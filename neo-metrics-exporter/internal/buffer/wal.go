package buffer

import (
	"bufio"
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"hash/crc32"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

var cryptoRandRead = rand.Read

const (
	walMagic         = "NGWAL\x00\x00\x00"
	walSchemaVersion = 1
	walHeaderSize    = 16 // 8 magic + 4 version + 4 reserved
	walFrameOverhead = 8  // 4 length + 4 crc
)

type WALConfig struct {
	Dir                  string
	MaxSizeMB            int
	HighWatermarkPct     int
	CriticalWatermarkPct int
}

func DefaultWALConfig(dir string) WALConfig {
	return WALConfig{
		Dir:                  dir,
		MaxSizeMB:            1024,
		HighWatermarkPct:     80,
		CriticalWatermarkPct: 95,
	}
}

type DiskBuffer struct {
	mu          sync.Mutex
	ring        *Ring
	walPath     string
	walFile     *os.File
	walWriter   *bufio.Writer
	walSize     int64
	diskEnabled bool
	cfg         WALConfig

	framesWritten   atomic.Int64
	framesCorrupted atomic.Int64
	writeRejections atomic.Int64
	droppedBytes    atomic.Int64
}

func NewDiskBuffer(maxItems int, walDir string) *DiskBuffer {
	return NewDiskBufferWithConfig(maxItems, DefaultWALConfig(walDir))
}

func NewDiskBufferWithConfig(maxItems int, cfg WALConfig) *DiskBuffer {
	db := &DiskBuffer{
		ring: NewRing(maxItems),
		cfg:  cfg,
	}

	if cfg.Dir == "" {
		return db
	}

	if err := os.MkdirAll(cfg.Dir, 0750); err != nil {
		slog.Warn("WAL directory creation failed, using memory-only buffer", "error", err)
		return db
	}

	db.walPath = filepath.Join(cfg.Dir, "metrics.wal")

	db.replayWAL()

	if err := db.openWAL(); err != nil {
		slog.Warn("WAL open failed, using memory-only buffer", "error", err)
		return db
	}

	db.diskEnabled = true
	slog.Info("disk buffer enabled", "path", db.walPath)
	return db
}

func (db *DiskBuffer) openWAL() error {
	f, err := os.OpenFile(db.walPath, os.O_CREATE|os.O_RDWR, 0640)
	if err != nil {
		return err
	}

	info, _ := f.Stat()
	if info.Size() == 0 {
		if err := db.writeHeader(f); err != nil {
			f.Close()
			return err
		}
		db.walSize = walHeaderSize
	} else {
		db.walSize = info.Size()
		if _, err := f.Seek(0, io.SeekEnd); err != nil {
			f.Close()
			return err
		}
	}

	db.walFile = f
	db.walWriter = bufio.NewWriterSize(f, 64*1024)
	return nil
}

func (db *DiskBuffer) writeHeader(f *os.File) error {
	var header [walHeaderSize]byte
	copy(header[:8], walMagic)
	binary.BigEndian.PutUint32(header[8:12], walSchemaVersion)
	// header[12:16] reserved (zeros)
	_, err := f.Write(header[:])
	return err
}

func (db *DiskBuffer) replayWAL() {
	f, err := os.Open(db.walPath)
	if err != nil {
		if os.IsNotExist(err) {
			return
		}
		slog.Warn("WAL replay open failed", "error", err)
		return
	}

	valid := db.validateHeader(f)
	if !valid {
		return
	}

	reader := bufio.NewReaderSize(f, 256*1024)
	var batches [][]model.MetricPoint
	var total, corrupted int

	for {
		points, err := db.readFrame(reader)
		if err == io.EOF || err == io.ErrUnexpectedEOF {
			break
		}
		if err != nil {
			corrupted++
			db.framesCorrupted.Add(1)
			slog.Warn("WAL replay: corrupt frame, skipping", "error", err)
			continue
		}
		batches = append(batches, points)
		db.ring.Push(points)
		total += len(points)
	}

	f.Close()

	if total > 0 {
		slog.Info("WAL replay complete", "points", total, "corrupted_frames", corrupted)
	}

	// Rewrite replayed data into fresh WAL with correct framing
	os.Remove(db.walPath)
	if total > 0 {
		db.rewriteWAL(batches)
	}
}

func (db *DiskBuffer) rewriteWAL(batches [][]model.MetricPoint) {
	f, err := os.OpenFile(db.walPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0640)
	if err != nil {
		slog.Warn("WAL rewrite after replay failed", "error", err)
		return
	}

	if err := db.writeHeader(f); err != nil {
		f.Close()
		return
	}

	writer := bufio.NewWriterSize(f, 64*1024)
	var size int64 = walHeaderSize

	for _, batch := range batches {
		data, err := json.Marshal(batch)
		if err != nil {
			continue
		}
		var frame [walFrameOverhead]byte
		binary.BigEndian.PutUint32(frame[:4], uint32(len(data)))
		binary.BigEndian.PutUint32(frame[4:8], crc32.ChecksumIEEE(data))
		writer.Write(frame[:])
		writer.Write(data)
		size += int64(walFrameOverhead + len(data))
	}

	writer.Flush()
	f.Sync()
	f.Close()
	db.walSize = size
}

func (db *DiskBuffer) validateHeader(f *os.File) bool {
	var header [walHeaderSize]byte
	n, err := io.ReadFull(f, header[:])
	if err != nil || n < walHeaderSize {
		corruptedPath := db.walPath + ".corrupted-" + randomSuffix()
		slog.Warn("WAL unreadable header, renaming", "new_path", corruptedPath)
		f.Close()
		os.Rename(db.walPath, corruptedPath)
		return false
	}

	if string(header[:8]) != walMagic {
		corruptedPath := db.walPath + ".corrupted-" + randomSuffix()
		slog.Warn("WAL invalid magic, renaming", "new_path", corruptedPath)
		f.Close()
		os.Rename(db.walPath, corruptedPath)
		return false
	}

	version := binary.BigEndian.Uint32(header[8:12])
	if version > walSchemaVersion {
		slog.Error("WAL schema version too new", "file_version", version, "supported", walSchemaVersion)
		f.Close()
		os.Exit(78)
	}

	return true
}

func (db *DiskBuffer) readFrame(r *bufio.Reader) ([]model.MetricPoint, error) {
	var frameMeta [walFrameOverhead]byte
	if _, err := io.ReadFull(r, frameMeta[:]); err != nil {
		return nil, err
	}

	length := binary.BigEndian.Uint32(frameMeta[:4])
	expectedCRC := binary.BigEndian.Uint32(frameMeta[4:8])

	if length == 0 || length > 16*1024*1024 {
		return nil, errCorruptFrame
	}

	payload := make([]byte, length)
	if _, err := io.ReadFull(r, payload); err != nil {
		return nil, err
	}

	actualCRC := crc32.ChecksumIEEE(payload)
	if actualCRC != expectedCRC {
		db.framesCorrupted.Add(1)
		return nil, errCRCMismatch
	}

	var points []model.MetricPoint
	if err := json.Unmarshal(payload, &points); err != nil {
		return nil, err
	}

	return points, nil
}

func (db *DiskBuffer) Push(points []model.MetricPoint) {
	if len(points) == 0 {
		return
	}

	db.ring.Push(points)

	if !db.diskEnabled {
		return
	}

	db.mu.Lock()
	defer db.mu.Unlock()

	if db.isAtCapacity() {
		db.writeRejections.Add(1)
		return
	}

	if db.isAtCriticalWatermark() {
		db.dropOldestSegment()
	}

	data, err := json.Marshal(points)
	if err != nil {
		slog.Warn("WAL marshal failed", "error", err)
		return
	}

	frameSize := int64(walFrameOverhead + len(data))

	var frame [walFrameOverhead]byte
	binary.BigEndian.PutUint32(frame[:4], uint32(len(data)))
	binary.BigEndian.PutUint32(frame[4:8], crc32.ChecksumIEEE(data))

	if _, err := db.walWriter.Write(frame[:]); err != nil {
		slog.Warn("WAL write failed, continuing memory-only", "error", err)
		db.disableDisk()
		return
	}
	if _, err := db.walWriter.Write(data); err != nil {
		slog.Warn("WAL write failed, continuing memory-only", "error", err)
		db.disableDisk()
		return
	}

	db.walSize += frameSize
	db.framesWritten.Add(1)

	if db.framesWritten.Load()%10 == 0 {
		db.walWriter.Flush()
	}
}

func (db *DiskBuffer) DrainWithMeta(max int) DrainResult {
	result := db.ring.DrainWithMeta(max)

	if db.diskEnabled && len(result.Points) > 0 {
		db.mu.Lock()
		db.compactWAL()
		db.mu.Unlock()
	}

	return result
}

func (db *DiskBuffer) Drain(max int) []model.MetricPoint {
	result := db.DrainWithMeta(max)
	return result.Points
}

func (db *DiskBuffer) PushFront(points []model.MetricPoint, retryCount int) {
	if len(points) == 0 {
		return
	}

	db.ring.PushFront(points, retryCount)

	if !db.diskEnabled {
		return
	}

	db.mu.Lock()
	defer db.mu.Unlock()

	// Force immediate WAL write + fsync for crash safety on re-enqueue
	data, err := json.Marshal(points)
	if err != nil {
		slog.Warn("WAL marshal failed on PushFront", "error", err)
		return
	}

	var frame [walFrameOverhead]byte
	binary.BigEndian.PutUint32(frame[:4], uint32(len(data)))
	binary.BigEndian.PutUint32(frame[4:8], crc32.ChecksumIEEE(data))

	if _, err := db.walWriter.Write(frame[:]); err != nil {
		slog.Warn("WAL PushFront write failed", "error", err)
		return
	}
	if _, err := db.walWriter.Write(data); err != nil {
		slog.Warn("WAL PushFront write failed", "error", err)
		return
	}

	db.walSize += int64(walFrameOverhead + len(data))
	db.framesWritten.Add(1)

	// Forced flush + fsync for durability
	if err := db.walWriter.Flush(); err != nil {
		slog.Warn("WAL PushFront flush failed", "error", err)
		return
	}
	if db.walFile != nil {
		db.walFile.Sync()
	}
}

func (db *DiskBuffer) compactWAL() {
	remaining := db.ring.Len()
	if remaining == 0 {
		if db.walWriter != nil {
			db.walWriter.Flush()
		}
		if db.walFile != nil {
			db.walFile.Close()
		}
		os.Remove(db.walPath)
		db.walSize = 0
		db.reopenWAL()
		return
	}

	tmpPath := db.walPath + ".tmp"
	f, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0640)
	if err != nil {
		slog.Warn("WAL compact: failed to create temp file", "error", err)
		return
	}

	if err := db.writeHeader(f); err != nil {
		f.Close()
		os.Remove(tmpPath)
		slog.Warn("WAL compact: failed to write header", "error", err)
		return
	}

	writer := bufio.NewWriterSize(f, 64*1024)
	var newSize int64 = walHeaderSize

	batches := db.ring.PeekBatches()
	for _, batch := range batches {
		data, err := json.Marshal(batch)
		if err != nil {
			continue
		}

		var frame [walFrameOverhead]byte
		binary.BigEndian.PutUint32(frame[:4], uint32(len(data)))
		binary.BigEndian.PutUint32(frame[4:8], crc32.ChecksumIEEE(data))

		if _, err := writer.Write(frame[:]); err != nil {
			f.Close()
			os.Remove(tmpPath)
			slog.Warn("WAL compact: write failed, keeping original", "error", err)
			return
		}
		if _, err := writer.Write(data); err != nil {
			f.Close()
			os.Remove(tmpPath)
			slog.Warn("WAL compact: write failed, keeping original", "error", err)
			return
		}
		newSize += int64(walFrameOverhead + len(data))
	}

	if err := writer.Flush(); err != nil {
		f.Close()
		os.Remove(tmpPath)
		slog.Warn("WAL compact: flush failed", "error", err)
		return
	}
	if err := f.Sync(); err != nil {
		f.Close()
		os.Remove(tmpPath)
		slog.Warn("WAL compact: fsync failed", "error", err)
		return
	}
	f.Close()

	if db.walWriter != nil {
		db.walWriter.Flush()
	}
	if db.walFile != nil {
		db.walFile.Close()
	}

	if err := os.Rename(tmpPath, db.walPath); err != nil {
		slog.Warn("WAL compact: rename failed", "error", err)
		os.Remove(tmpPath)
		db.reopenWAL()
		return
	}

	db.walSize = newSize
	db.reopenWAL()
}

func (db *DiskBuffer) reopenWAL() {
	f, err := os.OpenFile(db.walPath, os.O_CREATE|os.O_RDWR, 0640)
	if err != nil {
		slog.Warn("WAL reopen failed, continuing memory-only", "error", err)
		db.disableDisk()
		return
	}

	info, _ := f.Stat()
	if info.Size() == 0 {
		if err := db.writeHeader(f); err != nil {
			f.Close()
			db.disableDisk()
			return
		}
		db.walSize = walHeaderSize
	} else {
		db.walSize = info.Size()
		if _, err := f.Seek(0, io.SeekEnd); err != nil {
			f.Close()
			db.disableDisk()
			return
		}
	}

	db.walFile = f
	db.walWriter = bufio.NewWriterSize(f, 64*1024)
}

func (db *DiskBuffer) disableDisk() {
	db.diskEnabled = false
	if db.walFile != nil {
		db.walFile.Close()
		db.walFile = nil
	}
	db.walWriter = nil
}

func (db *DiskBuffer) isAtCapacity() bool {
	if db.cfg.MaxSizeMB <= 0 {
		return false
	}
	maxBytes := int64(db.cfg.MaxSizeMB) * 1024 * 1024
	return db.walSize >= maxBytes
}

func (db *DiskBuffer) isAtCriticalWatermark() bool {
	if db.cfg.MaxSizeMB <= 0 {
		return false
	}
	pct := db.cfg.CriticalWatermarkPct
	if pct <= 0 {
		pct = 95
	}
	maxBytes := int64(db.cfg.MaxSizeMB) * 1024 * 1024
	threshold := maxBytes * int64(pct) / 100
	return db.walSize >= threshold
}

func (db *DiskBuffer) IsAtHighWatermark() bool {
	if db.cfg.MaxSizeMB <= 0 {
		return false
	}
	pct := db.cfg.HighWatermarkPct
	if pct <= 0 {
		pct = 80
	}
	maxBytes := int64(db.cfg.MaxSizeMB) * 1024 * 1024
	threshold := maxBytes * int64(pct) / 100
	return db.walSize >= threshold
}

func (db *DiskBuffer) dropOldestSegment() {
	dropped := db.ring.DropOldest()
	if dropped > 0 {
		db.droppedBytes.Add(int64(dropped))
		slog.Warn("WAL critical watermark: dropped oldest batch", "points_dropped", dropped)
	}
}

func (db *DiskBuffer) Stats() Stats {
	return db.ring.Stats()
}

func (db *DiskBuffer) WALStats() WALStats {
	db.mu.Lock()
	defer db.mu.Unlock()
	return WALStats{
		SizeBytes:       db.walSize,
		FramesWritten:   db.framesWritten.Load(),
		FramesCorrupted: db.framesCorrupted.Load(),
		WriteRejections: db.writeRejections.Load(),
		DroppedBytes:    db.droppedBytes.Load(),
		DiskEnabled:     db.diskEnabled,
	}
}

type WALStats struct {
	SizeBytes       int64
	FramesWritten   int64
	FramesCorrupted int64
	WriteRejections int64
	DroppedBytes    int64
	DiskEnabled     bool
}

// Metrics returns WAL pressure metrics as model.MetricPoint slice.
// Accepts baseTags from the emitter to preserve identity tags.
func (db *DiskBuffer) Metrics(baseTags map[string]string) []model.MetricPoint {
	walStats := db.WALStats()
	ringStats := db.ring.Stats()

	return []model.MetricPoint{
		model.NewGauge("agent.wal.size_bytes", float64(walStats.SizeBytes), baseTags),
		model.NewCounter("agent.wal.frames_total", float64(walStats.FramesWritten), baseTags),
		model.NewCounter("agent.wal.corrupted_frames_total", float64(walStats.FramesCorrupted), baseTags),
		model.NewCounter("agent.wal.write_rejections_total", float64(walStats.WriteRejections), baseTags),
		model.NewCounter("agent.wal.dropped_points_total", float64(ringStats.Dropped), baseTags),
	}
}

func (db *DiskBuffer) FlushWAL() {
	if !db.diskEnabled {
		return
	}
	db.mu.Lock()
	defer db.mu.Unlock()
	if db.walWriter != nil {
		db.walWriter.Flush()
	}
	if db.walFile != nil {
		db.walFile.Sync()
	}
}

func (db *DiskBuffer) DropHalf() int {
	return db.ring.DropHalf()
}

func (db *DiskBuffer) SetReplayCount(n int) {
	db.ring.SetReplayCount(n)
}

func (db *DiskBuffer) ReplayCount() int {
	return db.ring.ReplayCount()
}

func (db *DiskBuffer) DrainLive(max int) DrainResult {
	result := db.ring.DrainLive(max)
	if db.diskEnabled && len(result.Points) > 0 {
		db.mu.Lock()
		db.compactWAL()
		db.mu.Unlock()
	}
	return result
}

func (db *DiskBuffer) DrainReplay(max int) DrainResult {
	result := db.ring.DrainReplay(max)
	if db.diskEnabled && len(result.Points) > 0 {
		db.mu.Lock()
		db.compactWAL()
		db.mu.Unlock()
	}
	return result
}

func (db *DiskBuffer) Len() int {
	return db.ring.Len()
}

func (db *DiskBuffer) Close() error {
	db.mu.Lock()
	defer db.mu.Unlock()

	if db.walWriter != nil {
		db.walWriter.Flush()
	}
	if db.walFile != nil {
		return db.walFile.Close()
	}
	return nil
}

func randomSuffix() string {
	var b [4]byte
	cr, err := cryptoRandRead(b[:])
	if err != nil || cr == 0 {
		return fmt.Sprintf("%d", time.Now().UnixNano()%100000000)
	}
	return fmt.Sprintf("%08x", binary.BigEndian.Uint32(b[:]))
}

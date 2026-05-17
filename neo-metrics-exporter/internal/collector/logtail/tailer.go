package logtail

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"os"
	"sync"
	"sync/atomic"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

type Line struct {
	Text   string
	Source string
}

// PressureChecker allows tailers to observe spool backpressure (control path per reviewer requirement).
type PressureChecker interface {
	IsHighWatermark() bool
}

type TailerOptions struct {
	StateDir           string
	CheckpointInterval time.Duration
	PollInterval       time.Duration
	StartPosition      string
	Service            string
	PressureChecker    PressureChecker // Optional: if set, tailer slows down when high watermark is reached
}

func (o *TailerOptions) checkpointInterval() time.Duration {
	if o.CheckpointInterval > 0 {
		return o.CheckpointInterval
	}
	return 5 * time.Second
}

func (o *TailerOptions) pollInterval() time.Duration {
	if o.PollInterval > 0 {
		return o.PollInterval
	}
	return 30 * time.Second
}

func (o *TailerOptions) startPosition() string {
	if o.StartPosition == "start" {
		return "start"
	}
	return "end"
}

type Tailer struct {
	path    string
	opts    *TailerOptions
	lines   chan Line
	ctx     context.Context
	cancel  context.CancelFunc
	wg      sync.WaitGroup
	cursor  *Cursor
	store   *CursorStore
	file    *os.File
	reader  *bufio.Reader
	active  atomic.Int32
	metrics *tailerMetrics
}

type tailerMetrics struct {
	rotations   atomic.Int64
	truncations atomic.Int64
	missingPolls atomic.Int64
}

func NewTailer(path string, opts *TailerOptions) *Tailer {
	if opts == nil {
		opts = &TailerOptions{}
	}
	ctx, cancel := context.WithCancel(context.Background())

	var store *CursorStore
	if opts.StateDir != "" {
		store = NewCursorStore(opts.StateDir)
	}

	return &Tailer{
		path:    path,
		opts:    opts,
		lines:   make(chan Line, 100000),
		ctx:     ctx,
		cancel:  cancel,
		store:   store,
		metrics: &tailerMetrics{},
	}
}

func (t *Tailer) Start() {
	t.wg.Add(1)
	go t.run()
}

func (t *Tailer) Stop() {
	t.cancel()
	t.wg.Wait()
	if t.file != nil {
		t.file.Close()
		t.file = nil
	}
	t.saveCheckpoint()
}

func (t *Tailer) Lines() <-chan Line {
	return t.lines
}

func (t *Tailer) Path() string {
	return t.path
}

func (t *Tailer) ActiveFileCount() int {
	return int(t.active.Load())
}

func (t *Tailer) SaveCheckpoint() {
	t.saveCheckpoint()
}

func (t *Tailer) Metrics(baseTags map[string]string) []model.MetricPoint {
	tags := make(map[string]string, len(baseTags)+1)
	for k, v := range baseTags {
		tags[k] = v
	}
	tags["source"] = t.path

	var points []model.MetricPoint

	rotations := float64(t.metrics.rotations.Load())
	if rotations > 0 {
		renameTags := make(map[string]string, len(tags)+1)
		for k, v := range tags {
			renameTags[k] = v
		}
		renameTags["rotation_type"] = "rename"
		points = append(points, model.NewCounter("agent.logs.rotations", rotations, renameTags))
	}

	truncations := float64(t.metrics.truncations.Load())
	if truncations > 0 {
		points = append(points, model.NewCounter("agent.logs.truncations", truncations, tags))
	}

	missingPolls := float64(t.metrics.missingPolls.Load())
	if missingPolls > 0 {
		points = append(points, model.NewCounter("agent.logs.missing_files", missingPolls, tags))
	}

	return points
}

func (t *Tailer) run() {
	defer t.wg.Done()
	defer close(t.lines)

	if err := t.openFile(); err != nil {
		slog.Info("file not available, entering poll loop", "path", t.path, "error", err)
		if !t.pollForFile() {
			return
		}
	}

	t.active.Store(1)
	defer t.active.Store(0)

	checkpointTicker := time.NewTicker(t.opts.checkpointInterval())
	defer checkpointTicker.Stop()

	pollTicker := time.NewTicker(t.opts.pollInterval())
	defer pollTicker.Stop()

	for {
		select {
		case <-t.ctx.Done():
			return
		default:
		}

		if t.file == nil {
			select {
			case <-t.ctx.Done():
				return
			case <-pollTicker.C:
				if !t.tryOpen() {
					t.metrics.missingPolls.Add(1)
				}
				continue
			}
		}

		line, err := t.readLine()
		if err != nil {
			if err == io.EOF {
				if t.detectRotation() {
					continue
				}
				select {
				case <-t.ctx.Done():
					return
				case <-checkpointTicker.C:
					t.saveCheckpoint()
				case <-time.After(100 * time.Millisecond):
				}
				continue
			}
			if os.IsNotExist(err) || isFileClosed(err) {
				slog.Info("file removed, stopping watch", "path", t.path)
				t.file.Close()
				t.file = nil
				t.active.Store(0)
				continue
			}
			slog.Error("read error", "path", t.path, "error", err)
			select {
			case <-t.ctx.Done():
				return
			case <-time.After(1 * time.Second):
			}
			continue
		}

		select {
		case t.lines <- Line{Text: line, Source: t.path}:
		case <-t.ctx.Done():
			return
		}

		// Check high watermark pressure and slow down if needed (control path per §9.1.2)
		if t.opts.PressureChecker != nil && t.opts.PressureChecker.IsHighWatermark() {
			time.Sleep(100 * time.Millisecond) // Slow down per contract §9.1.2
		}

		select {
		case <-checkpointTicker.C:
			t.saveCheckpoint()
		default:
		}
	}
}

func (t *Tailer) openFile() error {
	f, err := os.Open(t.path)
	if err != nil {
		return err
	}

	identity, err := getFileIdentity(f)
	if err != nil {
		f.Close()
		return fmt.Errorf("get file identity: %w", err)
	}

	var offset int64
	if t.store != nil {
		saved, loadErr := t.store.Load(t.path)
		if loadErr == nil && saved.PlatformFileIdentity.Device == identity.Device && saved.PlatformFileIdentity.Inode == identity.Inode {
			offset = saved.Offset
		} else if loadErr == nil {
			slog.Info("file identity changed since last checkpoint, treating as rotation", "path", t.path)
			offset = 0
		} else if t.opts.startPosition() == "end" {
			fi, _ := f.Stat()
			if fi != nil {
				offset = fi.Size()
			}
		}
	} else if t.opts.startPosition() == "end" {
		fi, _ := f.Stat()
		if fi != nil {
			offset = fi.Size()
		}
	}

	if _, err := f.Seek(offset, io.SeekStart); err != nil {
		f.Close()
		return fmt.Errorf("seek: %w", err)
	}

	t.file = f
	t.reader = bufio.NewReaderSize(f, 65536)
	t.cursor = &Cursor{
		ConfiguredPath:       t.path,
		PlatformFileIdentity: *identity,
		Offset:               offset,
		LastCheckpoint:       time.Now().UTC(),
	}
	if fi, err := f.Stat(); err == nil {
		t.cursor.FileSize = fi.Size()
	}

	return nil
}

func (t *Tailer) tryOpen() bool {
	err := t.openFile()
	if err == nil {
		t.active.Store(1)
		return true
	}
	return false
}

func (t *Tailer) pollForFile() bool {
	pollTicker := time.NewTicker(t.opts.pollInterval())
	defer pollTicker.Stop()

	for {
		select {
		case <-t.ctx.Done():
			return false
		case <-pollTicker.C:
			t.metrics.missingPolls.Add(1)
			if t.tryOpen() {
				return true
			}
		}
	}
}

func (t *Tailer) readLine() (string, error) {
	raw, err := t.reader.ReadString('\n')
	if err != nil && len(raw) == 0 {
		return "", err
	}
	if err == io.EOF && len(raw) > 0 && raw[len(raw)-1] != '\n' {
		return "", io.EOF
	}

	if t.cursor != nil {
		t.cursor.Offset += int64(len(raw))
	}
	return trimNewline(raw), nil
}

func (t *Tailer) detectRotation() bool {
	if t.file == nil {
		return false
	}

	fi, err := os.Stat(t.path)
	if err != nil {
		if os.IsNotExist(err) {
			slog.Info("file removed during tail", "path", t.path)
			t.file.Close()
			t.file = nil
			t.reader = nil
			t.active.Store(0)
			return true
		}
		return false
	}

	if fi.Size() < t.cursor.Offset {
		slog.Warn("truncation detected, resetting to offset 0", "path", t.path)
		t.metrics.truncations.Add(1)
		t.file.Seek(0, io.SeekStart)
		t.reader.Reset(t.file)
		t.cursor.Offset = 0
		t.cursor.FileSize = fi.Size()
		return true
	}

	currentIdentity, err := getFileIdentityByPath(t.path)
	if err != nil {
		if os.IsNotExist(err) {
			slog.Info("file removed during identity check", "path", t.path)
			t.file.Close()
			t.file = nil
			t.reader = nil
			t.active.Store(0)
			return true
		}
		return false
	}

	if currentIdentity.Device != t.cursor.PlatformFileIdentity.Device ||
		currentIdentity.Inode != t.cursor.PlatformFileIdentity.Inode {
		slog.Info("rename rotation detected", "path", t.path)
		t.metrics.rotations.Add(1)

		t.drainRemainingLines()
		t.file.Close()

		t.file = nil
		t.reader = nil
		t.cursor.Offset = 0
		t.cursor.PlatformFileIdentity = *currentIdentity

		if err := t.openFileAtOffset(0); err != nil {
			slog.Warn("failed to open new file after rotation", "path", t.path, "error", err)
			t.active.Store(0)
		}
		return true
	}

	t.cursor.FileSize = fi.Size()
	return false
}

func (t *Tailer) drainRemainingLines() {
	for {
		line, err := t.reader.ReadString('\n')
		if err != nil || len(line) == 0 {
			break
		}
		line = trimNewline(line)
		select {
		case t.lines <- Line{Text: line, Source: t.path}:
		case <-t.ctx.Done():
			return
		}
	}
}

func (t *Tailer) openFileAtOffset(offset int64) error {
	f, err := os.Open(t.path)
	if err != nil {
		return err
	}

	identity, err := getFileIdentity(f)
	if err != nil {
		f.Close()
		return err
	}

	if _, err := f.Seek(offset, io.SeekStart); err != nil {
		f.Close()
		return err
	}

	t.file = f
	t.reader = bufio.NewReaderSize(f, 65536)
	t.cursor = &Cursor{
		ConfiguredPath:       t.path,
		PlatformFileIdentity: *identity,
		Offset:               offset,
		LastCheckpoint:       time.Now().UTC(),
	}
	if fi, err := f.Stat(); err == nil {
		t.cursor.FileSize = fi.Size()
	}
	return nil
}

func (t *Tailer) saveCheckpoint() {
	if t.store == nil || t.cursor == nil {
		return
	}
	t.cursor.LastCheckpoint = time.Now().UTC()
	if err := t.store.Save(t.path, t.cursor); err != nil {
		slog.Warn("failed to save cursor checkpoint", "path", t.path, "error", err)
	}
}

func PathHash(path string) string {
	h := sha256.Sum256([]byte(path))
	return hex.EncodeToString(h[:])[:16]
}

func trimNewline(s string) string {
	if len(s) > 0 && s[len(s)-1] == '\n' {
		s = s[:len(s)-1]
	}
	if len(s) > 0 && s[len(s)-1] == '\r' {
		s = s[:len(s)-1]
	}
	return s
}

func isFileClosed(err error) bool {
	return err != nil && (os.IsNotExist(err) || err.Error() == "file already closed")
}

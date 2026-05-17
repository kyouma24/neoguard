package buffer

import (
	"encoding/json"
	"sync"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

// LogRing is a bounded in-memory ring buffer for log entries with threshold notification.
// Separate from metrics Ring per log pipeline contract §1.2 and §2.2.
type LogRing struct {
	mu          sync.Mutex
	entries     []model.LogEntry
	head        int
	tail        int
	size        int
	cap         int
	approxBytes int

	threshCount int
	threshBytes int

	notifyCh chan struct{}
}

func NewLogRing(capacity, threshCount, threshBytes int) *LogRing {
	return &LogRing{
		entries:     make([]model.LogEntry, capacity),
		cap:         capacity,
		threshCount: threshCount,
		threshBytes: threshBytes,
		notifyCh:    make(chan struct{}, 1),
	}
}

func (r *LogRing) Write(entry model.LogEntry) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.size == r.cap {
		return false
	}

	r.entries[r.tail] = entry
	r.tail = (r.tail + 1) % r.cap
	r.size++
	r.approxBytes += estimateEntryBytes(entry)

	if r.size >= r.threshCount || r.approxBytes >= r.threshBytes {
		r.signal()
	}

	return true
}

// Read drains up to n entries from the ring, respecting maxBytes.
// Returns entries whose cumulative estimated size does not exceed maxBytes.
// If maxBytes <= 0, only the count limit applies.
func (r *LogRing) Read(n int, maxBytes int) []model.LogEntry {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.size == 0 {
		return nil
	}

	toRead := n
	if toRead > r.size {
		toRead = r.size
	}

	var result []model.LogEntry
	var totalBytes int

	for i := 0; i < toRead; i++ {
		entry := r.entries[r.head]
		entrySize := estimateEntryBytes(entry)

		if maxBytes > 0 && totalBytes+entrySize > maxBytes && len(result) > 0 {
			break
		}

		result = append(result, entry)
		totalBytes += entrySize
		r.head = (r.head + 1) % r.cap
		r.size--
		r.approxBytes -= entrySize
	}

	if r.approxBytes < 0 {
		r.approxBytes = 0
	}

	return result
}

// DropOldest removes the oldest n entries from the ring (critical watermark per §9.1.3).
func (r *LogRing) DropOldest(n int) int {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.size == 0 {
		return 0
	}

	toDrop := n
	if toDrop > r.size {
		toDrop = r.size
	}

	for i := 0; i < toDrop; i++ {
		entry := r.entries[r.head]
		r.approxBytes -= estimateEntryBytes(entry)
		r.head = (r.head + 1) % r.cap
		r.size--
	}

	if r.approxBytes < 0 {
		r.approxBytes = 0
	}

	return toDrop
}

func (r *LogRing) Size() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.size
}

func (r *LogRing) Capacity() int {
	return r.cap
}

// Notify returns a channel that receives a signal when batch thresholds are reached.
// Shipper selects on this to trigger immediate flush.
func (r *LogRing) Notify() <-chan struct{} {
	return r.notifyCh
}

func (r *LogRing) signal() {
	select {
	case r.notifyCh <- struct{}{}:
	default:
	}
}

func estimateEntryBytes(entry model.LogEntry) int {
	// Fast estimate: message length + fixed overhead for JSON structure/tags/fields
	size := len(entry.Message) + len(entry.Service) + len(entry.Source) + 256
	if entry.Fields != nil {
		data, err := json.Marshal(entry.Fields)
		if err == nil {
			size += len(data)
		}
	}
	return size
}

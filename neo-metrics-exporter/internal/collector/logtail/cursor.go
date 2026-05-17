package logtail

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

type FileIdentity struct {
	Device uint64 `json:"device"`
	Inode  uint64 `json:"inode"`
}

type Cursor struct {
	ConfiguredPath       string       `json:"configured_path"`
	PlatformFileIdentity FileIdentity `json:"platform_file_identity"`
	Offset               int64        `json:"offset"`
	FileSize             int64        `json:"file_size"`
	LastCheckpoint       time.Time    `json:"last_checkpoint"`
}

type CursorStore struct {
	stateDir string
}

func NewCursorStore(stateDir string) *CursorStore {
	return &CursorStore{stateDir: stateDir}
}

func (s *CursorStore) cursorPath(configuredPath string) string {
	hash := PathHash(configuredPath)
	return filepath.Join(s.stateDir, "log_cursors", hash+".json")
}

func (s *CursorStore) Load(configuredPath string) (*Cursor, error) {
	path := s.cursorPath(configuredPath)
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var cursor Cursor
	if err := json.Unmarshal(data, &cursor); err != nil {
		return nil, fmt.Errorf("unmarshal cursor: %w", err)
	}
	return &cursor, nil
}

func (s *CursorStore) Save(configuredPath string, cursor *Cursor) error {
	path := s.cursorPath(configuredPath)

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0750); err != nil {
		return fmt.Errorf("create cursor dir: %w", err)
	}

	data, err := json.Marshal(cursor)
	if err != nil {
		return fmt.Errorf("marshal cursor: %w", err)
	}

	return os.WriteFile(path, data, 0640)
}

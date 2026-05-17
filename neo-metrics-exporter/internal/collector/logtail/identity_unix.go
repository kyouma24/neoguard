//go:build !windows

package logtail

import (
	"fmt"
	"os"
	"syscall"
)

func getFileIdentity(f *os.File) (*FileIdentity, error) {
	fi, err := f.Stat()
	if err != nil {
		return nil, fmt.Errorf("stat: %w", err)
	}
	stat, ok := fi.Sys().(*syscall.Stat_t)
	if !ok {
		return nil, fmt.Errorf("unsupported platform: cannot get inode")
	}
	return &FileIdentity{
		Device: uint64(stat.Dev),
		Inode:  stat.Ino,
	}, nil
}

func getFileIdentityByPath(path string) (*FileIdentity, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return getFileIdentity(f)
}

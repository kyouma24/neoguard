//go:build windows

package logtail

import (
	"fmt"
	"os"
	"syscall"
)

func getFileIdentity(f *os.File) (*FileIdentity, error) {
	var d syscall.ByHandleFileInformation
	if err := syscall.GetFileInformationByHandle(syscall.Handle(f.Fd()), &d); err != nil {
		return nil, fmt.Errorf("GetFileInformationByHandle: %w", err)
	}
	return &FileIdentity{
		Device: uint64(d.VolumeSerialNumber),
		Inode:  uint64(d.FileIndexHigh)<<32 | uint64(d.FileIndexLow),
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

//go:build !linux

package config

func checkFilePermissions(_ string) error {
	return nil
}

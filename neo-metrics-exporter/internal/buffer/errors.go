package buffer

import "errors"

var (
	errCorruptFrame = errors.New("wal: corrupt frame (invalid length)")
	errCRCMismatch  = errors.New("wal: CRC mismatch")
)

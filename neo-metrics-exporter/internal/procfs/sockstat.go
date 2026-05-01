//go:build linux

package procfs

import (
	"strconv"
	"strings"
)

type Sockstat struct {
	SocketsUsed uint64
	TCPInUse    uint64
	TCPOrphan   uint64
	TCPTimeWait uint64
	TCPAlloc    uint64
	TCPMemPages uint64
	UDPInUse    uint64
	UDPMemPages uint64
	UDP6InUse   uint64
	Raw         uint64
	Frag        uint64
}

func ReadSockstat() (*Sockstat, error) {
	return ReadSockstatFrom("/proc/net/sockstat")
}

func ReadSockstatFrom(path string) (*Sockstat, error) {
	s := &Sockstat{}

	err := ScanLines(path, func(line string) error {
		fields := strings.Fields(line)
		if len(fields) < 3 {
			return nil
		}

		kv := make(map[string]uint64)
		for i := 1; i+1 < len(fields); i += 2 {
			val, _ := strconv.ParseUint(fields[i+1], 10, 64)
			kv[fields[i]] = val
		}

		switch {
		case strings.HasPrefix(line, "sockets:"):
			s.SocketsUsed = kv["used"]
		case strings.HasPrefix(line, "TCP:"):
			s.TCPInUse = kv["inuse"]
			s.TCPOrphan = kv["orphan"]
			s.TCPTimeWait = kv["tw"]
			s.TCPAlloc = kv["alloc"]
			s.TCPMemPages = kv["mem"]
		case strings.HasPrefix(line, "UDP:"):
			s.UDPInUse = kv["inuse"]
			s.UDPMemPages = kv["mem"]
		case strings.HasPrefix(line, "RAW:"):
			s.Raw = kv["inuse"]
		case strings.HasPrefix(line, "FRAG:"):
			s.Frag = kv["inuse"]
		}
		return nil
	})

	return s, err
}

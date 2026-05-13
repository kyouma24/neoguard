//go:build linux

package procfs

import "testing"

func TestReadSockstatFromMock(t *testing.T) {
	content := `sockets: used 1234
TCP: inuse 150 orphan 5 tw 200 alloc 300 mem 50
UDP: inuse 30 mem 2
UDPLITE: inuse 0
RAW: inuse 1
FRAG: inuse 0 memory 0
`
	path := writeTempFile(t, content)
	s, err := ReadSockstatFrom(path)
	if err != nil {
		t.Fatal(err)
	}

	if s.SocketsUsed != 1234 {
		t.Errorf("sockets_used = %d", s.SocketsUsed)
	}
	if s.TCPInUse != 150 {
		t.Errorf("tcp_inuse = %d", s.TCPInUse)
	}
	if s.TCPOrphan != 5 {
		t.Errorf("tcp_orphan = %d", s.TCPOrphan)
	}
	if s.TCPTimeWait != 200 {
		t.Errorf("tcp_tw = %d", s.TCPTimeWait)
	}
	if s.TCPAlloc != 300 {
		t.Errorf("tcp_alloc = %d", s.TCPAlloc)
	}
	if s.TCPMemPages != 50 {
		t.Errorf("tcp_mem = %d", s.TCPMemPages)
	}
	if s.UDPInUse != 30 {
		t.Errorf("udp_inuse = %d", s.UDPInUse)
	}
	if s.Raw != 1 {
		t.Errorf("raw = %d", s.Raw)
	}
}

func TestReadSockstatLive(t *testing.T) {
	s, err := ReadSockstat()
	if err != nil {
		t.Fatal(err)
	}
	if s.SocketsUsed == 0 {
		t.Error("sockets_used should be > 0")
	}
}

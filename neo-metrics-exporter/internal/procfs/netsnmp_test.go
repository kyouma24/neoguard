//go:build linux

package procfs

import "testing"

func TestReadNetSNMPFromMock(t *testing.T) {
	content := `Ip: Forwarding DefaultTTL InReceives InHdrErrors InAddrErrors ForwDatagrams InUnknownProtos InDiscards InDelivers OutRequests OutDiscards OutNoRoutes ReasmTimeout ReasmReqds ReasmOKs ReasmFails FragOKs FragFails FragCreates
Ip: 1 64 123456 0 0 0 0 0 123456 234567 0 0 0 0 0 0 0 0 0
Tcp: RtoAlgorithm RtoMin RtoMax MaxConn ActiveOpens PassiveOpens AttemptFails EstabResets CurrEstab InSegs OutSegs RetransSegs InErrs OutRsts InCsumErrors
Tcp: 1 200 120000 -1 5000 3000 100 200 150 987654 876543 1234 56 7890 0
Udp: InDatagrams NoPorts InErrors OutDatagrams RcvbufErrors SndbufErrors InCsumErrors IgnoredMulti MemErrors
Udp: 500000 1000 50 400000 10 5 0 0 0
`
	path := writeTempFile(t, content)
	s, err := ReadNetSNMPFrom(path)
	if err != nil {
		t.Fatal(err)
	}

	if s.TCP.ActiveOpens != 5000 {
		t.Errorf("tcp.active_opens = %d", s.TCP.ActiveOpens)
	}
	if s.TCP.PassiveOpens != 3000 {
		t.Errorf("tcp.passive_opens = %d", s.TCP.PassiveOpens)
	}
	if s.TCP.RetransSegs != 1234 {
		t.Errorf("tcp.retrans = %d", s.TCP.RetransSegs)
	}
	if s.TCP.CurrEstab != 150 {
		t.Errorf("tcp.curr_estab = %d", s.TCP.CurrEstab)
	}
	if s.TCP.InSegs != 987654 {
		t.Errorf("tcp.in_segs = %d", s.TCP.InSegs)
	}
	if s.TCP.InErrs != 56 {
		t.Errorf("tcp.in_errs = %d", s.TCP.InErrs)
	}
	if s.TCP.EstabResets != 200 {
		t.Errorf("tcp.estab_resets = %d", s.TCP.EstabResets)
	}
	if s.UDP.InDatagrams != 500000 {
		t.Errorf("udp.in_datagrams = %d", s.UDP.InDatagrams)
	}
	if s.UDP.OutDatagrams != 400000 {
		t.Errorf("udp.out_datagrams = %d", s.UDP.OutDatagrams)
	}
	if s.UDP.NoPorts != 1000 {
		t.Errorf("udp.no_ports = %d", s.UDP.NoPorts)
	}
	if s.UDP.InErrors != 50 {
		t.Errorf("udp.in_errors = %d", s.UDP.InErrors)
	}
}

func TestReadNetSNMPLive(t *testing.T) {
	s, err := ReadNetSNMP()
	if err != nil {
		t.Fatal(err)
	}
	if s.TCP.InSegs == 0 && s.TCP.OutSegs == 0 {
		t.Error("expected some TCP activity on a live system")
	}
}

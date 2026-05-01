//go:build linux

package procfs

import "testing"

func TestReadStatFromMock(t *testing.T) {
	content := `cpu  1234 56 789 10000 200 30 10 5 0 0
cpu0 617 28 394 5000 100 15 5 2 0 0
cpu1 617 28 395 5000 100 15 5 3 0 0
intr 45678901 23 0 0 0 0 0 0 0 1 2 0 0 156 0 0 0 42 0 0 0
ctxt 987654321
btime 1700000000
processes 54321
procs_running 3
procs_blocked 1
softirq 12345678 100 200 300 400 500 0 600 700 800 900
`
	path := writeTempFile(t, content)
	s, err := ReadStatFrom(path)
	if err != nil {
		t.Fatal(err)
	}

	if s.ContextSwitches != 987654321 {
		t.Errorf("ctxt = %d", s.ContextSwitches)
	}
	if s.Interrupts != 45678901 {
		t.Errorf("intr = %d", s.Interrupts)
	}
	if s.Forks != 54321 {
		t.Errorf("forks = %d", s.Forks)
	}
	if s.ProcsRunning != 3 {
		t.Errorf("procs_running = %d", s.ProcsRunning)
	}
	if s.ProcsBlocked != 1 {
		t.Errorf("procs_blocked = %d", s.ProcsBlocked)
	}
}

func TestReadStatLive(t *testing.T) {
	s, err := ReadStat()
	if err != nil {
		t.Fatal(err)
	}
	if s.ContextSwitches == 0 {
		t.Error("context_switches should be > 0")
	}
	if s.Forks == 0 {
		t.Error("forks should be > 0")
	}
}

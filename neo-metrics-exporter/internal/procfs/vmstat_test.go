//go:build linux

package procfs

import "testing"

func TestReadVMStatFromMock(t *testing.T) {
	content := `nr_free_pages 1234567
pgfault 987654321
pgmajfault 12345
pswpin 100
pswpout 200
oom_kill 3
pgpgin 50000
pgpgout 60000
`
	path := writeTempFile(t, content)
	v, err := ReadVMStatFrom(path)
	if err != nil {
		t.Fatal(err)
	}

	if v.PgFault != 987654321 {
		t.Errorf("pgfault = %d", v.PgFault)
	}
	if v.PgMajFault != 12345 {
		t.Errorf("pgmajfault = %d", v.PgMajFault)
	}
	if v.PswpIn != 100 {
		t.Errorf("pswpin = %d", v.PswpIn)
	}
	if v.PswpOut != 200 {
		t.Errorf("pswpout = %d", v.PswpOut)
	}
	if v.OomKill != 3 {
		t.Errorf("oom_kill = %d", v.OomKill)
	}
}

func TestReadVMStatLive(t *testing.T) {
	v, err := ReadVMStat()
	if err != nil {
		t.Fatal(err)
	}
	if v.PgFault == 0 {
		t.Error("pgfault should be > 0 on a running system")
	}
}

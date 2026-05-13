//go:build linux

package procfs

import "testing"

func TestReadMeminfoFromMock(t *testing.T) {
	content := `MemTotal:       16384000 kB
MemFree:         8192000 kB
MemAvailable:   12000000 kB
Buffers:          512000 kB
Cached:          2048000 kB
SwapCached:        10000 kB
Active:          4000000 kB
Inactive:        2000000 kB
Slab:             256000 kB
Dirty:              1234 kB
Writeback:             0 kB
Mapped:           128000 kB
PageTables:        32000 kB
HugePages_Total:       8
HugePages_Free:        4
Hugepagesize:       2048 kB
`
	path := writeTempFile(t, content)
	m, err := ReadMeminfoFrom(path)
	if err != nil {
		t.Fatal(err)
	}

	if m.Slab != 256000*1024 {
		t.Errorf("slab = %d", m.Slab)
	}
	if m.Dirty != 1234*1024 {
		t.Errorf("dirty = %d", m.Dirty)
	}
	if m.Mapped != 128000*1024 {
		t.Errorf("mapped = %d", m.Mapped)
	}
	if m.PageTables != 32000*1024 {
		t.Errorf("page_tables = %d", m.PageTables)
	}
	if m.HugeTotal != 8 {
		t.Errorf("hugepages_total = %d", m.HugeTotal)
	}
	if m.HugeFree != 4 {
		t.Errorf("hugepages_free = %d", m.HugeFree)
	}
	if m.HugeSize != 2048*1024 {
		t.Errorf("hugepagesize = %d", m.HugeSize)
	}
}

func TestReadMeminfoLive(t *testing.T) {
	m, err := ReadMeminfo()
	if err != nil {
		t.Fatal(err)
	}
	_ = m
}

//go:build linux

package procfs

type Meminfo struct {
	Slab       uint64
	Dirty      uint64
	Writeback  uint64
	Mapped     uint64
	PageTables uint64
	HugeTotal  uint64
	HugeFree   uint64
	HugeSize   uint64
	SwapIn     uint64
	SwapOut    uint64
}

func ReadMeminfo() (*Meminfo, error) {
	return ReadMeminfoFrom("/proc/meminfo")
}

func ReadMeminfoFrom(path string) (*Meminfo, error) {
	kv, err := ParseKeyValueFile(path)
	if err != nil {
		return nil, err
	}

	return &Meminfo{
		Slab:       kv["Slab"] * 1024,
		Dirty:      kv["Dirty"] * 1024,
		Writeback:  kv["Writeback"] * 1024,
		Mapped:     kv["Mapped"] * 1024,
		PageTables: kv["PageTables"] * 1024,
		HugeTotal:  kv["HugePages_Total"],
		HugeFree:   kv["HugePages_Free"],
		HugeSize:   kv["Hugepagesize"] * 1024,
	}, nil
}

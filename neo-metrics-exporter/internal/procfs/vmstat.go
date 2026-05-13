//go:build linux

package procfs

type VMStat struct {
	PgFault    uint64
	PgMajFault uint64
	PswpIn     uint64
	PswpOut    uint64
	OomKill    uint64
}

func ReadVMStat() (*VMStat, error) {
	return ReadVMStatFrom("/proc/vmstat")
}

func ReadVMStatFrom(path string) (*VMStat, error) {
	kv, err := ParseKeyValueFile(path)
	if err != nil {
		return nil, err
	}

	return &VMStat{
		PgFault:    kv["pgfault"],
		PgMajFault: kv["pgmajfault"],
		PswpIn:     kv["pswpin"],
		PswpOut:    kv["pswpout"],
		OomKill:    kv["oom_kill"],
	}, nil
}

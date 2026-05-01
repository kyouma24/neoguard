//go:build !linux

package collector

func PlatformCollectors(disabled func(string) bool) []Collector {
	return nil
}

func PlatformSlowCollectors(disabled func(string) bool) []Collector {
	return nil
}

//go:build linux

package procfs

import (
	"bufio"
	"os"
	"strconv"
	"strings"
)

type NetSNMP struct {
	TCP NetSNMPTCP
	UDP NetSNMPUDP
}

type NetSNMPTCP struct {
	ActiveOpens uint64
	PassiveOpens uint64
	InSegs      uint64
	OutSegs     uint64
	RetransSegs uint64
	InErrs      uint64
	OutRsts     uint64
	EstabResets uint64
	CurrEstab   uint64
}

type NetSNMPUDP struct {
	InDatagrams  uint64
	OutDatagrams uint64
	InErrors     uint64
	NoPorts      uint64
	RcvbufErrors uint64
	SndbufErrors uint64
}

func ReadNetSNMP() (*NetSNMP, error) {
	return ReadNetSNMPFrom("/proc/net/snmp")
}

func ReadNetSNMPFrom(path string) (*NetSNMP, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	result := &NetSNMP{}
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, maxLineLength), maxLineLength)

	for scanner.Scan() {
		headerLine := scanner.Text()
		if !scanner.Scan() {
			break
		}
		valueLine := scanner.Text()

		headerFields := strings.Fields(headerLine)
		valueFields := strings.Fields(valueLine)

		if len(headerFields) < 2 || len(valueFields) < 2 {
			continue
		}
		if headerFields[0] != valueFields[0] {
			continue
		}

		protocol := strings.TrimSuffix(headerFields[0], ":")

		valueMap := make(map[string]uint64)
		for i := 1; i < len(headerFields) && i < len(valueFields); i++ {
			val, _ := strconv.ParseUint(valueFields[i], 10, 64)
			valueMap[headerFields[i]] = val
		}

		switch protocol {
		case "Tcp":
			result.TCP.ActiveOpens = valueMap["ActiveOpens"]
			result.TCP.PassiveOpens = valueMap["PassiveOpens"]
			result.TCP.InSegs = valueMap["InSegs"]
			result.TCP.OutSegs = valueMap["OutSegs"]
			result.TCP.RetransSegs = valueMap["RetransSegs"]
			result.TCP.InErrs = valueMap["InErrs"]
			result.TCP.OutRsts = valueMap["OutRsts"]
			result.TCP.EstabResets = valueMap["EstabResets"]
			result.TCP.CurrEstab = valueMap["CurrEstab"]
		case "Udp":
			result.UDP.InDatagrams = valueMap["InDatagrams"]
			result.UDP.OutDatagrams = valueMap["OutDatagrams"]
			result.UDP.InErrors = valueMap["InErrors"]
			result.UDP.NoPorts = valueMap["NoPorts"]
			result.UDP.RcvbufErrors = valueMap["RcvbufErrors"]
			result.UDP.SndbufErrors = valueMap["SndbufErrors"]
		}
	}

	return result, scanner.Err()
}

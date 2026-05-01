//go:build linux

package procfs

import "testing"

func TestReadPressureFromMock(t *testing.T) {
	cpuContent := `some avg10=1.50 avg60=2.30 avg300=3.10 total=12345678
`
	memContent := `some avg10=0.50 avg60=1.00 avg300=0.80 total=5000000
full avg10=0.10 avg60=0.20 avg300=0.15 total=1000000
`
	ioContent := `some avg10=5.00 avg60=3.50 avg300=2.00 total=50000000
full avg10=2.00 avg60=1.50 avg300=1.00 total=20000000
`

	cpuPath := writeTempFile(t, cpuContent)
	memPath := writeTempFile(t, memContent)
	ioPath := writeTempFile(t, ioContent)

	p, err := ReadPressureFrom(cpuPath, memPath, ioPath)
	if err != nil {
		t.Fatal(err)
	}

	if p.CPU == nil || p.CPU.Some == nil {
		t.Fatal("cpu.some missing")
	}
	if p.CPU.Some.Avg10 != 1.50 {
		t.Errorf("cpu.some.avg10 = %f", p.CPU.Some.Avg10)
	}
	if p.CPU.Some.Avg300 != 3.10 {
		t.Errorf("cpu.some.avg300 = %f", p.CPU.Some.Avg300)
	}
	if p.CPU.Full != nil {
		t.Error("cpu should not have full line")
	}

	if p.Memory == nil || p.Memory.Some == nil {
		t.Fatal("memory.some missing")
	}
	if p.Memory.Full == nil {
		t.Fatal("memory.full missing")
	}
	if p.Memory.Full.Avg10 != 0.10 {
		t.Errorf("memory.full.avg10 = %f", p.Memory.Full.Avg10)
	}

	if p.IO == nil || p.IO.Some == nil {
		t.Fatal("io.some missing")
	}
	if p.IO.Some.Avg10 != 5.00 {
		t.Errorf("io.some.avg10 = %f", p.IO.Some.Avg10)
	}
	if p.IO.Full.Avg10 != 2.00 {
		t.Errorf("io.full.avg10 = %f", p.IO.Full.Avg10)
	}
}

func TestReadPressureLive(t *testing.T) {
	p, err := ReadPressure()
	if err != nil {
		t.Skip("PSI not available:", err)
	}
	if p.CPU != nil && p.CPU.Some != nil {
		if p.CPU.Some.Avg10 < 0 {
			t.Error("cpu avg10 should be >= 0")
		}
	}
}

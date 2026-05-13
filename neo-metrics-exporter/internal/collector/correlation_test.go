package collector

import (
	"context"
	"testing"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

func TestCorrelationCollectorName(t *testing.T) {
	c := NewProcessCorrelationCollector()
	if c.Name() != "correlation" {
		t.Errorf("name = %q", c.Name())
	}
}

func TestCorrelationCPUTopProcess(t *testing.T) {
	c := NewProcessCorrelationCollector()
	input := []model.MetricPoint{
		model.NewGauge("process.cpu_pct", 50, map[string]string{"process_name": "nginx", "process_pid": "100"}),
		model.NewGauge("process.cpu_pct", 80, map[string]string{"process_name": "java", "process_pid": "200"}),
		model.NewGauge("process.cpu_pct", 30, map[string]string{"process_name": "python", "process_pid": "300"}),
	}

	points, err := c.CollectComposite(context.Background(), map[string]string{}, input)
	if err != nil {
		t.Fatal(err)
	}

	topCPU := findPointByName(points, "system.cpu.top_process")
	if topCPU == nil {
		t.Fatal("missing system.cpu.top_process")
	}
	if topCPU.Value != 80 {
		t.Errorf("top cpu = %f, want 80", topCPU.Value)
	}
	if topCPU.Tags["process_name"] != "java" {
		t.Errorf("top process = %q, want java", topCPU.Tags["process_name"])
	}
}

func TestCorrelationTop3Sum(t *testing.T) {
	c := NewProcessCorrelationCollector()
	input := []model.MetricPoint{
		model.NewGauge("process.cpu_pct", 50, map[string]string{"process_name": "a", "process_pid": "1"}),
		model.NewGauge("process.cpu_pct", 30, map[string]string{"process_name": "b", "process_pid": "2"}),
		model.NewGauge("process.cpu_pct", 20, map[string]string{"process_name": "c", "process_pid": "3"}),
		model.NewGauge("process.cpu_pct", 10, map[string]string{"process_name": "d", "process_pid": "4"}),
	}

	points, err := c.CollectComposite(context.Background(), map[string]string{}, input)
	if err != nil {
		t.Fatal(err)
	}

	top3 := findPointByName(points, "system.cpu.top3_pct")
	if top3 == nil {
		t.Fatal("missing system.cpu.top3_pct")
	}
	if top3.Value != 100 {
		t.Errorf("top3 cpu = %f, want 100 (50+30+20)", top3.Value)
	}
}

func TestCorrelationMemoryTopProcess(t *testing.T) {
	c := NewProcessCorrelationCollector()
	input := []model.MetricPoint{
		model.NewGauge("process.memory_bytes", 1000000, map[string]string{"process_name": "small", "process_pid": "1"}),
		model.NewGauge("process.memory_bytes", 9000000, map[string]string{"process_name": "big", "process_pid": "2"}),
	}

	points, err := c.CollectComposite(context.Background(), map[string]string{}, input)
	if err != nil {
		t.Fatal(err)
	}

	topMem := findPointByName(points, "system.memory.top_process")
	if topMem == nil {
		t.Fatal("missing system.memory.top_process")
	}
	if topMem.Tags["process_name"] != "big" {
		t.Errorf("top memory process = %q, want big", topMem.Tags["process_name"])
	}
}

func TestCorrelationIOTopProcess(t *testing.T) {
	c := NewProcessCorrelationCollector()
	input := []model.MetricPoint{
		model.NewGauge("process.io_read_bytes", 100, map[string]string{"process_name": "a", "process_pid": "1"}),
		model.NewGauge("process.io_write_bytes", 200, map[string]string{"process_name": "a", "process_pid": "1"}),
		model.NewGauge("process.io_read_bytes", 500, map[string]string{"process_name": "b", "process_pid": "2"}),
		model.NewGauge("process.io_write_bytes", 500, map[string]string{"process_name": "b", "process_pid": "2"}),
	}

	points, err := c.CollectComposite(context.Background(), map[string]string{}, input)
	if err != nil {
		t.Fatal(err)
	}

	topIO := findPointByName(points, "system.io.top_process")
	if topIO == nil {
		t.Fatal("missing system.io.top_process")
	}
	if topIO.Value != 1000 {
		t.Errorf("top io = %f, want 1000 (500+500)", topIO.Value)
	}
	if topIO.Tags["process_name"] != "b" {
		t.Errorf("top io process = %q, want b", topIO.Tags["process_name"])
	}
}

func TestCorrelationNoProcessData(t *testing.T) {
	c := NewProcessCorrelationCollector()
	points, err := c.CollectComposite(context.Background(), map[string]string{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(points) != 0 {
		t.Errorf("expected no points with no process data, got %d", len(points))
	}
}

func TestCorrelationFewerThan3(t *testing.T) {
	c := NewProcessCorrelationCollector()
	input := []model.MetricPoint{
		model.NewGauge("process.cpu_pct", 50, map[string]string{"process_name": "only", "process_pid": "1"}),
	}

	points, err := c.CollectComposite(context.Background(), map[string]string{}, input)
	if err != nil {
		t.Fatal(err)
	}

	top3 := findPointByName(points, "system.cpu.top3_pct")
	if top3 == nil {
		t.Fatal("missing system.cpu.top3_pct")
	}
	if top3.Value != 50 {
		t.Errorf("top3 with 1 process = %f, want 50", top3.Value)
	}
}

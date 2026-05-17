package collector

import (
	"testing"
)

func TestLogStatsIncrementAndCollect(t *testing.T) {
	stats := NewLogStats()

	stats.Increment("agent.logs.parser_errors", map[string]string{"source": "/var/log/app.log", "parser_mode": "json"})
	stats.Increment("agent.logs.parser_errors", map[string]string{"source": "/var/log/app.log", "parser_mode": "json"})
	stats.Increment("agent.logs.parser_errors", map[string]string{"source": "/var/log/other.log", "parser_mode": "regex"})

	points := stats.Collect(map[string]string{"hostname": "test-host"})

	if len(points) != 2 {
		t.Fatalf("expected 2 points, got %d", len(points))
	}

	var appCount, otherCount float64
	for _, p := range points {
		if p.Tags["source"] == "/var/log/app.log" {
			appCount = p.Value
		} else if p.Tags["source"] == "/var/log/other.log" {
			otherCount = p.Value
		}
	}

	if appCount != 2 {
		t.Errorf("app.log count = %f, want 2", appCount)
	}
	if otherCount != 1 {
		t.Errorf("other.log count = %f, want 1", otherCount)
	}

	for _, p := range points {
		if p.Tags["hostname"] != "test-host" {
			t.Errorf("missing base tag hostname on point %s", p.Name)
		}
	}
}

func TestLogStatsMonotonic(t *testing.T) {
	stats := NewLogStats()

	stats.Increment("agent.logs.dead_lettered", map[string]string{"reason": "retry_exhausted"})

	points1 := stats.Collect(nil)
	if len(points1) != 1 {
		t.Fatalf("first collect: expected 1 point, got %d", len(points1))
	}
	if points1[0].Value != 1 {
		t.Errorf("first collect value = %f, want 1", points1[0].Value)
	}

	// Second collect returns same cumulative value (monotonic, no reset)
	points2 := stats.Collect(nil)
	if len(points2) != 1 {
		t.Fatalf("second collect: expected 1 point, got %d", len(points2))
	}
	if points2[0].Value != 1 {
		t.Errorf("second collect value = %f, want 1 (monotonic)", points2[0].Value)
	}

	// Increment again — value grows
	stats.Increment("agent.logs.dead_lettered", map[string]string{"reason": "retry_exhausted"})
	points3 := stats.Collect(nil)
	if len(points3) != 1 {
		t.Fatalf("third collect: expected 1 point, got %d", len(points3))
	}
	if points3[0].Value != 2 {
		t.Errorf("third collect value = %f, want 2", points3[0].Value)
	}
}

func TestLogStatsAdd(t *testing.T) {
	stats := NewLogStats()

	stats.Add("agent.logs.buffer_dropped_batches", 50, map[string]string{"reason": "critical_watermark"})
	stats.Add("agent.logs.buffer_dropped_batches", 25, map[string]string{"reason": "critical_watermark"})

	points := stats.Collect(nil)
	if len(points) != 1 {
		t.Fatalf("expected 1 point, got %d", len(points))
	}
	if points[0].Value != 75 {
		t.Errorf("value = %f, want 75", points[0].Value)
	}
}

func TestLogStatsNilTags(t *testing.T) {
	stats := NewLogStats()

	stats.Increment("agent.logs.buffer_high_watermark", nil)

	points := stats.Collect(nil)
	if len(points) != 1 {
		t.Fatalf("expected 1 point, got %d", len(points))
	}
	if points[0].Value != 1 {
		t.Errorf("value = %f, want 1", points[0].Value)
	}
}

func TestLogStatsCollisionSafeTags(t *testing.T) {
	stats := NewLogStats()

	// These tag sets should NOT collide even though delimiter-based encoding would
	stats.Increment("test", map[string]string{"a": "b,c=d"})
	stats.Increment("test", map[string]string{"a,c": "b", "": "d"})

	points := stats.Collect(nil)
	if len(points) != 2 {
		t.Errorf("expected 2 distinct points (no collision), got %d", len(points))
	}
}

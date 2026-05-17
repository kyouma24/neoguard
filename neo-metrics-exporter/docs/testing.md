# Testing Guide

## Race Detector

Go's race detector (`-race`) requires CGO, which is unavailable on Windows-native builds.
All concurrent code **must** be race-tested on Linux before merging.

### Local (Docker)

```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd):/app" -w /app golang:1.24 go test -race ./...
```

### Targeted (specific package)

```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd):/app" -w /app golang:1.24 go test -race ./internal/agent/
```

### CI (GitHub Actions — nightly)

The `-race` flag should run on Linux runners nightly for all packages with concurrent code:
- `internal/agent/` (supervisor, clock guard, signal handlers)
- `internal/buffer/` (concurrent push/drain)
- `internal/transport/` (concurrent send)

### Packages verified with -race

| Package | Date | Result |
|---------|------|--------|
| `internal/agent/` (supervisor) | 2026-05-13 | PASS (Docker golang:1.24, 14 tests) |
| `internal/agent/` (memguard) | 2026-05-13 | PASS (Docker golang:1.24, 16 tests) |
| `internal/agent/` (backpressure+transmitter) | 2026-05-13 | PASS (Docker golang:1.24, -count=10, 17 tests) |
| `internal/buffer/` (replay watermark) | 2026-05-13 | PASS (Docker golang:1.24, -count=10) |
| `internal/agent/` (full package) | 2026-05-13 | PASS (Docker golang:1.24, -count=3, all tests) |

## Standard Test Suites

```bash
# All tests (Windows-native)
go test ./...

# Verbose with specific package
go test -v ./internal/agent/

# With timeout
go test -timeout 60s ./internal/buffer/
```

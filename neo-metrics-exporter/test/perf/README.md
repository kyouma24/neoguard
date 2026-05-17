---
Last updated: 2026-05-17
Verified on version: 0.3.0
---

# Performance Regression Suite

Go benchmarks and a baseline comparison system to detect performance regressions before release.

## Running Benchmarks

```bash
# Run benchmarks only (no regression check)
make bench

# Run benchmarks and compare against baselines
make bench-check
```

## How It Works

1. `bench_test.go` contains Go benchmarks for critical paths: ring buffer, WAL writes, config loading, log parsing, and credential redaction.
2. `baselines.json` stores locked ns/op values from a known-good run.
3. `check_regression.sh` runs benchmarks with `-count=5` for stability, compares each against baselines, and fails if any benchmark regresses >10%.

## Updating Baselines

When a regression is expected (new feature, intentional tradeoff):

```bash
make bench-update
```

This runs benchmarks and overwrites `baselines.json` with current values. Commit the updated baselines.

## Baselines File

`baselines.json` structure:
- `benchmarks.*`: ns/op values per benchmark (null = not yet populated)
- `binary_size_bytes`: last known binary size (null = not yet measured)
- `binary_size_limit_bytes`: hard cap (15 MB per strategy §1.2)
- `_threshold_pct`: regression threshold percentage
- `_bench_count`: number of iterations for statistical stability

## Initial Setup

On first run, all baselines are `null`. The regression check exits 0 with a message to populate baselines. Run `make bench-update` after the first successful build on CI to establish the baseline.

## CI Integration

The CI workflow runs `make bench-check` on pushes to main/master. It does not block pull requests (per ticket non-goals) — only main branch.

## Binary Size Check

The script also checks `bin/neoguard-agent-linux-amd64` against `binary_size_limit_bytes` (15 MB). If the binary exceeds this, the check fails.

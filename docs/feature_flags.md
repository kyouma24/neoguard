# Feature Flags

Feature flags are stored in Redis as a hash at key `neoguard:feature_flags`. They can be toggled at runtime without restart.

## API

- `GET /api/v1/system/feature-flags` — returns all flags with current values (no auth required)
- `PUT /api/v1/system/feature-flags/{flag_name}?enabled=true|false` — set a flag (admin scope required)

## Flags

| Flag | Default | Purpose | Rollback Procedure | Owner |
|------|---------|---------|-------------------|-------|
| `dashboards.batch_queries` | ON | Routes all eligible panel queries through the streaming NDJSON batch endpoint | Set to OFF: panels fall back to individual per-panel fetches via WidgetRenderer | Platform |
| `dashboards.viewport_loading` | ON | Only fetches/renders panels visible in the viewport (IntersectionObserver) | Set to OFF: all panels render immediately (higher initial load, no skeleton flash) | Platform |
| `metrics.cardinality_denylist` | ON | Blocks tag value enumeration for known high-cardinality tags | Set to OFF: denylist bypassed (hard limits still enforced) | Platform |
| `mql.streaming_batch` | ON | Returns batch query results as streaming NDJSON | Set to OFF: returns results as a single JSON array response | Platform |

## Storage

Redis hash key: `neoguard:feature_flags`
- Field = flag name (e.g., `dashboards.batch_queries`)
- Value = `"1"` (enabled) or `"0"` (disabled)
- Missing field = uses hardcoded default (all ON)

## Fail-Open Behavior

If Redis is unavailable, all flags fall back to their hardcoded defaults (all enabled). This prevents a Redis outage from disabling production features.

## CLI Toggle

```bash
# Enable a flag
redis-cli HSET neoguard:feature_flags "dashboards.batch_queries" "1"

# Disable a flag
redis-cli HSET neoguard:feature_flags "dashboards.batch_queries" "0"

# View all flags
redis-cli HGETALL neoguard:feature_flags

# Reset to defaults (remove all overrides)
redis-cli DEL neoguard:feature_flags
```

## Frontend Integration

The `useFeatureFlags()` hook fetches flags from the system endpoint with 60s stale time. The `useFeatureFlag(name)` hook returns a single boolean. Both fall back to ON defaults if the API is unreachable.

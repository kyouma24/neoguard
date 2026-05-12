# Cloud Migration Guide

This document maps every `TODO(production)` marker in the codebase to its migration path. Each section corresponds to a category of local-dev assumptions that must be addressed before multi-worker production deployment.

## credential-caches

**Affected files:**
- `src/neoguard/services/azure/credentials.py` — Azure credential + client + secret caches
- `src/neoguard/services/aws/credentials.py` — AWS STS session cache
- `src/neoguard/services/collection/orchestrator.py` — Enabled region cache

**Current:** Process-local Python dicts with TTL. Each Uvicorn worker maintains its own cache instance. Workers redundantly refresh credentials.

**Cloud solution:** Redis hash per cache (e.g., `neoguard:aws_sessions:{account_id}`) with TTL matching credential expiry. Serialized via orjson. Workers share cached credentials, reducing STS/Azure AD API calls.

**Migration steps:**
1. Create `src/neoguard/services/credential_cache.py` — shared Redis-backed cache with get/set/TTL
2. Replace dict lookups with async Redis gets (fallback to dict for dev)
3. Add cache hit/miss metrics
4. Test with 4 workers — verify single credential refresh per TTL window

**Risk:** Low. Credential refresh is idempotent. Worst case: multiple workers refresh simultaneously during Redis outage (same as current behavior).

---

## background-singletons

**Affected files:**
- `src/neoguard/services/alerts/engine.py` — AlertEngine singleton
- `src/neoguard/services/collection/orchestrator.py` — CollectionOrchestrator singleton
- `src/neoguard/services/metrics/writer.py` — MetricBatchWriter singleton
- `src/neoguard/services/logs/writer.py` — LogBatchWriter singleton
- `src/neoguard/services/telemetry/collector.py` — TelemetryCollector singleton

**Current:** Module-level singletons instantiated per-worker. All workers run all background tasks independently.

**Cloud solution:** Distributed leader election via Redis (Redlock algorithm). Only the elected leader runs singleton background tasks. Workers that lose leadership gracefully stop their loops.

**Migration steps:**
1. Create `src/neoguard/services/leader_election.py` — Redlock-based leader lease (15s TTL, 10s renewal)
2. Modify `main.py` lifespan: background tasks only start if worker is leader
3. Leader loss triggers graceful shutdown of background tasks (drain buffers first)
4. Batch writers (metrics, logs) continue on all workers — they're safe to run concurrently
5. Alert engine + orchestrator: leader-only (concurrent evaluation causes duplicate alerts)
6. Telemetry collector: leader-only (aggregation needs single source)

**Risk:** High. Alert engine concurrent evaluation causes duplicate notifications. Orchestrator concurrent discovery causes duplicate API calls to AWS/Azure.

---

## redis-ha

**Affected files:**
- `src/neoguard/db/redis/connection.py` — Single Redis connection
- `src/neoguard/core/config.py` — `redis_url` hardcoded to localhost
- `src/neoguard/services/feature_flags.py` — Feature flag storage

**Current:** Single Redis instance at `localhost:6379/0`. No failover, no replication, no cluster awareness.

**Cloud solution:** AWS ElastiCache Redis with Multi-AZ, automatic failover, and read replicas. Connection via `redis.asyncio.RedisCluster` or Sentinel-aware connection.

**Migration steps:**
1. Add `redis_cluster_mode: bool = False` and `redis_sentinel_hosts: list[str] = []` to config
2. Modify `init_redis()` to use `RedisCluster` or `Sentinel` based on config
3. Ensure all Redis operations use cluster-compatible commands (no multi-key ops across slots)
4. Feature flags: single hash key, always in same slot — no changes needed
5. Sessions: key-per-session, no cross-key ops — no changes needed
6. Rate limiter: key-per-user, INCR + EXPIRE — cluster-safe
7. Query cache: key-per-query, GET/SET/DEL — cluster-safe

**Risk:** Medium. `redis.asyncio` supports cluster mode but API differs slightly. Need to test all Redis callers.

---

## cardinality-denylist

**Affected files:**
- `src/neoguard/core/config.py` — `high_cardinality_tag_denylist` static list

**Current:** Global hardcoded list of 7 tag names. Applied equally to all tenants. Cannot be overridden per-tenant.

**Cloud solution:** DB table `tag_cardinality_observations` storing per-tenant observed cardinality. Merge hardcoded list with runtime observations. Admin UI to manage per-tenant overrides.

**Migration steps:**
1. Create migration: `tag_cardinality_observations` table (see Task -1.6 schema)
2. Background job: daily HyperLogLog sampling of tag cardinality per tenant
3. Modify tag-values endpoint: check BOTH hardcoded list AND observations table
4. Add admin API: `GET/PUT /api/v1/admin/tenants/{id}/cardinality-config`
5. UI: tenant settings page, "High Cardinality Tags" section

**Risk:** Low. Hardcoded list remains as baseline. Adaptive detection is additive.

---

## sse-realtime

**Affected files:**
- `src/neoguard/api/routes/sse.py` — Heartbeat-only SSE stream

**Current:** SSE endpoint sends only heartbeat + lifecycle events. No actual data push. Clients must poll for metric updates.

**Cloud solution:** Redis Streams or pub/sub for event fan-out. Each worker subscribes to relevant channels and forwards events to connected SSE clients.

**Migration steps:**
1. Create `src/neoguard/services/realtime/publisher.py` — publishes metric updates to Redis Stream
2. Create `src/neoguard/services/realtime/subscriber.py` — subscribes to Redis Stream, yields events
3. Modify SSE route: after initial connection, subscribe to `neoguard:events:{tenant_id}:{dashboard_id}`
4. Metric writer: after flush, publish summary to Redis Stream
5. Alert engine: on state transition, publish alert event
6. Handle connection affinity: client reconnects to any worker, subscriber resumes from last ID

**Risk:** Medium. Redis Streams are cluster-safe but require careful consumer group management. Connection drops need graceful reconnection with event replay.

---

## admin-tenant-selector

**Affected files:**
- `src/neoguard/api/deps.py` — `get_query_tenant_id` uses `?tenant_id=X` query param

**Current:** Super admin passes tenant context via URL query parameter. Frontend auto-fills from dashboard metadata when viewing a specific dashboard.

**Cloud solution:** Admin UI tenant context switcher. Selected tenant persisted in session. All API calls automatically scoped without query param.

**Migration steps:**
1. Add `admin_tenant_context: str | None` to session data
2. Modify `get_query_tenant_id`: if super admin + session has `admin_tenant_context`, use it as fallback before raising 400
3. Frontend: add tenant selector dropdown in admin header bar
4. API: `PUT /auth/me/admin-context` to set active tenant context

**Risk:** Low. Frontend-only change initially. Backend contract (query param) remains supported for API consumers.

---

## cache-coordination

**Affected files:**
- `src/neoguard/services/mql/cache.py` — Stale-while-revalidate query cache

**Current:** Single-process cache refresh. When cache age exceeds TTL, one request serves stale data and triggers async refresh in same worker. Other requests to same key (same worker) get STALE status from shared process memory.

**Cloud solution:** Redis-based cache stampede protection (SET NX with refresh lock). First worker to detect stale entry acquires distributed lock (`neoguard:refresh_lock:{cache_key}` with 10s TTL), refreshes, and writes result. Other workers serve stale data without attempting refresh.

**Migration steps:**
1. Modify `get_cached()` to check for refresh lock before flagging STALE
2. On STALE: attempt `SET NX refresh_lock:{key} 1 EX 10`
3. If lock acquired: worker proceeds with refresh (current behavior)
4. If lock not acquired: return FRESH (pretend stale data is fresh, skip refresh)
5. Refresh completion: `DEL refresh_lock:{key}` and `SET cache:{key}` atomically
6. Add metric: `cache_refresh_lock_contention` (count of workers that skipped refresh)

**Risk:** Medium. Cache stampede protection reduces DB load spikes on expiry. Worst case: refresh lock holder crashes and lock expires after 10s, next worker retries. Stale data served for max 10s beyond expiry.

---

## single-flight

**Affected files:**
- `src/neoguard/services/mql/executor.py` — (Phase 1: single-flight dedup layer)

**Current:** Not yet implemented. Identical concurrent queries execute independently, hitting the DB multiple times.

**Cloud solution:** Process-local single-flight first (asyncio.Event-based dedup). For multi-worker, upgrade to Redis-based distributed lock with result sharing via Redis cache.

**Migration steps:**
1. Phase 1: Implement process-local single-flight in executor (asyncio.shield + in-flight dict)
2. Cloud: Replace in-flight dict with Redis SET NX + PX (distributed lock)
3. Waiting callers poll Redis cache for result (set by winner)
4. Timeout: if lock holder doesn't write result in 5s, waiters fall through to direct execution

**Risk:** Medium. Process-local is straightforward. Distributed version needs careful timeout + cleanup logic to avoid deadlocks if lock holder crashes.

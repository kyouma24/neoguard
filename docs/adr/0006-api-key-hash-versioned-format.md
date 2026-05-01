# ADR-0006: API Key Hash Migration — Versioned Format (SHA-256 v1 to Argon2id v2)

**Status**: Accepted  
**Date**: 2026-05-01  
**Author**: ObserveLabs Engineering

---

## Context

NeoGuard currently uses SHA-256 for API key hashing with a ULID-based key format. The ObserveLabs specs (`08-api-keys.md`) prescribe `obl_live_<32 base62>` format with Argon2id hashing.

SHA-256 is a fast hash. For API keys specifically (high entropy, not human-chosen passwords), SHA-256 is acceptable because brute-forcing a 128-bit key is computationally infeasible regardless of hash speed. However, Argon2id provides defense-in-depth: if the key database is leaked, the memory-hard hash function raises the cost of offline brute-force attacks by orders of magnitude, even against shorter or lower-entropy keys that may appear in the future.

Existing API keys are in production use. A hard cutover would break every integration overnight. We need a migration path that preserves backward compatibility while moving all new keys to the stronger algorithm.

## Decision

**Versioned format with coexistence period.** Two key versions coexist, distinguished by a `hash_version` column on the `api_keys` table.

### Key Versions

| Version | Format | Hash Algorithm | Parameters |
|---------|--------|----------------|------------|
| v1 (existing) | Current ULID-based format | SHA-256 | N/A |
| v2 (new) | `obl_live_<32 base62>` | Argon2id | memory=64MB, iterations=3, parallelism=1 (OWASP recommended) |

Version is **not** encoded as a literal `_v1_` or `_v2_` in the key itself. The version is determined by the `hash_version` integer column stored alongside the hash in the database (1 = SHA-256, 2 = Argon2id).

### Verification Logic

When an API key is presented for authentication:

1. Look up the key record by `key_prefix` (first 11 characters).
2. Read the `hash_version` column.
3. Dispatch to the correct hasher:
   - `hash_version = 1`: compute SHA-256 of the presented key and compare.
   - `hash_version = 2`: verify with Argon2id using stored hash.
4. Proceed with normal scope and rate-limit checks.

### Observability on v1 Usage

When a v1 key is successfully verified:

- **Metric**: emit `api_keys.deprecated_version_used` counter, tagged with `key_prefix`.
- **Structured log**: `{"event": "deprecated_api_key_used", "key_prefix": "...", "hash_version": 1}`.

This gives operators visibility into v1 adoption rate and identifies which integrations need rotation.

### Deprecation UI

- **Settings page banner**: v1 keys display a warning — "This key uses an older format. Rotate for improved security."
- **Key list**: each key shows a version badge (v1 / v2) so users can identify which keys need rotation at a glance.

### Sunset Timeline

All dates are relative to ObserveLabs launch date:

| Milestone | Action |
|-----------|--------|
| Launch | v1 keys continue to work normally. All new keys are v2. |
| Launch + 6 months | Email notification sent to v1 key owners urging rotation. |
| Launch + 11 months | API response header `X-Key-Deprecated: true` added to every request authenticated with a v1 key. |
| Launch + 12 months | v1 keys return `401 Unauthorized` with a response body directing the user to rotate their key. |

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Hard cutover to Argon2id | Breaks all existing integrations immediately. Unacceptable for production users. |
| Keep SHA-256 permanently | Misses defense-in-depth opportunity. Diverges from the ObserveLabs spec. Makes future security audits harder to pass. |
| Bcrypt instead of Argon2id | Bcrypt is battle-tested but not memory-hard. Argon2id is the current OWASP recommendation and provides stronger resistance to GPU/ASIC attacks. Aligns with the auth stack already chosen for password hashing (ADR-0001). |

## Consequences

### Positive

- **Zero breakage** for existing users. All v1 keys continue to work for 12 months after launch.
- **Clear migration path** with escalating urgency (banner, email, header, hard cutoff).
- **Observability** into v1 adoption rate enables data-driven decisions about accelerating or delaying the sunset.
- **Defense-in-depth** for new keys. Even if the key database is exfiltrated, Argon2id makes offline brute-force prohibitively expensive.
- **Spec alignment**. New key format (`obl_live_<32 base62>`) matches the ObserveLabs product spec.

### Negative

- **Dual verification code path** adds small complexity to the auth middleware. Two hash functions must be maintained and tested.
- **12-month maintenance window** for v1 support. Engineering must track the sunset timeline and execute each milestone.
- **Argon2id adds approximately 100ms** to key verification compared to SHA-256's sub-millisecond speed. Acceptable because: (a) key verification happens once per request, not per query; (b) the verified key can be cached in Redis for the request's lifetime; (c) 100ms is well within the 200ms p99 latency budget.

## Review Trigger

Revisit this ADR when any of the following occur:

- **v1 usage drops to 0%** — remove the v1 verification path early and simplify the codebase.
- **Argon2id verification latency exceeds 200ms** — tune memory/iteration parameters or introduce a short-lived verification cache.
- **Key database breach occurs** — accelerate the v1 sunset timeline regardless of adoption metrics.

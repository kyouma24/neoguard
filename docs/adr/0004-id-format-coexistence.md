# ADR-0004: ID Format Coexistence — ULID (Existing) + UUIDv7 (New)

**Status**: Accepted  
**Date**: 2026-05-01  
**Author**: ObserveLabs Engineering

---

## Context

NeoGuard currently uses ULID (`python-ulid`) for all generated IDs across all tables — resources, metrics, alert rules, notification channels, API keys, and more. The 12 ObserveLabs product specs prescribe UUIDv7 (RFC 9562) as the standard identifier format for all new tables.

Both ULID and UUIDv7 are 128-bit, time-ordered identifiers. Critically, both are binary-compatible in PostgreSQL `uuid` columns: a ULID can be stored and queried as a native Postgres uuid without any conversion, and UUIDv7 is a first-class uuid variant. Both sort chronologically by default, preserving insert-order locality in B-tree indexes.

A full migration of existing tables from ULID to UUIDv7 would require:

- Altering every primary key and foreign key across all existing tables
- Updating every service module that generates or references IDs
- Rewriting or adapting all 630 existing tests
- Coordinating migration scripts for production data with potential downtime

This is high risk and low reward given that the two formats are functionally equivalent for our use cases.

## Decision

**Coexistence**: existing tables keep ULID. All new tables use UUIDv7.

### Existing Tables (ULID — No Change)

All tables created before Phase 1 continue to use ULID via `from ulid import ULID`. These include: `resources`, `metrics_raw`, `metrics_1m`, `metrics_1h`, `alert_rules`, `alert_events`, `alert_silences`, `notification_channels`, `api_keys`, `cloud_accounts`, and all other pre-existing tables.

### New Tables (UUIDv7 — Going Forward)

All tables introduced in Phase 1 and beyond use UUIDv7. These include: `tenants`, `users`, `tenant_memberships`, `user_invites`, `oauth_identities`, `audit_log`, `platform_audit_log`, `security_log`, and all future tables.

UUIDv7 generation uses `uuid7()` from the `uuid-utils` package (MIT-licensed, pure Python with optional C extension).

### Cross-Domain Foreign Keys

When a new UUIDv7-based table references an existing ULID-based table via foreign key, it stores the ULID value as-is in a `uuid` column. No conversion is needed — Postgres treats both as native `uuid` values. The constraint is that ID format must not be mixed **within** a single feature domain: a table either generates ULIDs or UUIDv7s, never both.

### Full Migration (Deferred)

A complete ULID-to-UUIDv7 migration is deferred to a dedicated sprint estimated post-Phase 4, when the majority of tables will already be UUIDv7-native. At that point the migration scope will be smaller and the risk proportionally lower.

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Migrate all existing tables to UUIDv7 now | Touches every FK, every test, every service module. High risk of regressions for zero functional benefit. Both formats are binary-compatible and time-ordered. |
| Standardize on ULID for new tables too | Ignores the spec direction and the broader ecosystem momentum toward UUIDv7 (RFC 9562). ULID lacks a formal RFC and has weaker library support in some languages. |
| Use string-based IDs instead of uuid columns | Wastes storage (36 bytes vs 16 bytes), loses native Postgres uuid indexing and comparison operators, breaks type safety. |
| Use UUIDv4 for new tables | Not time-ordered. Loses insert-order locality, degrades B-tree index performance, and prevents ID-based chronological sorting that monitoring dashboards rely on. |

## Consequences

### Positive

- **Zero migration risk in Phase 1**: existing 630 tests remain unaffected. No schema changes to production tables.
- **Both formats sort correctly by time**: dashboards, pagination, and "latest first" queries work identically regardless of which format generated the ID.
- **Postgres treats both as native uuid**: no casting, no type mismatch errors, no index incompatibility. JOINs between ULID-based and UUIDv7-based tables work transparently.
- **Clear boundary**: developers can determine ID format by checking whether a table is pre-Phase 1 (ULID) or post-Phase 1 (UUIDv7). No ambiguity within a single table.
- **Aligns with spec direction**: new code follows the ObserveLabs standard from day one, reducing future migration scope.

### Negative

- **Two ID generation patterns in codebase**: some modules import `from ulid import ULID`, others import `from uuid_utils import uuid7`. Developers must know which pattern applies to the table they are working with.
- **Mixed formats in logs and API responses**: a single API response that joins across old and new tables may contain both ULID-formatted and UUIDv7-formatted IDs. This is cosmetic but could cause confusion during debugging.
- **Deferred migration debt**: the full migration sprint must eventually happen. Until then, the codebase carries two patterns.

## Review Trigger

Revisit this ADR when any of the following occur:

- All existing ULID-based tables have been superseded or are candidates for schema migration (estimated post-Phase 4)
- A third ID format is proposed for any reason
- Cross-domain JOINs between ULID and UUIDv7 tables cause measurable query planning issues
- The `uuid-utils` package is deprecated or a better UUIDv7 library emerges in the Python ecosystem

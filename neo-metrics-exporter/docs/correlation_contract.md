# Correlation Contract

> **Version:** 1.1
> **Date:** 2026-05-14
> **Status:** Active
> **Ticket:** AGENT-001

This document defines how NeoGuard correlates all observability data (metrics, future logs, agent state, cloud resources) for a single machine or VM. All producers and consumers of telemetry must conform to this contract.

---

## 1. Canonical Join Keys

All NeoGuard observability data for a single resource is correlated through exactly three keys:

| Key | Source of Truth | Mutability | Scope |
|---|---|---|---|
| `tenant_id` | Backend auth layer (API key session) | Immutable per API key | Partition key for all data |
| `resource_id` | Agent identity resolver (`Identity.InstanceID`) | Stable per machine lifecycle | Primary resource join key |
| `agent_id` | Agent identity persistence (`<stateDir>/agent_id`) | Stable per agent installation | Agent installation identity |

### 1.1 tenant_id

- **Derived by:** Backend authentication middleware only (`get_tenant_id_required(request)` in `src/neoguard/api/routes/agents.py`).
- **Never trusted from:** Agent payloads. The `MetricBatch.tenant_id` field is ignored by the backend; the authenticated tenant is always used.
- **Purpose:** Partition isolation. Every query, every table, every join includes `tenant_id` as a required filter.
- **Agent responsibility:** None. The agent does not send, derive, or store `tenant_id`.

### 1.2 resource_id

- **Definition:** An immutable identifier for the compute resource (VM, bare metal host) running the agent.
- **Field mapping:** `Identity.InstanceID` in Go, `resource_id` in backend models and metric tags.
- **Agent sends as:** `resource_id` in registration payload (`AgentRegisterRequest.resource_id`), and as the tag `resource_id` on every metric point.

#### Sources by Provider

| Provider | Source | Format | Stability | Implementation |
|---|---|---|---|---|
| AWS | EC2 Instance ID via IMDSv2 | `i-0123456789abcdef0` | Immutable for instance lifetime | `internal/identity/aws.go` - `Detect()` fetches `/latest/meta-data/instance-id` |
| Azure | VM ID via Azure IMDS | UUID (e.g., `12345678-abcd-...`) | Immutable for VM lifetime | `internal/identity/azure.go` - `Detect()` parses `compute.vmId` |
| On-prem (Linux) | `/etc/machine-id` or `/var/lib/dbus/machine-id` | `host-<machine-id-hex>` | Stable across reboots, changes on OS reinstall | `internal/identity/machineid.go` - `readMachineID()` |
| Unknown / Fallback | OS hostname | `host-<hostname>` | **Explicitly unstable** - changes on hostname change | `internal/identity/resolver.go` - `fallbackIdentity()` |

#### resource_id Rules

1. `resource_id` is **always** set. The resolver never returns an empty `InstanceID`.
2. On-prem and fallback values are prefixed with `host-` to distinguish them from cloud instance IDs.
3. The fallback (hostname-based) `resource_id` is logged with `resolved_via: "hostname-fallback"` and is explicitly unstable.
4. A change in `resource_id` between agent restarts is logged as a warning (`identity_changed` in `persistence.go`).
5. Backend accepts `resource_id` as `str | None` on registration (`AgentRegisterRequest.resource_id`), but the agent always provides it.

### 1.3 agent_id

- **Definition:** A stable identifier for a specific agent installation on a specific resource.
- **Persistence:** Written to `<stateDir>/agent_id` on first run, read on subsequent runs.
- **Agent sends as:** `agent_id_external` in lifecycle requests, and as the tag `agent_id` on every metric point.

#### Derivation Rules

| Condition | Derivation | Determinism |
|---|---|---|
| Existing `<stateDir>/agent_id` file | Read from file | Deterministic (persisted) |
| AWS or Azure provider detected | `UUIDv5(NeoGuard namespace, "<provider>:<resource_id>")` | Deterministic (reproducible) |
| On-prem or unknown provider | `UUIDv4()` (random) | **Not deterministic** - reinstall creates new identity |

- **Implementation:** `deriveAgentID()` in `internal/identity/persistence.go`.
- **Namespace UUID:** `a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d` (hardcoded, must never change).
- **State directory:** `/var/lib/neoguard` (Linux), `C:\ProgramData\NeoGuard` (Windows).

---

## 2. Required Tags on Every Metric Point

These tags must be present on every `MetricPoint` emitted by the agent and on every future log event. Tags are key-value pairs attached to metric and log payloads for correlation and filtering.

Lifecycle requests (register, heartbeat, stopping) do **not** carry tags. They carry equivalent identity information as explicit request fields. See Section 2.3 for the lifecycle field mapping.

| Tag Key | Contract Requirement | Current Implementation Status | Follow-up |
|---|---|---|---|
| `resource_id` | Must always be present | **Satisfied.** `Identity.Tags()` emits `resource_id` from `Identity.InstanceID`, which is always populated by the resolver. | None |
| `agent_id` | Must always be present | **Satisfied.** `Identity.Tags()` emits `agent_id` from `Identity.AgentID`, which is derived/persisted in `Resolve()` when `stateDir` is configured. | None (stateDir is always configured in production) |
| `cloud_provider` | Must always be present, including the value `"unknown"` for undetected environments | **Satisfied (AGENT-005).** `Identity.Tags()` now always emits `cloud_provider`, including `"unknown"`. | None |
| `hostname` | Must always be present | **Satisfied.** `Identity.Tags()` always emits `hostname` from `Identity.Hostname`, which `fillHostInfo()` guarantees is populated. | None |
| `os` | Must always be present | **Satisfied.** `Identity.Tags()` always emits `os` from `Identity.OS`, which `fillHostInfo()` sets from `runtime.GOOS`. | None |
| `agent_version` | Must always be present | **Satisfied for runtime metrics.** `Agent.Run()` injects `baseTags["agent_version"] = a.version` after calling `Identity.Tags()` (`internal/agent/agent.go:131`). All collector metrics inherit this. | Narrow risk: `TestConnection` uses a separate tag set with only `hostname` and `agent_version` (no `resource_id`/`agent_id`). Future lifecycle and log paths must also preserve `agent_version`. |

### 2.1 agent_version Delivery

`agent_version` is delivered to metric points through `Agent.Run()`:

```
baseTags := id.Tags()
baseTags["agent_version"] = a.version
```

This injection happens in `internal/agent/agent.go:130-131`, after identity resolution and before any collector runs. All runtime metrics inherit `agent_version` from `baseTags`.

`Identity.Tags()` itself does not emit `agent_version` because the `Identity` struct does not carry a version field. The version is a build-time constant owned by the `Agent` struct.

**Narrow residual risk:** The `TestConnection` path (`agent.go:508-511`) constructs its own tag map with only `hostname` and `agent_version`. It does not include `resource_id` or `agent_id`. Future telemetry paths (logs, lifecycle) must ensure `agent_version` is included.

### 2.2 cloud_provider

**Contract requirement:** `cloud_provider` must always be present as a tag. Valid values are `"aws"`, `"azure"`, `"on-prem"`, or `"unknown"`.

**Status: Satisfied (AGENT-005).** `Identity.Tags()` now unconditionally emits `cloud_provider` for all provider values. The previous conditional guard was removed.

### 2.3 Lifecycle Identity Fields

Lifecycle requests carry identity as explicit request fields, not as tags. The backend schema defines these fields on each endpoint:

| Endpoint | Identity Fields Sent |
|---|---|
| `POST /api/v1/agents/register` | `agent_id_external`, `resource_id`, `hostname`, `os`, `arch`, `agent_version` |
| `POST /api/v1/agents/heartbeat` | `agent_id_external` |
| `POST /api/v1/agents/stopping` | `agent_id_external` |

**Note on cloud_provider:** The backend lifecycle schema (`AgentRegisterRequest` in `src/neoguard/models/agents.py`) does not currently include a `cloud_provider` field. If fleet UI requires provider-based filtering, this must be handled via the `capabilities` dict on registration or by adding an explicit field in a future backend schema change.

---

## 3. Optional Cloud Tags

These tags are emitted when the cloud provider populates the corresponding field. They are not required for correlation but enable rich filtering and grouping.

| Tag Key | Source | Present When |
|---|---|---|
| `region` | `Identity.Region` | AWS or Azure detected region |
| `availability_zone` | `Identity.AvailabilityZone` | AWS AZ or Azure Zone |
| `account_id` | `Identity.AccountID` | AWS Account ID or Azure Subscription ID |
| `instance_type` | `Identity.InstanceType` | AWS instance type or Azure VM size |
| `os_version` | `Identity.OSVersion` | When OS version is detectable |

---

## 4. Forbidden Fields

### 4.1 Forbidden Trusted Payload Fields

The agent must **never** send a `tenant_id` field that the backend trusts for authorization or data routing. The backend always derives `tenant_id` from the authenticated API key session.

| Field | Reason |
|---|---|
| `tenant_id` | Must be derived by backend auth, never trusted from agent |

### 4.2 Forbidden Default Tags

These must **never** appear as default metric tags. Some may be optionally enabled with explicit user configuration (e.g., `process_cmdline` with `collect_cmdline: true`), but must not be emitted by default.

| Forbidden Tag | Reason |
|---|---|
| Raw command line (`process_cmdline` with args) | Cardinality bomb, potential secret leakage |
| Full process arguments | Secret leakage risk |
| Request IDs | Unbounded cardinality |
| Session IDs | Unbounded cardinality |
| Trace/span IDs as enumerable dimensions | Unbounded cardinality (traces are separate pipeline) |
| Secrets or credentials | Security violation |

---

## 5. Correlation Invariants

These invariants must hold across all telemetry types (metrics now, logs and traces in future):

1. **All metric points** include `resource_id`, `agent_id`, and `cloud_provider` tags.
2. **All lifecycle requests** (register, heartbeat, stopping) include `agent_id_external` which maps to `agent_id`.
3. **Registration** includes `resource_id` which the backend persists in the agent record.
4. **Backend queries** for a resource join on `(tenant_id, resource_id)`, not on hostname.
5. **Hostname** is display metadata. It may appear in UI labels and search, but never as a primary key in joins, indexes, or correlation logic.
6. **Future log events** must carry the same `resource_id`, `agent_id`, and `cloud_provider` tags as metrics from the same agent.
7. **Backend agent registry** stores `resource_id` per agent record, enabling resource-to-agent correlation.

---

## 6. Mismatches Between Contract and Current Code

| # | Mismatch | Location | Severity | Recommended Fix |
|---|---|---|---|---|
| 1 | ~~`cloud_provider` omitted when `ProviderUnknown`~~ | `internal/identity/identity.go:40` | ~~High~~ Fixed (AGENT-005) | `Tags()` now always emits `cloud_provider`, including `"unknown"`. |
| 2 | `resource_id` is nullable in backend registration model | `src/neoguard/models/agents.py:61` - `resource_id: str | None` | Low | Agent always sends it; backend should log warning if missing but cannot require it (fallback agents may fail identity) |
| 3 | Agent does not yet call lifecycle endpoints | `internal/agent/agent.go` | High | AGENT-002 will implement register/heartbeat/stopping |
| 4 | `TestConnection` tag set is incomplete | `internal/agent/agent.go:508-511` | Low | Test connection only sends `hostname` and `agent_version`. Missing `resource_id`, `agent_id`, `cloud_provider`. Acceptable for connectivity test but must not be used as a contract reference. |

---

## 7. Implementation References

| Contract Element | Code Location |
|---|---|
| Identity struct and `Tags()` method | `internal/identity/identity.go` |
| Provider resolution chain | `internal/identity/resolver.go` - `Resolve()`, `detect()` |
| AWS IMDSv2 instance-id fetch | `internal/identity/aws.go` - `Detect()` |
| Azure IMDS vmId fetch | `internal/identity/azure.go` - `Detect()` |
| On-prem machine-id read | `internal/identity/machineid.go` - `readMachineID()` |
| Hostname fallback | `internal/identity/resolver.go` - `fallbackIdentity()` |
| agent_id derivation and persistence | `internal/identity/persistence.go` - `deriveAgentID()`, `loadAgentID()`, `saveAgentID()` |
| Deterministic UUIDv5 generation | `internal/identity/identity.go` - `DeterministicAgentID()` |
| Identity change detection | `internal/identity/persistence.go` - `checkIdentityChange()` |
| agent_version injection into baseTags | `internal/agent/agent.go:130-131` |
| TestConnection separate tag set | `internal/agent/agent.go:508-511` |
| Metric point structure with tags | `internal/model/metric.go` - `MetricPoint.Tags` |
| Tag merge utility | `internal/model/metric.go` - `MergeTags()` |
| Backend registration endpoint | `src/neoguard/api/routes/agents.py` - `register()` |
| Backend registration model | `src/neoguard/models/agents.py` - `AgentRegisterRequest` |
| Backend tenant derivation | `src/neoguard/api/routes/agents.py` - `get_tenant_id_required(request)` |

---

## 8. Future Telemetry Types

When logs, traces, or other signal types are added:

1. They must carry the same `resource_id`, `agent_id`, and `cloud_provider` tags defined in this contract.
2. They must use separate buffers, retry state, and transport from metrics (see AGENT-004).
3. They must not introduce new join keys that bypass `(tenant_id, resource_id)`.
4. `hostname` remains display metadata in all signal types.
5. `tenant_id` remains backend-derived in all signal types.
6. `agent_version` must be included in every telemetry path.

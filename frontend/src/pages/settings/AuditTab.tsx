import { Eye } from "lucide-react";
import { format } from "date-fns";
import { useApi } from "../../hooks/useApi";
import { api } from "../../services/api";
import type { TenantAuditEntry } from "../../types";
import {
  Card,
  Badge,
  DataTable,
  EmptyState,
} from "../../design-system";
import type { DataTableColumn } from "../../design-system";
import { useAuth } from "../../contexts/AuthContext";

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG TAB
// ═══════════════════════════════════════════════════════════════════════════

const columns: DataTableColumn<TenantAuditEntry>[] = [
  {
    key: "created_at",
    label: "Time",
    render: (_, row) => format(new Date(row.created_at), "MMM d, HH:mm:ss"),
  },
  {
    key: "actor_name",
    label: "Actor",
    render: (_, row) => row.actor_name || row.actor_email || row.actor_type,
  },
  {
    key: "action",
    label: "Action",
    render: (_, row) => <Badge variant="info">{row.action}</Badge>,
  },
  {
    key: "resource_type",
    label: "Resource",
    render: (_, row) =>
      `${row.resource_type}${row.resource_id ? ` / ${row.resource_id.slice(0, 8)}...` : ""}`,
  },
  {
    key: "details",
    label: "Details",
    render: (_, row) =>
      Object.keys(row.details).length > 0 ? JSON.stringify(row.details) : "—",
  },
  {
    key: "ip_address",
    label: "IP",
    render: (_, row) => row.ip_address || "—",
  },
];

export function AuditLogTab() {
  const { tenant, role } = useAuth();
  const canView = role === "owner" || role === "admin";
  const { data: entries, loading } = useApi<TenantAuditEntry[]>(
    () => (tenant && canView ? api.tenants.auditLog(tenant.id, { limit: 100 }) : Promise.resolve([])),
    [tenant?.id, canView],
  );

  if (!canView) {
    return (
      <div style={{ marginTop: 16 }}>
        <EmptyState
          icon={<Eye size={24} />}
          title="Access Restricted"
          description="Only admins and owners can view the audit log."
        />
      </div>
    );
  }

  if (loading) {
    return <div style={{ marginTop: 16, color: "var(--color-neutral-500)", fontSize: 13 }}>Loading audit log...</div>;
  }

  if (!entries || entries.length === 0) {
    return (
      <div style={{ marginTop: 16 }}>
        <EmptyState
          icon={<Eye size={24} />}
          title="No Audit Entries"
          description="Actions taken in this tenant will appear here."
        />
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16 }}>
      <Card variant="bordered" padding="md">
        <DataTable<TenantAuditEntry>
          columns={columns}
          data={entries}
          striped
          hoverable
        />
      </Card>
    </div>
  );
}

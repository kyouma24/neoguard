"""Resource change tracking — stores metadata diffs on every upsert.

Revision ID: 006_resource_changes
Revises: 005_dashboard_permissions
Create Date: 2026-05-04

Adds:
- resource_changes table (tracks metadata diffs per resource over time)
- RLS policy on resource_changes
- Index for fast lookups by resource_id + tenant_id
"""
from alembic import op

revision = "006_resource_changes"
down_revision = "005_dashboard_permissions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS resource_changes (
            id              TEXT PRIMARY KEY,
            tenant_id       TEXT NOT NULL,
            resource_id     TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
            change_type     TEXT NOT NULL DEFAULT 'metadata_changed',
            field_changes   JSONB NOT NULL DEFAULT '[]',
            previous_status TEXT,
            new_status      TEXT,
            detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_resource_changes_resource
            ON resource_changes (tenant_id, resource_id, detected_at DESC)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_resource_changes_tenant_time
            ON resource_changes (tenant_id, detected_at DESC)
    """)

    op.execute("""
        DO $$ BEGIN
            CREATE POLICY resource_changes_tenant_isolation
                ON resource_changes
                FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)
    op.execute("ALTER TABLE resource_changes ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE resource_changes FORCE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS resource_changes")

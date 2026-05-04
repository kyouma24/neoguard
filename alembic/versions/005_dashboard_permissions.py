"""Dashboard-level RBAC: permissions table + created_by on dashboards.

Revision ID: 005_dashboard_permissions
Revises: 004_schema_hardening
Create Date: 2026-05-02

Adds:
- dashboards.created_by column (tracks who created the dashboard)
- dashboard_permissions table (per-user, per-dashboard permission grants)
- RLS + FORCE on dashboard_permissions
"""
from alembic import op

revision = "005_dashboard_permissions"
down_revision = "004_schema_hardening"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ----- 1. Add created_by column to dashboards -----
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE dashboards ADD COLUMN created_by TEXT;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$
    """)

    # ----- 2. dashboard_permissions table -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS dashboard_permissions (
            id              BIGSERIAL PRIMARY KEY,
            tenant_id       TEXT NOT NULL,
            dashboard_id    TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
            user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            permission      TEXT NOT NULL CHECK (permission IN ('view', 'edit', 'admin')),
            granted_by      UUID,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (dashboard_id, user_id)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_dashboard_permissions_dash
            ON dashboard_permissions (dashboard_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_dashboard_permissions_user
            ON dashboard_permissions (user_id, tenant_id)
    """)

    # ----- 3. RLS on dashboard_permissions -----
    op.execute("ALTER TABLE dashboard_permissions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE dashboard_permissions FORCE ROW LEVEL SECURITY")
    op.execute("""
        DO $$ BEGIN
            CREATE POLICY tenant_isolation ON dashboard_permissions
                FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON dashboard_permissions")
    op.execute("ALTER TABLE dashboard_permissions DISABLE ROW LEVEL SECURITY")
    op.execute("DROP TABLE IF EXISTS dashboard_permissions")
    op.execute("ALTER TABLE dashboards DROP COLUMN IF EXISTS created_by")

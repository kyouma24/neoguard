"""Schema hardening — missing tables, columns, FORCE RLS, FK fix.

Revision ID: 004_schema_hardening
Revises: 003_dashboard_extensions
Create Date: 2026-05-02

Fixes:
- DASH-001: dashboard_versions table (was created ad-hoc, not in migration)
- DASH-002: annotations table (was created ad-hoc, not in migration)
- DASH-003: dashboards.variables, groups, links columns (missing from 001)
- DASH-004: dashboard_favorites.user_id FK type mismatch (TEXT→UUID)
- SEC-001: FORCE ROW LEVEL SECURITY on all RLS-enabled tables
- SEC-002: key_prefix index on api_keys for O(1) Argon2id lookup
"""
from alembic import op

revision = "004_schema_hardening"
down_revision = "003_dashboard_extensions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ----- DASH-003: Add missing JSONB columns to dashboards -----
    for col in ("variables", "groups", "links"):
        op.execute(f"""
            DO $$ BEGIN
                ALTER TABLE dashboards ADD COLUMN {col} JSONB NOT NULL DEFAULT '[]';
            EXCEPTION WHEN duplicate_column THEN NULL;
            END $$
        """)

    # ----- DASH-001: dashboard_versions table -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS dashboard_versions (
            id              TEXT PRIMARY KEY,
            dashboard_id    TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
            version_number  INTEGER NOT NULL DEFAULT 1,
            data            JSONB NOT NULL,
            change_summary  TEXT NOT NULL DEFAULT '',
            created_by      TEXT NOT NULL,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_dashboard_versions_dash_ver
            ON dashboard_versions (dashboard_id, version_number DESC)
    """)

    # ----- DASH-002: annotations table -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS annotations (
            id              TEXT PRIMARY KEY,
            tenant_id       TEXT NOT NULL,
            dashboard_id    TEXT REFERENCES dashboards(id) ON DELETE CASCADE,
            title           TEXT NOT NULL DEFAULT '',
            text            TEXT NOT NULL DEFAULT '',
            tags            JSONB NOT NULL DEFAULT '[]',
            starts_at       TIMESTAMPTZ NOT NULL,
            ends_at         TIMESTAMPTZ,
            created_by      TEXT NOT NULL DEFAULT '',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_annotations_tenant_dash_time
            ON annotations (tenant_id, dashboard_id, starts_at DESC)
    """)

    # ----- DASH-004: Fix dashboard_favorites.user_id FK type -----
    # Drop and recreate the table with correct UUID type.
    # Safe: favorites are ephemeral user preferences.
    op.execute("DROP TABLE IF EXISTS dashboard_favorites")
    op.execute("""
        CREATE TABLE dashboard_favorites (
            tenant_id       TEXT NOT NULL,
            user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            dashboard_id    TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
            favorited_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, dashboard_id)
        )
    """)

    # ----- SEC-002: key_prefix index for O(1) Argon2id lookup -----
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_api_keys_prefix_version
            ON api_keys (key_prefix, hash_version) WHERE enabled = TRUE
    """)

    # ----- SEC-001: FORCE ROW LEVEL SECURITY on all RLS-enabled tables -----
    # PostgreSQL RLS does not apply to table owners. FORCE makes it apply
    # regardless, closing the bypass for the neoguard connection pool user.
    _all_rls_tables = [
        "metrics",
        "alert_rules",
        "alert_events",
        "alert_rule_states",
        "alert_silences",
        "dashboards",
        "dashboard_tags",
        "dashboard_views",
        "dashboard_favorites",
        "dashboard_versions",
        "annotations",
        "notification_channels",
        "resources",
        "aws_accounts",
        "azure_subscriptions",
        "collection_jobs",
        "api_keys",
        "audit_log",
    ]
    for table in _all_rls_tables:
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")

    # RLS policies for new tables (dashboard_versions, annotations, dashboard_favorites recreated)
    _new_rls_tables = ["dashboard_versions", "annotations", "dashboard_favorites"]
    for table in _new_rls_tables:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"""
            DO $$ BEGIN
                CREATE POLICY tenant_isolation ON {table}
                    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$
        """)


def downgrade() -> None:
    # Remove FORCE RLS (revert to default ENABLE-only)
    _all_rls_tables = [
        "metrics", "alert_rules", "alert_events", "alert_rule_states",
        "alert_silences", "dashboards", "dashboard_tags", "dashboard_views",
        "dashboard_favorites", "dashboard_versions", "annotations",
        "notification_channels", "resources", "aws_accounts",
        "azure_subscriptions", "collection_jobs", "api_keys", "audit_log",
    ]
    for table in _all_rls_tables:
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")

    # Drop RLS on new tables
    for table in ["dashboard_favorites", "dashboard_versions", "annotations"]:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    # Drop new index
    op.execute("DROP INDEX IF EXISTS idx_api_keys_prefix_version")

    # Recreate dashboard_favorites with old TEXT type
    op.execute("DROP TABLE IF EXISTS dashboard_favorites")
    op.execute("""
        CREATE TABLE dashboard_favorites (
            tenant_id       TEXT NOT NULL,
            user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            dashboard_id    TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
            favorited_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, dashboard_id)
        )
    """)
    op.execute("ALTER TABLE dashboard_favorites ENABLE ROW LEVEL SECURITY")
    op.execute("""
        DO $$ BEGIN
            CREATE POLICY tenant_isolation ON dashboard_favorites
                FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)

    # Drop annotations
    op.execute("DROP TABLE IF EXISTS annotations")

    # Drop dashboard_versions
    op.execute("DROP TABLE IF EXISTS dashboard_versions")

    # Drop columns
    op.execute("ALTER TABLE dashboards DROP COLUMN IF EXISTS links")
    op.execute("ALTER TABLE dashboards DROP COLUMN IF EXISTS groups")
    op.execute("ALTER TABLE dashboards DROP COLUMN IF EXISTS variables")

"""Dashboard extensions: tags, views, favorites, FTS, layout_version.

Revision ID: 003_dashboard_extensions
Revises: 002_password_reset_tokens
Create Date: 2026-05-02

Adds:
- layout_version column on dashboards
- dashboard_tags table (normalized tags for facet filtering)
- dashboard_views table (view tracking for "most viewed" sort)
- dashboard_favorites table (per-user favorites)
- search_vector tsvector column on dashboards (FTS)
- RLS policies on all 3 new tables
"""
from alembic import op

revision = "003_dashboard_extensions"
down_revision = "002_password_reset_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ----- 1. layout_version on dashboards -----
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE dashboards ADD COLUMN layout_version INTEGER NOT NULL DEFAULT 1;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$
    """)

    # ----- 2. dashboard_tags (normalized tags for facet filtering) -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS dashboard_tags (
            tenant_id       TEXT NOT NULL,
            dashboard_id    TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
            tag             TEXT NOT NULL,
            PRIMARY KEY (tenant_id, dashboard_id, tag)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_dashboard_tags_tenant_tag
            ON dashboard_tags (tenant_id, tag)
    """)

    # ----- 3. dashboard_views (view tracking) -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS dashboard_views (
            id              BIGSERIAL PRIMARY KEY,
            tenant_id       TEXT NOT NULL,
            dashboard_id    TEXT NOT NULL,
            user_id         TEXT NOT NULL,
            viewed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_dash_views_tenant_dash_time
            ON dashboard_views (tenant_id, dashboard_id, viewed_at DESC)
    """)

    # ----- 4. dashboard_favorites (per-user favorites) -----
    op.execute("""
        CREATE TABLE IF NOT EXISTS dashboard_favorites (
            tenant_id       TEXT NOT NULL,
            user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            dashboard_id    TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
            favorited_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, dashboard_id)
        )
    """)

    # ----- 5. FTS search_vector (generated column) -----
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE dashboards ADD COLUMN search_vector tsvector
                GENERATED ALWAYS AS (
                    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
                    setweight(to_tsvector('english', coalesce(description, '')), 'B')
                ) STORED;
        EXCEPTION WHEN duplicate_column THEN NULL;
        END $$
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_dashboards_fts
            ON dashboards USING GIN (search_vector)
    """)

    # ----- 6. RLS on new tables -----
    _rls_tables = ["dashboard_tags", "dashboard_views", "dashboard_favorites"]
    for table in _rls_tables:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"""
            DO $$ BEGIN
                CREATE POLICY tenant_isolation ON {table}
                    FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true));
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$
        """)


def downgrade() -> None:
    # Drop RLS policies
    _rls_tables = ["dashboard_favorites", "dashboard_views", "dashboard_tags"]
    for table in _rls_tables:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    # Drop FTS index and column
    op.execute("DROP INDEX IF EXISTS idx_dashboards_fts")
    op.execute("ALTER TABLE dashboards DROP COLUMN IF EXISTS search_vector")

    # Drop tables (reverse order of creation)
    op.execute("DROP TABLE IF EXISTS dashboard_favorites")
    op.execute("DROP TABLE IF EXISTS dashboard_views")
    op.execute("DROP INDEX IF EXISTS idx_dashboard_tags_tenant_tag")
    op.execute("DROP TABLE IF EXISTS dashboard_tags")

    # Drop layout_version column
    op.execute("ALTER TABLE dashboards DROP COLUMN IF EXISTS layout_version")

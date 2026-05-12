"""Tag cardinality observations — adaptive high-cardinality detection.

Revision ID: 007_tag_cardinality_observations
Revises: 006_resource_changes
Create Date: 2026-05-06

Adds:
- tag_cardinality_observations table (stores sampled distinct counts per tag key per tenant)
- RLS policy on tag_cardinality_observations
- Index for fast lookups by tenant + tag_key
"""
from alembic import op

revision = "007_tag_cardinality_observations"
down_revision = "006_resource_changes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS tag_cardinality_observations (
            tenant_id               TEXT NOT NULL,
            tag_key                 TEXT NOT NULL,
            observed_distinct_count BIGINT NOT NULL,
            observation_window_start TIMESTAMPTZ NOT NULL,
            observation_window_end  TIMESTAMPTZ NOT NULL,
            sample_size             BIGINT NOT NULL,
            PRIMARY KEY (tenant_id, tag_key, observation_window_start)
        );

        CREATE INDEX IF NOT EXISTS idx_tag_cardinality_tenant_key
            ON tag_cardinality_observations (tenant_id, tag_key);

        ALTER TABLE tag_cardinality_observations ENABLE ROW LEVEL SECURITY;

        CREATE POLICY tenant_isolation_tag_cardinality
            ON tag_cardinality_observations
            USING (tenant_id = current_setting('app.tenant_id', true));
    """)


def downgrade() -> None:
    op.execute("""
        DROP POLICY IF EXISTS tenant_isolation_tag_cardinality ON tag_cardinality_observations;
        DROP TABLE IF EXISTS tag_cardinality_observations;
    """)

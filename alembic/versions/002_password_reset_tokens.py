"""Add password_reset_tokens table.

Revision ID: 002_password_reset_tokens
Revises: 001_initial_schema
Create Date: 2026-05-01
"""
from alembic import op

revision = "002_password_reset_tokens"
down_revision = "001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id              UUID PRIMARY KEY,
            user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash      TEXT NOT NULL,
            expires_at      TIMESTAMPTZ NOT NULL,
            used_at         TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash
            ON password_reset_tokens (token_hash)
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
            ON password_reset_tokens (user_id, created_at DESC)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS password_reset_tokens")

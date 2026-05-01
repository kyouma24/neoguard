"""Bootstrap a super admin user.

Usage:
    python -m neoguard.cli.bootstrap_admin --email admin@example.com --password changeme --name "Admin"

If the user already exists, promotes them to super_admin.
Creates a default tenant "Platform Admin" if the user has none.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from uuid_utils import uuid7


async def _bootstrap(email: str, password: str, name: str) -> None:
    from neoguard.core.config import settings
    from neoguard.db.timescale.connection import init_pool, close_pool, get_pool
    from neoguard.services.auth.passwords import hash_password

    await init_pool()
    pool = await get_pool()

    try:
        existing = await pool.fetchrow(
            "SELECT id, is_super_admin FROM users WHERE LOWER(email) = LOWER($1)",
            email,
        )

        if existing:
            user_id = existing["id"]
            if existing["is_super_admin"]:
                print(f"User {email} is already a super admin (id: {user_id})")
            else:
                await pool.execute(
                    "UPDATE users SET is_super_admin = TRUE, email_verified = TRUE, updated_at = NOW() WHERE id = $1",
                    user_id,
                )
                print(f"Promoted existing user {email} to super admin (id: {user_id})")
        else:
            user_id = uuid7()
            pw_hash = hash_password(password)
            await pool.execute(
                """
                INSERT INTO users (id, email, name, password_hash, is_super_admin, email_verified)
                VALUES ($1, LOWER($2), $3, $4, TRUE, TRUE)
                """,
                user_id, email, name, pw_hash,
            )
            print(f"Created super admin user {email} (id: {user_id})")

        tenant_count = await pool.fetchval(
            "SELECT COUNT(*) FROM tenant_memberships WHERE user_id = $1",
            user_id,
        )
        if tenant_count == 0:
            tenant_id = uuid7()
            slug = "platform-admin"
            for i in range(1, 100):
                conflict = await pool.fetchval(
                    "SELECT id FROM tenants WHERE slug = $1", slug,
                )
                if conflict is None:
                    break
                slug = f"platform-admin-{i}"

            await pool.execute(
                "INSERT INTO tenants (id, slug, name) VALUES ($1, $2, $3)",
                tenant_id, slug, "Platform Admin",
            )
            await pool.execute(
                "INSERT INTO tenant_memberships (user_id, tenant_id, role) VALUES ($1, $2, 'owner')",
                user_id, tenant_id,
            )
            print(f"Created tenant 'Platform Admin' (id: {tenant_id}, slug: {slug})")

        print("\nBootstrap complete. You can now log in at http://localhost:5173/login")

    finally:
        await close_pool()


def run_bootstrap(email: str, password: str, name: str) -> None:
    """Validate inputs and run bootstrap. Called from __main__.py subcommand dispatcher."""
    if len(password) < 8:
        print("Error: Password must be at least 8 characters", file=sys.stderr)
        sys.exit(1)
    if "@" not in email:
        print("Error: Invalid email address", file=sys.stderr)
        sys.exit(1)
    asyncio.run(_bootstrap(email, password, name))


def main() -> None:
    parser = argparse.ArgumentParser(description="Bootstrap a super admin user")
    parser.add_argument("--email", required=True, help="Admin email address")
    parser.add_argument("--password", required=True, help="Admin password (min 8 chars)")
    parser.add_argument("--name", default="Admin", help="Display name")
    args = parser.parse_args()
    run_bootstrap(args.email, args.password, args.name)


if __name__ == "__main__":
    main()

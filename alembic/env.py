from __future__ import annotations

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = None


def _resolve_url() -> str:
    host = os.environ.get("NEOGUARD_DB_HOST", "localhost")
    port = os.environ.get("NEOGUARD_DB_PORT", "5433")
    name = os.environ.get("NEOGUARD_DB_NAME", "neoguard")
    user = os.environ.get("NEOGUARD_DB_USER", "neoguard")
    password = os.environ.get("NEOGUARD_DB_PASSWORD", "neoguard_dev")
    return f"postgresql+asyncpg://{user}:{password}@{host}:{port}/{name}"


def run_migrations_offline() -> None:
    url = _resolve_url()
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    section = dict(config.get_section(config.config_ini_section, {}))
    section["sqlalchemy.url"] = _resolve_url()
    connectable = async_engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

import clickhouse_connect
from clickhouse_connect.driver.asyncclient import AsyncClient

from neoguard.core.config import settings
from neoguard.core.logging import log

_client: AsyncClient | None = None


async def get_clickhouse() -> AsyncClient:
    global _client
    if _client is None:
        raise RuntimeError("ClickHouse client not initialized. Call init_clickhouse() first.")
    return _client


async def init_clickhouse() -> AsyncClient:
    global _client
    _client = await clickhouse_connect.get_async_client(
        host=settings.clickhouse_host,
        port=settings.clickhouse_port,
        database=settings.clickhouse_database,
    )
    await log.ainfo("ClickHouse client initialized", host=settings.clickhouse_host)
    return _client


async def close_clickhouse() -> None:
    global _client
    if _client:
        _client.close()
        _client = None
        await log.ainfo("ClickHouse client closed")

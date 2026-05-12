"""Azure credential management with service principal auth and client caching."""

import time
from typing import Any

from azure.identity import ClientSecretCredential

from neoguard.models.azure import AzureSubscription

# TODO(production): Process-local cache; needs Redis-backed shared credential cache for multi-worker
# Current: In-memory dict per worker with TTL
# Cloud: Redis hash with TTL, or centralized credential service
# Migration risk: Low — credential refresh is idempotent
# Reference: docs/cloud_migration.md#credential-caches
_credential_cache: dict[str, tuple[ClientSecretCredential, float]] = {}
CREDENTIAL_TTL = 3500


def get_credential(sub: AzureSubscription) -> ClientSecretCredential:
    cache_key = f"{sub.subscription_id}:{sub.azure_tenant_id}:{sub.client_id}"
    cached = _credential_cache.get(cache_key)
    if cached and (time.time() - cached[1]) < CREDENTIAL_TTL:
        return cached[0]

    credential = ClientSecretCredential(
        tenant_id=sub.azure_tenant_id,
        client_id=sub.client_id,
        client_secret=_get_client_secret(sub),
    )
    _credential_cache[cache_key] = (credential, time.time())
    return credential


_client_cache: dict[str, tuple[Any, float]] = {}
CLIENT_TTL = 600


def get_mgmt_client(sub: AzureSubscription, client_class: type, **kwargs):
    cache_key = f"{sub.subscription_id}:{client_class.__name__}"
    cached = _client_cache.get(cache_key)
    if cached and (time.time() - cached[1]) < CLIENT_TTL:
        return cached[0]

    credential = get_credential(sub)
    client = client_class(credential, sub.subscription_id, **kwargs)
    _client_cache[cache_key] = (client, time.time())
    return client


def _get_client_secret(sub: AzureSubscription) -> str:
    return _secret_cache.get(sub.subscription_id, "")


_secret_cache: dict[str, str] = {}


def cache_client_secret(subscription_id: str, secret: str) -> None:
    _secret_cache[subscription_id] = secret


def clear_credential_cache() -> None:
    _credential_cache.clear()
    _client_cache.clear()
    _secret_cache.clear()

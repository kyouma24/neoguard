"""Phase B4 — Cloud Credential Safety regression tests.

CLOUD-002: Azure credential cache key must include NeoGuard tenant_id
CLOUD-003: AWS session TTL must have clock-skew safety margin
CLOUD-004: AWS pagination must use MaxItems cap
CLOUD-005: Azure VM status must default to 'unknown' on instance_view failure
"""

import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from neoguard.models.azure import AzureSubscription
from neoguard.models.resources import ResourceStatus


# ---------------------------------------------------------------------------
# CLOUD-002: Azure credential cache key must include NeoGuard tenant_id
# ---------------------------------------------------------------------------

class TestAzureCredCacheTenantIsolation:
    """Two NeoGuard tenants sharing the same Azure subscription must NOT share cached credentials."""

    def setup_method(self):
        from neoguard.services.azure import credentials
        credentials._credential_cache.clear()
        credentials._client_cache.clear()
        credentials._secret_cache.clear()

    def _make_sub(self, tenant_id: str, subscription_id: str = "sub-111",
                  azure_tenant_id: str = "az-tenant-1", client_id: str = "client-1") -> AzureSubscription:
        from datetime import datetime
        return AzureSubscription(
            id="internal-id-1",
            tenant_id=tenant_id,
            name="Test Sub",
            subscription_id=subscription_id,
            azure_tenant_id=azure_tenant_id,
            client_id=client_id,
            regions=["eastus"],
            enabled=True,
            collect_config={},
            last_sync_at=None,
            created_at=datetime(2026, 1, 1),
            updated_at=datetime(2026, 1, 1),
        )

    @patch("neoguard.services.azure.credentials.ClientSecretCredential")
    def test_different_tenants_same_azure_sub_get_separate_credentials(self, mock_cred_cls):
        """If tenant A and B both configure the same Azure subscription,
        they should get separate credential objects (not share a cache entry)."""
        from neoguard.services.azure import credentials
        credentials.cache_client_secret("sub-111", "secret-for-tenant-A")

        mock_cred_a = MagicMock(name="cred_A")
        mock_cred_b = MagicMock(name="cred_B")
        mock_cred_cls.side_effect = [mock_cred_a, mock_cred_b]

        sub_tenant_a = self._make_sub(tenant_id="tenant-A")
        sub_tenant_b = self._make_sub(tenant_id="tenant-B")

        cred_a = credentials.get_credential(sub_tenant_a)
        # Re-cache secret for tenant B
        credentials.cache_client_secret("sub-111", "secret-for-tenant-B")
        cred_b = credentials.get_credential(sub_tenant_b)

        # They should be different objects (different cache entries)
        assert cred_a is not cred_b
        assert mock_cred_cls.call_count == 2

    @patch("neoguard.services.azure.credentials.ClientSecretCredential")
    def test_same_tenant_same_sub_reuses_cache(self, mock_cred_cls):
        """Same tenant + same subscription should reuse cached credential."""
        from neoguard.services.azure import credentials
        credentials.cache_client_secret("sub-111", "the-secret")

        mock_cred_cls.return_value = MagicMock(name="cred")

        sub = self._make_sub(tenant_id="tenant-A")
        cred1 = credentials.get_credential(sub)
        cred2 = credentials.get_credential(sub)

        assert cred1 is cred2
        assert mock_cred_cls.call_count == 1


# ---------------------------------------------------------------------------
# CLOUD-003: AWS session TTL must have clock-skew safety margin
# ---------------------------------------------------------------------------

class TestAWSSessionTTLSkew:
    """SESSION_TTL must be conservative enough to avoid using expired tokens."""

    def test_session_ttl_at_most_55_minutes(self):
        """3300s = 55 min provides 5-minute margin before 1hr STS expiry."""
        from neoguard.services.aws.credentials import SESSION_TTL
        # Must be <= 3300 to ensure at least 5-minute safety margin
        assert SESSION_TTL <= 3300, (
            f"SESSION_TTL={SESSION_TTL} too close to 3600s STS expiry. "
            "Clock skew or processing delay could use an expired token."
        )

    def test_session_ttl_is_configurable(self):
        """SESSION_TTL should be configurable via settings."""
        from neoguard.core.config import settings
        assert hasattr(settings, "aws_session_ttl"), (
            "settings.aws_session_ttl missing — SESSION_TTL is not configurable"
        )


# ---------------------------------------------------------------------------
# CLOUD-004: AWS pagination must use MaxItems cap
# ---------------------------------------------------------------------------

class TestAWSPaginationCap:
    """AWS paginator calls must set PaginationConfig MaxItems to prevent unbounded enumeration."""

    @patch("neoguard.services.discovery.aws_discovery.get_client")
    @patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
    @pytest.mark.asyncio
    async def test_ec2_paginator_has_max_items(self, mock_upsert, mock_get_client):
        """EC2 describe_instances paginator must use PaginationConfig with MaxItems."""
        from neoguard.models.aws import AWSAccount

        mock_paginator = MagicMock()
        mock_paginator.paginate.return_value = iter([])  # no pages

        mock_client = MagicMock()
        mock_client.get_paginator.return_value = mock_paginator
        mock_get_client.return_value = mock_client

        account = AWSAccount(
            id="acc-1",
            tenant_id="t1",
            account_id="111111111111",
            name="Test",
            role_arn="arn:aws:iam::111111111111:role/NeoGuard",
            external_id="ext-1",
            regions=["us-east-1"],
            enabled=True,
            collect_config={},
            last_sync_at=None,
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-01T00:00:00Z",
        )

        from neoguard.services.discovery.aws_discovery import _discover_ec2
        await _discover_ec2(account, "us-east-1", "t1")

        # Verify paginator was called with PaginationConfig
        mock_paginator.paginate.assert_called_once()
        call_kwargs = mock_paginator.paginate.call_args
        pagination_config = call_kwargs.kwargs.get("PaginationConfig") if call_kwargs.kwargs else None
        if pagination_config is None and call_kwargs.args:
            # Check if passed as positional
            pagination_config = None
        assert pagination_config is not None, (
            "paginator.paginate() called without PaginationConfig — unbounded enumeration risk"
        )
        assert "MaxItems" in pagination_config, "PaginationConfig missing MaxItems"
        assert pagination_config["MaxItems"] <= 10000, "MaxItems too high"


# ---------------------------------------------------------------------------
# CLOUD-004b: Warn when discoverer count approaches pagination cap
# ---------------------------------------------------------------------------

class TestPaginationCapWarning:
    """_warn_if_near_cap must log when count >= 90% of MaxItems, and stay silent below."""

    @patch("neoguard.services.discovery.aws_discovery.log")
    @pytest.mark.asyncio
    async def test_warns_when_count_at_threshold(self, mock_log):
        """Should log warning when count >= 4500 (90% of 5000 cap)."""
        from neoguard.services.discovery.aws_discovery import _warn_if_near_cap
        mock_log.awarn = AsyncMock()

        await _warn_if_near_cap(4500, "ec2", "111111111111", "us-east-1", "t1")

        mock_log.awarn.assert_called_once()
        call_kwargs = mock_log.awarn.call_args
        assert "approaching pagination cap" in call_kwargs.args[0]
        assert call_kwargs.kwargs["count"] == 4500
        assert call_kwargs.kwargs["cap"] == 5000
        assert call_kwargs.kwargs["tenant_id"] == "t1"
        assert call_kwargs.kwargs["account_id"] == "111111111111"

    @patch("neoguard.services.discovery.aws_discovery.log")
    @pytest.mark.asyncio
    async def test_silent_when_count_below_threshold(self, mock_log):
        """Should NOT log when count < 4500."""
        from neoguard.services.discovery.aws_discovery import _warn_if_near_cap
        mock_log.awarn = AsyncMock()

        await _warn_if_near_cap(4499, "ec2", "111111111111", "us-east-1", "t1")

        mock_log.awarn.assert_not_called()

    @patch("neoguard.services.discovery.aws_discovery.log")
    @pytest.mark.asyncio
    async def test_warns_when_count_at_cap(self, mock_log):
        """Should also warn when count == MaxItems (5000)."""
        from neoguard.services.discovery.aws_discovery import _warn_if_near_cap
        mock_log.awarn = AsyncMock()

        await _warn_if_near_cap(5000, "ec2", "111111111111", "us-east-1", "t1")

        mock_log.awarn.assert_called_once()


# ---------------------------------------------------------------------------
# CLOUD-005: Azure VM instance_view failure must default to 'unknown', not 'active'
# ---------------------------------------------------------------------------

class TestAzureVMStatusOnError:
    """When instance_view API call fails, VM status must be 'unknown', not 'active'."""

    @patch("neoguard.services.discovery.azure_discovery.get_mgmt_client")
    @patch("neoguard.services.discovery.azure_discovery.upsert_resource", new_callable=AsyncMock)
    @pytest.mark.asyncio
    async def test_vm_status_defaults_to_unknown_on_instance_view_failure(
        self, mock_upsert, mock_get_client
    ):
        """If instance_view throws, the VM should be upserted with status=UNKNOWN, not ACTIVE."""
        from datetime import datetime
        from neoguard.services.discovery.azure_discovery import _discover_vms

        # Build a mock VM that will fail on instance_view
        mock_vm = MagicMock()
        mock_vm.location = "eastus"
        mock_vm.id = "/subscriptions/sub-1/resourceGroups/rg1/providers/Microsoft.Compute/virtualMachines/vm1"
        mock_vm.name = "vm1"
        mock_vm.tags = {}
        mock_vm.hardware_profile = MagicMock(vm_size="Standard_D2s_v3")
        mock_vm.os_profile = MagicMock(linux_configuration=True, windows_configuration=None)
        mock_vm.network_profile = MagicMock(network_interfaces=[])
        mock_vm.storage_profile = MagicMock()
        mock_vm.storage_profile.image_reference = MagicMock(offer="UbuntuServer", sku="18.04")

        mock_client = MagicMock()
        mock_client.virtual_machines.list_all.return_value = [mock_vm]
        # instance_view throws
        mock_client.virtual_machines.instance_view.side_effect = Exception("API timeout")
        mock_get_client.return_value = mock_client

        sub = AzureSubscription(
            id="internal-1",
            tenant_id="t1",
            name="Test",
            subscription_id="sub-1",
            azure_tenant_id="az-tenant-1",
            client_id="client-1",
            regions=["eastus"],
            enabled=True,
            collect_config={},
            last_sync_at=None,
            created_at=datetime(2026, 1, 1),
            updated_at=datetime(2026, 1, 1),
        )

        await _discover_vms(sub, "eastus", "t1")

        # Should have been called with UNKNOWN status
        assert mock_upsert.call_count == 1
        resource_create = mock_upsert.call_args[0][1]
        assert resource_create.status == ResourceStatus.UNKNOWN, (
            f"Expected status=UNKNOWN on instance_view failure, got {resource_create.status}"
        )


# ---------------------------------------------------------------------------
# Tenant-isolation integration test for Phase B4
# ---------------------------------------------------------------------------

class TestCloudCredentialTenantIsolation:
    """Cross-tenant credential isolation: one tenant's cloud ops must never leak to another."""

    def setup_method(self):
        from neoguard.services.azure import credentials
        from neoguard.services.aws import credentials as aws_creds
        credentials._credential_cache.clear()
        credentials._client_cache.clear()
        credentials._secret_cache.clear()
        aws_creds._session_cache.clear()

    @patch("neoguard.services.azure.credentials.ClientSecretCredential")
    def test_azure_mgmt_client_cache_isolated_by_tenant(self, mock_cred_cls):
        """Management client cache must also be tenant-scoped."""
        from datetime import datetime
        from neoguard.services.azure import credentials

        mock_cred_cls.return_value = MagicMock()

        sub_a = AzureSubscription(
            id="id-a", tenant_id="tenant-A", name="Sub",
            subscription_id="sub-1", azure_tenant_id="az-t1",
            client_id="client-1", regions=["eastus"], enabled=True,
            collect_config={}, last_sync_at=None,
            created_at=datetime(2026, 1, 1), updated_at=datetime(2026, 1, 1),
        )
        sub_b = AzureSubscription(
            id="id-b", tenant_id="tenant-B", name="Sub",
            subscription_id="sub-1", azure_tenant_id="az-t1",
            client_id="client-1", regions=["eastus"], enabled=True,
            collect_config={}, last_sync_at=None,
            created_at=datetime(2026, 1, 1), updated_at=datetime(2026, 1, 1),
        )

        credentials.cache_client_secret("sub-1", "secret-a")

        # Use a real class (not MagicMock) because get_mgmt_client accesses __name__
        class FakeClient:
            def __init__(self, credential, subscription_id):
                self.credential = credential
                self.subscription_id = subscription_id

        result_a = credentials.get_mgmt_client(sub_a, FakeClient)
        credentials.cache_client_secret("sub-1", "secret-b")
        result_b = credentials.get_mgmt_client(sub_b, FakeClient)

        assert result_a is not result_b, (
            "Two tenants got the same management client from cache — tenant isolation broken"
        )

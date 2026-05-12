"""Phase C5: Cloud Credentials refinement tests.

RED-then-GREEN: these tests MUST FAIL against committed code, PASS against working copy.
Findings: CLOUD-006, CLOUD-007, CLOUD-008, CLOUD-009.
"""

import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from neoguard.models.aws import AWSAccount


def _make_aws_account(**overrides) -> AWSAccount:
    defaults = {
        "id": "acc-1",
        "tenant_id": "t1",
        "account_id": "111111111111",
        "name": "Test",
        "role_arn": "arn:aws:iam::111111111111:role/NeoGuard",
        "external_id": "ext-1",
        "regions": ["us-east-1"],
        "enabled": True,
        "collect_config": {},
        "last_sync_at": None,
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
    }
    defaults.update(overrides)
    return AWSAccount(**defaults)


# ===========================================================================
# CLOUD-006: Structured error handling in get_boto_session / get_enabled_regions
# ===========================================================================


class TestCloud006AWSErrorHandling:
    """CLOUD-006: get_boto_session must catch and log specific botocore exceptions."""

    def setup_method(self):
        from neoguard.services.aws import credentials
        credentials._session_cache.clear()

    @patch("neoguard.services.aws.credentials._assume_role_session")
    @patch("neoguard.services.aws.credentials.log")
    def test_get_boto_session_logs_client_error(self, mock_log, mock_assume):
        """ClientError from STS must be logged with error_class='auth' before re-raise."""
        from botocore.exceptions import ClientError
        from neoguard.services.aws.credentials import get_boto_session

        error_response = {"Error": {"Code": "AccessDenied", "Message": "Not allowed"}}
        mock_assume.side_effect = ClientError(error_response, "AssumeRole")

        account = _make_aws_account()
        with pytest.raises(ClientError):
            get_boto_session(account, "us-east-1")

        mock_log.error.assert_called_once()
        call_kwargs = mock_log.error.call_args.kwargs
        assert call_kwargs["error_code"] == "AccessDenied"
        assert call_kwargs["error_class"] == "auth"

    @patch("neoguard.services.aws.credentials._assume_role_session")
    @patch("neoguard.services.aws.credentials.log")
    def test_get_boto_session_logs_connectivity_error(self, mock_log, mock_assume):
        """EndpointConnectionError must be logged with error_class='connectivity'."""
        from botocore.exceptions import EndpointConnectionError
        from neoguard.services.aws.credentials import get_boto_session

        mock_assume.side_effect = EndpointConnectionError(endpoint_url="https://sts.amazonaws.com")

        account = _make_aws_account()
        with pytest.raises(EndpointConnectionError):
            get_boto_session(account, "us-east-1")

        mock_log.error.assert_called_once()
        call_kwargs = mock_log.error.call_args.kwargs
        assert call_kwargs["error_class"] == "connectivity"

    @patch("neoguard.services.aws.credentials.get_boto_session")
    @patch("neoguard.services.aws.credentials.log")
    def test_get_enabled_regions_logs_client_error(self, mock_log, mock_session):
        """get_enabled_regions must log ClientError with structured fields."""
        from botocore.exceptions import ClientError
        from neoguard.services.aws.credentials import get_enabled_regions

        mock_ec2 = MagicMock()
        error_response = {"Error": {"Code": "AuthFailure", "Message": "Bad auth"}}
        mock_ec2.describe_regions.side_effect = ClientError(error_response, "DescribeRegions")

        mock_sess = MagicMock()
        mock_sess.client.return_value = mock_ec2
        mock_session.return_value = mock_sess

        account = _make_aws_account()
        with pytest.raises(ClientError):
            get_enabled_regions(account)

        mock_log.error.assert_called_once()
        call_kwargs = mock_log.error.call_args.kwargs
        assert call_kwargs["error_code"] == "AuthFailure"


# ===========================================================================
# CLOUD-007: Classified error handling in discover_all
# ===========================================================================


class TestCloud007ErrorClassification:
    """CLOUD-007: discover_all must classify exceptions into auth/throttle/connectivity/unknown."""

    def test_classify_aws_error_auth(self):
        """AccessDenied ClientError classifies as 'auth'."""
        from botocore.exceptions import ClientError
        from neoguard.services.discovery.aws_discovery import _classify_aws_error

        error_response = {"Error": {"Code": "AccessDenied", "Message": ""}}
        e = ClientError(error_response, "DescribeInstances")
        cls, code = _classify_aws_error(e)
        assert cls == "auth"
        assert code == "AccessDenied"

    def test_classify_aws_error_throttle(self):
        """Throttling ClientError classifies as 'throttle'."""
        from botocore.exceptions import ClientError
        from neoguard.services.discovery.aws_discovery import _classify_aws_error

        error_response = {"Error": {"Code": "Throttling", "Message": ""}}
        e = ClientError(error_response, "DescribeInstances")
        cls, code = _classify_aws_error(e)
        assert cls == "throttle"
        assert code == "Throttling"

    def test_classify_aws_error_connectivity(self):
        """EndpointConnectionError classifies as 'connectivity'."""
        from botocore.exceptions import EndpointConnectionError
        from neoguard.services.discovery.aws_discovery import _classify_aws_error

        e = EndpointConnectionError(endpoint_url="https://ec2.us-east-1.amazonaws.com")
        cls, code = _classify_aws_error(e)
        assert cls == "connectivity"
        assert code == "EndpointConnectionError"

    def test_classify_aws_error_unknown(self):
        """Generic exception classifies as 'unknown'."""
        from neoguard.services.discovery.aws_discovery import _classify_aws_error

        e = RuntimeError("something unexpected")
        cls, code = _classify_aws_error(e)
        assert cls == "unknown"
        assert code == "RuntimeError"

    @patch("neoguard.services.discovery.aws_discovery.log")
    @patch("neoguard.services.discovery.aws_discovery.get_client")
    @pytest.mark.asyncio
    async def test_discover_all_uses_warn_for_throttle(self, mock_get_client, mock_log):
        """Throttle errors should be logged at WARN level, not ERROR."""
        from botocore.exceptions import ClientError
        from neoguard.services.discovery.aws_discovery import discover_all

        error_response = {"Error": {"Code": "Throttling", "Message": "rate exceeded"}}

        mock_log.awarn = AsyncMock()
        mock_log.aerror = AsyncMock()

        mock_client = MagicMock()
        mock_paginator = MagicMock()
        mock_paginator.paginate.side_effect = ClientError(error_response, "DescribeInstances")
        mock_client.get_paginator.return_value = mock_paginator
        mock_get_client.return_value = mock_client

        account = _make_aws_account()
        results = await discover_all(account, "us-east-1", "t1")

        assert mock_log.awarn.call_count >= 1
        warn_calls = [c for c in mock_log.awarn.call_args_list if "Discovery failed" in str(c)]
        assert len(warn_calls) >= 1


# ===========================================================================
# CLOUD-008: Azure ClientSecretCredential validation
# ===========================================================================


class TestCloud008AzureCredentialValidation:
    """CLOUD-008: get_credential must catch ValueError/TypeError and raise RuntimeError."""

    def setup_method(self):
        from neoguard.services.azure import credentials
        credentials._credential_cache.clear()
        credentials._client_cache.clear()
        credentials._secret_cache.clear()

    def _make_sub(self):
        from datetime import datetime
        from neoguard.models.azure import AzureSubscription
        return AzureSubscription(
            id="internal-id-1",
            tenant_id="t1",
            name="Test Sub",
            subscription_id="sub-111",
            azure_tenant_id="az-tenant-1",
            client_id="client-1",
            regions=["eastus"],
            enabled=True,
            collect_config={},
            last_sync_at=None,
            created_at=datetime(2026, 1, 1),
            updated_at=datetime(2026, 1, 1),
        )

    @patch("neoguard.services.azure.credentials.ClientSecretCredential")
    @patch("neoguard.services.azure.credentials.log")
    def test_invalid_client_id_raises_runtime_error(self, mock_log, mock_cred_cls):
        """ValueError from ClientSecretCredential must be wrapped in RuntimeError."""
        from neoguard.services.azure.credentials import get_credential, cache_client_secret

        mock_cred_cls.side_effect = ValueError("Invalid tenant_id format")
        cache_client_secret("sub-111", "test-secret")

        sub = self._make_sub()
        with pytest.raises(RuntimeError, match="Failed to create Azure credential"):
            get_credential(sub)

        mock_log.error.assert_called_once()

    @patch("neoguard.services.azure.credentials.ClientSecretCredential")
    @patch("neoguard.services.azure.credentials.log")
    def test_type_error_raises_runtime_error(self, mock_log, mock_cred_cls):
        """TypeError from ClientSecretCredential must be wrapped in RuntimeError."""
        from neoguard.services.azure.credentials import get_credential, cache_client_secret

        mock_cred_cls.side_effect = TypeError("argument of type 'NoneType'")
        cache_client_secret("sub-111", "test-secret")

        sub = self._make_sub()
        with pytest.raises(RuntimeError, match="Failed to create Azure credential"):
            get_credential(sub)

    @patch("neoguard.services.azure.credentials.ClientSecretCredential")
    def test_secret_cache_cleared_after_credential_creation(self, mock_cred_cls):
        """After successful credential creation, secret must be removed from _secret_cache."""
        from neoguard.services.azure import credentials
        from neoguard.services.azure.credentials import get_credential, cache_client_secret

        mock_cred_cls.return_value = MagicMock()
        cache_client_secret("sub-111", "my-secret")

        assert "sub-111" in credentials._secret_cache

        sub = self._make_sub()
        get_credential(sub)

        assert "sub-111" not in credentials._secret_cache


# ===========================================================================
# CLOUD-009: N+1 resource query optimization
# ===========================================================================


class TestCloud009ResourceQueryOptimization:
    """CLOUD-009: list_resources must be called once per account, not once per region."""

    @patch("neoguard.services.collection.orchestrator.collect_cloudwatch_metrics", new_callable=AsyncMock)
    @patch("neoguard.services.collection.orchestrator.list_resources", new_callable=AsyncMock)
    @patch("neoguard.services.collection.orchestrator._resolve_regions", new_callable=AsyncMock)
    @patch("neoguard.services.collection.orchestrator.list_aws_accounts", new_callable=AsyncMock)
    @pytest.mark.asyncio
    async def test_list_resources_called_once_per_account(
        self, mock_list_accounts, mock_resolve_regions, mock_list_resources, mock_collect
    ):
        """With 3 regions, list_resources should be called once (not 3 times)."""
        from neoguard.services.collection.orchestrator import CollectionOrchestrator

        mock_account = MagicMock()
        mock_account.tenant_id = "t1"
        mock_account.account_id = "111111111111"
        mock_list_accounts.return_value = [mock_account]
        mock_resolve_regions.return_value = ["us-east-1", "us-west-2", "eu-west-1"]
        mock_list_resources.return_value = []
        mock_collect.return_value = 0

        orch = CollectionOrchestrator()
        await orch._run_aws_metrics()

        assert mock_list_resources.call_count == 1, (
            f"list_resources called {mock_list_resources.call_count} times "
            f"(expected 1 — once per account, not per region)"
        )

"""Unit tests for onboarding wizard API routes.

Covers Pydantic model validation, response defaults, static endpoint logic,
and the generate_ext_id route with mocked service dependency.
"""

from unittest.mock import patch
from uuid import UUID

import pytest
from pydantic import ValidationError

from neoguard.api.routes.onboarding import (
    ARM_TEMPLATE_URL,
    CFT_TEMPLATE_URL,
    DiscoverPreviewRequest,
    DiscoverPreviewResponse,
    GenerateExternalIdResponse,
    VerifyAWSRequest,
    VerifyAWSResponse,
    VerifyAzureRequest,
    _build_arm_portal_url,
    _build_cft_console_url,
    router,
)

TENANT_ID = "fedcba98-7654-3210-fedc-ba9876543210"

# Minimal valid values for fields with constraints
VALID_ROLE_ARN = "arn:aws:iam::123456789012:role/NeoGuardRole"
VALID_EXTERNAL_ID = "ng-abc123def456"
VALID_UUID = "01234567-89ab-cdef-0123-456789abcdef"


# ---------------------------------------------------------------------------
# Pydantic model validation — VerifyAWSRequest
# ---------------------------------------------------------------------------


class TestVerifyAWSRequestValidation:
    def test_rejects_role_arn_shorter_than_20(self):
        with pytest.raises(ValidationError) as exc_info:
            VerifyAWSRequest(role_arn="short", external_id=VALID_EXTERNAL_ID)
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("role_arn",) for e in errors)

    def test_rejects_role_arn_longer_than_2048(self):
        with pytest.raises(ValidationError) as exc_info:
            VerifyAWSRequest(role_arn="a" * 2049, external_id=VALID_EXTERNAL_ID)
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("role_arn",) for e in errors)

    def test_defaults_region_to_us_east_1(self):
        req = VerifyAWSRequest(
            role_arn=VALID_ROLE_ARN, external_id=VALID_EXTERNAL_ID
        )
        assert req.region == "us-east-1"

    def test_accepts_custom_region(self):
        req = VerifyAWSRequest(
            role_arn=VALID_ROLE_ARN,
            external_id=VALID_EXTERNAL_ID,
            region="eu-west-1",
        )
        assert req.region == "eu-west-1"

    def test_rejects_external_id_shorter_than_5(self):
        with pytest.raises(ValidationError) as exc_info:
            VerifyAWSRequest(role_arn=VALID_ROLE_ARN, external_id="abc")
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("external_id",) for e in errors)

    def test_rejects_external_id_longer_than_256(self):
        with pytest.raises(ValidationError) as exc_info:
            VerifyAWSRequest(role_arn=VALID_ROLE_ARN, external_id="x" * 257)
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("external_id",) for e in errors)


# ---------------------------------------------------------------------------
# Pydantic model validation — DiscoverPreviewRequest
# ---------------------------------------------------------------------------


class TestDiscoverPreviewRequestValidation:
    def test_rejects_empty_regions_list(self):
        with pytest.raises(ValidationError) as exc_info:
            DiscoverPreviewRequest(
                role_arn=VALID_ROLE_ARN,
                external_id=VALID_EXTERNAL_ID,
                regions=[],
            )
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("regions",) for e in errors)

    def test_rejects_more_than_30_regions(self):
        with pytest.raises(ValidationError) as exc_info:
            DiscoverPreviewRequest(
                role_arn=VALID_ROLE_ARN,
                external_id=VALID_EXTERNAL_ID,
                regions=[f"region-{i}" for i in range(31)],
            )
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("regions",) for e in errors)

    def test_accepts_exactly_30_regions(self):
        req = DiscoverPreviewRequest(
            role_arn=VALID_ROLE_ARN,
            external_id=VALID_EXTERNAL_ID,
            regions=[f"region-{i}" for i in range(30)],
        )
        assert len(req.regions) == 30

    def test_accepts_single_region(self):
        req = DiscoverPreviewRequest(
            role_arn=VALID_ROLE_ARN,
            external_id=VALID_EXTERNAL_ID,
            regions=["us-east-1"],
        )
        assert req.regions == ["us-east-1"]


# ---------------------------------------------------------------------------
# Pydantic model validation — VerifyAzureRequest
# ---------------------------------------------------------------------------


class TestVerifyAzureRequestValidation:
    def test_rejects_invalid_uuid_for_azure_tenant_id(self):
        with pytest.raises(ValidationError) as exc_info:
            VerifyAzureRequest(
                azure_tenant_id="not-a-uuid",
                client_id="some-client-id",
                client_secret="some-secret",
                subscription_id=VALID_UUID,
            )
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("azure_tenant_id",) for e in errors)

    def test_rejects_invalid_uuid_for_subscription_id(self):
        with pytest.raises(ValidationError) as exc_info:
            VerifyAzureRequest(
                azure_tenant_id=VALID_UUID,
                client_id="some-client-id",
                client_secret="some-secret",
                subscription_id="invalid-sub-id",
            )
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("subscription_id",) for e in errors)

    def test_accepts_valid_uuid_format(self):
        req = VerifyAzureRequest(
            azure_tenant_id=VALID_UUID,
            client_id="my-client-id",
            client_secret="my-client-secret",
            subscription_id=VALID_UUID,
        )
        assert req.azure_tenant_id == VALID_UUID
        assert req.subscription_id == VALID_UUID

    def test_rejects_empty_client_id(self):
        with pytest.raises(ValidationError) as exc_info:
            VerifyAzureRequest(
                azure_tenant_id=VALID_UUID,
                client_id="",
                client_secret="some-secret",
                subscription_id=VALID_UUID,
            )
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("client_id",) for e in errors)

    def test_rejects_empty_client_secret(self):
        with pytest.raises(ValidationError) as exc_info:
            VerifyAzureRequest(
                azure_tenant_id=VALID_UUID,
                client_id="some-client-id",
                client_secret="",
                subscription_id=VALID_UUID,
            )
        errors = exc_info.value.errors()
        assert any(e["loc"] == ("client_secret",) for e in errors)

    def test_rejects_uppercase_uuid(self):
        """UUID pattern is lowercase hex only: ^[0-9a-f-]{36}$."""
        with pytest.raises(ValidationError):
            VerifyAzureRequest(
                azure_tenant_id="01234567-89AB-CDEF-0123-456789ABCDEF",
                client_id="some-client-id",
                client_secret="some-secret",
                subscription_id=VALID_UUID,
            )


# ---------------------------------------------------------------------------
# Response model defaults
# ---------------------------------------------------------------------------


class TestResponseModelDefaults:
    def test_generate_external_id_response_default_account_id(self):
        resp = GenerateExternalIdResponse(
            external_id="ng-abc123",
            cft_template_url="https://example.com/cft.yaml",
            arm_template_url="https://example.com/arm.json",
            cft_console_url="https://console.aws.amazon.com/cloudformation/home#/stacks/quickcreate?templateURL=...",
            arm_portal_url="https://portal.azure.com/#create/Microsoft.Template/uri/...",
        )
        assert resp.neoguard_account_id == "271547278517"

    def test_generate_external_id_response_allows_override(self):
        resp = GenerateExternalIdResponse(
            external_id="ng-abc123",
            cft_template_url="https://example.com/cft.yaml",
            arm_template_url="https://example.com/arm.json",
            cft_console_url="https://console.aws.amazon.com/cloudformation/home#/stacks/quickcreate?templateURL=...",
            arm_portal_url="https://portal.azure.com/#create/Microsoft.Template/uri/...",
            neoguard_account_id="999999999999",
        )
        assert resp.neoguard_account_id == "999999999999"

    def test_verify_aws_response_allows_none_account_id(self):
        resp = VerifyAWSResponse(
            success=False,
            account_id=None,
            role_arn=VALID_ROLE_ARN,
            services={},
            error="STS call failed",
        )
        assert resp.account_id is None

    def test_verify_aws_response_with_account_id(self):
        resp = VerifyAWSResponse(
            success=True,
            account_id="123456789012",
            role_arn=VALID_ROLE_ARN,
            services={"ec2": 5},
        )
        assert resp.account_id == "123456789012"

    def test_discover_preview_response_allows_none_error(self):
        resp = DiscoverPreviewResponse(
            success=True,
            regions={"us-east-1": {"ec2": 3}},
            totals={"ec2": 3},
        )
        assert resp.error is None

    def test_discover_preview_response_with_error(self):
        resp = DiscoverPreviewResponse(
            success=False,
            regions={},
            totals={},
            error="Discovery failed",
        )
        assert resp.error == "Discovery failed"


# ---------------------------------------------------------------------------
# Static endpoints — list_regions and list_services
# ---------------------------------------------------------------------------


class TestListRegionsEndpoint:
    async def test_returns_both_aws_and_azure_lists(self):
        from neoguard.api.routes.onboarding import list_regions

        result = await list_regions()
        assert len(result.aws) > 0, "AWS regions list must not be empty"
        assert len(result.azure) > 0, "Azure regions list must not be empty"

    async def test_aws_regions_include_us_east_1(self):
        from neoguard.api.routes.onboarding import list_regions

        result = await list_regions()
        assert "us-east-1" in result.aws

    async def test_azure_regions_include_centralindia(self):
        from neoguard.api.routes.onboarding import list_regions

        result = await list_regions()
        assert "centralindia" in result.azure

    async def test_aws_regions_count_matches_source(self):
        from neoguard.api.routes.onboarding import list_regions
        from neoguard.core.regions import AWS_DEFAULT_REGIONS

        result = await list_regions()
        assert len(result.aws) == len(AWS_DEFAULT_REGIONS)

    async def test_azure_regions_count_matches_source(self):
        from neoguard.api.routes.onboarding import list_regions
        from neoguard.core.regions import AZURE_DEFAULT_REGIONS

        result = await list_regions()
        assert len(result.azure) == len(AZURE_DEFAULT_REGIONS)


class TestListServicesEndpoint:
    async def test_returns_9_aws_services(self):
        from neoguard.api.routes.onboarding import list_services

        result = await list_services()
        assert len(result.aws) == 9

    async def test_returns_15_azure_services(self):
        from neoguard.api.routes.onboarding import list_services

        result = await list_services()
        assert len(result.azure) == 15

    async def test_aws_entries_have_id_and_label(self):
        from neoguard.api.routes.onboarding import list_services

        result = await list_services()
        for entry in result.aws:
            assert "id" in entry, f"Missing 'id' key in AWS service entry: {entry}"
            assert "label" in entry, f"Missing 'label' key in AWS service entry: {entry}"

    async def test_azure_entries_have_id_and_label(self):
        from neoguard.api.routes.onboarding import list_services

        result = await list_services()
        for entry in result.azure:
            assert "id" in entry, f"Missing 'id' key in Azure service entry: {entry}"
            assert "label" in entry, f"Missing 'label' key in Azure service entry: {entry}"

    async def test_aws_includes_ec2(self):
        from neoguard.api.routes.onboarding import list_services

        result = await list_services()
        ids = [s["id"] for s in result.aws]
        assert "ec2" in ids

    async def test_azure_includes_virtual_machines(self):
        from neoguard.api.routes.onboarding import list_services

        result = await list_services()
        ids = [s["id"] for s in result.azure]
        assert "virtual_machines" in ids


# ---------------------------------------------------------------------------
# Template URL constants
# ---------------------------------------------------------------------------


class TestTemplateURLConstants:
    def test_cft_template_url_points_to_s3(self):
        assert "s3.amazonaws.com" in CFT_TEMPLATE_URL
        assert CFT_TEMPLATE_URL.endswith(".yaml")

    def test_arm_template_url_points_to_s3(self):
        assert "s3.amazonaws.com" in ARM_TEMPLATE_URL
        assert ARM_TEMPLATE_URL.endswith(".json")

    def test_cft_url_uses_https(self):
        assert CFT_TEMPLATE_URL.startswith("https://")

    def test_arm_url_uses_https(self):
        assert ARM_TEMPLATE_URL.startswith("https://")


class TestConsoleURLBuilders:
    def test_cft_console_url_points_to_aws_console(self):
        url = _build_cft_console_url("https://bucket.s3.amazonaws.com/tpl.yaml", "ng-abc123")
        assert url.startswith("https://console.aws.amazon.com/cloudformation/home#/stacks/quickcreate")

    def test_cft_console_url_includes_template_url(self):
        tpl = "https://bucket.s3.amazonaws.com/tpl.yaml"
        url = _build_cft_console_url(tpl, "ng-abc123")
        assert "templateURL=" in url

    def test_cft_console_url_includes_external_id_param(self):
        url = _build_cft_console_url("https://bucket.s3.amazonaws.com/tpl.yaml", "ng-myextid999")
        assert "param_ExternalId=ng-myextid999" in url

    def test_cft_console_url_includes_stack_name(self):
        url = _build_cft_console_url("https://bucket.s3.amazonaws.com/tpl.yaml", "ng-abc")
        assert "stackName=NeoGuardMonitoringRole" in url

    def test_cft_console_url_includes_account_id_param(self):
        url = _build_cft_console_url("https://bucket.s3.amazonaws.com/tpl.yaml", "ng-abc")
        assert "param_NeoGuardAccountId=271547278517" in url

    def test_cft_console_url_encodes_template_url(self):
        tpl = "https://bucket.s3.amazonaws.com/templates/role.yaml"
        url = _build_cft_console_url(tpl, "ng-abc")
        encoded_part = url.split("templateURL=")[1].split("&")[0]
        assert "%3A" in encoded_part, "Template URL colons should be percent-encoded"
        assert "%2F" in encoded_part, "Template URL slashes should be percent-encoded"

    def test_arm_portal_url_points_to_azure_portal(self):
        url = _build_arm_portal_url("https://bucket.s3.amazonaws.com/tpl.json")
        assert url.startswith("https://portal.azure.com/#create/Microsoft.Template/uri/")

    def test_arm_portal_url_encodes_template_url(self):
        tpl = "https://bucket.s3.amazonaws.com/templates/role.json"
        url = _build_arm_portal_url(tpl)
        encoded_part = url.split("/uri/")[1]
        assert "https%3A" in encoded_part

    def test_cft_console_url_does_not_link_to_raw_s3(self):
        url = _build_cft_console_url(CFT_TEMPLATE_URL, "ng-test")
        assert not url.startswith("https://neoguard-config-bucket.s3")

    def test_arm_portal_url_does_not_link_to_raw_s3(self):
        url = _build_arm_portal_url(ARM_TEMPLATE_URL)
        assert not url.startswith("https://neoguard-config-bucket.s3")


# ---------------------------------------------------------------------------
# generate_ext_id route — mock the service layer
# ---------------------------------------------------------------------------


class TestGenerateExtIdRoute:
    async def test_returns_external_id_from_service(self):
        from neoguard.api.routes.onboarding import generate_ext_id, GenerateExternalIdResponse

        mock_ext_id = "ng-abcdef1234567890abcdef1234567890abcdef12"
        with patch(
            "neoguard.api.routes.onboarding.generate_external_id",
            return_value=mock_ext_id,
        ) as mock_fn:
            result = await generate_ext_id(tenant_id=TENANT_ID)

        mock_fn.assert_called_once_with(TENANT_ID)
        assert result.external_id == mock_ext_id

    async def test_returns_correct_cft_template_url(self):
        mock_ext_id = "ng-abcdef1234567890abcdef1234567890abcdef12"
        with patch(
            "neoguard.api.routes.onboarding.generate_external_id",
            return_value=mock_ext_id,
        ):
            from neoguard.api.routes.onboarding import generate_ext_id

            result = await generate_ext_id(tenant_id=TENANT_ID)

        assert result.cft_template_url == CFT_TEMPLATE_URL

    async def test_returns_correct_arm_template_url(self):
        mock_ext_id = "ng-abcdef1234567890abcdef1234567890abcdef12"
        with patch(
            "neoguard.api.routes.onboarding.generate_external_id",
            return_value=mock_ext_id,
        ):
            from neoguard.api.routes.onboarding import generate_ext_id

            result = await generate_ext_id(tenant_id=TENANT_ID)

        assert result.arm_template_url == ARM_TEMPLATE_URL

    async def test_returns_neoguard_account_id(self):
        mock_ext_id = "ng-abcdef1234567890abcdef1234567890abcdef12"
        with patch(
            "neoguard.api.routes.onboarding.generate_external_id",
            return_value=mock_ext_id,
        ):
            from neoguard.api.routes.onboarding import generate_ext_id

            result = await generate_ext_id(tenant_id=TENANT_ID)

        assert result.neoguard_account_id == "271547278517"

    async def test_cft_console_url_points_to_aws_console(self):
        mock_ext_id = "ng-abcdef1234567890abcdef1234567890abcdef12"
        with patch(
            "neoguard.api.routes.onboarding.generate_external_id",
            return_value=mock_ext_id,
        ):
            from neoguard.api.routes.onboarding import generate_ext_id

            result = await generate_ext_id(tenant_id=TENANT_ID)

        assert result.cft_console_url.startswith(
            "https://console.aws.amazon.com/cloudformation/home"
        )
        assert "param_ExternalId=" in result.cft_console_url

    async def test_arm_portal_url_points_to_azure_portal(self):
        mock_ext_id = "ng-abcdef1234567890abcdef1234567890abcdef12"
        with patch(
            "neoguard.api.routes.onboarding.generate_external_id",
            return_value=mock_ext_id,
        ):
            from neoguard.api.routes.onboarding import generate_ext_id

            result = await generate_ext_id(tenant_id=TENANT_ID)

        assert result.arm_portal_url.startswith(
            "https://portal.azure.com/#create/Microsoft.Template/uri/"
        )

    async def test_console_urls_do_not_link_to_raw_s3(self):
        mock_ext_id = "ng-abcdef1234567890abcdef1234567890abcdef12"
        with patch(
            "neoguard.api.routes.onboarding.generate_external_id",
            return_value=mock_ext_id,
        ):
            from neoguard.api.routes.onboarding import generate_ext_id

            result = await generate_ext_id(tenant_id=TENANT_ID)

        assert not result.cft_console_url.startswith("https://neoguard-config-bucket.s3")
        assert not result.arm_portal_url.startswith("https://neoguard-config-bucket.s3")


# ---------------------------------------------------------------------------
# HTTP-level route tests via ASGI transport
# ---------------------------------------------------------------------------

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient


def _make_app(
    *,
    tenant_id: str = TENANT_ID,
    scopes: list[str] | None = None,
) -> FastAPI:
    """Create a test FastAPI app with injected auth state."""
    app = FastAPI()

    @app.middleware("http")
    async def inject_auth(request, call_next):
        request.state.tenant_id = tenant_id
        request.state.scopes = scopes if scopes is not None else ["admin"]
        request.state.is_super_admin = False
        return await call_next(request)

    app.include_router(router)
    return app


class TestGenerateExtIdHTTP:
    async def test_generate_external_id_200(self):
        app = _make_app()
        mock_ext_id = "ng-abcdef1234567890abcdef1234567890abcdef12"
        with patch(
            "neoguard.api.routes.onboarding.generate_external_id",
            return_value=mock_ext_id,
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.post("/api/v1/onboarding/generate-external-id")
            assert resp.status_code == 200
            data = resp.json()
            assert data["external_id"] == mock_ext_id
            assert data["neoguard_account_id"] == "271547278517"
            assert data["cft_template_url"] == CFT_TEMPLATE_URL
            assert data["arm_template_url"] == ARM_TEMPLATE_URL
            assert data["cft_console_url"].startswith("https://console.aws.amazon.com/cloudformation/")
            assert data["arm_portal_url"].startswith("https://portal.azure.com/#create/")

    async def test_generate_external_id_rejects_read_scope(self):
        app = _make_app(scopes=["read"])
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/api/v1/onboarding/generate-external-id")
        assert resp.status_code == 403


class TestRegionsHTTP:
    async def test_list_regions_200(self):
        app = _make_app()
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/v1/onboarding/regions")
        assert resp.status_code == 200
        data = resp.json()
        assert "aws" in data
        assert "azure" in data
        assert len(data["aws"]) > 0
        assert len(data["azure"]) > 0


class TestServicesHTTP:
    async def test_list_services_200(self):
        app = _make_app()
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/v1/onboarding/services")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["aws"]) == 9
        assert len(data["azure"]) == 15


class TestVerifyAWSHTTP:
    async def test_verify_aws_returns_result(self):
        app = _make_app()
        mock_result = {
            "success": True,
            "account_id": "123456789012",
            "role_arn": VALID_ROLE_ARN,
            "services": {"ec2": 5, "rds": 2},
        }
        with patch(
            "neoguard.api.routes.onboarding.verify_aws_role",
            return_value=mock_result,
        ), patch(
            "neoguard.services.aws.accounts.list_aws_accounts",
            return_value=[],
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.post(
                    "/api/v1/onboarding/verify-aws",
                    json={
                        "role_arn": VALID_ROLE_ARN,
                        "external_id": VALID_EXTERNAL_ID,
                        "region": "us-east-1",
                    },
                )
            assert resp.status_code == 200
            data = resp.json()
            assert data["success"] is True
            assert data["account_id"] == "123456789012"

    async def test_verify_aws_rejects_short_role_arn(self):
        app = _make_app()
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/onboarding/verify-aws",
                json={
                    "role_arn": "short",
                    "external_id": VALID_EXTERNAL_ID,
                },
            )
        assert resp.status_code == 422

    async def test_verify_aws_rejects_read_scope(self):
        app = _make_app(scopes=["read"])
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/onboarding/verify-aws",
                json={
                    "role_arn": VALID_ROLE_ARN,
                    "external_id": VALID_EXTERNAL_ID,
                },
            )
        assert resp.status_code == 403


class TestDiscoverPreviewHTTP:
    async def test_discover_preview_returns_result(self):
        app = _make_app()
        mock_result = {
            "success": True,
            "regions": {"us-east-1": {"ec2": 3}},
            "totals": {"ec2": 3},
        }
        with patch(
            "neoguard.api.routes.onboarding.discover_aws_preview",
            return_value=mock_result,
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.post(
                    "/api/v1/onboarding/discover-preview",
                    json={
                        "role_arn": VALID_ROLE_ARN,
                        "external_id": VALID_EXTERNAL_ID,
                        "regions": ["us-east-1"],
                    },
                )
            assert resp.status_code == 200
            data = resp.json()
            assert data["success"] is True
            assert "us-east-1" in data["regions"]

    async def test_discover_preview_rejects_empty_regions(self):
        app = _make_app()
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/onboarding/discover-preview",
                json={
                    "role_arn": VALID_ROLE_ARN,
                    "external_id": VALID_EXTERNAL_ID,
                    "regions": [],
                },
            )
        assert resp.status_code == 422


class TestVerifyAzureHTTP:
    async def test_verify_azure_returns_result(self):
        app = _make_app()
        mock_result = {
            "success": True,
            "subscription_id": VALID_UUID,
            "services": {"virtual_machines": 3},
        }
        with patch(
            "neoguard.services.azure.accounts.list_azure_subscriptions",
            return_value=[],
        ), patch(
            "neoguard.api.routes.onboarding.verify_azure_sp",
            return_value=mock_result,
        ):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                resp = await client.post(
                    "/api/v1/onboarding/verify-azure",
                    json={
                        "azure_tenant_id": VALID_UUID,
                        "client_id": "my-client",
                        "client_secret": "my-secret",
                        "subscription_id": VALID_UUID,
                    },
                )
            assert resp.status_code == 200
            data = resp.json()
            assert data["success"] is True

    async def test_verify_azure_rejects_invalid_tenant_uuid(self):
        app = _make_app()
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/onboarding/verify-azure",
                json={
                    "azure_tenant_id": "not-valid",
                    "client_id": "my-client",
                    "client_secret": "my-secret",
                    "subscription_id": VALID_UUID,
                },
            )
        assert resp.status_code == 422

    async def test_verify_azure_rejects_read_scope(self):
        app = _make_app(scopes=["read"])
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/onboarding/verify-azure",
                json={
                    "azure_tenant_id": VALID_UUID,
                    "client_id": "my-client",
                    "client_secret": "my-secret",
                    "subscription_id": VALID_UUID,
                },
            )
        assert resp.status_code == 403

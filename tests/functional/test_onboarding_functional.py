"""
Functional tests for cloud account onboarding wizard API.

Requires: Backend on :8000, TimescaleDB on :5433, Redis on :6379
Tests marked "EXPECTED FAILURE" will fail without real AWS/Azure credentials -- this is intentional.
Run: NEOGUARD_DB_PORT=5433 python -m pytest tests/functional/test_onboarding_functional.py -v
"""
from __future__ import annotations

import httpx
import pytest

BASE = "http://localhost:8000"
ADMIN_EMAIL = "admin@neoguard.dev"
ADMIN_PASSWORD = "SuperAdmin1!"

# Fake but structurally valid values for cloud verification tests
FAKE_AWS_ARN = "arn:aws:iam::999999999999:role/FakeNeoGuardRole"
FAKE_EXTERNAL_ID = "ng-0000000000000000000000000000000000000000"
FAKE_AZURE_TENANT_ID = "00000000-0000-0000-0000-000000000001"
FAKE_AZURE_CLIENT_ID = "00000000-0000-0000-0000-000000000002"
FAKE_AZURE_CLIENT_SECRET = "fake-client-secret-value-for-testing"
FAKE_AZURE_SUBSCRIPTION_ID = "00000000-0000-0000-0000-000000000003"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def session():
    """Authenticated admin session with CSRF token for mutation endpoints."""
    client = httpx.Client(base_url=BASE, timeout=30.0)
    resp = client.post("/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    csrf = client.cookies.get("csrf_token")
    client.headers["X-CSRF-Token"] = csrf or ""
    yield client
    client.close()


@pytest.fixture(scope="module")
def unauthenticated_client():
    """Client with no auth session -- used to verify 401 responses."""
    client = httpx.Client(base_url=BASE, timeout=15.0)
    yield client
    client.close()


# ---------------------------------------------------------------------------
# 1. Regions endpoint (functional -- should PASS)
# ---------------------------------------------------------------------------


class TestOnboardingRegions:
    """Verify GET /api/v1/onboarding/regions returns correct AWS and Azure region lists."""

    def test_regions_returns_200(self, session: httpx.Client):
        """GET /regions should return 200 with aws and azure keys."""
        resp = session.get("/api/v1/onboarding/regions")
        assert resp.status_code == 200
        data = resp.json()
        assert "aws" in data, "Response missing 'aws' key"
        assert "azure" in data, "Response missing 'azure' key"

    def test_aws_regions_non_empty(self, session: httpx.Client):
        """AWS region list must not be empty."""
        resp = session.get("/api/v1/onboarding/regions")
        data = resp.json()
        assert len(data["aws"]) > 0, "AWS region list is empty"

    def test_azure_regions_non_empty(self, session: httpx.Client):
        """Azure region list must not be empty."""
        resp = session.get("/api/v1/onboarding/regions")
        data = resp.json()
        assert len(data["azure"]) > 0, "Azure region list is empty"

    def test_aws_contains_us_east_1(self, session: httpx.Client):
        """us-east-1 is the most common AWS region and must be present."""
        resp = session.get("/api/v1/onboarding/regions")
        data = resp.json()
        assert "us-east-1" in data["aws"], "us-east-1 missing from AWS regions"

    def test_azure_contains_centralindia(self, session: httpx.Client):
        """centralindia is a key Azure region for NeoGuard and must be present."""
        resp = session.get("/api/v1/onboarding/regions")
        data = resp.json()
        assert "centralindia" in data["azure"], "centralindia missing from Azure regions"

    def test_aws_region_count(self, session: httpx.Client):
        """AWS should have exactly 9 default regions."""
        resp = session.get("/api/v1/onboarding/regions")
        data = resp.json()
        assert len(data["aws"]) == 9, f"Expected 9 AWS regions, got {len(data['aws'])}"

    def test_azure_region_count(self, session: httpx.Client):
        """Azure should have exactly 14 default regions."""
        resp = session.get("/api/v1/onboarding/regions")
        data = resp.json()
        assert len(data["azure"]) == 14, f"Expected 14 Azure regions, got {len(data['azure'])}"

    def test_regions_are_strings(self, session: httpx.Client):
        """All region entries must be strings."""
        resp = session.get("/api/v1/onboarding/regions")
        data = resp.json()
        for region in data["aws"]:
            assert isinstance(region, str), f"AWS region not a string: {region}"
        for region in data["azure"]:
            assert isinstance(region, str), f"Azure region not a string: {region}"


# ---------------------------------------------------------------------------
# 2. Services endpoint (functional -- should PASS)
# ---------------------------------------------------------------------------


class TestOnboardingServices:
    """Verify GET /api/v1/onboarding/services returns correct AWS and Azure service catalogs."""

    def test_services_returns_200(self, session: httpx.Client):
        """GET /services should return 200 with aws and azure keys."""
        resp = session.get("/api/v1/onboarding/services")
        assert resp.status_code == 200
        data = resp.json()
        assert "aws" in data, "Response missing 'aws' key"
        assert "azure" in data, "Response missing 'azure' key"

    def test_aws_services_count(self, session: httpx.Client):
        """AWS should list exactly 9 monitorable services."""
        resp = session.get("/api/v1/onboarding/services")
        data = resp.json()
        assert len(data["aws"]) == 9, f"Expected 9 AWS services, got {len(data['aws'])}"

    def test_azure_services_count(self, session: httpx.Client):
        """Azure should list exactly 15 monitorable services."""
        resp = session.get("/api/v1/onboarding/services")
        data = resp.json()
        assert len(data["azure"]) == 15, f"Expected 15 Azure services, got {len(data['azure'])}"

    def test_service_items_have_id_and_label(self, session: httpx.Client):
        """Every service item must have 'id' and 'label' keys."""
        resp = session.get("/api/v1/onboarding/services")
        data = resp.json()
        for provider in ("aws", "azure"):
            for item in data[provider]:
                assert "id" in item, f"{provider} service missing 'id': {item}"
                assert "label" in item, f"{provider} service missing 'label': {item}"

    def test_aws_includes_core_services(self, session: httpx.Client):
        """AWS must include ec2, rds, lambda, dynamodb, s3."""
        resp = session.get("/api/v1/onboarding/services")
        data = resp.json()
        aws_ids = {s["id"] for s in data["aws"]}
        expected = {"ec2", "rds", "lambda", "dynamodb", "s3"}
        missing = expected - aws_ids
        assert not missing, f"AWS missing core services: {missing}"

    def test_azure_includes_core_services(self, session: httpx.Client):
        """Azure must include virtual_machines and sql_databases."""
        resp = session.get("/api/v1/onboarding/services")
        data = resp.json()
        azure_ids = {s["id"] for s in data["azure"]}
        expected = {"virtual_machines", "sql_databases"}
        missing = expected - azure_ids
        assert not missing, f"Azure missing core services: {missing}"

    def test_service_ids_are_unique(self, session: httpx.Client):
        """Service IDs must be unique within each provider."""
        resp = session.get("/api/v1/onboarding/services")
        data = resp.json()
        for provider in ("aws", "azure"):
            ids = [s["id"] for s in data[provider]]
            assert len(ids) == len(set(ids)), f"Duplicate service IDs in {provider}: {ids}"

    def test_service_labels_are_non_empty(self, session: httpx.Client):
        """Service labels must be non-empty human-readable strings."""
        resp = session.get("/api/v1/onboarding/services")
        data = resp.json()
        for provider in ("aws", "azure"):
            for item in data[provider]:
                assert len(item["label"]) > 0, f"Empty label in {provider}: {item}"


# ---------------------------------------------------------------------------
# 3. Generate external ID (functional -- should PASS)
# ---------------------------------------------------------------------------


class TestGenerateExternalId:
    """Verify POST /api/v1/onboarding/generate-external-id returns correct structure."""

    def test_returns_200(self, session: httpx.Client):
        """Endpoint should return 200 for authenticated admin."""
        resp = session.post("/api/v1/onboarding/generate-external-id")
        assert resp.status_code == 200

    def test_external_id_starts_with_ng_prefix(self, session: httpx.Client):
        """External ID must start with 'ng-' prefix per NeoGuard convention."""
        resp = session.post("/api/v1/onboarding/generate-external-id")
        data = resp.json()
        assert data["external_id"].startswith("ng-"), f"Expected ng- prefix, got: {data['external_id']}"

    def test_external_id_is_43_chars(self, session: httpx.Client):
        """External ID format: 'ng-' (3 chars) + 40 hex chars = 43 total."""
        resp = session.post("/api/v1/onboarding/generate-external-id")
        data = resp.json()
        assert len(data["external_id"]) == 43, (
            f"Expected 43 chars, got {len(data['external_id'])}: {data['external_id']}"
        )

    def test_external_id_hex_portion_is_valid(self, session: httpx.Client):
        """The 40-char portion after 'ng-' must be valid hexadecimal."""
        resp = session.post("/api/v1/onboarding/generate-external-id")
        data = resp.json()
        hex_part = data["external_id"][3:]
        assert len(hex_part) == 40
        try:
            int(hex_part, 16)
        except ValueError:
            pytest.fail(f"Non-hex characters in external_id hex portion: {hex_part}")

    def test_cft_template_url_points_to_s3(self, session: httpx.Client):
        """Raw CFT template URL must point to the NeoGuard S3 config bucket."""
        resp = session.post("/api/v1/onboarding/generate-external-id")
        data = resp.json()
        assert data["cft_template_url"].startswith("https://neoguard-config-bucket.s3.amazonaws.com/"), (
            f"Unexpected CFT URL: {data['cft_template_url']}"
        )

    def test_arm_template_url_points_to_s3(self, session: httpx.Client):
        """Raw ARM template URL must point to the NeoGuard S3 config bucket."""
        resp = session.post("/api/v1/onboarding/generate-external-id")
        data = resp.json()
        assert data["arm_template_url"].startswith("https://neoguard-config-bucket.s3.amazonaws.com/"), (
            f"Unexpected ARM URL: {data['arm_template_url']}"
        )

    def test_cft_console_url_points_to_aws_console(self, session: httpx.Client):
        """CFT console URL must open CloudFormation Console quick-create, not raw S3."""
        resp = session.post("/api/v1/onboarding/generate-external-id")
        data = resp.json()
        url = data["cft_console_url"]
        assert url.startswith("https://console.aws.amazon.com/cloudformation/"), (
            f"cft_console_url should open AWS Console, not raw S3: {url}"
        )
        assert "quickcreate" in url, "Should use quick-create flow"
        assert "param_ExternalId=" in url, "External ID should be baked into URL"
        assert "stackName=NeoGuardMonitoringRole" in url, "Stack name should be pre-filled"
        assert not url.startswith("https://neoguard-config-bucket.s3"), (
            "Console URL must NOT be a raw S3 link"
        )

    def test_arm_portal_url_points_to_azure_portal(self, session: httpx.Client):
        """ARM portal URL must open Azure Portal template deploy, not raw S3."""
        resp = session.post("/api/v1/onboarding/generate-external-id")
        data = resp.json()
        url = data["arm_portal_url"]
        assert url.startswith("https://portal.azure.com/#create/Microsoft.Template/uri/"), (
            f"arm_portal_url should open Azure Portal, not raw S3: {url}"
        )
        assert not url.startswith("https://neoguard-config-bucket.s3"), (
            "Portal URL must NOT be a raw S3 link"
        )

    def test_neoguard_account_id(self, session: httpx.Client):
        """NeoGuard AWS account ID must be 271547278517."""
        resp = session.post("/api/v1/onboarding/generate-external-id")
        data = resp.json()
        assert data["neoguard_account_id"] == "271547278517", (
            f"Unexpected account ID: {data['neoguard_account_id']}"
        )

    def test_two_calls_return_different_ids(self, session: httpx.Client):
        """Each call must generate a unique cryptographic external ID (randomness check)."""
        resp1 = session.post("/api/v1/onboarding/generate-external-id")
        resp2 = session.post("/api/v1/onboarding/generate-external-id")
        id1 = resp1.json()["external_id"]
        id2 = resp2.json()["external_id"]
        assert id1 != id2, f"Two calls returned the same external_id: {id1}"

    def test_without_auth_returns_401(self, unauthenticated_client: httpx.Client):
        """Unauthenticated POST to generate-external-id must be rejected with 401."""
        resp = unauthenticated_client.post("/api/v1/onboarding/generate-external-id")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"


# ---------------------------------------------------------------------------
# 4. Auth enforcement on onboarding endpoints (functional -- should PASS)
# ---------------------------------------------------------------------------


class TestOnboardingAuth:
    """Verify that protected endpoints reject unauthenticated requests with 401."""

    def test_generate_external_id_without_auth_returns_401(
        self, unauthenticated_client: httpx.Client
    ):
        """POST generate-external-id without auth must return 401."""
        resp = unauthenticated_client.post("/api/v1/onboarding/generate-external-id")
        assert resp.status_code == 401

    def test_verify_aws_without_auth_returns_401(self, unauthenticated_client: httpx.Client):
        """POST verify-aws without auth must return 401."""
        resp = unauthenticated_client.post(
            "/api/v1/onboarding/verify-aws",
            json={
                "role_arn": FAKE_AWS_ARN,
                "external_id": FAKE_EXTERNAL_ID,
            },
        )
        assert resp.status_code == 401

    def test_verify_azure_without_auth_returns_401(self, unauthenticated_client: httpx.Client):
        """POST verify-azure without auth must return 401."""
        resp = unauthenticated_client.post(
            "/api/v1/onboarding/verify-azure",
            json={
                "azure_tenant_id": FAKE_AZURE_TENANT_ID,
                "client_id": FAKE_AZURE_CLIENT_ID,
                "client_secret": FAKE_AZURE_CLIENT_SECRET,
                "subscription_id": FAKE_AZURE_SUBSCRIPTION_ID,
            },
        )
        assert resp.status_code == 401

    def test_discover_preview_without_auth_returns_401(
        self, unauthenticated_client: httpx.Client
    ):
        """POST discover-preview without auth must return 401."""
        resp = unauthenticated_client.post(
            "/api/v1/onboarding/discover-preview",
            json={
                "role_arn": FAKE_AWS_ARN,
                "external_id": FAKE_EXTERNAL_ID,
                "regions": ["us-east-1"],
            },
        )
        assert resp.status_code == 401

    def test_regions_without_auth_returns_401(self, unauthenticated_client: httpx.Client):
        """GET /regions without auth returns 401 because the auth middleware intercepts
        all non-exempt paths. The endpoint itself has no auth dependency, but the
        middleware layer enforces authentication before the request reaches the route."""
        resp = unauthenticated_client.get("/api/v1/onboarding/regions")
        assert resp.status_code == 401

    def test_services_without_auth_returns_401(self, unauthenticated_client: httpx.Client):
        """GET /services without auth returns 401 for the same reason as /regions --
        the auth middleware blocks unauthenticated requests before they reach the handler."""
        resp = unauthenticated_client.get("/api/v1/onboarding/services")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# 5. Input validation (functional -- should PASS)
# ---------------------------------------------------------------------------


class TestOnboardingValidation:
    """Verify Pydantic validation rejects malformed requests with 422."""

    def test_verify_aws_short_role_arn_returns_422(self, session: httpx.Client):
        """role_arn has min_length=20. A short ARN must be rejected."""
        resp = session.post(
            "/api/v1/onboarding/verify-aws",
            json={"role_arn": "arn:short", "external_id": FAKE_EXTERNAL_ID},
        )
        assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"

    def test_verify_aws_empty_body_returns_422(self, session: httpx.Client):
        """An empty JSON body must fail validation (role_arn and external_id are required)."""
        resp = session.post("/api/v1/onboarding/verify-aws", json={})
        assert resp.status_code == 422

    def test_verify_aws_short_external_id_returns_422(self, session: httpx.Client):
        """external_id has min_length=5. A 3-char value must be rejected."""
        resp = session.post(
            "/api/v1/onboarding/verify-aws",
            json={"role_arn": FAKE_AWS_ARN, "external_id": "ng"},
        )
        assert resp.status_code == 422

    def test_verify_azure_invalid_tenant_id_returns_422(self, session: httpx.Client):
        """azure_tenant_id must match UUID pattern ^[0-9a-f-]{36}$. A non-UUID is rejected."""
        resp = session.post(
            "/api/v1/onboarding/verify-azure",
            json={
                "azure_tenant_id": "not-a-valid-uuid",
                "client_id": FAKE_AZURE_CLIENT_ID,
                "client_secret": FAKE_AZURE_CLIENT_SECRET,
                "subscription_id": FAKE_AZURE_SUBSCRIPTION_ID,
            },
        )
        assert resp.status_code == 422

    def test_verify_azure_invalid_subscription_id_returns_422(self, session: httpx.Client):
        """subscription_id must match UUID pattern. A short string is rejected."""
        resp = session.post(
            "/api/v1/onboarding/verify-azure",
            json={
                "azure_tenant_id": FAKE_AZURE_TENANT_ID,
                "client_id": FAKE_AZURE_CLIENT_ID,
                "client_secret": FAKE_AZURE_CLIENT_SECRET,
                "subscription_id": "invalid",
            },
        )
        assert resp.status_code == 422

    def test_verify_azure_empty_body_returns_422(self, session: httpx.Client):
        """An empty JSON body must fail validation (all 4 fields are required)."""
        resp = session.post("/api/v1/onboarding/verify-azure", json={})
        assert resp.status_code == 422

    def test_discover_preview_empty_regions_returns_422(self, session: httpx.Client):
        """regions list has min_length=1. An empty list must be rejected."""
        resp = session.post(
            "/api/v1/onboarding/discover-preview",
            json={
                "role_arn": FAKE_AWS_ARN,
                "external_id": FAKE_EXTERNAL_ID,
                "regions": [],
            },
        )
        assert resp.status_code == 422

    def test_discover_preview_too_many_regions_returns_422(self, session: httpx.Client):
        """regions list has max_length=30. 31 regions must be rejected."""
        regions = [f"us-fake-{i}" for i in range(31)]
        resp = session.post(
            "/api/v1/onboarding/discover-preview",
            json={
                "role_arn": FAKE_AWS_ARN,
                "external_id": FAKE_EXTERNAL_ID,
                "regions": regions,
            },
        )
        assert resp.status_code == 422

    def test_discover_preview_missing_regions_returns_422(self, session: httpx.Client):
        """The 'regions' field is required. Omitting it must return 422."""
        resp = session.post(
            "/api/v1/onboarding/discover-preview",
            json={
                "role_arn": FAKE_AWS_ARN,
                "external_id": FAKE_EXTERNAL_ID,
            },
        )
        assert resp.status_code == 422

    def test_discover_preview_empty_body_returns_422(self, session: httpx.Client):
        """An empty body must fail validation."""
        resp = session.post("/api/v1/onboarding/discover-preview", json={})
        assert resp.status_code == 422

    def test_verify_azure_empty_client_secret_returns_422(self, session: httpx.Client):
        """client_secret has min_length=1. An empty string must be rejected."""
        resp = session.post(
            "/api/v1/onboarding/verify-azure",
            json={
                "azure_tenant_id": FAKE_AZURE_TENANT_ID,
                "client_id": FAKE_AZURE_CLIENT_ID,
                "client_secret": "",
                "subscription_id": FAKE_AZURE_SUBSCRIPTION_ID,
            },
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# 6. Verify AWS (EXPECTED FAILURE -- no real AWS credentials)
# ---------------------------------------------------------------------------


class TestVerifyAWSFunctional:
    """Test POST /api/v1/onboarding/verify-aws with fake credentials.

    EXPECTED FAILURE: These tests call the real AWS STS AssumeRole API with
    fabricated credentials. The endpoint should return a 200 response with
    success=false and an error message describing the STS failure. This is
    the correct behavior -- the onboarding wizard shows the error to the
    user so they can fix their IAM configuration.

    To make these tests pass with success=true, configure a real AWS IAM
    role with the NeoGuard trust policy and external ID.
    """

    def test_fake_arn_returns_200_with_failure(self, session: httpx.Client):
        """Verify-aws with a fake ARN should return 200 with success=false.

        Expected failure -- no real AWS role configured for demo.
        The endpoint wraps STS errors gracefully rather than returning 500.
        """
        resp = session.post(
            "/api/v1/onboarding/verify-aws",
            json={
                "role_arn": FAKE_AWS_ARN,
                "external_id": FAKE_EXTERNAL_ID,
            },
        )
        assert resp.status_code == 200, (
            f"Expected 200 (graceful error), got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert data["success"] is False, (
            "Expected success=false with fake credentials -- if this passes with "
            "success=true, real AWS credentials are configured (unexpected in demo)"
        )
        assert data["error"] is not None, "Expected an error message describing the STS failure"
        assert data["role_arn"] == FAKE_AWS_ARN

    def test_fake_arn_response_shape(self, session: httpx.Client):
        """Even on failure, the response must have the full VerifyAWSResponse shape.

        Expected failure -- no real AWS role configured for demo.
        """
        resp = session.post(
            "/api/v1/onboarding/verify-aws",
            json={
                "role_arn": FAKE_AWS_ARN,
                "external_id": FAKE_EXTERNAL_ID,
                "region": "ap-south-1",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        # All response fields must be present regardless of success/failure
        assert "success" in data
        assert "role_arn" in data
        assert "services" in data
        assert "error" in data
        assert "account_id" in data

    def test_fake_arn_services_empty_on_failure(self, session: httpx.Client):
        """On STS failure, the services dict should be empty.

        Expected failure -- no real AWS role configured for demo.
        """
        resp = session.post(
            "/api/v1/onboarding/verify-aws",
            json={
                "role_arn": FAKE_AWS_ARN,
                "external_id": FAKE_EXTERNAL_ID,
            },
        )
        data = resp.json()
        assert data["success"] is False
        assert isinstance(data["services"], dict)


# ---------------------------------------------------------------------------
# 7. Verify Azure (EXPECTED FAILURE -- no real Azure credentials)
# ---------------------------------------------------------------------------


class TestVerifyAzureFunctional:
    """Test POST /api/v1/onboarding/verify-azure with fake credentials.

    EXPECTED FAILURE: These tests call the real Azure authentication API with
    fabricated service principal credentials. The endpoint should return a 200
    response with success=false and an error message describing the auth
    failure. This is the correct behavior -- the onboarding wizard shows the
    error to the user so they can fix their Azure AD app registration.

    To make these tests pass with success=true, configure a real Azure AD
    app registration with the NeoGuard required permissions.
    """

    def test_fake_credentials_returns_200_with_failure(self, session: httpx.Client):
        """Verify-azure with fake creds should return 200 with success=false.

        Expected failure -- no real Azure credentials configured for demo.
        The endpoint wraps Azure auth errors gracefully rather than returning 500.
        """
        resp = session.post(
            "/api/v1/onboarding/verify-azure",
            json={
                "azure_tenant_id": FAKE_AZURE_TENANT_ID,
                "client_id": FAKE_AZURE_CLIENT_ID,
                "client_secret": FAKE_AZURE_CLIENT_SECRET,
                "subscription_id": FAKE_AZURE_SUBSCRIPTION_ID,
            },
        )
        assert resp.status_code == 200, (
            f"Expected 200 (graceful error), got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert data["success"] is False, (
            "Expected success=false with fake credentials -- if this passes with "
            "success=true, real Azure credentials are configured (unexpected in demo)"
        )
        assert data["error"] is not None, "Expected an error message describing the auth failure"

    def test_fake_credentials_response_shape(self, session: httpx.Client):
        """Even on failure, the response must have the full VerifyAzureResponse shape.

        Expected failure -- no real Azure credentials configured for demo.
        """
        resp = session.post(
            "/api/v1/onboarding/verify-azure",
            json={
                "azure_tenant_id": FAKE_AZURE_TENANT_ID,
                "client_id": FAKE_AZURE_CLIENT_ID,
                "client_secret": FAKE_AZURE_CLIENT_SECRET,
                "subscription_id": FAKE_AZURE_SUBSCRIPTION_ID,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        # All response fields must be present regardless of success/failure
        assert "success" in data
        assert "subscription_id" in data
        assert "services" in data
        assert "error" in data

    def test_fake_credentials_subscription_echoed(self, session: httpx.Client):
        """The response should echo back the subscription_id from the request.

        Expected failure -- no real Azure credentials configured for demo.
        """
        resp = session.post(
            "/api/v1/onboarding/verify-azure",
            json={
                "azure_tenant_id": FAKE_AZURE_TENANT_ID,
                "client_id": FAKE_AZURE_CLIENT_ID,
                "client_secret": FAKE_AZURE_CLIENT_SECRET,
                "subscription_id": FAKE_AZURE_SUBSCRIPTION_ID,
            },
        )
        data = resp.json()
        assert data["subscription_id"] == FAKE_AZURE_SUBSCRIPTION_ID


# ---------------------------------------------------------------------------
# 8. Discover Preview (EXPECTED FAILURE -- no real AWS credentials)
# ---------------------------------------------------------------------------


class TestDiscoverPreviewFunctional:
    """Test POST /api/v1/onboarding/discover-preview with fake credentials.

    EXPECTED FAILURE: This endpoint calls AWS STS + multiple AWS service APIs
    to enumerate resources across regions. With fake credentials, the STS
    AssumeRole call will fail, resulting in success=false.

    To make these tests pass with success=true, configure a real AWS IAM
    role with cross-account discovery permissions.
    """

    def test_fake_arn_returns_200_with_failure(self, session: httpx.Client):
        """Discover-preview with a fake ARN should return 200 with success=false.

        Expected failure -- no real AWS role configured for demo.
        The endpoint wraps STS errors gracefully rather than returning 500.
        """
        resp = session.post(
            "/api/v1/onboarding/discover-preview",
            json={
                "role_arn": FAKE_AWS_ARN,
                "external_id": FAKE_EXTERNAL_ID,
                "regions": ["us-east-1", "ap-south-1"],
            },
        )
        assert resp.status_code == 200, (
            f"Expected 200 (graceful error), got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert data["success"] is False, (
            "Expected success=false with fake credentials -- if this passes with "
            "success=true, real AWS credentials are configured (unexpected in demo)"
        )
        assert data["error"] is not None, "Expected an error message describing the failure"

    def test_fake_arn_response_shape(self, session: httpx.Client):
        """Even on failure, the response must have the full DiscoverPreviewResponse shape.

        Expected failure -- no real AWS role configured for demo.
        """
        resp = session.post(
            "/api/v1/onboarding/discover-preview",
            json={
                "role_arn": FAKE_AWS_ARN,
                "external_id": FAKE_EXTERNAL_ID,
                "regions": ["us-east-1"],
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        # All response fields must be present regardless of success/failure
        assert "success" in data
        assert "regions" in data
        assert "totals" in data
        assert "error" in data

    def test_single_region_preview(self, session: httpx.Client):
        """Discover-preview with a single region should still return valid shape.

        Expected failure -- no real AWS role configured for demo.
        """
        resp = session.post(
            "/api/v1/onboarding/discover-preview",
            json={
                "role_arn": FAKE_AWS_ARN,
                "external_id": FAKE_EXTERNAL_ID,
                "regions": ["us-east-1"],
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data["regions"], dict)
        assert isinstance(data["totals"], dict)


# ---------------------------------------------------------------------------
# 9. End-to-end flow (functional workflow -- tests the API contract)
# ---------------------------------------------------------------------------


class TestOnboardingEndToEndFlow:
    """End-to-end workflow tests that exercise the full onboarding API contract.

    These tests simulate the wizard flow: generate external ID, then attempt
    cloud verification. The verification steps will fail without real
    credentials, but the API contract (request/response shapes, status codes,
    field presence) is fully validated.
    """

    def test_aws_onboarding_flow(self, session: httpx.Client):
        """Full AWS onboarding flow: generate external ID -> verify AWS -> check response.

        Step 1: Generate external ID (should succeed).
        Step 2: Use that external ID to call verify-aws with a fake ARN.
        Step 3: Verify the response shape is correct even though verification fails.

        The verify-aws step will fail because there is no real AWS role -- this is
        expected and documented. The test validates the API contract, not AWS connectivity.
        """
        # Step 1: Generate external ID
        resp = session.post("/api/v1/onboarding/generate-external-id")
        assert resp.status_code == 200
        gen_data = resp.json()
        external_id = gen_data["external_id"]

        # Validate generated external ID
        assert external_id.startswith("ng-")
        assert len(external_id) == 43
        assert gen_data["neoguard_account_id"] == "271547278517"
        assert gen_data["cft_template_url"].endswith(".yaml")
        assert gen_data["arm_template_url"].endswith(".json")
        assert gen_data["cft_console_url"].startswith("https://console.aws.amazon.com/")
        assert gen_data["arm_portal_url"].startswith("https://portal.azure.com/")

        # Step 2: Attempt verify-aws with real external ID but fake ARN
        # Expected failure -- no real AWS role configured
        resp = session.post(
            "/api/v1/onboarding/verify-aws",
            json={
                "role_arn": FAKE_AWS_ARN,
                "external_id": external_id,
                "region": "us-east-1",
            },
        )
        assert resp.status_code == 200

        # Step 3: Validate response shape
        verify_data = resp.json()
        assert "success" in verify_data
        assert "role_arn" in verify_data
        assert "services" in verify_data
        assert "error" in verify_data
        assert "account_id" in verify_data
        assert verify_data["role_arn"] == FAKE_AWS_ARN
        # With fake credentials, success should be false
        assert verify_data["success"] is False

    def test_azure_onboarding_flow(self, session: httpx.Client):
        """Full Azure onboarding flow: generate external ID -> verify Azure -> check response.

        Step 1: Generate external ID (should succeed -- also used for ARM template reference).
        Step 2: Call verify-azure with fake service principal credentials.
        Step 3: Verify the response shape is correct even though verification fails.

        The verify-azure step will fail because there are no real Azure AD credentials --
        this is expected and documented.
        """
        # Step 1: Generate external ID (also returns ARM template URL)
        resp = session.post("/api/v1/onboarding/generate-external-id")
        assert resp.status_code == 200
        gen_data = resp.json()
        assert gen_data["arm_template_url"].startswith("https://")
        assert gen_data["arm_portal_url"].startswith("https://portal.azure.com/")

        # Step 2: Attempt verify-azure with fake credentials
        # Expected failure -- no real Azure service principal configured
        resp = session.post(
            "/api/v1/onboarding/verify-azure",
            json={
                "azure_tenant_id": FAKE_AZURE_TENANT_ID,
                "client_id": FAKE_AZURE_CLIENT_ID,
                "client_secret": FAKE_AZURE_CLIENT_SECRET,
                "subscription_id": FAKE_AZURE_SUBSCRIPTION_ID,
            },
        )
        assert resp.status_code == 200

        # Step 3: Validate response shape
        verify_data = resp.json()
        assert "success" in verify_data
        assert "subscription_id" in verify_data
        assert "services" in verify_data
        assert "error" in verify_data
        assert verify_data["subscription_id"] == FAKE_AZURE_SUBSCRIPTION_ID
        # With fake credentials, success should be false
        assert verify_data["success"] is False

    def test_aws_discovery_flow(self, session: httpx.Client):
        """Full AWS discovery flow: generate external ID -> get regions -> discover preview.

        Step 1: Generate external ID (should succeed).
        Step 2: Fetch available regions (should succeed).
        Step 3: Use a subset of regions to call discover-preview with a fake ARN.
        Step 4: Verify the response shape is correct even though discovery fails.

        The discover-preview step will fail because there is no real AWS role -- this is
        expected and documented.
        """
        # Step 1: Generate external ID
        resp = session.post("/api/v1/onboarding/generate-external-id")
        assert resp.status_code == 200
        external_id = resp.json()["external_id"]

        # Step 2: Fetch available regions
        resp = session.get("/api/v1/onboarding/regions")
        assert resp.status_code == 200
        regions_data = resp.json()
        aws_regions = regions_data["aws"]
        assert len(aws_regions) > 0

        # Step 3: Attempt discover-preview with first 3 regions and fake ARN
        # Expected failure -- no real AWS role configured
        selected_regions = aws_regions[:3]
        resp = session.post(
            "/api/v1/onboarding/discover-preview",
            json={
                "role_arn": FAKE_AWS_ARN,
                "external_id": external_id,
                "regions": selected_regions,
            },
        )
        assert resp.status_code == 200

        # Step 4: Validate response shape
        discover_data = resp.json()
        assert "success" in discover_data
        assert "regions" in discover_data
        assert "totals" in discover_data
        assert "error" in discover_data
        assert isinstance(discover_data["regions"], dict)
        assert isinstance(discover_data["totals"], dict)
        # With fake credentials, success should be false
        assert discover_data["success"] is False

    def test_external_id_uniqueness_across_workflow(self, session: httpx.Client):
        """Multiple generate calls within a workflow must produce unique IDs.

        This validates that the cryptographic nonce-based generation produces
        distinct external IDs even when called in rapid succession.
        """
        ids = set()
        for _ in range(5):
            resp = session.post("/api/v1/onboarding/generate-external-id")
            assert resp.status_code == 200
            ext_id = resp.json()["external_id"]
            assert ext_id not in ids, f"Duplicate external_id generated: {ext_id}"
            ids.add(ext_id)
        assert len(ids) == 5

"""Onboarding wizard API routes.

Endpoints for cloud account verification, discovery preview, and
external ID generation used by the frontend wizard.
"""

from __future__ import annotations

import asyncio
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from neoguard.api.deps import get_tenant_id_required, require_scope
from neoguard.core.regions import AWS_DEFAULT_REGIONS, AZURE_DEFAULT_REGIONS
from neoguard.services.onboarding.external_id import generate_external_id
from neoguard.services.onboarding.verify import (
    discover_aws_preview,
    verify_aws_role,
    verify_azure_sp,
)

router = APIRouter(prefix="/api/v1/onboarding", tags=["onboarding"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class GenerateExternalIdResponse(BaseModel):
    external_id: str
    cft_template_url: str
    arm_template_url: str
    cft_console_url: str
    arm_portal_url: str
    neoguard_account_id: str = "271547278517"


class VerifyAWSRequest(BaseModel):
    role_arn: str = Field(..., min_length=20, max_length=2048)
    external_id: str = Field(..., min_length=5, max_length=256)
    region: str = "us-east-1"


class VerifyAWSResponse(BaseModel):
    success: bool
    account_id: str | None = None
    role_arn: str
    services: dict[str, Any]
    error: str | None = None


class DiscoverPreviewRequest(BaseModel):
    role_arn: str = Field(..., min_length=20, max_length=2048)
    external_id: str = Field(..., min_length=5, max_length=256)
    regions: list[str] = Field(..., min_length=1, max_length=30)


class DiscoverPreviewResponse(BaseModel):
    success: bool
    regions: dict[str, Any]
    totals: dict[str, int]
    error: str | None = None


class VerifyAzureRequest(BaseModel):
    azure_tenant_id: str = Field(..., pattern=r"^[0-9a-f-]{36}$")
    client_id: str = Field(..., min_length=1)
    client_secret: str = Field(..., min_length=1)
    subscription_id: str = Field(..., pattern=r"^[0-9a-f-]{36}$")


class VerifyAzureResponse(BaseModel):
    success: bool
    subscription_id: str
    services: dict[str, Any]
    error: str | None = None


class AvailableRegionsResponse(BaseModel):
    aws: list[str]
    azure: list[str]


class AvailableServicesResponse(BaseModel):
    aws: list[dict[str, str]]
    azure: list[dict[str, str]]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

CFT_TEMPLATE_URL = (
    "https://neoguard-config-bucket.s3.amazonaws.com/templates/neoguard-monitoring-role.yaml"
)
ARM_TEMPLATE_URL = (
    "https://neoguard-config-bucket.s3.amazonaws.com/templates/neoguard-monitoring-role.json"
)


NEOGUARD_ACCOUNT_ID = "271547278517"


def _build_cft_console_url(template_url: str, external_id: str) -> str:
    """Build AWS CloudFormation Console quick-create URL.

    Opens the user's AWS Console with the stack pre-configured —
    they just review and click "Create stack".
    """
    return (
        "https://console.aws.amazon.com/cloudformation/home#/stacks/quickcreate"
        f"?templateURL={quote(template_url, safe='')}"
        f"&stackName=NeoGuardMonitoringRole"
        f"&param_ExternalId={quote(external_id, safe='')}"
        f"&param_NeoGuardAccountId={NEOGUARD_ACCOUNT_ID}"
    )


def _build_arm_portal_url(template_url: str) -> str:
    """Build Azure Portal custom template deployment URL.

    Uses /deploymentTemplate/ (subscription-level) so Azure does not
    ask for a Resource Group or Region — only the template parameters.
    """
    return (
        "https://portal.azure.com/#create/Microsoft.Template/uri/"
        + quote(template_url, safe="")
    )


@router.post(
    "/generate-external-id",
    response_model=GenerateExternalIdResponse,
    dependencies=[Depends(require_scope("admin"))],
)
async def generate_ext_id(
    tenant_id: str = Depends(get_tenant_id_required),
) -> GenerateExternalIdResponse:
    ext_id = generate_external_id(tenant_id)
    return GenerateExternalIdResponse(
        external_id=ext_id,
        cft_template_url=CFT_TEMPLATE_URL,
        arm_template_url=ARM_TEMPLATE_URL,
        cft_console_url=_build_cft_console_url(CFT_TEMPLATE_URL, ext_id),
        arm_portal_url=_build_arm_portal_url(ARM_TEMPLATE_URL),
        neoguard_account_id=NEOGUARD_ACCOUNT_ID,
    )


@router.post(
    "/verify-aws",
    response_model=VerifyAWSResponse,
    dependencies=[Depends(require_scope("admin"))],
)
async def verify_aws(
    body: VerifyAWSRequest,
    tenant_id: str = Depends(get_tenant_id_required),
) -> VerifyAWSResponse:
    result = await asyncio.to_thread(
        verify_aws_role, body.role_arn, body.external_id, body.region
    )
    resp = VerifyAWSResponse(**result)
    if resp.success and resp.account_id:
        from neoguard.services.aws.accounts import list_aws_accounts

        existing = await list_aws_accounts(tenant_id, enabled_only=False)
        for acct in existing:
            if acct.account_id == resp.account_id:
                resp.success = False
                resp.error = (
                    f"AWS account {resp.account_id} is already connected "
                    f"to this tenant as \"{acct.name}\". "
                    f"You can manage it from the Infrastructure page."
                )
                break
    return resp


@router.post(
    "/discover-preview",
    response_model=DiscoverPreviewResponse,
    dependencies=[Depends(require_scope("admin"))],
)
async def discover_preview(
    body: DiscoverPreviewRequest,
    tenant_id: str = Depends(get_tenant_id_required),
) -> DiscoverPreviewResponse:
    result = await asyncio.to_thread(
        discover_aws_preview, body.role_arn, body.external_id, body.regions
    )
    return DiscoverPreviewResponse(**result)


@router.post(
    "/verify-azure",
    response_model=VerifyAzureResponse,
    dependencies=[Depends(require_scope("admin"))],
)
async def verify_azure(
    body: VerifyAzureRequest,
    tenant_id: str = Depends(get_tenant_id_required),
) -> VerifyAzureResponse:
    from neoguard.services.azure.accounts import list_azure_subscriptions

    existing = await list_azure_subscriptions(tenant_id, enabled_only=False)
    for sub in existing:
        if sub.subscription_id == body.subscription_id:
            return VerifyAzureResponse(
                success=False,
                subscription_id=body.subscription_id,
                services={},
                error=(
                    f"Azure subscription {body.subscription_id} is already connected "
                    f"to this tenant as \"{sub.name}\". "
                    f"You can manage it from the Infrastructure page."
                ),
            )

    result = await asyncio.to_thread(
        verify_azure_sp,
        body.azure_tenant_id,
        body.client_id,
        body.client_secret,
        body.subscription_id,
    )
    return VerifyAzureResponse(**result)


@router.get("/regions", response_model=AvailableRegionsResponse)
async def list_regions() -> AvailableRegionsResponse:
    return AvailableRegionsResponse(
        aws=list(AWS_DEFAULT_REGIONS),
        azure=list(AZURE_DEFAULT_REGIONS),
    )


@router.get("/services", response_model=AvailableServicesResponse)
async def list_services() -> AvailableServicesResponse:
    return AvailableServicesResponse(
        aws=[
            {"id": "ec2", "label": "EC2 Instances"},
            {"id": "rds", "label": "RDS Databases"},
            {"id": "lambda", "label": "Lambda Functions"},
            {"id": "dynamodb", "label": "DynamoDB Tables"},
            {"id": "s3", "label": "S3 Buckets"},
            {"id": "elb", "label": "Load Balancers (ALB/NLB)"},
            {"id": "ebs", "label": "EBS Volumes"},
            {"id": "nat_gateway", "label": "NAT Gateways"},
            {"id": "route53", "label": "Route 53 Hosted Zones"},
        ],
        azure=[
            {"id": "virtual_machines", "label": "Virtual Machines"},
            {"id": "sql_databases", "label": "SQL Databases"},
            {"id": "functions", "label": "Azure Functions"},
            {"id": "storage_accounts", "label": "Storage Accounts"},
            {"id": "load_balancers", "label": "Load Balancers"},
            {"id": "cosmos_db", "label": "Cosmos DB"},
            {"id": "redis_cache", "label": "Azure Cache for Redis"},
            {"id": "app_services", "label": "App Services"},
            {"id": "aks", "label": "AKS Clusters"},
            {"id": "key_vault", "label": "Key Vaults"},
            {"id": "nsg", "label": "Network Security Groups"},
            {"id": "vnet", "label": "Virtual Networks"},
            {"id": "dns_zones", "label": "DNS Zones"},
            {"id": "disks", "label": "Managed Disks"},
            {"id": "app_gateway", "label": "Application Gateways"},
        ],
    )

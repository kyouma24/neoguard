from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from neoguard.api.deps import get_tenant_id, get_tenant_id_required
from neoguard.services.aws.accounts import get_aws_account
from neoguard.services.aws.credentials import get_enabled_regions
from neoguard.services.azure.accounts import get_azure_subscription
from neoguard.services.collection.jobs import (
    get_job,
    list_jobs,
)
from neoguard.services.discovery.aws_discovery import discover_all as aws_discover_all
from neoguard.services.discovery.azure_discovery import discover_all as azure_discover_all

router = APIRouter(prefix="/api/v1/collection", tags=["collection"])


class TriggerDiscoveryRequest(BaseModel):
    aws_account_id: str | None = None
    azure_subscription_id: str | None = None
    region: str | None = None


@router.post("/discover", status_code=202)
async def trigger_discovery(
    req: TriggerDiscoveryRequest,
    tenant_id: str = Depends(get_tenant_id_required),
) -> dict:
    if req.aws_account_id:
        acct = await get_aws_account(tenant_id, req.aws_account_id)
        if not acct:
            raise HTTPException(404, "AWS account not found")
        regions = [req.region] if req.region else get_enabled_regions(acct)
        results: dict[str, dict] = {}
        for region in regions:
            results[region] = await aws_discover_all(acct, region, tenant_id)
        return {"status": "completed", "provider": "aws", "results": results}

    if req.azure_subscription_id:
        sub = await get_azure_subscription(tenant_id, req.azure_subscription_id)
        if not sub:
            raise HTTPException(404, "Azure subscription not found")
        regions = [req.region] if req.region else sub.regions
        results = {}
        for region in regions:
            results[region] = await azure_discover_all(sub, region, tenant_id)
        return {"status": "completed", "provider": "azure", "results": results}

    raise HTTPException(400, "Provide aws_account_id or azure_subscription_id")


@router.get("/jobs")
async def list_collection_jobs(
    job_type: str | None = None,
    status: str | None = None,
    limit: int = 50,
    tenant_id: str | None = Depends(get_tenant_id),
) -> list[dict]:
    return await list_jobs(tenant_id, job_type=job_type, status=status, limit=limit)


@router.get("/jobs/{job_id}")
async def get_collection_job(
    job_id: str,
    tenant_id: str | None = Depends(get_tenant_id),
) -> dict:
    job = await get_job(tenant_id, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job

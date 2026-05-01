"""AWS credential management with assume-role and session caching."""

import time
from typing import Any

import boto3
from botocore.config import Config as BotoConfig

from neoguard.models.aws import AWSAccount

_session_cache: dict[str, tuple[Any, float]] = {}
SESSION_TTL = 3500  # refresh 100s before the 1hr STS expiry

BOTO_CONFIG = BotoConfig(
    retries={"max_attempts": 3, "mode": "adaptive"},
    connect_timeout=10,
    read_timeout=30,
)


def get_boto_session(account: AWSAccount, region: str) -> boto3.Session:
    cache_key = f"{account.account_id}:{region}:{account.role_arn}"
    cached = _session_cache.get(cache_key)
    if cached and (time.time() - cached[1]) < SESSION_TTL:
        return cached[0]

    session = _assume_role_session(account, region) if account.role_arn else boto3.Session(region_name=region)

    _session_cache[cache_key] = (session, time.time())
    return session


def get_client(account: AWSAccount, region: str, service: str):
    session = get_boto_session(account, region)
    return session.client(service, config=BOTO_CONFIG)


def _assume_role_session(account: AWSAccount, region: str) -> boto3.Session:
    sts = boto3.client("sts", config=BOTO_CONFIG)

    params: dict[str, Any] = {
        "RoleArn": account.role_arn,
        "RoleSessionName": f"neoguard-{account.account_id}",
        "DurationSeconds": 3600,
    }
    if account.external_id:
        params["ExternalId"] = account.external_id

    resp = sts.assume_role(**params)
    creds = resp["Credentials"]

    return boto3.Session(
        aws_access_key_id=creds["AccessKeyId"],
        aws_secret_access_key=creds["SecretAccessKey"],
        aws_session_token=creds["SessionToken"],
        region_name=region,
    )


def get_enabled_regions(account: AWSAccount) -> list[str]:
    """Return only regions that are opted-in (or opt-in-not-required) for this account.

    Calls ec2:DescribeRegions with the account's credentials, then intersects
    with the account's configured region list.
    """
    session = get_boto_session(account, account.regions[0] if account.regions else "us-east-1")
    ec2 = session.client("ec2", config=BOTO_CONFIG)
    resp = ec2.describe_regions(
        Filters=[{
            "Name": "opt-in-status",
            "Values": ["opt-in-not-required", "opted-in"],
        }],
    )
    enabled = {r["RegionName"] for r in resp.get("Regions", [])}
    return [r for r in account.regions if r in enabled]


def clear_session_cache() -> None:
    _session_cache.clear()

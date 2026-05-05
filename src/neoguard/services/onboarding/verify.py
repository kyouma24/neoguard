"""Cloud account verification and discovery preview for onboarding wizard."""

from __future__ import annotations

import asyncio
from typing import Any

import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError

from neoguard.core.logging import log

BOTO_CONFIG = BotoConfig(
    retries={"max_attempts": 2, "mode": "adaptive"},
    connect_timeout=8,
    read_timeout=15,
)

# AWS services we can monitor and their required IAM permission probes
AWS_SERVICE_PROBES: dict[str, dict[str, Any]] = {
    "ec2": {
        "service": "ec2",
        "method": "describe_instances",
        "kwargs": {"MaxResults": 5},
        "label": "EC2 Instances",
    },
    "rds": {
        "service": "rds",
        "method": "describe_db_instances",
        "kwargs": {"MaxRecords": 20},
        "label": "RDS Databases",
    },
    "lambda": {
        "service": "lambda",
        "method": "list_functions",
        "kwargs": {"MaxItems": 10},
        "label": "Lambda Functions",
    },
    "dynamodb": {
        "service": "dynamodb",
        "method": "list_tables",
        "kwargs": {"Limit": 10},
        "label": "DynamoDB Tables",
    },
    "s3": {
        "service": "s3",
        "method": "list_buckets",
        "kwargs": {},
        "label": "S3 Buckets",
    },
    "elb": {
        "service": "elbv2",
        "method": "describe_load_balancers",
        "kwargs": {"PageSize": 10},
        "label": "Load Balancers",
    },
    "cloudwatch": {
        "service": "cloudwatch",
        "method": "list_metrics",
        "kwargs": {"RecentlyActive": "PT3H"},
        "label": "CloudWatch Metrics",
    },
}

AZURE_SERVICE_PROBES: list[str] = [
    "virtual_machines",
    "sql_databases",
    "functions",
    "storage_accounts",
    "load_balancers",
    "cosmos_db",
    "redis_cache",
    "app_services",
]


def verify_aws_role(
    role_arn: str,
    external_id: str,
    region: str = "us-east-1",
) -> dict:
    """Attempt STS AssumeRole and probe per-service permissions.

    Returns a dict with ``success``, ``account_id``, per-service permission
    results, and any error details.
    """
    result: dict[str, Any] = {
        "success": False,
        "account_id": None,
        "role_arn": role_arn,
        "services": {},
        "error": None,
    }

    try:
        sts = boto3.client("sts", region_name=region, config=BOTO_CONFIG)
        params: dict[str, Any] = {
            "RoleArn": role_arn,
            "RoleSessionName": "neoguard-onboarding-verify",
            "DurationSeconds": 900,
        }
        if external_id:
            params["ExternalId"] = external_id

        resp = sts.assume_role(**params)
        creds = resp["Credentials"]
        assumed_arn = resp.get("AssumedRoleUser", {}).get("Arn", "")
        # Extract account ID from ARN: arn:aws:sts::123456789012:assumed-role/...
        parts = assumed_arn.split(":")
        result["account_id"] = parts[4] if len(parts) > 4 else None
        result["success"] = True

    except ClientError as e:
        code = e.response["Error"]["Code"]
        msg = e.response["Error"]["Message"]
        if code == "AccessDenied":
            result["error"] = (
                "Cannot assume the role. Verify the trust policy includes "
                f"the correct external ID: {external_id}"
            )
        elif code == "MalformedPolicyDocument":
            result["error"] = "The role's trust policy is malformed. Check the role configuration in IAM."
        else:
            result["error"] = f"{code}: {msg}"
        return result
    except Exception as e:
        result["error"] = f"Unexpected error: {e}"
        return result

    # Probe each service permission
    session = boto3.Session(
        aws_access_key_id=creds["AccessKeyId"],
        aws_secret_access_key=creds["SecretAccessKey"],
        aws_session_token=creds["SessionToken"],
        region_name=region,
    )

    for svc_key, probe in AWS_SERVICE_PROBES.items():
        svc_result: dict[str, Any] = {"ok": False, "label": probe["label"], "error": None}
        try:
            client = session.client(probe["service"], config=BOTO_CONFIG)
            getattr(client, probe["method"])(**probe["kwargs"])
            svc_result["ok"] = True
        except ClientError as e:
            code = e.response["Error"]["Code"]
            if code in ("AccessDeniedException", "UnauthorizedAccess", "AccessDenied"):
                svc_result["error"] = f"Missing permission for {probe['label']}"
            else:
                svc_result["error"] = f"{code}"
        except Exception as e:
            svc_result["error"] = str(e)[:200]
        result["services"][svc_key] = svc_result

    return result


def discover_aws_preview(
    role_arn: str,
    external_id: str,
    regions: list[str],
) -> dict:
    """Quick region scan: count resources per region and per service.

    Returns lightweight counts without persisting anything. Used by the
    wizard to show the user what we found before they commit.
    """
    result: dict[str, Any] = {
        "success": False,
        "regions": {},
        "totals": {"resources": 0, "regions_with_resources": 0},
        "error": None,
    }

    try:
        sts = boto3.client("sts", region_name="us-east-1", config=BOTO_CONFIG)
        params: dict[str, Any] = {
            "RoleArn": role_arn,
            "RoleSessionName": "neoguard-onboarding-preview",
            "DurationSeconds": 900,
        }
        if external_id:
            params["ExternalId"] = external_id
        resp = sts.assume_role(**params)
        creds = resp["Credentials"]
    except Exception as e:
        result["error"] = f"Cannot assume role: {e}"
        return result

    total = 0
    regions_with = 0

    for region in regions:
        session = boto3.Session(
            aws_access_key_id=creds["AccessKeyId"],
            aws_secret_access_key=creds["SecretAccessKey"],
            aws_session_token=creds["SessionToken"],
            region_name=region,
        )
        region_counts: dict[str, int] = {}

        # EC2
        try:
            ec2 = session.client("ec2", config=BOTO_CONFIG)
            pages = ec2.get_paginator("describe_instances").paginate(MaxResults=100)
            count = 0
            for page in pages:
                for res in page.get("Reservations", []):
                    count += len(res.get("Instances", []))
            if count:
                region_counts["ec2"] = count
        except Exception:
            pass

        # RDS
        try:
            rds = session.client("rds", config=BOTO_CONFIG)
            dbs = rds.describe_db_instances(MaxRecords=100)
            count = len(dbs.get("DBInstances", []))
            if count:
                region_counts["rds"] = count
        except Exception:
            pass

        # Lambda
        try:
            lam = session.client("lambda", config=BOTO_CONFIG)
            funcs = lam.list_functions(MaxItems=200)
            count = len(funcs.get("Functions", []))
            if count:
                region_counts["lambda"] = count
        except Exception:
            pass

        # DynamoDB
        try:
            ddb = session.client("dynamodb", config=BOTO_CONFIG)
            tables = ddb.list_tables(Limit=100)
            count = len(tables.get("TableNames", []))
            if count:
                region_counts["dynamodb"] = count
        except Exception:
            pass

        # S3 (global — only in us-east-1)
        if region == "us-east-1":
            try:
                s3 = session.client("s3", config=BOTO_CONFIG)
                buckets = s3.list_buckets()
                count = len(buckets.get("Buckets", []))
                if count:
                    region_counts["s3"] = count
            except Exception:
                pass

        # ELB
        try:
            elb = session.client("elbv2", config=BOTO_CONFIG)
            lbs = elb.describe_load_balancers(PageSize=100)
            count = len(lbs.get("LoadBalancers", []))
            if count:
                region_counts["elb"] = count
        except Exception:
            pass

        region_total = sum(region_counts.values())
        if region_total > 0:
            regions_with += 1
            total += region_total
        result["regions"][region] = {
            "services": region_counts,
            "total": region_total,
        }

    result["success"] = True
    result["totals"]["resources"] = total
    result["totals"]["regions_with_resources"] = regions_with
    return result


def verify_azure_sp(
    azure_tenant_id: str,
    client_id: str,
    client_secret: str,
    subscription_id: str,
) -> dict:
    """Verify Azure service principal credentials and probe permissions."""
    result: dict[str, Any] = {
        "success": False,
        "subscription_id": subscription_id,
        "services": {},
        "error": None,
    }

    try:
        from azure.identity import ClientSecretCredential
        from azure.mgmt.resource import ResourceManagementClient

        credential = ClientSecretCredential(
            tenant_id=azure_tenant_id,
            client_id=client_id,
            client_secret=client_secret,
        )
        resource_client = ResourceManagementClient(credential, subscription_id)
        # Quick verification — list first resource group
        rgs = list(resource_client.resource_groups.list())
        result["success"] = True
        result["services"]["resource_groups"] = {
            "ok": True,
            "label": "Resource Groups",
            "count": len(rgs),
        }
    except ImportError:
        result["error"] = "Azure SDK not installed"
        return result
    except Exception as e:
        error_str = str(e)
        if "AADSTS" in error_str or "unauthorized" in error_str.lower():
            result["error"] = "Invalid credentials. Check tenant ID, client ID, and client secret."
        else:
            result["error"] = f"Azure auth failed: {error_str[:300]}"
        return result

    # Probe VM access
    try:
        from azure.mgmt.compute import ComputeManagementClient
        compute = ComputeManagementClient(credential, subscription_id)
        vms = list(compute.virtual_machines.list_all())
        result["services"]["virtual_machines"] = {
            "ok": True,
            "label": "Virtual Machines",
            "count": len(vms),
        }
    except Exception as e:
        result["services"]["virtual_machines"] = {
            "ok": False,
            "label": "Virtual Machines",
            "error": str(e)[:200],
        }

    # Probe SQL
    try:
        from azure.mgmt.sql import SqlManagementClient
        sql = SqlManagementClient(credential, subscription_id)
        servers = list(sql.servers.list())
        result["services"]["sql_databases"] = {
            "ok": True,
            "label": "SQL Databases",
            "count": len(servers),
        }
    except Exception as e:
        result["services"]["sql_databases"] = {
            "ok": False,
            "label": "SQL Databases",
            "error": str(e)[:200],
        }

    # Probe Storage
    try:
        from azure.mgmt.storage import StorageManagementClient
        storage = StorageManagementClient(credential, subscription_id)
        accounts = list(storage.storage_accounts.list())
        result["services"]["storage_accounts"] = {
            "ok": True,
            "label": "Storage Accounts",
            "count": len(accounts),
        }
    except Exception as e:
        result["services"]["storage_accounts"] = {
            "ok": False,
            "label": "Storage Accounts",
            "error": str(e)[:200],
        }

    return result

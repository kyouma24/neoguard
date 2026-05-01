"""AWS resource discovery — auto-discovers resources across services."""

import asyncio
import contextlib

from neoguard.core.logging import log
from neoguard.models.aws import AWSAccount
from neoguard.models.resources import (
    Provider,
    ResourceCreate,
    ResourceStatus,
    ResourceType,
)
from neoguard.services.aws.credentials import get_client
from neoguard.services.resources.crud import upsert_resource


async def discover_all(account: AWSAccount, region: str, tenant_id: str) -> dict:
    """Run all discovery functions for an account+region. Returns counts."""
    results: dict[str, int] = {}
    for name, func in _DISCOVERERS.items():
        try:
            count = await func(account, region, tenant_id)
            results[name] = count
        except Exception as e:
            await log.aerror("Discovery failed", service=name, region=region, error=str(e))
            results[name] = -1
    return results


def _aws_tags_to_dict(tag_list: list[dict] | None) -> dict[str, str]:
    if not tag_list:
        return {}
    return {t.get("Key", t.get("key", "")): t.get("Value", t.get("value", "")) for t in tag_list}


def _get_name_from_tags(tags: dict[str, str], fallback: str) -> str:
    return tags.get("Name", tags.get("name", fallback))


async def _discover_ec2(account: AWSAccount, region: str, tenant_id: str) -> int:
    ec2 = get_client(account, region, "ec2")
    paginator = ec2.get_paginator("describe_instances")
    count = 0

    pages = await asyncio.to_thread(lambda: list(paginator.paginate()))
    for page in pages:
        for reservation in page["Reservations"]:
            for inst in reservation["Instances"]:
                tags = _aws_tags_to_dict(inst.get("Tags"))
                state = inst["State"]["Name"]
                status = {
                    "running": ResourceStatus.ACTIVE,
                    "stopped": ResourceStatus.STOPPED,
                    "terminated": ResourceStatus.TERMINATED,
                }.get(state, ResourceStatus.UNKNOWN)

                placement = inst.get("Placement", {})
                await upsert_resource(tenant_id, ResourceCreate(
                    resource_type=ResourceType.EC2,
                    provider=Provider.AWS,
                    region=region,
                    account_id=account.account_id,
                    name=_get_name_from_tags(tags, inst["InstanceId"]),
                    external_id=inst["InstanceId"],
                    tags=tags,
                    metadata={
                        "instance_type": inst.get("InstanceType", ""),
                        "availability_zone": placement.get("AvailabilityZone", ""),
                        "tenancy": placement.get("Tenancy", ""),
                        "private_ip": inst.get("PrivateIpAddress", ""),
                        "public_ip": inst.get("PublicIpAddress", ""),
                        "private_dns": inst.get("PrivateDnsName", ""),
                        "public_dns": inst.get("PublicDnsName", ""),
                        "vpc_id": inst.get("VpcId", ""),
                        "subnet_id": inst.get("SubnetId", ""),
                        "ami_id": inst.get("ImageId", ""),
                        "launch_time": str(inst.get("LaunchTime", "")),
                        "state": state,
                        "platform": inst.get("PlatformDetails", ""),
                        "architecture": inst.get("Architecture", ""),
                        "ebs_optimized": inst.get("EbsOptimized", False),
                        "root_device_type": inst.get("RootDeviceType", ""),
                        "hypervisor": inst.get("Hypervisor", ""),
                        "virtualization_type": inst.get("VirtualizationType", ""),
                        "security_groups": [
                            sg.get("GroupId", "")
                            for sg in inst.get("SecurityGroups", [])
                        ],
                        "iam_profile": (
                            inst.get("IamInstanceProfile", {}).get("Arn", "")
                        ),
                        "key_name": inst.get("KeyName", ""),
                        "monitoring": inst.get("Monitoring", {}).get("State", ""),
                        "ena_support": inst.get("EnaSupport", False),
                        "ebs_volumes": [
                            {
                                "device": bdm.get("DeviceName", ""),
                                "volume_id": bdm.get("Ebs", {}).get("VolumeId", ""),
                                "status": bdm.get("Ebs", {}).get("Status", ""),
                                "delete_on_termination": bdm.get("Ebs", {}).get(
                                    "DeleteOnTermination", False
                                ),
                            }
                            for bdm in inst.get("BlockDeviceMappings", [])
                        ],
                        "network_interfaces": [
                            {
                                "eni_id": ni.get("NetworkInterfaceId", ""),
                                "private_ip": ni.get("PrivateIpAddress", ""),
                                "subnet_id": ni.get("SubnetId", ""),
                                "status": ni.get("Status", ""),
                            }
                            for ni in inst.get("NetworkInterfaces", [])
                        ],
                    },
                    status=status,
                ))
                count += 1

    await log.ainfo("EC2 discovery complete", region=region, count=count)
    return count


async def _discover_ebs(account: AWSAccount, region: str, tenant_id: str) -> int:
    ec2 = get_client(account, region, "ec2")
    paginator = ec2.get_paginator("describe_volumes")
    count = 0

    pages = await asyncio.to_thread(lambda: list(paginator.paginate()))
    for page in pages:
        for vol in page["Volumes"]:
            tags = _aws_tags_to_dict(vol.get("Tags"))
            vol_id = vol["VolumeId"]
            state = vol.get("State", "unknown")
            status_map = {
                "available": ResourceStatus.ACTIVE,
                "in-use": ResourceStatus.ACTIVE,
                "creating": ResourceStatus.ACTIVE,
                "deleting": ResourceStatus.TERMINATED,
                "deleted": ResourceStatus.TERMINATED,
                "error": ResourceStatus.UNKNOWN,
            }
            status = status_map.get(state, ResourceStatus.UNKNOWN)

            attachments = vol.get("Attachments", [])
            attached_to = attachments[0].get("InstanceId", "") if attachments else ""
            device = attachments[0].get("Device", "") if attachments else ""

            await upsert_resource(tenant_id, ResourceCreate(
                resource_type=ResourceType.EBS,
                provider=Provider.AWS,
                region=region,
                account_id=account.account_id,
                name=_get_name_from_tags(tags, vol_id),
                external_id=vol_id,
                tags=tags,
                metadata={
                    "volume_type": vol.get("VolumeType", ""),
                    "size_gb": vol.get("Size", 0),
                    "iops": vol.get("Iops", 0),
                    "throughput_mbps": vol.get("Throughput", 0),
                    "state": state,
                    "availability_zone": vol.get("AvailabilityZone", ""),
                    "encrypted": vol.get("Encrypted", False),
                    "kms_key_id": vol.get("KmsKeyId", ""),
                    "snapshot_id": vol.get("SnapshotId", ""),
                    "attached_instance": attached_to,
                    "device": device,
                    "multi_attach_enabled": vol.get("MultiAttachEnabled", False),
                    "create_time": str(vol.get("CreateTime", "")),
                },
                status=status,
            ))
            count += 1

    await log.ainfo("EBS discovery complete", region=region, count=count)
    return count


async def _discover_rds(account: AWSAccount, region: str, tenant_id: str) -> int:
    rds = get_client(account, region, "rds")
    paginator = rds.get_paginator("describe_db_instances")
    count = 0

    pages = await asyncio.to_thread(lambda: list(paginator.paginate()))
    for page in pages:
        for db in page["DBInstances"]:
            tags = _aws_tags_to_dict(db.get("TagList"))
            status_map = {"available": ResourceStatus.ACTIVE, "stopped": ResourceStatus.STOPPED}
            status = status_map.get(db["DBInstanceStatus"], ResourceStatus.UNKNOWN)

            await upsert_resource(tenant_id, ResourceCreate(
                resource_type=ResourceType.RDS,
                provider=Provider.AWS,
                region=region,
                account_id=account.account_id,
                name=db["DBInstanceIdentifier"],
                external_id=db["DBInstanceIdentifier"],
                tags=tags,
                metadata={
                    "engine": db.get("Engine", ""),
                    "engine_version": db.get("EngineVersion", ""),
                    "instance_class": db.get("DBInstanceClass", ""),
                    "availability_zone": db.get("AvailabilityZone", ""),
                    "secondary_az": db.get("SecondaryAvailabilityZone", ""),
                    "multi_az": db.get("MultiAZ", False),
                    "storage_type": db.get("StorageType", ""),
                    "allocated_storage_gb": db.get("AllocatedStorage", 0),
                    "max_allocated_storage_gb": db.get("MaxAllocatedStorage", 0),
                    "iops": db.get("Iops", 0),
                    "storage_encrypted": db.get("StorageEncrypted", False),
                    "kms_key_id": db.get("KmsKeyId", ""),
                    "endpoint": db.get("Endpoint", {}).get("Address", ""),
                    "port": db.get("Endpoint", {}).get("Port", 0),
                    "vpc_id": (
                        db.get("DBSubnetGroup", {}).get("VpcId", "")
                    ),
                    "subnet_group": (
                        db.get("DBSubnetGroup", {}).get("DBSubnetGroupName", "")
                    ),
                    "publicly_accessible": db.get("PubliclyAccessible", False),
                    "auto_minor_version_upgrade": db.get(
                        "AutoMinorVersionUpgrade", False
                    ),
                    "backup_retention_days": db.get("BackupRetentionPeriod", 0),
                    "preferred_backup_window": db.get("PreferredBackupWindow", ""),
                    "preferred_maintenance_window": db.get(
                        "PreferredMaintenanceWindow", ""
                    ),
                    "ca_certificate": db.get("CACertificateIdentifier", ""),
                    "performance_insights": db.get(
                        "PerformanceInsightsEnabled", False
                    ),
                    "deletion_protection": db.get("DeletionProtection", False),
                    "iam_auth_enabled": db.get(
                        "IAMDatabaseAuthenticationEnabled", False
                    ),
                    "db_name": db.get("DBName", ""),
                    "master_username": db.get("MasterUsername", ""),
                    "parameter_group": (
                        db.get("DBParameterGroups", [{}])[0].get(
                            "DBParameterGroupName", ""
                        )
                        if db.get("DBParameterGroups")
                        else ""
                    ),
                    "security_groups": [
                        sg.get("VpcSecurityGroupId", "")
                        for sg in db.get("VpcSecurityGroups", [])
                    ],
                    "read_replica_source": db.get(
                        "ReadReplicaSourceDBInstanceIdentifier", ""
                    ),
                    "read_replicas": db.get(
                        "ReadReplicaDBInstanceIdentifiers", []
                    ),
                    "arn": db.get("DBInstanceArn", ""),
                    "status": db["DBInstanceStatus"],
                },
                status=status,
            ))
            count += 1

    await log.ainfo("RDS discovery complete", region=region, count=count)
    return count


async def _discover_lambda(account: AWSAccount, region: str, tenant_id: str) -> int:
    lam = get_client(account, region, "lambda")
    paginator = lam.get_paginator("list_functions")
    count = 0

    pages = await asyncio.to_thread(lambda: list(paginator.paginate()))
    for page in pages:
        for fn in page["Functions"]:
            tags_resp = {}
            with contextlib.suppress(Exception):
                tags_resp = await asyncio.to_thread(
                    lambda arn=fn["FunctionArn"]: lam.list_tags(Resource=arn).get("Tags", {}),
                )

            vpc_config = fn.get("VpcConfig", {})
            await upsert_resource(tenant_id, ResourceCreate(
                resource_type=ResourceType.LAMBDA,
                provider=Provider.AWS,
                region=region,
                account_id=account.account_id,
                name=fn["FunctionName"],
                external_id=fn["FunctionName"],
                tags=tags_resp,
                metadata={
                    "runtime": fn.get("Runtime", ""),
                    "memory_mb": fn.get("MemorySize", 0),
                    "ephemeral_storage_mb": (
                        fn.get("EphemeralStorage", {}).get("Size", 512)
                    ),
                    "timeout_sec": fn.get("Timeout", 0),
                    "handler": fn.get("Handler", ""),
                    "code_size": fn.get("CodeSize", 0),
                    "package_type": fn.get("PackageType", "Zip"),
                    "architectures": fn.get("Architectures", ["x86_64"]),
                    "last_modified": fn.get("LastModified", ""),
                    "description": fn.get("Description", ""),
                    "role": fn.get("Role", ""),
                    "vpc_id": vpc_config.get("VpcId", ""),
                    "subnet_ids": vpc_config.get("SubnetIds", []),
                    "security_group_ids": vpc_config.get("SecurityGroupIds", []),
                    "layers": [
                        layer.get("Arn", "")
                        for layer in fn.get("Layers", [])
                    ],
                    "tracing_mode": fn.get("TracingConfig", {}).get("Mode", ""),
                    "state": fn.get("State", "Active"),
                    "last_update_status": fn.get("LastUpdateStatus", ""),
                    "snap_start": fn.get("SnapStart", {}).get(
                        "ApplyOn", "None"
                    ),
                    "logging_format": fn.get("LoggingConfig", {}).get(
                        "LogFormat", ""
                    ),
                    "arn": fn.get("FunctionArn", ""),
                },
                status=ResourceStatus.ACTIVE,
            ))
            count += 1

    await log.ainfo("Lambda discovery complete", region=region, count=count)
    return count


async def _discover_alb(account: AWSAccount, region: str, tenant_id: str) -> int:
    elb = get_client(account, region, "elbv2")
    paginator = elb.get_paginator("describe_load_balancers")
    count = 0

    pages = await asyncio.to_thread(lambda: list(paginator.paginate()))
    for page in pages:
        for lb in page["LoadBalancers"]:
            lb_type = lb.get("Type", "application")
            rtype = ResourceType.ALB if lb_type == "application" else ResourceType.NLB
            azs = lb.get("AvailabilityZones", [])

            await upsert_resource(tenant_id, ResourceCreate(
                resource_type=rtype,
                provider=Provider.AWS,
                region=region,
                account_id=account.account_id,
                name=lb["LoadBalancerName"],
                external_id=lb["LoadBalancerArn"].split("/", 1)[-1],
                tags={},
                metadata={
                    "dns_name": lb.get("DNSName", ""),
                    "canonical_hosted_zone_id": lb.get(
                        "CanonicalHostedZoneId", ""
                    ),
                    "scheme": lb.get("Scheme", ""),
                    "vpc_id": lb.get("VpcId", ""),
                    "type": lb_type,
                    "ip_address_type": lb.get("IpAddressType", ""),
                    "availability_zones": [
                        az.get("ZoneName", "") for az in azs
                    ],
                    "subnet_ids": [
                        az.get("SubnetId", "") for az in azs
                    ],
                    "security_groups": lb.get("SecurityGroups", []),
                    "state": lb.get("State", {}).get("Code", ""),
                    "created_time": str(lb.get("CreatedTime", "")),
                    "arn": lb["LoadBalancerArn"],
                },
                status=ResourceStatus.ACTIVE,
            ))
            count += 1

    await log.ainfo("ELBv2 discovery complete", region=region, count=count)
    return count


async def _discover_dynamodb(account: AWSAccount, region: str, tenant_id: str) -> int:
    ddb = get_client(account, region, "dynamodb")
    paginator = ddb.get_paginator("list_tables")
    count = 0

    pages = await asyncio.to_thread(lambda: list(paginator.paginate()))
    for page in pages:
        for table_name in page["TableNames"]:
            desc = (await asyncio.to_thread(ddb.describe_table, TableName=table_name))["Table"]
            provisioned = desc.get("ProvisionedThroughput", {})
            gsis = desc.get("GlobalSecondaryIndexes", [])
            lsis = desc.get("LocalSecondaryIndexes", [])
            sse = desc.get("SSEDescription", {})
            stream = desc.get("StreamSpecification", {})

            await upsert_resource(tenant_id, ResourceCreate(
                resource_type=ResourceType.DYNAMODB,
                provider=Provider.AWS,
                region=region,
                account_id=account.account_id,
                name=table_name,
                external_id=table_name,
                tags={},
                metadata={
                    "status": desc.get("TableStatus", ""),
                    "item_count": desc.get("ItemCount", 0),
                    "size_bytes": desc.get("TableSizeBytes", 0),
                    "billing_mode": desc.get("BillingModeSummary", {}).get(
                        "BillingMode", "PROVISIONED"
                    ),
                    "read_capacity_units": provisioned.get(
                        "ReadCapacityUnits", 0
                    ),
                    "write_capacity_units": provisioned.get(
                        "WriteCapacityUnits", 0
                    ),
                    "global_secondary_indexes": len(gsis),
                    "local_secondary_indexes": len(lsis),
                    "gsi_names": [g.get("IndexName", "") for g in gsis],
                    "encryption": sse.get("Status", ""),
                    "encryption_type": sse.get("SSEType", ""),
                    "stream_enabled": stream.get("StreamEnabled", False),
                    "stream_view_type": stream.get("StreamViewType", ""),
                    "table_class": desc.get("TableClassSummary", {}).get(
                        "TableClass", "STANDARD"
                    ),
                    "deletion_protection": desc.get(
                        "DeletionProtectionEnabled", False
                    ),
                    "replica_regions": [
                        r.get("RegionName", "")
                        for r in desc.get("Replicas", [])
                    ],
                    "point_in_time_recovery": False,
                    "arn": desc.get("TableArn", ""),
                },
                status=ResourceStatus.ACTIVE,
            ))
            count += 1

    await log.ainfo("DynamoDB discovery complete", region=region, count=count)
    return count


async def _discover_sqs(account: AWSAccount, region: str, tenant_id: str) -> int:
    sqs = get_client(account, region, "sqs")
    count = 0

    resp = await asyncio.to_thread(sqs.list_queues)
    for url in resp.get("QueueUrls", []):
        queue_name = url.rsplit("/", 1)[-1]

        attrs = {}
        with contextlib.suppress(Exception):
            attrs = (await asyncio.to_thread(
                sqs.get_queue_attributes, QueueUrl=url, AttributeNames=["All"],
            )).get("Attributes", {})

        is_fifo = queue_name.endswith(".fifo")
        is_dlq = bool(attrs.get("RedriveAllowPolicy")) or "dlq" in queue_name.lower()

        await upsert_resource(tenant_id, ResourceCreate(
            resource_type=ResourceType.SQS,
            provider=Provider.AWS,
            region=region,
            account_id=account.account_id,
            name=queue_name,
            external_id=queue_name,
            tags={},
            metadata={
                "queue_url": url,
                "queue_arn": attrs.get("QueueArn", ""),
                "fifo": is_fifo,
                "is_dlq": is_dlq,
                "visibility_timeout_sec": int(
                    attrs.get("VisibilityTimeout", 30)
                ),
                "message_retention_sec": int(
                    attrs.get("MessageRetentionPeriod", 345600)
                ),
                "max_message_size_bytes": int(
                    attrs.get("MaximumMessageSize", 262144)
                ),
                "delay_sec": int(attrs.get("DelaySeconds", 0)),
                "receive_wait_time_sec": int(
                    attrs.get("ReceiveMessageWaitTimeSeconds", 0)
                ),
                "approximate_messages": int(
                    attrs.get("ApproximateNumberOfMessages", 0)
                ),
                "approximate_messages_not_visible": int(
                    attrs.get("ApproximateNumberOfMessagesNotVisible", 0)
                ),
                "approximate_messages_delayed": int(
                    attrs.get("ApproximateNumberOfMessagesDelayed", 0)
                ),
                "redrive_policy": attrs.get("RedrivePolicy", ""),
                "encryption": attrs.get("SqsManagedSseEnabled", "false"),
                "kms_key_id": attrs.get("KmsMasterKeyId", ""),
                "created_timestamp": attrs.get("CreatedTimestamp", ""),
                "last_modified_timestamp": attrs.get(
                    "LastModifiedTimestamp", ""
                ),
            },
            status=ResourceStatus.ACTIVE,
        ))
        count += 1

    await log.ainfo("SQS discovery complete", region=region, count=count)
    return count


async def _discover_ecs(account: AWSAccount, region: str, tenant_id: str) -> int:
    ecs = get_client(account, region, "ecs")
    count = 0

    clusters_resp = await asyncio.to_thread(ecs.list_clusters)
    cluster_arns = clusters_resp.get("clusterArns", [])

    if cluster_arns:
        cluster_descs = (await asyncio.to_thread(
            ecs.describe_clusters, clusters=cluster_arns, include=["STATISTICS", "TAGS"],
        )).get("clusters", [])
    else:
        cluster_descs = []

    for cluster in cluster_descs:
        cluster_arn = cluster["clusterArn"]
        cluster_name = cluster.get("clusterName", cluster_arn.rsplit("/", 1)[-1])
        stats = cluster.get("statistics", [])
        stats_dict = {s["name"]: s["value"] for s in stats}

        await upsert_resource(tenant_id, ResourceCreate(
            resource_type=ResourceType.ECS_CLUSTER,
            provider=Provider.AWS,
            region=region,
            account_id=account.account_id,
            name=cluster_name,
            external_id=cluster_arn,
            tags=_aws_tags_to_dict(cluster.get("tags")),
            metadata={
                "arn": cluster_arn,
                "status": cluster.get("status", ""),
                "registered_container_instances": int(
                    cluster.get("registeredContainerInstancesCount", 0)
                ),
                "active_services": int(cluster.get("activeServicesCount", 0)),
                "running_tasks": int(cluster.get("runningTasksCount", 0)),
                "pending_tasks": int(cluster.get("pendingTasksCount", 0)),
                "running_ec2_tasks": int(stats_dict.get("runningEC2TasksCount", 0)),
                "running_fargate_tasks": int(
                    stats_dict.get("runningFargateTasksCount", 0)
                ),
                "capacity_providers": cluster.get("capacityProviders", []),
            },
            status=ResourceStatus.ACTIVE,
        ))
        count += 1

        svc_paginator = ecs.get_paginator("list_services")
        svc_pages = await asyncio.to_thread(
            lambda ca=cluster_arn, sp=svc_paginator: list(sp.paginate(cluster=ca)),
        )
        for svc_page in svc_pages:
            svc_arns = svc_page.get("serviceArns", [])
            if not svc_arns:
                continue
            descs = await asyncio.to_thread(
                ecs.describe_services,
                cluster=cluster_arn, services=svc_arns, include=["TAGS"],
            )
            for svc in descs.get("services", []):
                deployments = svc.get("deployments", [])
                primary_dep = next(
                    (d for d in deployments if d.get("status") == "PRIMARY"), {}
                )

                await upsert_resource(tenant_id, ResourceCreate(
                    resource_type=ResourceType.ECS_SERVICE,
                    provider=Provider.AWS,
                    region=region,
                    account_id=account.account_id,
                    name=svc["serviceName"],
                    external_id=svc["serviceArn"],
                    tags=_aws_tags_to_dict(svc.get("tags")),
                    metadata={
                        "cluster": cluster_name,
                        "arn": svc["serviceArn"],
                        "desired_count": svc.get("desiredCount", 0),
                        "running_count": svc.get("runningCount", 0),
                        "pending_count": svc.get("pendingCount", 0),
                        "launch_type": svc.get("launchType", ""),
                        "platform_version": svc.get("platformVersion", ""),
                        "network_mode": (
                            svc.get("networkConfiguration", {})
                            .get("awsvpcConfiguration", {})
                            .get("assignPublicIp", "")
                        ),
                        "task_definition": svc.get("taskDefinition", ""),
                        "deployment_count": len(deployments),
                        "primary_deployment_status": primary_dep.get(
                            "rolloutState", ""
                        ),
                        "health_check_grace_sec": svc.get(
                            "healthCheckGracePeriodSeconds", 0
                        ),
                        "scheduling_strategy": svc.get(
                            "schedulingStrategy", "REPLICA"
                        ),
                    },
                    status=ResourceStatus.ACTIVE,
                ))
                count += 1

    await log.ainfo("ECS discovery complete", region=region, count=count)
    return count


async def _discover_elasticache(
    account: AWSAccount, region: str, tenant_id: str,
) -> int:
    ec = get_client(account, region, "elasticache")
    paginator = ec.get_paginator("describe_cache_clusters")
    count = 0

    pages = await asyncio.to_thread(lambda: list(paginator.paginate(ShowCacheNodeInfo=True)))
    for page in pages:
        for cluster in page["CacheClusters"]:
            nodes = cluster.get("CacheNodes", [])
            endpoint = cluster.get("ConfigurationEndpoint", {})
            subnet_group = cluster.get("CacheSubnetGroupName", "")

            status_map = {
                "available": ResourceStatus.ACTIVE,
                "stopped": ResourceStatus.STOPPED,
            }
            status = status_map.get(
                cluster.get("CacheClusterStatus", ""), ResourceStatus.UNKNOWN
            )

            await upsert_resource(tenant_id, ResourceCreate(
                resource_type=ResourceType.ELASTICACHE,
                provider=Provider.AWS,
                region=region,
                account_id=account.account_id,
                name=cluster["CacheClusterId"],
                external_id=cluster["CacheClusterId"],
                tags={},
                metadata={
                    "engine": cluster.get("Engine", ""),
                    "engine_version": cluster.get("EngineVersion", ""),
                    "node_type": cluster.get("CacheNodeType", ""),
                    "num_nodes": cluster.get("NumCacheNodes", 0),
                    "preferred_az": cluster.get(
                        "PreferredAvailabilityZone", ""
                    ),
                    "availability_zones": [
                        n.get("CustomerAvailabilityZone", "")
                        for n in nodes
                    ],
                    "cache_node_endpoints": [
                        {
                            "node_id": n.get("CacheNodeId", ""),
                            "address": n.get("Endpoint", {}).get(
                                "Address", ""
                            ),
                            "port": n.get("Endpoint", {}).get("Port", 0),
                            "az": n.get("CustomerAvailabilityZone", ""),
                            "status": n.get("CacheNodeStatus", ""),
                        }
                        for n in nodes
                    ],
                    "configuration_endpoint": endpoint.get("Address", ""),
                    "configuration_endpoint_port": endpoint.get("Port", 0),
                    "subnet_group": subnet_group,
                    "security_groups": [
                        sg.get("SecurityGroupId", "")
                        for sg in cluster.get("SecurityGroups", [])
                    ],
                    "replication_group_id": cluster.get(
                        "ReplicationGroupId", ""
                    ),
                    "snapshot_retention_days": cluster.get(
                        "SnapshotRetentionLimit", 0
                    ),
                    "snapshot_window": cluster.get("SnapshotWindow", ""),
                    "maintenance_window": cluster.get(
                        "PreferredMaintenanceWindow", ""
                    ),
                    "auto_minor_version_upgrade": cluster.get(
                        "AutoMinorVersionUpgrade", False
                    ),
                    "at_rest_encryption": cluster.get(
                        "AtRestEncryptionEnabled", False
                    ),
                    "transit_encryption": cluster.get(
                        "TransitEncryptionEnabled", False
                    ),
                    "auth_token_enabled": cluster.get(
                        "AuthTokenEnabled", False
                    ),
                    "arn": cluster.get("ARN", ""),
                    "status": cluster.get("CacheClusterStatus", ""),
                },
                status=status,
            ))
            count += 1

    await log.ainfo("ElastiCache discovery complete", region=region, count=count)
    return count


async def _discover_s3(account: AWSAccount, region: str, tenant_id: str) -> int:
    s3 = get_client(account, region, "s3")
    count = 0

    if region != account.regions[0]:
        return 0

    resp = await asyncio.to_thread(s3.list_buckets)
    for bucket in resp.get("Buckets", []):
        bucket_name = bucket["Name"]

        try:
            loc = await asyncio.to_thread(s3.get_bucket_location, Bucket=bucket_name)
            bucket_region = loc.get("LocationConstraint") or "us-east-1"
        except Exception:
            bucket_region = "unknown"

        versioning = ""
        with contextlib.suppress(Exception):
            versioning = (await asyncio.to_thread(
                s3.get_bucket_versioning, Bucket=bucket_name,
            )).get("Status", "Disabled")

        encryption = ""
        encryption_type = ""
        with contextlib.suppress(Exception):
            enc_rules = (await asyncio.to_thread(
                s3.get_bucket_encryption, Bucket=bucket_name,
            )).get("ServerSideEncryptionConfiguration", {}).get("Rules", [])
            if enc_rules:
                sse = enc_rules[0].get("ApplyServerSideEncryptionByDefault", {})
                encryption = sse.get("SSEAlgorithm", "")
                encryption_type = sse.get("KMSMasterKeyID", "")

        public_access = {}
        with contextlib.suppress(Exception):
            public_access = (await asyncio.to_thread(
                s3.get_public_access_block, Bucket=bucket_name,
            )).get("PublicAccessBlockConfiguration", {})

        lifecycle_rules = 0
        with contextlib.suppress(Exception):
            lifecycle_rules = len(
                (await asyncio.to_thread(
                    s3.get_bucket_lifecycle_configuration, Bucket=bucket_name,
                )).get("Rules", [])
            )

        await upsert_resource(tenant_id, ResourceCreate(
            resource_type=ResourceType.S3,
            provider=Provider.AWS,
            region=bucket_region,
            account_id=account.account_id,
            name=bucket_name,
            external_id=bucket_name,
            tags={},
            metadata={
                "creation_date": str(bucket.get("CreationDate", "")),
                "versioning": versioning or "Disabled",
                "encryption": encryption,
                "encryption_key": encryption_type,
                "block_public_acls": public_access.get(
                    "BlockPublicAcls", False
                ),
                "block_public_policy": public_access.get(
                    "BlockPublicPolicy", False
                ),
                "ignore_public_acls": public_access.get(
                    "IgnorePublicAcls", False
                ),
                "restrict_public_buckets": public_access.get(
                    "RestrictPublicBuckets", False
                ),
                "lifecycle_rules_count": lifecycle_rules,
                "arn": f"arn:aws:s3:::{bucket_name}",
            },
            status=ResourceStatus.ACTIVE,
        ))
        count += 1

    await log.ainfo("S3 discovery complete", count=count)
    return count


async def _discover_sns(account: AWSAccount, region: str, tenant_id: str) -> int:
    sns = get_client(account, region, "sns")
    paginator = sns.get_paginator("list_topics")
    count = 0

    pages = await asyncio.to_thread(lambda: list(paginator.paginate()))
    for page in pages:
        for topic in page.get("Topics", []):
            arn = topic["TopicArn"]
            topic_name = arn.rsplit(":", 1)[-1]

            attrs = {}
            with contextlib.suppress(Exception):
                attrs = (await asyncio.to_thread(
                    sns.get_topic_attributes, TopicArn=arn,
                )).get("Attributes", {})

            is_fifo = topic_name.endswith(".fifo")
            await upsert_resource(tenant_id, ResourceCreate(
                resource_type=ResourceType.SNS,
                provider=Provider.AWS,
                region=region,
                account_id=account.account_id,
                name=topic_name,
                external_id=topic_name,
                tags={},
                metadata={
                    "arn": arn,
                    "display_name": attrs.get("DisplayName", ""),
                    "fifo": is_fifo,
                    "content_based_dedup": attrs.get(
                        "ContentBasedDeduplication", "false"
                    ) == "true",
                    "subscriptions_confirmed": int(
                        attrs.get("SubscriptionsConfirmed", 0)
                    ),
                    "subscriptions_pending": int(
                        attrs.get("SubscriptionsPending", 0)
                    ),
                    "subscriptions_deleted": int(
                        attrs.get("SubscriptionsDeleted", 0)
                    ),
                    "delivery_policy": bool(attrs.get("DeliveryPolicy")),
                    "effective_delivery_policy": bool(
                        attrs.get("EffectiveDeliveryPolicy")
                    ),
                    "kms_key_id": attrs.get("KmsMasterKeyId", ""),
                    "owner": attrs.get("Owner", ""),
                    "policy_present": bool(attrs.get("Policy")),
                },
                status=ResourceStatus.ACTIVE,
            ))
            count += 1

    await log.ainfo("SNS discovery complete", region=region, count=count)
    return count


async def _discover_cloudfront(
    account: AWSAccount, region: str, tenant_id: str,
) -> int:
    if region != account.regions[0]:
        return 0

    cf = get_client(account, region, "cloudfront")
    paginator = cf.get_paginator("list_distributions")
    count = 0

    pages = await asyncio.to_thread(lambda: list(paginator.paginate()))
    for page in pages:
        dist_list = page.get("DistributionList", {})
        for dist in dist_list.get("Items", []):
            origins = dist.get("Origins", {}).get("Items", [])
            aliases = dist.get("Aliases", {}).get("Items", [])
            viewer_cert = dist.get("ViewerCertificate", {})
            default_cache = dist.get("DefaultCacheBehavior", {})

            await upsert_resource(tenant_id, ResourceCreate(
                resource_type=ResourceType.CLOUDFRONT,
                provider=Provider.AWS,
                region="global",
                account_id=account.account_id,
                name=dist.get("Comment") or dist["Id"],
                external_id=dist["Id"],
                tags={},
                metadata={
                    "domain_name": dist.get("DomainName", ""),
                    "aliases": aliases,
                    "status": dist.get("Status", ""),
                    "enabled": dist.get("Enabled", False),
                    "price_class": dist.get("PriceClass", ""),
                    "http_version": dist.get("HttpVersion", ""),
                    "is_ipv6_enabled": dist.get("IsIPV6Enabled", False),
                    "web_acl_id": dist.get("WebACLId", ""),
                    "origins": [
                        {
                            "id": o.get("Id", ""),
                            "domain": o.get("DomainName", ""),
                            "protocol_policy": o.get("CustomOriginConfig", {}).get(
                                "OriginProtocolPolicy", ""
                            ),
                        }
                        for o in origins
                    ],
                    "default_cache_behavior_viewer_protocol": (
                        default_cache.get("ViewerProtocolPolicy", "")
                    ),
                    "default_cache_behavior_compress": (
                        default_cache.get("Compress", False)
                    ),
                    "ssl_certificate": viewer_cert.get(
                        "ACMCertificateArn", ""
                    ),
                    "minimum_protocol_version": viewer_cert.get(
                        "MinimumProtocolVersion", ""
                    ),
                    "last_modified_time": str(
                        dist.get("LastModifiedTime", "")
                    ),
                    "arn": dist.get("ARN", ""),
                },
                status=ResourceStatus.ACTIVE,
            ))
            count += 1

    await log.ainfo("CloudFront discovery complete", count=count)
    return count


async def _discover_api_gateway(
    account: AWSAccount, region: str, tenant_id: str,
) -> int:
    apigw = get_client(account, region, "apigateway")
    count = 0

    paginator = apigw.get_paginator("get_rest_apis")
    pages = await asyncio.to_thread(lambda: list(paginator.paginate()))
    for page in pages:
        for api in page.get("items", []):
            endpoint_config = api.get("endpointConfiguration", {})
            endpoint_types = endpoint_config.get("types", ["EDGE"])
            vpc_endpoint_ids = endpoint_config.get("vpcEndpointIds", [])

            await upsert_resource(tenant_id, ResourceCreate(
                resource_type=ResourceType.API_GATEWAY,
                provider=Provider.AWS,
                region=region,
                account_id=account.account_id,
                name=api["name"],
                external_id=api["name"],
                tags=api.get("tags", {}),
                metadata={
                    "id": api["id"],
                    "description": api.get("description", ""),
                    "created_date": str(api.get("createdDate", "")),
                    "endpoint_types": endpoint_types,
                    "vpc_endpoint_ids": vpc_endpoint_ids,
                    "api_key_source": api.get("apiKeySource", "HEADER"),
                    "minimum_compression_size": api.get(
                        "minimumCompressionSize", -1
                    ),
                    "disable_execute_api_endpoint": api.get(
                        "disableExecuteApiEndpoint", False
                    ),
                    "version": api.get("version", ""),
                    "policy_present": bool(api.get("policy")),
                },
                status=ResourceStatus.ACTIVE,
            ))
            count += 1

    await log.ainfo("API Gateway discovery complete", region=region, count=count)
    return count


async def _discover_kinesis(account: AWSAccount, region: str, tenant_id: str) -> int:
    kinesis = get_client(account, region, "kinesis")
    paginator = kinesis.get_paginator("list_streams")
    count = 0

    pages = await asyncio.to_thread(lambda: list(paginator.paginate()))
    for page in pages:
        for stream_name in page.get("StreamNames", []):
            desc = {}
            with contextlib.suppress(Exception):
                desc = (await asyncio.to_thread(
                    kinesis.describe_stream_summary, StreamName=stream_name,
                )).get("StreamDescriptionSummary", {})

            consumers = 0
            with contextlib.suppress(Exception):
                stream_arn = desc.get("StreamARN", "")
                consumers = len(
                    (await asyncio.to_thread(
                        kinesis.list_stream_consumers, StreamARN=stream_arn,
                    )).get("Consumers", [])
                )

            status_map = {
                "ACTIVE": ResourceStatus.ACTIVE,
                "DELETING": ResourceStatus.TERMINATED,
            }
            status = status_map.get(
                desc.get("StreamStatus", ""), ResourceStatus.UNKNOWN
            )

            await upsert_resource(tenant_id, ResourceCreate(
                resource_type=ResourceType.KINESIS,
                provider=Provider.AWS,
                region=region,
                account_id=account.account_id,
                name=stream_name,
                external_id=stream_name,
                tags={},
                metadata={
                    "status": desc.get("StreamStatus", ""),
                    "shard_count": desc.get("OpenShardCount", 0),
                    "retention_hours": desc.get("RetentionPeriodHours", 24),
                    "mode": desc.get("StreamModeDetails", {}).get(
                        "StreamMode", "PROVISIONED"
                    ),
                    "encryption_type": desc.get("EncryptionType", "NONE"),
                    "kms_key_id": desc.get("KeyId", ""),
                    "consumer_count": consumers,
                    "creation_timestamp": str(
                        desc.get("StreamCreationTimestamp", "")
                    ),
                    "arn": desc.get("StreamARN", ""),
                },
                status=status,
            ))
            count += 1

    await log.ainfo("Kinesis discovery complete", region=region, count=count)
    return count


async def _discover_redshift(account: AWSAccount, region: str, tenant_id: str) -> int:
    rs = get_client(account, region, "redshift")
    paginator = rs.get_paginator("describe_clusters")
    count = 0

    pages = await asyncio.to_thread(lambda: list(paginator.paginate()))
    for page in pages:
        for cluster in page.get("Clusters", []):
            cid = cluster["ClusterIdentifier"]
            status_map = {"available": ResourceStatus.ACTIVE, "paused": ResourceStatus.STOPPED}
            status = status_map.get(cluster.get("ClusterStatus", ""), ResourceStatus.UNKNOWN)

            await upsert_resource(tenant_id, ResourceCreate(
                resource_type=ResourceType.REDSHIFT,
                provider=Provider.AWS,
                region=region,
                account_id=account.account_id,
                name=cid,
                external_id=cid,
                tags=_aws_tags_to_dict(cluster.get("Tags")),
                metadata={
                    "node_type": cluster.get("NodeType", ""),
                    "number_of_nodes": cluster.get("NumberOfNodes", 0),
                    "availability_zone": cluster.get("AvailabilityZone", ""),
                    "db_name": cluster.get("DBName", ""),
                    "master_username": cluster.get("MasterUsername", ""),
                    "endpoint": cluster.get("Endpoint", {}).get("Address", ""),
                    "port": cluster.get("Endpoint", {}).get("Port", 0),
                    "vpc_id": cluster.get("VpcId", ""),
                    "subnet_group": cluster.get(
                        "ClusterSubnetGroupName", ""
                    ),
                    "publicly_accessible": cluster.get(
                        "PubliclyAccessible", False
                    ),
                    "encrypted": cluster.get("Encrypted", False),
                    "kms_key_id": cluster.get("KmsKeyId", ""),
                    "enhanced_vpc_routing": cluster.get(
                        "EnhancedVpcRouting", False
                    ),
                    "maintenance_window": cluster.get(
                        "PreferredMaintenanceWindow", ""
                    ),
                    "automated_snapshot_retention": cluster.get(
                        "AutomatedSnapshotRetentionPeriod", 0
                    ),
                    "cluster_version": cluster.get("ClusterVersion", ""),
                    "allow_version_upgrade": cluster.get(
                        "AllowVersionUpgrade", True
                    ),
                    "elastic_resize": cluster.get(
                        "ElasticResizeNumberOfNodeOptions", ""
                    ),
                    "security_groups": [
                        sg.get("VpcSecurityGroupId", "")
                        for sg in cluster.get("VpcSecurityGroups", [])
                    ],
                    "iam_roles": [
                        r.get("IamRoleArn", "")
                        for r in cluster.get("IamRoles", [])
                    ],
                    "total_storage_capacity_mb": cluster.get(
                        "TotalStorageCapacityInMegaBytes", 0
                    ),
                    "status": cluster.get("ClusterStatus", ""),
                },
                status=status,
            ))
            count += 1

    await log.ainfo("Redshift discovery complete", region=region, count=count)
    return count


async def _discover_opensearch(
    account: AWSAccount, region: str, tenant_id: str,
) -> int:
    es = get_client(account, region, "opensearch")
    count = 0

    names_resp = await asyncio.to_thread(es.list_domain_names, EngineType="OpenSearch")
    domain_names = [d["DomainName"] for d in names_resp.get("DomainNames", [])]

    for batch_start in range(0, len(domain_names), 5):
        batch = domain_names[batch_start:batch_start + 5]
        descs = await asyncio.to_thread(es.describe_domains, DomainNames=batch)
        for domain in descs.get("DomainStatusList", []):
            cluster_cfg = domain.get("ClusterConfig", {})
            ebs_opts = domain.get("EBSOptions", {})
            vpc_opts = domain.get("VPCOptions", {})
            encryption = domain.get("EncryptionAtRestOptions", {})
            node_to_node = domain.get("NodeToNodeEncryptionOptions", {})

            await upsert_resource(tenant_id, ResourceCreate(
                resource_type=ResourceType.OPENSEARCH,
                provider=Provider.AWS,
                region=region,
                account_id=account.account_id,
                name=domain["DomainName"],
                external_id=domain["DomainName"],
                tags={},
                metadata={
                    "engine_version": domain.get("EngineVersion", ""),
                    "instance_type": cluster_cfg.get("InstanceType", ""),
                    "instance_count": cluster_cfg.get("InstanceCount", 0),
                    "dedicated_master_enabled": cluster_cfg.get(
                        "DedicatedMasterEnabled", False
                    ),
                    "dedicated_master_type": cluster_cfg.get(
                        "DedicatedMasterType", ""
                    ),
                    "dedicated_master_count": cluster_cfg.get(
                        "DedicatedMasterCount", 0
                    ),
                    "zone_awareness_enabled": cluster_cfg.get(
                        "ZoneAwarenessEnabled", False
                    ),
                    "availability_zones": (
                        cluster_cfg.get("ZoneAwarenessConfig", {}).get(
                            "AvailabilityZoneCount", 1
                        )
                    ),
                    "warm_enabled": cluster_cfg.get("WarmEnabled", False),
                    "warm_type": cluster_cfg.get("WarmType", ""),
                    "warm_count": cluster_cfg.get("WarmCount", 0),
                    "ebs_enabled": ebs_opts.get("EBSEnabled", False),
                    "ebs_volume_type": ebs_opts.get("VolumeType", ""),
                    "ebs_volume_size_gb": ebs_opts.get("VolumeSize", 0),
                    "ebs_iops": ebs_opts.get("Iops", 0),
                    "vpc_id": vpc_opts.get("VPCId", ""),
                    "subnet_ids": vpc_opts.get("SubnetIds", []),
                    "security_group_ids": vpc_opts.get(
                        "SecurityGroupIds", []
                    ),
                    "availability_zone_list": vpc_opts.get(
                        "AvailabilityZones", []
                    ),
                    "encryption_at_rest": encryption.get("Enabled", False),
                    "encryption_kms_key": encryption.get("KmsKeyId", ""),
                    "node_to_node_encryption": node_to_node.get(
                        "Enabled", False
                    ),
                    "endpoint": domain.get("Endpoint", ""),
                    "processing": domain.get("Processing", False),
                    "arn": domain.get("ARN", ""),
                },
                status=ResourceStatus.ACTIVE,
            ))
            count += 1

    await log.ainfo("OpenSearch discovery complete", region=region, count=count)
    return count


async def _discover_step_functions(
    account: AWSAccount, region: str, tenant_id: str,
) -> int:
    sfn = get_client(account, region, "stepfunctions")
    paginator = sfn.get_paginator("list_state_machines")
    count = 0

    pages = await asyncio.to_thread(lambda: list(paginator.paginate()))
    for page in pages:
        for sm in page.get("stateMachines", []):
            sm_arn = sm["stateMachineArn"]
            desc = {}
            with contextlib.suppress(Exception):
                desc = await asyncio.to_thread(
                    sfn.describe_state_machine, stateMachineArn=sm_arn,
                )

            status_map = {
                "ACTIVE": ResourceStatus.ACTIVE,
                "DELETING": ResourceStatus.TERMINATED,
            }
            status = status_map.get(
                desc.get("status", sm.get("type", "")),
                ResourceStatus.ACTIVE,
            )

            await upsert_resource(tenant_id, ResourceCreate(
                resource_type=ResourceType.STEP_FUNCTIONS,
                provider=Provider.AWS,
                region=region,
                account_id=account.account_id,
                name=sm["name"],
                external_id=sm_arn,
                tags={},
                metadata={
                    "arn": sm_arn,
                    "type": sm.get("type", "STANDARD"),
                    "creation_date": str(sm.get("creationDate", "")),
                    "role_arn": desc.get("roleArn", ""),
                    "logging_level": desc.get("loggingConfiguration", {}).get(
                        "level", "OFF"
                    ),
                    "tracing_enabled": desc.get(
                        "tracingConfiguration", {}
                    ).get("enabled", False),
                    "status": desc.get("status", "ACTIVE"),
                },
                status=status,
            ))
            count += 1

    await log.ainfo("Step Functions discovery complete", region=region, count=count)
    return count


async def _discover_nat_gateway(
    account: AWSAccount, region: str, tenant_id: str,
) -> int:
    ec2 = get_client(account, region, "ec2")
    paginator = ec2.get_paginator("describe_nat_gateways")
    count = 0

    pages = await asyncio.to_thread(lambda: list(paginator.paginate()))
    for page in pages:
        for ngw in page.get("NatGateways", []):
            tags = _aws_tags_to_dict(ngw.get("Tags"))
            state = ngw.get("State", "")
            status = {
                "available": ResourceStatus.ACTIVE,
                "deleted": ResourceStatus.TERMINATED,
                "deleting": ResourceStatus.TERMINATED,
            }.get(state, ResourceStatus.UNKNOWN)

            addresses = ngw.get("NatGatewayAddresses", [])
            await upsert_resource(tenant_id, ResourceCreate(
                resource_type=ResourceType.NAT_GATEWAY,
                provider=Provider.AWS,
                region=region,
                account_id=account.account_id,
                name=_get_name_from_tags(tags, ngw["NatGatewayId"]),
                external_id=ngw["NatGatewayId"],
                tags=tags,
                metadata={
                    "vpc_id": ngw.get("VpcId", ""),
                    "subnet_id": ngw.get("SubnetId", ""),
                    "state": state,
                    "connectivity_type": ngw.get("ConnectivityType", ""),
                    "public_ips": [
                        a.get("PublicIp", "") for a in addresses
                    ],
                    "private_ips": [
                        a.get("PrivateIp", "") for a in addresses
                    ],
                    "allocation_ids": [
                        a.get("AllocationId", "") for a in addresses
                    ],
                    "network_interface_ids": [
                        a.get("NetworkInterfaceId", "") for a in addresses
                    ],
                    "create_time": str(ngw.get("CreateTime", "")),
                    "delete_time": str(ngw.get("DeleteTime", "")),
                    "failure_code": ngw.get("FailureCode", ""),
                    "failure_message": ngw.get("FailureMessage", ""),
                },
                status=status,
            ))
            count += 1

    await log.ainfo("NAT Gateway discovery complete", region=region, count=count)
    return count


async def _discover_route53(account: AWSAccount, region: str, tenant_id: str) -> int:
    if region != account.regions[0]:
        return 0

    r53 = get_client(account, region, "route53")
    count = 0

    paginator = r53.get_paginator("list_hosted_zones")
    pages = await asyncio.to_thread(lambda: list(paginator.paginate()))
    for page in pages:
        for zone in page.get("HostedZones", []):
            zone_id = zone["Id"].rsplit("/", 1)[-1]
            config = zone.get("Config", {})
            is_private = config.get("PrivateZone", False)

            tags_dict = {}
            with contextlib.suppress(Exception):
                tag_resp = await asyncio.to_thread(
                    r53.list_tags_for_resource,
                    ResourceType="hostedzone", ResourceId=zone_id,
                )
                tags_dict = _aws_tags_to_dict(
                    tag_resp.get("ResourceTagSet", {}).get("Tags", [])
                )

            await upsert_resource(tenant_id, ResourceCreate(
                resource_type=ResourceType.ROUTE53,
                provider=Provider.AWS,
                region="global",
                account_id=account.account_id,
                name=zone["Name"].rstrip("."),
                external_id=zone_id,
                tags=tags_dict,
                metadata={
                    "zone_id": zone_id,
                    "record_count": zone.get("ResourceRecordSetCount", 0),
                    "private": is_private,
                    "comment": config.get("Comment", ""),
                    "caller_reference": zone.get("CallerReference", ""),
                    "linked_service": zone.get(
                        "LinkedService", {}
                    ).get("ServicePrincipal", ""),
                },
                status=ResourceStatus.ACTIVE,
            ))
            count += 1

    await log.ainfo("Route53 discovery complete", count=count)
    return count


async def _discover_efs(account: AWSAccount, region: str, tenant_id: str) -> int:
    efs = get_client(account, region, "efs")
    paginator = efs.get_paginator("describe_file_systems")
    count = 0

    pages = await asyncio.to_thread(lambda: list(paginator.paginate()))
    for page in pages:
        for fs in page.get("FileSystems", []):
            tags = _aws_tags_to_dict(fs.get("Tags"))
            size_info = fs.get("SizeInBytes", {})
            fs_id = fs["FileSystemId"]

            mount_targets = []
            with contextlib.suppress(Exception):
                mt_resp = await asyncio.to_thread(
                    efs.describe_mount_targets, FileSystemId=fs_id,
                )
                mount_targets = mt_resp.get("MountTargets", [])

            status_map = {
                "available": ResourceStatus.ACTIVE,
                "deleted": ResourceStatus.TERMINATED,
                "deleting": ResourceStatus.TERMINATED,
            }
            status = status_map.get(
                fs.get("LifeCycleState", ""), ResourceStatus.UNKNOWN
            )

            await upsert_resource(tenant_id, ResourceCreate(
                resource_type=ResourceType.EFS,
                provider=Provider.AWS,
                region=region,
                account_id=account.account_id,
                name=_get_name_from_tags(tags, fs_id),
                external_id=fs_id,
                tags=tags,
                metadata={
                    "size_bytes": size_info.get("Value", 0),
                    "size_in_ia_bytes": size_info.get(
                        "ValueInIA", 0
                    ),
                    "size_in_standard_bytes": size_info.get(
                        "ValueInStandard", 0
                    ),
                    "performance_mode": fs.get("PerformanceMode", ""),
                    "throughput_mode": fs.get("ThroughputMode", ""),
                    "provisioned_throughput_mibps": fs.get(
                        "ProvisionedThroughputInMibps", 0
                    ),
                    "encrypted": fs.get("Encrypted", False),
                    "kms_key_id": fs.get("KmsKeyId", ""),
                    "lifecycle_state": fs.get("LifeCycleState", ""),
                    "number_of_mount_targets": fs.get(
                        "NumberOfMountTargets", 0
                    ),
                    "mount_targets": [
                        {
                            "mount_target_id": mt.get(
                                "MountTargetId", ""
                            ),
                            "subnet_id": mt.get("SubnetId", ""),
                            "availability_zone": mt.get(
                                "AvailabilityZoneName", ""
                            ),
                            "ip_address": mt.get("IpAddress", ""),
                            "lifecycle_state": mt.get(
                                "LifeCycleState", ""
                            ),
                            "network_interface_id": mt.get(
                                "NetworkInterfaceId", ""
                            ),
                        }
                        for mt in mount_targets
                    ],
                    "availability_zone": fs.get(
                        "AvailabilityZoneName", ""
                    ),
                    "arn": fs.get("FileSystemArn", ""),
                },
                status=status,
            ))
            count += 1

    await log.ainfo("EFS discovery complete", region=region, count=count)
    return count


async def _discover_fsx(account: AWSAccount, region: str, tenant_id: str) -> int:
    fsx = get_client(account, region, "fsx")
    paginator = fsx.get_paginator("describe_file_systems")
    count = 0

    pages = await asyncio.to_thread(lambda: list(paginator.paginate()))
    for page in pages:
        for fs in page.get("FileSystems", []):
            tags = _aws_tags_to_dict(fs.get("Tags"))
            status_map = {"AVAILABLE": ResourceStatus.ACTIVE}
            status = status_map.get(fs.get("Lifecycle", ""), ResourceStatus.UNKNOWN)

            await upsert_resource(tenant_id, ResourceCreate(
                resource_type=ResourceType.FSX,
                provider=Provider.AWS,
                region=region,
                account_id=account.account_id,
                name=_get_name_from_tags(tags, fs["FileSystemId"]),
                external_id=fs["FileSystemId"],
                tags=tags,
                metadata={
                    "type": fs.get("FileSystemType", ""),
                    "storage_capacity_gb": fs.get("StorageCapacity", 0),
                    "storage_type": fs.get("StorageType", ""),
                    "lifecycle": fs.get("Lifecycle", ""),
                    "dns_name": fs.get("DNSName", ""),
                    "vpc_id": fs.get("VpcId", ""),
                    "subnet_ids": fs.get("SubnetIds", []),
                    "creation_time": str(fs.get("CreationTime", "")),
                    "owner_id": fs.get("OwnerId", ""),
                    "kms_key_id": fs.get("KmsKeyId", ""),
                    "network_interface_ids": fs.get(
                        "NetworkInterfaceIds", []
                    ),
                    "lustre_config": {
                        "deployment_type": fs.get(
                            "LustreConfiguration", {}
                        ).get("DeploymentType", ""),
                        "per_unit_storage_throughput": fs.get(
                            "LustreConfiguration", {}
                        ).get("PerUnitStorageThroughput", 0),
                        "data_compression_type": fs.get(
                            "LustreConfiguration", {}
                        ).get("DataCompressionType", "NONE"),
                    } if fs.get("FileSystemType") == "LUSTRE" else {},
                    "windows_config": {
                        "throughput_capacity_mbps": fs.get(
                            "WindowsConfiguration", {}
                        ).get("ThroughputCapacity", 0),
                        "deployment_type": fs.get(
                            "WindowsConfiguration", {}
                        ).get("DeploymentType", ""),
                        "active_directory_id": fs.get(
                            "WindowsConfiguration", {}
                        ).get("ActiveDirectoryId", ""),
                    } if fs.get("FileSystemType") == "WINDOWS" else {},
                    "arn": fs.get("ResourceARN", ""),
                },
                status=status,
            ))
            count += 1

    await log.ainfo("FSx discovery complete", region=region, count=count)
    return count


async def _discover_elb(account: AWSAccount, region: str, tenant_id: str) -> int:
    elb = get_client(account, region, "elb")
    paginator = elb.get_paginator("describe_load_balancers")
    count = 0

    pages = await asyncio.to_thread(lambda: list(paginator.paginate()))
    for page in pages:
        for lb in page.get("LoadBalancerDescriptions", []):
            azs = lb.get("AvailabilityZones", [])
            listeners = lb.get("ListenerDescriptions", [])
            health_check = lb.get("HealthCheck", {})

            await upsert_resource(tenant_id, ResourceCreate(
                resource_type=ResourceType.ELB,
                provider=Provider.AWS,
                region=region,
                account_id=account.account_id,
                name=lb["LoadBalancerName"],
                external_id=lb["LoadBalancerName"],
                tags={},
                metadata={
                    "dns_name": lb.get("DNSName", ""),
                    "canonical_hosted_zone_name": lb.get(
                        "CanonicalHostedZoneName", ""
                    ),
                    "scheme": lb.get("Scheme", ""),
                    "vpc_id": lb.get("VPCId", ""),
                    "availability_zones": azs,
                    "subnet_ids": lb.get("Subnets", []),
                    "security_groups": lb.get("SecurityGroups", []),
                    "instance_count": len(lb.get("Instances", [])),
                    "instance_ids": [
                        i.get("InstanceId", "")
                        for i in lb.get("Instances", [])
                    ],
                    "listener_count": len(listeners),
                    "listener_ports": [
                        ld.get("Listener", {}).get("LoadBalancerPort", 0)
                        for ld in listeners
                    ],
                    "health_check_target": health_check.get("Target", ""),
                    "health_check_interval": health_check.get("Interval", 0),
                    "health_check_timeout": health_check.get("Timeout", 0),
                    "healthy_threshold": health_check.get(
                        "HealthyThreshold", 0
                    ),
                    "unhealthy_threshold": health_check.get(
                        "UnhealthyThreshold", 0
                    ),
                    "source_security_group": lb.get(
                        "SourceSecurityGroup", {}
                    ).get("GroupName", ""),
                    "created_time": str(lb.get("CreatedTime", "")),
                },
                status=ResourceStatus.ACTIVE,
            ))
            count += 1

    await log.ainfo("ELB Classic discovery complete", region=region, count=count)
    return count


async def _discover_eks(account: AWSAccount, region: str, tenant_id: str) -> int:
    eks = get_client(account, region, "eks")
    paginator = eks.get_paginator("list_clusters")
    count = 0

    pages = await asyncio.to_thread(lambda: list(paginator.paginate()))
    for page in pages:
        for cluster_name in page.get("clusters", []):
            desc = {}
            with contextlib.suppress(Exception):
                desc = (await asyncio.to_thread(
                    eks.describe_cluster, name=cluster_name,
                )).get("cluster", {})

            status_map = {"ACTIVE": ResourceStatus.ACTIVE, "DELETING": ResourceStatus.TERMINATED}
            status = status_map.get(desc.get("status", ""), ResourceStatus.UNKNOWN)

            vpc_config = desc.get("resourcesVpcConfig", {})
            logging_cfg = desc.get("logging", {}).get(
                "clusterLogging", [{}]
            )
            enabled_log_types = []
            for lc in logging_cfg:
                if lc.get("enabled"):
                    enabled_log_types.extend(lc.get("types", []))

            nodegroups = []
            with contextlib.suppress(Exception):
                ng_resp = await asyncio.to_thread(
                    eks.list_nodegroups, clusterName=cluster_name,
                )
                nodegroups = ng_resp.get("nodegroups", [])

            await upsert_resource(tenant_id, ResourceCreate(
                resource_type=ResourceType.EKS,
                provider=Provider.AWS,
                region=region,
                account_id=account.account_id,
                name=cluster_name,
                external_id=cluster_name,
                tags=desc.get("tags", {}),
                metadata={
                    "version": desc.get("version", ""),
                    "platform_version": desc.get("platformVersion", ""),
                    "endpoint": desc.get("endpoint", ""),
                    "endpoint_public_access": vpc_config.get(
                        "endpointPublicAccess", True
                    ),
                    "endpoint_private_access": vpc_config.get(
                        "endpointPrivateAccess", False
                    ),
                    "vpc_id": vpc_config.get("vpcId", ""),
                    "subnet_ids": vpc_config.get("subnetIds", []),
                    "security_group_ids": vpc_config.get(
                        "securityGroupIds", []
                    ),
                    "cluster_security_group_id": vpc_config.get(
                        "clusterSecurityGroupId", ""
                    ),
                    "public_access_cidrs": vpc_config.get(
                        "publicAccessCidrs", []
                    ),
                    "role_arn": desc.get("roleArn", ""),
                    "kubernetes_network_config": {
                        "service_ipv4_cidr": desc.get(
                            "kubernetesNetworkConfig", {}
                        ).get("serviceIpv4Cidr", ""),
                        "ip_family": desc.get(
                            "kubernetesNetworkConfig", {}
                        ).get("ipFamily", ""),
                    },
                    "enabled_log_types": enabled_log_types,
                    "encryption_config": bool(
                        desc.get("encryptionConfig")
                    ),
                    "nodegroup_names": nodegroups,
                    "nodegroup_count": len(nodegroups),
                    "arn": desc.get("arn", ""),
                    "status": desc.get("status", ""),
                    "created_at": str(desc.get("createdAt", "")),
                },
                status=status,
            ))
            count += 1

    await log.ainfo("EKS discovery complete", region=region, count=count)
    return count


async def _discover_aurora(account: AWSAccount, region: str, tenant_id: str) -> int:
    rds = get_client(account, region, "rds")
    paginator = rds.get_paginator("describe_db_clusters")
    count = 0

    pages = await asyncio.to_thread(lambda: list(paginator.paginate()))
    for page in pages:
        for cluster in page.get("DBClusters", []):
            cid = cluster["DBClusterIdentifier"]
            status_map = {"available": ResourceStatus.ACTIVE, "stopped": ResourceStatus.STOPPED}
            status = status_map.get(cluster.get("Status", ""), ResourceStatus.UNKNOWN)

            members = cluster.get("DBClusterMembers", [])
            azs = cluster.get("AvailabilityZones", [])

            await upsert_resource(tenant_id, ResourceCreate(
                resource_type=ResourceType.AURORA,
                provider=Provider.AWS,
                region=region,
                account_id=account.account_id,
                name=cid,
                external_id=cid,
                tags=_aws_tags_to_dict(cluster.get("TagList")),
                metadata={
                    "engine": cluster.get("Engine", ""),
                    "engine_version": cluster.get("EngineVersion", ""),
                    "engine_mode": cluster.get("EngineMode", "provisioned"),
                    "endpoint": cluster.get("Endpoint", ""),
                    "reader_endpoint": cluster.get("ReaderEndpoint", ""),
                    "port": cluster.get("Port", 0),
                    "multi_az": cluster.get("MultiAZ", False),
                    "availability_zones": azs,
                    "db_subnet_group": cluster.get(
                        "DBSubnetGroup", ""
                    ),
                    "vpc_security_groups": [
                        sg.get("VpcSecurityGroupId", "")
                        for sg in cluster.get("VpcSecurityGroups", [])
                    ],
                    "member_count": len(members),
                    "members": [
                        {
                            "instance_id": m.get(
                                "DBInstanceIdentifier", ""
                            ),
                            "is_writer": m.get(
                                "IsClusterWriter", False
                            ),
                        }
                        for m in members
                    ],
                    "storage_encrypted": cluster.get(
                        "StorageEncrypted", False
                    ),
                    "kms_key_id": cluster.get("KmsKeyId", ""),
                    "backup_retention_days": cluster.get(
                        "BackupRetentionPeriod", 0
                    ),
                    "preferred_backup_window": cluster.get(
                        "PreferredBackupWindow", ""
                    ),
                    "preferred_maintenance_window": cluster.get(
                        "PreferredMaintenanceWindow", ""
                    ),
                    "deletion_protection": cluster.get(
                        "DeletionProtection", False
                    ),
                    "iam_auth_enabled": cluster.get(
                        "IAMDatabaseAuthenticationEnabled", False
                    ),
                    "http_endpoint_enabled": cluster.get(
                        "HttpEndpointEnabled", False
                    ),
                    "copy_tags_to_snapshot": cluster.get(
                        "CopyTagsToSnapshot", False
                    ),
                    "global_cluster_id": cluster.get(
                        "GlobalClusterIdentifier", ""
                    ),
                    "capacity": cluster.get("Capacity", 0),
                    "arn": cluster.get("DBClusterArn", ""),
                    "status": cluster.get("Status", ""),
                },
                status=status,
            ))
            count += 1

    await log.ainfo("Aurora discovery complete", region=region, count=count)
    return count


async def _discover_vpn(account: AWSAccount, region: str, tenant_id: str) -> int:
    ec2 = get_client(account, region, "ec2")
    count = 0

    resp = await asyncio.to_thread(ec2.describe_vpn_connections)
    for vpn in resp.get("VpnConnections", []):
        tags = _aws_tags_to_dict(vpn.get("Tags"))
        state = vpn.get("State", "")
        status = {
            "available": ResourceStatus.ACTIVE,
            "deleted": ResourceStatus.TERMINATED,
            "deleting": ResourceStatus.TERMINATED,
        }.get(state, ResourceStatus.UNKNOWN)

        tunnels = vpn.get("VgwTelemetry", [])
        options = vpn.get("Options", {})

        await upsert_resource(tenant_id, ResourceCreate(
            resource_type=ResourceType.VPN,
            provider=Provider.AWS,
            region=region,
            account_id=account.account_id,
            name=_get_name_from_tags(tags, vpn["VpnConnectionId"]),
            external_id=vpn["VpnConnectionId"],
            tags=tags,
            metadata={
                "state": state,
                "type": vpn.get("Type", ""),
                "category": vpn.get("Category", ""),
                "customer_gateway_id": vpn.get("CustomerGatewayId", ""),
                "vpn_gateway_id": vpn.get("VpnGatewayId", ""),
                "transit_gateway_id": vpn.get("TransitGatewayId", ""),
                "static_routes_only": options.get(
                    "StaticRoutesOnly", False
                ),
                "enable_acceleration": options.get(
                    "EnableAcceleration", False
                ),
                "tunnel_inside_ip_version": options.get(
                    "TunnelInsideIpVersion", ""
                ),
                "local_ipv4_cidr": options.get(
                    "LocalIpv4NetworkCidr", ""
                ),
                "remote_ipv4_cidr": options.get(
                    "RemoteIpv4NetworkCidr", ""
                ),
                "tunnels": [
                    {
                        "outside_ip": t.get("OutsideIpAddress", ""),
                        "status": t.get("Status", ""),
                        "status_message": t.get("StatusMessage", ""),
                        "accepted_route_count": t.get(
                            "AcceptedRouteCount", 0
                        ),
                        "last_status_change": str(
                            t.get("LastStatusChange", "")
                        ),
                    }
                    for t in tunnels
                ],
                "tunnel_count": len(tunnels),
                "tunnels_up": sum(
                    1 for t in tunnels if t.get("Status") == "UP"
                ),
            },
            status=status,
        ))
        count += 1

    await log.ainfo("VPN discovery complete", region=region, count=count)
    return count


_DISCOVERERS = {
    "ec2": _discover_ec2,
    "ebs": _discover_ebs,
    "rds": _discover_rds,
    "lambda": _discover_lambda,
    "alb_nlb": _discover_alb,
    "dynamodb": _discover_dynamodb,
    "sqs": _discover_sqs,
    "ecs": _discover_ecs,
    "elasticache": _discover_elasticache,
    "s3": _discover_s3,
    "sns": _discover_sns,
    "cloudfront": _discover_cloudfront,
    "api_gateway": _discover_api_gateway,
    "kinesis": _discover_kinesis,
    "redshift": _discover_redshift,
    "opensearch": _discover_opensearch,
    "step_functions": _discover_step_functions,
    "nat_gateway": _discover_nat_gateway,
    "route53": _discover_route53,
    "efs": _discover_efs,
    "fsx": _discover_fsx,
    "elb": _discover_elb,
    "eks": _discover_eks,
    "aurora": _discover_aurora,
    "vpn": _discover_vpn,
}

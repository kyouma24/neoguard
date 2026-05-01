"""Unit tests for AWS discovery functions — mock all AWS API calls."""

from unittest.mock import AsyncMock, MagicMock, patch

from neoguard.models.aws import AWSAccount
from neoguard.models.resources import ResourceStatus, ResourceType
from neoguard.services.discovery.aws_discovery import (
    _DISCOVERERS,
    discover_all,
)


def _make_account(**kwargs) -> AWSAccount:
    defaults = {
        "id": "acct-001",
        "tenant_id": "default",
        "name": "Test",
        "account_id": "123456789012",
        "regions": ["us-east-1"],
        "role_arn": "",
        "external_id": "",
        "enabled": True,
        "collect_config": {},
        "last_sync_at": None,
        "created_at": "2026-01-01T00:00:00",
        "updated_at": "2026-01-01T00:00:00",
    }
    defaults.update(kwargs)
    return AWSAccount(**defaults)


def _mock_paginator(pages):
    paginator = MagicMock()
    paginator.paginate.return_value = pages
    return paginator


class TestDiscovererRegistry:
    def test_all_expected_discoverers_registered(self):
        expected = {
            "ec2", "ebs", "rds", "lambda", "alb_nlb", "dynamodb", "sqs", "ecs",
            "elasticache", "s3", "sns", "cloudfront", "api_gateway", "kinesis",
            "redshift", "opensearch", "step_functions", "nat_gateway", "route53",
            "efs", "fsx", "elb", "eks", "aurora", "vpn",
        }
        assert set(_DISCOVERERS.keys()) == expected

    def test_discoverer_count(self):
        assert len(_DISCOVERERS) == 25


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverEC2:
    async def test_discovers_instances(self, mock_client, mock_upsert):
        ec2 = MagicMock()
        mock_client.return_value = ec2
        ec2.get_paginator.return_value = _mock_paginator([{
            "Reservations": [{
                "Instances": [{
                    "InstanceId": "i-abc123",
                    "State": {"Name": "running"},
                    "InstanceType": "t3.micro",
                    "Tags": [{"Key": "Name", "Value": "web-01"}],
                }]
            }]
        }])

        account = _make_account()
        from neoguard.services.discovery.aws_discovery import _discover_ec2
        count = await _discover_ec2(account, "us-east-1", "default")

        assert count == 1
        mock_upsert.assert_called_once()
        call_args = mock_upsert.call_args
        resource = call_args[0][1]
        assert resource.resource_type == ResourceType.EC2
        assert resource.name == "web-01"
        assert resource.external_id == "i-abc123"
        assert resource.status == ResourceStatus.ACTIVE

    async def test_captures_enriched_metadata(self, mock_client, mock_upsert):
        ec2 = MagicMock()
        mock_client.return_value = ec2
        ec2.get_paginator.return_value = _mock_paginator([{
            "Reservations": [{
                "Instances": [{
                    "InstanceId": "i-rich",
                    "State": {"Name": "running"},
                    "InstanceType": "c5.2xlarge",
                    "PlatformDetails": "Linux/UNIX",
                    "Architecture": "x86_64",
                    "EbsOptimized": True,
                    "RootDeviceType": "ebs",
                    "SecurityGroups": [
                        {"GroupId": "sg-aaa"},
                        {"GroupId": "sg-bbb"},
                    ],
                    "IamInstanceProfile": {
                        "Arn": "arn:aws:iam::123:instance-profile/web-role"
                    },
                }]
            }]
        }])

        from neoguard.services.discovery.aws_discovery import _discover_ec2
        await _discover_ec2(_make_account(), "us-east-1", "default")
        meta = mock_upsert.call_args[0][1].metadata
        assert meta["platform"] == "Linux/UNIX"
        assert meta["architecture"] == "x86_64"
        assert meta["ebs_optimized"] is True
        assert meta["security_groups"] == ["sg-aaa", "sg-bbb"]
        assert "web-role" in meta["iam_profile"]

    async def test_stopped_instance_status(self, mock_client, mock_upsert):
        ec2 = MagicMock()
        mock_client.return_value = ec2
        ec2.get_paginator.return_value = _mock_paginator([{
            "Reservations": [{
                "Instances": [{
                    "InstanceId": "i-stopped",
                    "State": {"Name": "stopped"},
                }]
            }]
        }])

        from neoguard.services.discovery.aws_discovery import _discover_ec2
        count = await _discover_ec2(_make_account(), "us-east-1", "default")
        assert count == 1
        resource = mock_upsert.call_args[0][1]
        assert resource.status == ResourceStatus.STOPPED


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverEC2EnrichedFull:
    async def test_captures_availability_zone_and_networking(self, mock_client, mock_upsert):
        ec2 = MagicMock()
        mock_client.return_value = ec2
        ec2.get_paginator.return_value = _mock_paginator([{
            "Reservations": [{
                "Instances": [{
                    "InstanceId": "i-az01",
                    "State": {"Name": "running"},
                    "InstanceType": "m5.xlarge",
                    "Placement": {
                        "AvailabilityZone": "us-east-1a",
                        "Tenancy": "default",
                    },
                    "PrivateIpAddress": "10.0.1.50",
                    "PublicIpAddress": "54.1.2.3",
                    "PrivateDnsName": "ip-10-0-1-50.ec2.internal",
                    "PublicDnsName": "ec2-54-1-2-3.compute-1.amazonaws.com",
                    "VpcId": "vpc-abc",
                    "SubnetId": "subnet-111",
                    "Hypervisor": "nitro",
                    "VirtualizationType": "hvm",
                    "KeyName": "prod-key",
                    "Monitoring": {"State": "enabled"},
                    "EnaSupport": True,
                    "BlockDeviceMappings": [{
                        "DeviceName": "/dev/sda1",
                        "Ebs": {
                            "VolumeId": "vol-aaa",
                            "Status": "attached",
                            "DeleteOnTermination": True,
                        },
                    }],
                    "NetworkInterfaces": [{
                        "NetworkInterfaceId": "eni-bbb",
                        "PrivateIpAddress": "10.0.1.50",
                        "SubnetId": "subnet-111",
                        "Status": "in-use",
                    }],
                }]
            }]
        }])

        from neoguard.services.discovery.aws_discovery import _discover_ec2
        await _discover_ec2(_make_account(), "us-east-1", "default")
        meta = mock_upsert.call_args[0][1].metadata

        assert meta["availability_zone"] == "us-east-1a"
        assert meta["tenancy"] == "default"
        assert meta["private_ip"] == "10.0.1.50"
        assert meta["public_ip"] == "54.1.2.3"
        assert meta["private_dns"] == "ip-10-0-1-50.ec2.internal"
        assert meta["vpc_id"] == "vpc-abc"
        assert meta["subnet_id"] == "subnet-111"
        assert meta["hypervisor"] == "nitro"
        assert meta["virtualization_type"] == "hvm"
        assert meta["key_name"] == "prod-key"
        assert meta["monitoring"] == "enabled"
        assert meta["ena_support"] is True
        assert len(meta["ebs_volumes"]) == 1
        assert meta["ebs_volumes"][0]["volume_id"] == "vol-aaa"
        assert len(meta["network_interfaces"]) == 1
        assert meta["network_interfaces"][0]["eni_id"] == "eni-bbb"


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverRDSEnriched:
    async def test_captures_full_rds_metadata(self, mock_client, mock_upsert):
        rds = MagicMock()
        mock_client.return_value = rds
        rds.get_paginator.return_value = _mock_paginator([{
            "DBInstances": [{
                "DBInstanceIdentifier": "prod-db",
                "DBInstanceStatus": "available",
                "Engine": "postgres",
                "EngineVersion": "15.4",
                "DBInstanceClass": "db.r6g.xlarge",
                "AvailabilityZone": "us-east-1b",
                "SecondaryAvailabilityZone": "us-east-1a",
                "MultiAZ": True,
                "StorageType": "gp3",
                "AllocatedStorage": 100,
                "MaxAllocatedStorage": 500,
                "Iops": 3000,
                "StorageEncrypted": True,
                "KmsKeyId": "arn:aws:kms:us-east-1:123:key/abc",
                "Endpoint": {"Address": "prod-db.abc.us-east-1.rds.amazonaws.com", "Port": 5432},
                "DBSubnetGroup": {"VpcId": "vpc-rds", "DBSubnetGroupName": "db-subnets"},
                "PubliclyAccessible": False,
                "AutoMinorVersionUpgrade": True,
                "BackupRetentionPeriod": 7,
                "PreferredBackupWindow": "03:00-04:00",
                "PreferredMaintenanceWindow": "sun:05:00-sun:06:00",
                "CACertificateIdentifier": "rds-ca-rsa2048-g1",
                "PerformanceInsightsEnabled": True,
                "DeletionProtection": True,
                "IAMDatabaseAuthenticationEnabled": True,
                "DBName": "neoguard",
                "MasterUsername": "admin",
                "DBParameterGroups": [{"DBParameterGroupName": "custom-pg15"}],
                "VpcSecurityGroups": [
                    {"VpcSecurityGroupId": "sg-rds1"},
                    {"VpcSecurityGroupId": "sg-rds2"},
                ],
                "ReadReplicaSourceDBInstanceIdentifier": "",
                "ReadReplicaDBInstanceIdentifiers": ["prod-db-replica"],
                "DBInstanceArn": "arn:aws:rds:us-east-1:123:db:prod-db",
            }]
        }])

        from neoguard.services.discovery.aws_discovery import _discover_rds
        count = await _discover_rds(_make_account(), "us-east-1", "default")
        assert count == 1
        resource = mock_upsert.call_args[0][1]
        assert resource.resource_type == ResourceType.RDS
        assert resource.status == ResourceStatus.ACTIVE

        meta = resource.metadata
        assert meta["engine"] == "postgres"
        assert meta["engine_version"] == "15.4"
        assert meta["instance_class"] == "db.r6g.xlarge"
        assert meta["availability_zone"] == "us-east-1b"
        assert meta["secondary_az"] == "us-east-1a"
        assert meta["multi_az"] is True
        assert meta["storage_type"] == "gp3"
        assert meta["allocated_storage_gb"] == 100
        assert meta["max_allocated_storage_gb"] == 500
        assert meta["iops"] == 3000
        assert meta["storage_encrypted"] is True
        assert "kms" in meta["kms_key_id"]
        assert meta["vpc_id"] == "vpc-rds"
        assert meta["subnet_group"] == "db-subnets"
        assert meta["publicly_accessible"] is False
        assert meta["backup_retention_days"] == 7
        assert meta["performance_insights"] is True
        assert meta["deletion_protection"] is True
        assert meta["iam_auth_enabled"] is True
        assert meta["db_name"] == "neoguard"
        assert meta["parameter_group"] == "custom-pg15"
        assert meta["security_groups"] == ["sg-rds1", "sg-rds2"]
        assert meta["read_replicas"] == ["prod-db-replica"]
        assert "arn" in meta


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverLambdaEnriched:
    async def test_captures_full_lambda_metadata(self, mock_client, mock_upsert):
        lam = MagicMock()
        mock_client.return_value = lam
        lam.get_paginator.return_value = _mock_paginator([{
            "Functions": [{
                "FunctionName": "process-orders",
                "FunctionArn": "arn:aws:lambda:us-east-1:123:function:process-orders",
                "Runtime": "python3.12",
                "MemorySize": 512,
                "EphemeralStorage": {"Size": 1024},
                "Timeout": 30,
                "Handler": "handler.main",
                "CodeSize": 5242880,
                "PackageType": "Zip",
                "Architectures": ["arm64"],
                "LastModified": "2026-04-01T00:00:00",
                "Description": "Order processing function",
                "Role": "arn:aws:iam::123:role/lambda-role",
                "VpcConfig": {
                    "VpcId": "vpc-lambda",
                    "SubnetIds": ["subnet-a", "subnet-b"],
                    "SecurityGroupIds": ["sg-lambda"],
                },
                "Layers": [
                    {"Arn": "arn:aws:lambda:us-east-1:123:layer:utils:3"},
                ],
                "TracingConfig": {"Mode": "Active"},
                "State": "Active",
                "LastUpdateStatus": "Successful",
                "SnapStart": {"ApplyOn": "None"},
                "LoggingConfig": {"LogFormat": "JSON"},
            }]
        }])
        lam.list_tags.return_value = {"Tags": {"team": "orders"}}

        from neoguard.services.discovery.aws_discovery import _discover_lambda
        count = await _discover_lambda(_make_account(), "us-east-1", "default")
        assert count == 1

        meta = mock_upsert.call_args[0][1].metadata
        assert meta["runtime"] == "python3.12"
        assert meta["memory_mb"] == 512
        assert meta["ephemeral_storage_mb"] == 1024
        assert meta["timeout_sec"] == 30
        assert meta["package_type"] == "Zip"
        assert meta["architectures"] == ["arm64"]
        assert meta["description"] == "Order processing function"
        assert meta["vpc_id"] == "vpc-lambda"
        assert meta["subnet_ids"] == ["subnet-a", "subnet-b"]
        assert meta["security_group_ids"] == ["sg-lambda"]
        assert len(meta["layers"]) == 1
        assert meta["tracing_mode"] == "Active"
        assert meta["state"] == "Active"
        assert meta["logging_format"] == "JSON"


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverSQSEnriched:
    async def test_captures_full_sqs_metadata(self, mock_client, mock_upsert):
        sqs = MagicMock()
        mock_client.return_value = sqs
        sqs.list_queues.return_value = {
            "QueueUrls": ["https://sqs.us-east-1.amazonaws.com/123/orders.fifo"]
        }
        sqs.get_queue_attributes.return_value = {
            "Attributes": {
                "QueueArn": "arn:aws:sqs:us-east-1:123:orders.fifo",
                "VisibilityTimeout": "60",
                "MessageRetentionPeriod": "1209600",
                "MaximumMessageSize": "262144",
                "DelaySeconds": "5",
                "ReceiveMessageWaitTimeSeconds": "20",
                "ApproximateNumberOfMessages": "42",
                "ApproximateNumberOfMessagesNotVisible": "3",
                "ApproximateNumberOfMessagesDelayed": "0",
                "RedrivePolicy": '{"deadLetterTargetArn":"arn:...","maxReceiveCount":"5"}',
                "SqsManagedSseEnabled": "true",
                "KmsMasterKeyId": "",
                "CreatedTimestamp": "1700000000",
                "LastModifiedTimestamp": "1700000100",
            }
        }

        from neoguard.services.discovery.aws_discovery import _discover_sqs
        count = await _discover_sqs(_make_account(), "us-east-1", "default")
        assert count == 1

        meta = mock_upsert.call_args[0][1].metadata
        assert meta["fifo"] is True
        assert meta["visibility_timeout_sec"] == 60
        assert meta["message_retention_sec"] == 1209600
        assert meta["delay_sec"] == 5
        assert meta["receive_wait_time_sec"] == 20
        assert meta["approximate_messages"] == 42
        assert meta["approximate_messages_not_visible"] == 3
        assert "deadLetterTargetArn" in meta["redrive_policy"]
        assert meta["encryption"] == "true"


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverALBEnriched:
    async def test_captures_full_alb_metadata(self, mock_client, mock_upsert):
        elb = MagicMock()
        mock_client.return_value = elb
        elb.get_paginator.return_value = _mock_paginator([{
            "LoadBalancers": [{
                "LoadBalancerName": "api-alb",
                "LoadBalancerArn": (
                    "arn:aws:elasticloadbalancing:us-east-1:123"
                    ":loadbalancer/app/api-alb/abc"
                ),
                "Type": "application",
                "Scheme": "internet-facing",
                "DNSName": "api-alb-123.us-east-1.elb.amazonaws.com",
                "VpcId": "vpc-alb",
                "IpAddressType": "dualstack",
                "AvailabilityZones": [
                    {"ZoneName": "us-east-1a", "SubnetId": "subnet-1a"},
                    {"ZoneName": "us-east-1b", "SubnetId": "subnet-1b"},
                ],
                "SecurityGroups": ["sg-alb1", "sg-alb2"],
                "State": {"Code": "active"},
                "CreatedTime": "2026-01-01T00:00:00",
            }]
        }])

        from neoguard.services.discovery.aws_discovery import _discover_alb
        count = await _discover_alb(_make_account(), "us-east-1", "default")
        assert count == 1

        resource = mock_upsert.call_args[0][1]
        assert resource.resource_type == ResourceType.ALB
        meta = resource.metadata
        assert meta["scheme"] == "internet-facing"
        assert meta["vpc_id"] == "vpc-alb"
        assert meta["ip_address_type"] == "dualstack"
        assert meta["availability_zones"] == ["us-east-1a", "us-east-1b"]
        assert meta["subnet_ids"] == ["subnet-1a", "subnet-1b"]
        assert meta["security_groups"] == ["sg-alb1", "sg-alb2"]
        assert meta["state"] == "active"


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverElastiCacheEnriched:
    async def test_captures_full_elasticache_metadata(self, mock_client, mock_upsert):
        ec = MagicMock()
        mock_client.return_value = ec
        ec.get_paginator.return_value = _mock_paginator([{
            "CacheClusters": [{
                "CacheClusterId": "redis-prod",
                "Engine": "redis",
                "EngineVersion": "7.0.7",
                "CacheNodeType": "cache.r6g.large",
                "NumCacheNodes": 2,
                "PreferredAvailabilityZone": "us-east-1a",
                "CacheClusterStatus": "available",
                "CacheNodes": [
                    {
                        "CacheNodeId": "0001",
                        "Endpoint": {
                            "Address": "redis-prod.abc.0001.use1.cache.amazonaws.com",
                            "Port": 6379,
                        },
                        "CustomerAvailabilityZone": "us-east-1a",
                        "CacheNodeStatus": "available",
                    },
                ],
                "ConfigurationEndpoint": {
                    "Address": "redis-prod.abc.cfg.use1.cache.amazonaws.com",
                    "Port": 6379,
                },
                "CacheSubnetGroupName": "redis-subnets",
                "SecurityGroups": [{"SecurityGroupId": "sg-redis"}],
                "ReplicationGroupId": "redis-prod-rg",
                "SnapshotRetentionLimit": 7,
                "SnapshotWindow": "03:00-04:00",
                "PreferredMaintenanceWindow": "sun:05:00-sun:06:00",
                "AutoMinorVersionUpgrade": True,
                "AtRestEncryptionEnabled": True,
                "TransitEncryptionEnabled": True,
                "AuthTokenEnabled": True,
                "ARN": "arn:aws:elasticache:us-east-1:123:cluster:redis-prod",
            }]
        }])

        from neoguard.services.discovery.aws_discovery import _discover_elasticache
        count = await _discover_elasticache(_make_account(), "us-east-1", "default")
        assert count == 1

        meta = mock_upsert.call_args[0][1].metadata
        assert meta["engine"] == "redis"
        assert meta["node_type"] == "cache.r6g.large"
        assert meta["num_nodes"] == 2
        assert meta["preferred_az"] == "us-east-1a"
        assert meta["availability_zones"] == ["us-east-1a"]
        assert len(meta["cache_node_endpoints"]) == 1
        assert meta["cache_node_endpoints"][0]["port"] == 6379
        assert meta["subnet_group"] == "redis-subnets"
        assert meta["security_groups"] == ["sg-redis"]
        assert meta["replication_group_id"] == "redis-prod-rg"
        assert meta["at_rest_encryption"] is True
        assert meta["transit_encryption"] is True
        assert meta["auth_token_enabled"] is True
        assert meta["snapshot_retention_days"] == 7


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverS3Enriched:
    async def test_captures_full_s3_metadata(self, mock_client, mock_upsert):
        s3 = MagicMock()
        mock_client.return_value = s3
        s3.list_buckets.return_value = {
            "Buckets": [{"Name": "data-lake", "CreationDate": "2026-01-01"}]
        }
        s3.get_bucket_location.return_value = {"LocationConstraint": "us-east-1"}
        s3.get_bucket_versioning.return_value = {"Status": "Enabled"}
        s3.get_bucket_encryption.return_value = {
            "ServerSideEncryptionConfiguration": {
                "Rules": [{
                    "ApplyServerSideEncryptionByDefault": {
                        "SSEAlgorithm": "aws:kms",
                        "KMSMasterKeyID": "arn:aws:kms:us-east-1:123:key/abc",
                    }
                }]
            }
        }
        s3.get_public_access_block.return_value = {
            "PublicAccessBlockConfiguration": {
                "BlockPublicAcls": True,
                "BlockPublicPolicy": True,
                "IgnorePublicAcls": True,
                "RestrictPublicBuckets": True,
            }
        }
        s3.get_bucket_lifecycle_configuration.return_value = {
            "Rules": [{"ID": "archive"}, {"ID": "cleanup"}]
        }

        from neoguard.services.discovery.aws_discovery import _discover_s3
        count = await _discover_s3(_make_account(), "us-east-1", "default")
        assert count == 1

        meta = mock_upsert.call_args[0][1].metadata
        assert meta["versioning"] == "Enabled"
        assert meta["encryption"] == "aws:kms"
        assert "kms" in meta["encryption_key"]
        assert meta["block_public_acls"] is True
        assert meta["block_public_policy"] is True
        assert meta["ignore_public_acls"] is True
        assert meta["restrict_public_buckets"] is True
        assert meta["lifecycle_rules_count"] == 2


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverDynamoDBEnriched:
    async def test_captures_full_dynamodb_metadata(self, mock_client, mock_upsert):
        ddb = MagicMock()
        mock_client.return_value = ddb
        ddb.get_paginator.return_value = _mock_paginator([{
            "TableNames": ["users"]
        }])
        ddb.describe_table.return_value = {
            "Table": {
                "TableStatus": "ACTIVE",
                "ItemCount": 50000,
                "TableSizeBytes": 10485760,
                "BillingModeSummary": {"BillingMode": "PAY_PER_REQUEST"},
                "ProvisionedThroughput": {
                    "ReadCapacityUnits": 0,
                    "WriteCapacityUnits": 0,
                },
                "GlobalSecondaryIndexes": [
                    {"IndexName": "email-index"},
                    {"IndexName": "status-index"},
                ],
                "LocalSecondaryIndexes": [{"IndexName": "created-index"}],
                "SSEDescription": {"Status": "ENABLED", "SSEType": "KMS"},
                "StreamSpecification": {
                    "StreamEnabled": True,
                    "StreamViewType": "NEW_AND_OLD_IMAGES",
                },
                "TableClassSummary": {"TableClass": "STANDARD"},
                "DeletionProtectionEnabled": True,
                "TableArn": "arn:aws:dynamodb:us-east-1:123:table/users",
            }
        }

        from neoguard.services.discovery.aws_discovery import _discover_dynamodb
        count = await _discover_dynamodb(_make_account(), "us-east-1", "default")
        assert count == 1

        meta = mock_upsert.call_args[0][1].metadata
        assert meta["item_count"] == 50000
        assert meta["size_bytes"] == 10485760
        assert meta["billing_mode"] == "PAY_PER_REQUEST"
        assert meta["global_secondary_indexes"] == 2
        assert meta["local_secondary_indexes"] == 1
        assert meta["gsi_names"] == ["email-index", "status-index"]
        assert meta["encryption"] == "ENABLED"
        assert meta["stream_enabled"] is True
        assert meta["stream_view_type"] == "NEW_AND_OLD_IMAGES"
        assert meta["deletion_protection"] is True
        assert meta["table_class"] == "STANDARD"


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverAuroraEnriched:
    async def test_captures_full_aurora_metadata(self, mock_client, mock_upsert):
        rds = MagicMock()
        mock_client.return_value = rds
        rds.get_paginator.return_value = _mock_paginator([{
            "DBClusters": [{
                "DBClusterIdentifier": "aurora-prod",
                "Status": "available",
                "Engine": "aurora-postgresql",
                "EngineVersion": "15.4",
                "EngineMode": "provisioned",
                "Endpoint": "aurora-prod.cluster-abc.us-east-1.rds.amazonaws.com",
                "ReaderEndpoint": "aurora-prod.cluster-ro-abc.us-east-1.rds.amazonaws.com",
                "Port": 5432,
                "MultiAZ": True,
                "AvailabilityZones": ["us-east-1a", "us-east-1b", "us-east-1c"],
                "DBSubnetGroup": "aurora-subnets",
                "VpcSecurityGroups": [
                    {"VpcSecurityGroupId": "sg-aurora1"},
                ],
                "DBClusterMembers": [
                    {"DBInstanceIdentifier": "aurora-prod-1", "IsClusterWriter": True},
                    {"DBInstanceIdentifier": "aurora-prod-2", "IsClusterWriter": False},
                ],
                "StorageEncrypted": True,
                "KmsKeyId": "arn:aws:kms:us-east-1:123:key/def",
                "BackupRetentionPeriod": 14,
                "DeletionProtection": True,
                "IAMDatabaseAuthenticationEnabled": True,
                "HttpEndpointEnabled": False,
                "CopyTagsToSnapshot": True,
                "DBClusterArn": "arn:aws:rds:us-east-1:123:cluster:aurora-prod",
                "TagList": [{"Key": "env", "Value": "prod"}],
            }]
        }])

        from neoguard.services.discovery.aws_discovery import _discover_aurora
        count = await _discover_aurora(_make_account(), "us-east-1", "default")
        assert count == 1

        meta = mock_upsert.call_args[0][1].metadata
        assert meta["engine"] == "aurora-postgresql"
        assert meta["engine_mode"] == "provisioned"
        assert meta["multi_az"] is True
        assert meta["availability_zones"] == ["us-east-1a", "us-east-1b", "us-east-1c"]
        assert meta["vpc_security_groups"] == ["sg-aurora1"]
        assert meta["member_count"] == 2
        assert meta["members"][0]["is_writer"] is True
        assert meta["members"][1]["is_writer"] is False
        assert meta["storage_encrypted"] is True
        assert meta["backup_retention_days"] == 14
        assert meta["deletion_protection"] is True
        assert meta["iam_auth_enabled"] is True
        assert meta["copy_tags_to_snapshot"] is True


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverEKSEnriched:
    async def test_captures_full_eks_metadata(self, mock_client, mock_upsert):
        eks = MagicMock()
        mock_client.return_value = eks
        eks.get_paginator.return_value = _mock_paginator([{
            "clusters": ["prod-cluster"]
        }])
        eks.describe_cluster.return_value = {
            "cluster": {
                "name": "prod-cluster",
                "version": "1.29",
                "platformVersion": "eks.5",
                "endpoint": "https://ABC.gr7.us-east-1.eks.amazonaws.com",
                "status": "ACTIVE",
                "roleArn": "arn:aws:iam::123:role/eks-cluster-role",
                "arn": "arn:aws:eks:us-east-1:123:cluster/prod-cluster",
                "resourcesVpcConfig": {
                    "vpcId": "vpc-eks",
                    "subnetIds": ["subnet-a", "subnet-b"],
                    "securityGroupIds": ["sg-eks1"],
                    "clusterSecurityGroupId": "sg-ekscluster",
                    "endpointPublicAccess": True,
                    "endpointPrivateAccess": True,
                    "publicAccessCidrs": ["10.0.0.0/8"],
                },
                "kubernetesNetworkConfig": {
                    "serviceIpv4Cidr": "172.20.0.0/16",
                    "ipFamily": "ipv4",
                },
                "logging": {
                    "clusterLogging": [
                        {"types": ["api", "audit"], "enabled": True},
                        {"types": ["scheduler"], "enabled": False},
                    ]
                },
                "encryptionConfig": [{"resources": ["secrets"]}],
                "tags": {"team": "platform"},
                "createdAt": "2026-01-01T00:00:00Z",
            }
        }
        eks.list_nodegroups.return_value = {
            "nodegroups": ["general", "gpu"]
        }

        from neoguard.services.discovery.aws_discovery import _discover_eks
        count = await _discover_eks(_make_account(), "us-east-1", "default")
        assert count == 1

        meta = mock_upsert.call_args[0][1].metadata
        assert meta["version"] == "1.29"
        assert meta["vpc_id"] == "vpc-eks"
        assert meta["subnet_ids"] == ["subnet-a", "subnet-b"]
        assert meta["security_group_ids"] == ["sg-eks1"]
        assert meta["cluster_security_group_id"] == "sg-ekscluster"
        assert meta["endpoint_public_access"] is True
        assert meta["endpoint_private_access"] is True
        assert meta["public_access_cidrs"] == ["10.0.0.0/8"]
        assert meta["enabled_log_types"] == ["api", "audit"]
        assert meta["encryption_config"] is True
        assert meta["nodegroup_names"] == ["general", "gpu"]
        assert meta["nodegroup_count"] == 2


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverSNS:
    async def test_discovers_topics(self, mock_client, mock_upsert):
        sns = MagicMock()
        mock_client.return_value = sns
        sns.get_paginator.return_value = _mock_paginator([{
            "Topics": [
                {"TopicArn": "arn:aws:sns:us-east-1:123:my-topic"},
                {"TopicArn": "arn:aws:sns:us-east-1:123:alerts"},
            ]
        }])
        sns.get_topic_attributes.return_value = {
            "Attributes": {"SubscriptionsConfirmed": "3", "SubscriptionsPending": "0"}
        }

        from neoguard.services.discovery.aws_discovery import _discover_sns
        count = await _discover_sns(_make_account(), "us-east-1", "default")
        assert count == 2
        assert mock_upsert.call_count == 2
        resource = mock_upsert.call_args_list[0][0][1]
        assert resource.resource_type == ResourceType.SNS
        assert resource.name == "my-topic"


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverCloudFront:
    async def test_discovers_distributions(self, mock_client, mock_upsert):
        cf = MagicMock()
        mock_client.return_value = cf
        cf.get_paginator.return_value = _mock_paginator([{
            "DistributionList": {
                "Items": [{
                    "Id": "E1ABC",
                    "DomainName": "d1.cloudfront.net",
                    "Comment": "My CDN",
                    "Status": "Deployed",
                    "Enabled": True,
                    "PriceClass": "PriceClass_100",
                    "ARN": "arn:aws:cloudfront::123:distribution/E1ABC",
                }]
            }
        }])

        from neoguard.services.discovery.aws_discovery import _discover_cloudfront
        count = await _discover_cloudfront(_make_account(), "us-east-1", "default")
        assert count == 1
        resource = mock_upsert.call_args[0][1]
        assert resource.resource_type == ResourceType.CLOUDFRONT
        assert resource.region == "global"
        assert resource.external_id == "E1ABC"

    async def test_skips_non_primary_region(self, mock_client, mock_upsert):
        from neoguard.services.discovery.aws_discovery import _discover_cloudfront
        count = await _discover_cloudfront(_make_account(), "eu-west-1", "default")
        assert count == 0
        mock_upsert.assert_not_called()


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverAPIGateway:
    async def test_discovers_apis(self, mock_client, mock_upsert):
        apigw = MagicMock()
        mock_client.return_value = apigw
        apigw.get_paginator.return_value = _mock_paginator([{
            "items": [{
                "id": "abc123",
                "name": "my-api",
                "description": "My REST API",
                "createdDate": "2026-01-01",
                "endpointConfiguration": {"types": ["REGIONAL"]},
            }]
        }])

        from neoguard.services.discovery.aws_discovery import _discover_api_gateway
        count = await _discover_api_gateway(_make_account(), "us-east-1", "default")
        assert count == 1
        resource = mock_upsert.call_args[0][1]
        assert resource.resource_type == ResourceType.API_GATEWAY
        assert resource.name == "my-api"


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverKinesis:
    async def test_discovers_streams(self, mock_client, mock_upsert):
        kinesis = MagicMock()
        mock_client.return_value = kinesis
        kinesis.get_paginator.return_value = _mock_paginator([{
            "StreamNames": ["events-stream", "logs-stream"]
        }])
        kinesis.describe_stream_summary.return_value = {
            "StreamDescriptionSummary": {
                "StreamStatus": "ACTIVE",
                "OpenShardCount": 4,
                "RetentionPeriodHours": 48,
                "StreamARN": "arn:aws:kinesis:us-east-1:123:stream/events-stream",
            }
        }

        from neoguard.services.discovery.aws_discovery import _discover_kinesis
        count = await _discover_kinesis(_make_account(), "us-east-1", "default")
        assert count == 2


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverRedshift:
    async def test_discovers_clusters(self, mock_client, mock_upsert):
        rs = MagicMock()
        mock_client.return_value = rs
        rs.get_paginator.return_value = _mock_paginator([{
            "Clusters": [{
                "ClusterIdentifier": "my-cluster",
                "ClusterStatus": "available",
                "NodeType": "dc2.large",
                "NumberOfNodes": 2,
                "DBName": "mydb",
                "Endpoint": {
                    "Address": "my-cluster.abc.us-east-1.redshift.amazonaws.com",
                    "Port": 5439,
                },
                "VpcId": "vpc-123",
                "Encrypted": True,
            }]
        }])

        from neoguard.services.discovery.aws_discovery import _discover_redshift
        count = await _discover_redshift(_make_account(), "us-east-1", "default")
        assert count == 1
        resource = mock_upsert.call_args[0][1]
        assert resource.resource_type == ResourceType.REDSHIFT
        assert resource.status == ResourceStatus.ACTIVE


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverOpenSearch:
    async def test_discovers_domains(self, mock_client, mock_upsert):
        es = MagicMock()
        mock_client.return_value = es
        es.list_domain_names.return_value = {
            "DomainNames": [{"DomainName": "my-domain"}]
        }
        es.describe_domains.return_value = {
            "DomainStatusList": [{
                "DomainName": "my-domain",
                "EngineVersion": "OpenSearch_2.5",
                "ClusterConfig": {"InstanceType": "r6g.large.search", "InstanceCount": 3},
                "Endpoint": "search-my-domain.us-east-1.es.amazonaws.com",
                "ARN": "arn:aws:es:us-east-1:123:domain/my-domain",
            }]
        }

        from neoguard.services.discovery.aws_discovery import _discover_opensearch
        count = await _discover_opensearch(_make_account(), "us-east-1", "default")
        assert count == 1
        resource = mock_upsert.call_args[0][1]
        assert resource.resource_type == ResourceType.OPENSEARCH


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverStepFunctions:
    async def test_discovers_state_machines(self, mock_client, mock_upsert):
        sfn = MagicMock()
        mock_client.return_value = sfn
        sfn.get_paginator.return_value = _mock_paginator([{
            "stateMachines": [{
                "stateMachineArn": "arn:aws:states:us-east-1:123:stateMachine:my-workflow",
                "name": "my-workflow",
                "type": "STANDARD",
                "creationDate": "2026-01-01",
            }]
        }])

        from neoguard.services.discovery.aws_discovery import _discover_step_functions
        count = await _discover_step_functions(_make_account(), "us-east-1", "default")
        assert count == 1
        resource = mock_upsert.call_args[0][1]
        assert resource.resource_type == ResourceType.STEP_FUNCTIONS


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverNATGateway:
    async def test_discovers_nat_gateways(self, mock_client, mock_upsert):
        ec2 = MagicMock()
        mock_client.return_value = ec2
        ec2.get_paginator.return_value = _mock_paginator([{
            "NatGateways": [{
                "NatGatewayId": "nat-abc123",
                "State": "available",
                "VpcId": "vpc-123",
                "SubnetId": "subnet-456",
                "Tags": [{"Key": "Name", "Value": "main-nat"}],
                "ConnectivityType": "public",
            }]
        }])

        from neoguard.services.discovery.aws_discovery import _discover_nat_gateway
        count = await _discover_nat_gateway(_make_account(), "us-east-1", "default")
        assert count == 1
        resource = mock_upsert.call_args[0][1]
        assert resource.resource_type == ResourceType.NAT_GATEWAY
        assert resource.name == "main-nat"
        assert resource.status == ResourceStatus.ACTIVE


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverRoute53:
    async def test_discovers_hosted_zones(self, mock_client, mock_upsert):
        r53 = MagicMock()
        mock_client.return_value = r53
        r53.get_paginator.return_value = _mock_paginator([{
            "HostedZones": [{
                "Id": "/hostedzone/Z12345",
                "Name": "example.com.",
                "ResourceRecordSetCount": 42,
                "Config": {"PrivateZone": False, "Comment": "Primary zone"},
            }]
        }])

        from neoguard.services.discovery.aws_discovery import _discover_route53
        count = await _discover_route53(_make_account(), "us-east-1", "default")
        assert count == 1
        resource = mock_upsert.call_args[0][1]
        assert resource.resource_type == ResourceType.ROUTE53
        assert resource.name == "example.com"
        assert resource.region == "global"

    async def test_skips_non_primary_region(self, mock_client, mock_upsert):
        from neoguard.services.discovery.aws_discovery import _discover_route53
        count = await _discover_route53(_make_account(), "eu-west-1", "default")
        assert count == 0
        mock_upsert.assert_not_called()


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverEFS:
    async def test_discovers_file_systems(self, mock_client, mock_upsert):
        efs = MagicMock()
        mock_client.return_value = efs
        efs.get_paginator.return_value = _mock_paginator([{
            "FileSystems": [{
                "FileSystemId": "fs-abc123",
                "Tags": [{"Key": "Name", "Value": "shared-data"}],
                "SizeInBytes": {"Value": 1073741824},
                "PerformanceMode": "generalPurpose",
                "ThroughputMode": "bursting",
                "Encrypted": True,
                "LifeCycleState": "available",
                "FileSystemArn": "arn:aws:elasticfilesystem:us-east-1:123:file-system/fs-abc123",
            }]
        }])

        from neoguard.services.discovery.aws_discovery import _discover_efs
        count = await _discover_efs(_make_account(), "us-east-1", "default")
        assert count == 1
        resource = mock_upsert.call_args[0][1]
        assert resource.resource_type == ResourceType.EFS
        assert resource.name == "shared-data"


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverFSx:
    async def test_discovers_file_systems(self, mock_client, mock_upsert):
        fsx = MagicMock()
        mock_client.return_value = fsx
        fsx.get_paginator.return_value = _mock_paginator([{
            "FileSystems": [{
                "FileSystemId": "fs-fsx001",
                "FileSystemType": "LUSTRE",
                "Lifecycle": "AVAILABLE",
                "StorageCapacity": 1200,
                "StorageType": "SSD",
                "DNSName": "fs-fsx001.fsx.us-east-1.amazonaws.com",
                "ResourceARN": "arn:aws:fsx:us-east-1:123:file-system/fs-fsx001",
                "Tags": [{"Key": "Name", "Value": "hpc-scratch"}],
            }]
        }])

        from neoguard.services.discovery.aws_discovery import _discover_fsx
        count = await _discover_fsx(_make_account(), "us-east-1", "default")
        assert count == 1
        resource = mock_upsert.call_args[0][1]
        assert resource.resource_type == ResourceType.FSX
        assert resource.status == ResourceStatus.ACTIVE


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverELB:
    async def test_discovers_classic_lbs(self, mock_client, mock_upsert):
        elb = MagicMock()
        mock_client.return_value = elb
        elb.get_paginator.return_value = _mock_paginator([{
            "LoadBalancerDescriptions": [{
                "LoadBalancerName": "classic-lb",
                "DNSName": "classic-lb-123.us-east-1.elb.amazonaws.com",
                "Scheme": "internet-facing",
                "VPCId": "vpc-123",
                "Instances": [{"InstanceId": "i-1"}, {"InstanceId": "i-2"}],
                "ListenerDescriptions": [{}],
                "CreatedTime": "2026-01-01",
            }]
        }])

        from neoguard.services.discovery.aws_discovery import _discover_elb
        count = await _discover_elb(_make_account(), "us-east-1", "default")
        assert count == 1
        resource = mock_upsert.call_args[0][1]
        assert resource.resource_type == ResourceType.ELB


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverEKS:
    async def test_discovers_clusters(self, mock_client, mock_upsert):
        eks = MagicMock()
        mock_client.return_value = eks
        eks.get_paginator.return_value = _mock_paginator([{
            "clusters": ["prod-cluster"]
        }])
        eks.describe_cluster.return_value = {
            "cluster": {
                "name": "prod-cluster",
                "version": "1.28",
                "platformVersion": "eks.1",
                "endpoint": "https://ABC.gr7.us-east-1.eks.amazonaws.com",
                "roleArn": "arn:aws:iam::123:role/eks-role",
                "arn": "arn:aws:eks:us-east-1:123:cluster/prod-cluster",
                "status": "ACTIVE",
                "tags": {"team": "platform"},
            }
        }

        from neoguard.services.discovery.aws_discovery import _discover_eks
        count = await _discover_eks(_make_account(), "us-east-1", "default")
        assert count == 1
        resource = mock_upsert.call_args[0][1]
        assert resource.resource_type == ResourceType.EKS
        assert resource.status == ResourceStatus.ACTIVE
        assert resource.tags == {"team": "platform"}


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverAurora:
    async def test_discovers_clusters(self, mock_client, mock_upsert):
        rds = MagicMock()
        mock_client.return_value = rds
        rds.get_paginator.return_value = _mock_paginator([{
            "DBClusters": [{
                "DBClusterIdentifier": "aurora-prod",
                "Status": "available",
                "Engine": "aurora-mysql",
                "EngineVersion": "8.0.mysql_aurora.3.03.1",
                "Endpoint": "aurora-prod.cluster-abc.us-east-1.rds.amazonaws.com",
                "ReaderEndpoint": "aurora-prod.cluster-ro-abc.us-east-1.rds.amazonaws.com",
                "Port": 3306,
                "MultiAZ": True,
                "DBClusterMembers": [{"DBInstanceIdentifier": "aurora-prod-1"}],
                "DBClusterArn": "arn:aws:rds:us-east-1:123:cluster:aurora-prod",
                "TagList": [{"Key": "env", "Value": "production"}],
            }]
        }])

        from neoguard.services.discovery.aws_discovery import _discover_aurora
        count = await _discover_aurora(_make_account(), "us-east-1", "default")
        assert count == 1
        resource = mock_upsert.call_args[0][1]
        assert resource.resource_type == ResourceType.AURORA
        assert resource.status == ResourceStatus.ACTIVE
        assert resource.tags == {"env": "production"}


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverVPN:
    async def test_discovers_vpn_connections(self, mock_client, mock_upsert):
        ec2 = MagicMock()
        mock_client.return_value = ec2
        ec2.describe_vpn_connections.return_value = {
            "VpnConnections": [{
                "VpnConnectionId": "vpn-abc123",
                "State": "available",
                "Type": "ipsec.1",
                "CustomerGatewayId": "cgw-111",
                "VpnGatewayId": "vgw-222",
                "Tags": [{"Key": "Name", "Value": "office-vpn"}],
            }]
        }

        from neoguard.services.discovery.aws_discovery import _discover_vpn
        count = await _discover_vpn(_make_account(), "us-east-1", "default")
        assert count == 1
        resource = mock_upsert.call_args[0][1]
        assert resource.resource_type == ResourceType.VPN
        assert resource.name == "office-vpn"
        assert resource.status == ResourceStatus.ACTIVE


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverECS:
    async def test_discovers_clusters_and_services(self, mock_client, mock_upsert):
        ecs = MagicMock()
        mock_client.return_value = ecs
        ecs.list_clusters.return_value = {
            "clusterArns": ["arn:aws:ecs:us-east-1:123:cluster/prod"]
        }
        ecs.describe_clusters.return_value = {
            "clusters": [{
                "clusterArn": "arn:aws:ecs:us-east-1:123:cluster/prod",
                "clusterName": "prod",
                "status": "ACTIVE",
                "registeredContainerInstancesCount": 3,
                "activeServicesCount": 2,
                "runningTasksCount": 5,
                "pendingTasksCount": 0,
                "statistics": [
                    {"name": "runningEC2TasksCount", "value": "2"},
                    {"name": "runningFargateTasksCount", "value": "3"},
                ],
                "capacityProviders": ["FARGATE", "FARGATE_SPOT"],
                "tags": [{"key": "env", "value": "production"}],
            }]
        }
        ecs.get_paginator.return_value = _mock_paginator([{
            "serviceArns": ["arn:aws:ecs:us-east-1:123:service/prod/api"]
        }])
        ecs.describe_services.return_value = {
            "services": [{
                "serviceName": "api",
                "serviceArn": "arn:aws:ecs:us-east-1:123:service/prod/api",
                "desiredCount": 3,
                "runningCount": 3,
                "pendingCount": 0,
                "launchType": "FARGATE",
                "platformVersion": "1.4.0",
                "taskDefinition": "arn:aws:ecs:us-east-1:123:task-definition/api:42",
                "deployments": [
                    {"status": "PRIMARY", "rolloutState": "COMPLETED"},
                ],
                "healthCheckGracePeriodSeconds": 60,
                "schedulingStrategy": "REPLICA",
                "tags": [{"key": "team", "value": "backend"}],
            }]
        }

        from neoguard.services.discovery.aws_discovery import _discover_ecs
        count = await _discover_ecs(_make_account(), "us-east-1", "default")

        assert count == 2  # 1 cluster + 1 service
        assert mock_upsert.call_count == 2

        cluster_resource = mock_upsert.call_args_list[0][0][1]
        assert cluster_resource.resource_type == ResourceType.ECS_CLUSTER
        assert cluster_resource.name == "prod"
        meta = cluster_resource.metadata
        assert meta["running_tasks"] == 5
        assert meta["running_fargate_tasks"] == 3
        assert meta["capacity_providers"] == ["FARGATE", "FARGATE_SPOT"]

        svc_resource = mock_upsert.call_args_list[1][0][1]
        assert svc_resource.resource_type == ResourceType.ECS_SERVICE
        assert svc_resource.name == "api"
        svc_meta = svc_resource.metadata
        assert svc_meta["desired_count"] == 3
        assert svc_meta["deployment_count"] == 1
        assert svc_meta["primary_deployment_status"] == "COMPLETED"
        assert svc_meta["health_check_grace_sec"] == 60
        assert svc_meta["task_definition"].endswith("api:42")

    async def test_empty_clusters(self, mock_client, mock_upsert):
        ecs = MagicMock()
        mock_client.return_value = ecs
        ecs.list_clusters.return_value = {"clusterArns": []}

        from neoguard.services.discovery.aws_discovery import _discover_ecs
        count = await _discover_ecs(_make_account(), "us-east-1", "default")

        assert count == 0
        mock_upsert.assert_not_called()
        ecs.describe_clusters.assert_not_called()


@patch("neoguard.services.discovery.aws_discovery.upsert_resource", new_callable=AsyncMock)
@patch("neoguard.services.discovery.aws_discovery.get_client")
class TestDiscoverAll:
    async def test_runs_all_discoverers(self, mock_client, mock_upsert):
        client = MagicMock()
        mock_client.return_value = client
        client.get_paginator.return_value = _mock_paginator([])
        client.list_queues.return_value = {"QueueUrls": []}
        client.list_clusters.return_value = {"clusterArns": []}
        client.list_buckets.return_value = {"Buckets": []}
        client.list_domain_names.return_value = {"DomainNames": []}
        client.describe_vpn_connections.return_value = {"VpnConnections": []}

        account = _make_account()
        results = await discover_all(account, "us-east-1", "default")

        assert len(results) == 25
        for name in _DISCOVERERS:
            assert name in results

    async def test_handles_individual_failure(self, mock_client, mock_upsert):
        client = MagicMock()
        mock_client.return_value = client
        client.get_paginator.side_effect = Exception("AWS error")
        client.list_queues.side_effect = Exception("AWS error")
        client.list_clusters.side_effect = Exception("AWS error")
        client.list_buckets.side_effect = Exception("AWS error")
        client.list_domain_names.side_effect = Exception("AWS error")
        client.describe_vpn_connections.side_effect = Exception("AWS error")

        account = _make_account()
        results = await discover_all(account, "us-east-1", "default")

        assert len(results) == 25
        for name in _DISCOVERERS:
            assert results[name] == -1

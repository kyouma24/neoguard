from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class Provider(StrEnum):
    AWS = "aws"
    LOCAL = "local"
    GCP = "gcp"
    AZURE = "azure"


class ResourceStatus(StrEnum):
    ACTIVE = "active"
    STOPPED = "stopped"
    TERMINATED = "terminated"
    UNKNOWN = "unknown"


class ResourceType(StrEnum):
    SERVER = "server"
    EC2 = "ec2"
    EBS = "ebs"
    RDS = "rds"
    AURORA = "aurora"
    LAMBDA = "lambda"
    ELB = "elb"
    ALB = "alb"
    NLB = "nlb"
    ECS_SERVICE = "ecs_service"
    ECS_CLUSTER = "ecs_cluster"
    EKS = "eks"
    DYNAMODB = "dynamodb"
    S3 = "s3"
    SQS = "sqs"
    SNS = "sns"
    ELASTICACHE = "elasticache"
    CLOUDFRONT = "cloudfront"
    API_GATEWAY = "api_gateway"
    KINESIS = "kinesis"
    REDSHIFT = "redshift"
    OPENSEARCH = "opensearch"
    STEP_FUNCTIONS = "step_functions"
    NAT_GATEWAY = "nat_gateway"
    VPN = "vpn"
    ROUTE53 = "route53"
    EFS = "efs"
    FSX = "fsx"
    # Azure resource types
    AZURE_VM = "azure_vm"
    AZURE_DISK = "azure_disk"
    AZURE_SQL = "azure_sql"
    AZURE_FUNCTION = "azure_function"
    AZURE_APP_SERVICE = "azure_app_service"
    AZURE_AKS = "azure_aks"
    AZURE_STORAGE = "azure_storage"
    AZURE_LB = "azure_lb"
    AZURE_APP_GW = "azure_app_gw"
    AZURE_COSMOSDB = "azure_cosmosdb"
    AZURE_REDIS = "azure_redis"
    AZURE_VNET = "azure_vnet"
    AZURE_NSG = "azure_nsg"
    AZURE_DNS_ZONE = "azure_dns_zone"
    AZURE_KEY_VAULT = "azure_key_vault"


class ResourceCreate(BaseModel):
    resource_type: ResourceType
    provider: Provider
    region: str = ""
    account_id: str = ""
    name: str = Field(..., min_length=1, max_length=512)
    external_id: str = ""
    tags: dict[str, str] = Field(default_factory=dict)
    metadata: dict = Field(default_factory=dict)
    status: ResourceStatus = ResourceStatus.ACTIVE


class ResourceUpdate(BaseModel):
    name: str | None = None
    tags: dict[str, str] | None = None
    metadata: dict | None = None
    status: ResourceStatus | None = None


class Resource(BaseModel):
    id: str
    tenant_id: str
    resource_type: ResourceType
    provider: Provider
    region: str
    account_id: str
    name: str
    external_id: str
    tags: dict[str, str]
    metadata: dict
    status: ResourceStatus
    last_seen_at: datetime | None
    created_at: datetime
    updated_at: datetime

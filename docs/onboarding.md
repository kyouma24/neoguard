# NeoGuard Cloud Account Onboarding

> **Version**: 1.0  
> **Last Updated**: 2026-05-04  
> **Status**: Complete (laptop demo)  
> **Authors**: NeoGuard Engineering

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [User Flow](#3-user-flow)
4. [Security Design](#4-security-design)
5. [Backend Implementation](#5-backend-implementation)
6. [Frontend Implementation](#6-frontend-implementation)
7. [Cloud Templates](#7-cloud-templates)
8. [API Reference](#8-api-reference)
9. [Role-Based Access Control](#9-role-based-access-control)
10. [Supported Regions and Services](#10-supported-regions-and-services)
11. [Test Coverage](#11-test-coverage)
12. [File Inventory](#12-file-inventory)
13. [Deployment Notes](#13-deployment-notes)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Overview

The onboarding system provides a guided, wizard-based experience for connecting AWS and Azure cloud accounts to the NeoGuard monitoring platform. It handles the full lifecycle from credential generation through verification, resource discovery, and account creation.

### Goals

- **Zero-friction setup**: An admin can go from "no cloud accounts" to "monitoring live resources" in under 5 minutes.
- **Security-first**: Read-only access only. Confused-deputy prevention via cryptographic external IDs. No customer write permissions ever granted.
- **Multi-cloud**: Unified wizard flow for both AWS (IAM role + CloudFormation) and Azure (service principal + ARM template).
- **Role-gated**: Only admins and above can add cloud accounts. Viewers see a grayed-out button with guidance.

### Scope

| Capability | Status |
|---|---|
| AWS account onboarding via CloudFormation | Complete |
| Azure subscription onboarding via ARM template | Complete |
| Cryptographic external ID generation | Complete |
| Per-service permission verification | Complete |
| Multi-region resource discovery preview | Complete |
| Region and service selection | Complete |
| Role-based access gating | Complete |
| Frontend 6-step wizard | Complete |
| Backend API (6 endpoints) | Complete |
| Unit and component tests (217+) | Complete |

---

## 2. Architecture

### System Diagram

```
                     +---------------------------+
                     |   InfrastructurePage       |
                     |  "Add Cloud Account" btn   |
                     +------------+--------------+
                                  |
                     +------------v--------------+
                     |  CloudAccountWizard        |
                     |  (6-step modal dialog)     |
                     +----+-------+-------+------+
                          |       |       |
              +-----------+  +----+----+  +-----------+
              v              v          v              v
     api.onboarding   api.onboarding  api.onboarding  api.aws /
     .generateId()    .verifyAws()    .discoverPrev()  api.azure
              |              |          |              .createAccount()
              v              v          v               |
     +--------+-------+-----+----------+------+        |
     |        FastAPI /api/v1/onboarding/*     |        |
     +---+--------+--------+--------+---------+        |
         |        |        |        |                   |
         v        v        v        v                   v
   external_id  verify   verify   discover         Account
   .generate()  _aws()   _azure() _aws_preview()   Persistence
         |        |        |        |
         |   +----v--------v--------v----+
         |   | AWS STS AssumeRole        |
         |   | -> service probes (7 AWS) |
         |   | Azure ClientSecret auth   |
         |   | -> service probes (4 Az)  |
         |   +---------------------------+
         |
    HMAC-SHA256
    double-random
    construction
```

### Component Responsibilities

| Component | Layer | Responsibility |
|---|---|---|
| `CloudAccountWizard.tsx` | Frontend | 6-step wizard UI, state management, API calls, validation |
| `InfrastructurePage.tsx` | Frontend | Entry point, "Add Cloud Account" button, role-based gating |
| `api.onboarding` | Frontend | Typed API client with 6 methods |
| `onboarding.py` (routes) | Backend | 6 REST endpoints, Pydantic validation, auth enforcement |
| `external_id.py` | Backend | Cryptographic external ID generation |
| `verify.py` | Backend | AWS/Azure credential verification and resource discovery |
| `neoguard-monitoring-role.yaml` | Infra | CloudFormation template for AWS IAM role |
| `neoguard-monitoring-role.json` | Infra | ARM template for Azure Reader role assignment |

---

## 3. User Flow

The onboarding wizard guides administrators through a 6-step process.

### Step-by-Step Walkthrough

#### Step 1: Provider Selection

The user selects their cloud provider (AWS or Azure). Each card shows the services available for monitoring:

- **AWS**: EC2, RDS, Lambda, S3, DynamoDB, and more
- **Azure**: VMs, SQL, Functions, AKS, Storage, and more

#### Step 2: Account Details

The user provides:

- **Account Name** (required): A human-readable label (e.g., "Production AWS", "Staging Azure"). Max 256 characters.
- **Environment Tag** (optional): One of `production`, `staging`, `development`, `testing`, `sandbox`, or no tag.

On clicking Continue, the backend generates a cryptographic external ID.

#### Step 3: Deploy Template

This step displays the generated credentials and guides the user to deploy the appropriate cloud template:

**For AWS:**
1. The wizard shows the **External ID** and **NeoGuard Account ID** (271547278517) with copy-to-clipboard buttons.
2. A link opens the CloudFormation Stack creation page pre-loaded with the NeoGuard template.
3. The user deploys the stack in their AWS Console, then copies the **Role ARN** from the stack outputs back into the wizard.

**For Azure:**
1. The wizard shows the **External ID** with a copy button.
2. A link opens the ARM template deployment page in the Azure Portal.
3. The user enters four credential fields: **Azure Tenant ID**, **Application (Client) ID**, **Client Secret**, and **Subscription ID**.

#### Step 4: Verification Results

NeoGuard verifies the connection by:

1. **AWS**: Assuming the IAM role via STS, then probing 7 service APIs (EC2, RDS, Lambda, DynamoDB, S3, ELB, CloudWatch).
2. **Azure**: Authenticating the service principal, then probing Resource Groups, Virtual Machines, SQL Databases, and Storage Accounts.

Each service displays a green checkmark or red X indicating whether NeoGuard has the necessary permissions.

#### Step 5: Region and Service Selection

The wizard presents:

- **Regions**: Checkboxes for all supported regions, with "Select All / Deselect All" toggle. For AWS, regions where resources were discovered during preview are pre-selected and annotated with resource counts.
- **Services**: Checkboxes for all monitorable services, with "Select All / Deselect All" toggle. All services are pre-selected by default.

The "Add Account" button is disabled until at least one region and one service are selected.

#### Step 6: Success Confirmation

Displays a confirmation message with the account name and environment tag. Offers two actions:

- **View Infrastructure**: Navigates to the Infrastructure page (triggers `onSuccess` callback)
- **Add Another Account**: Resets the wizard to Step 1

### Flow Diagram

```
[Provider Selection] -> [Account Details] -> [Deploy Template] -> [Verification]
                                                                       |
                                                                       v
                            [Success] <-- [Create Account] <-- [Region/Service Selection]
```

---

## 4. Security Design

### Confused Deputy Prevention

The external ID mechanism prevents the [confused deputy problem](https://docs.aws.amazon.com/IAM/latest/UserGuide/confused-deputy.html), where an attacker could trick NeoGuard into assuming a role in their own account to access a victim's resources.

### External ID Generation

```
Algorithm: HMAC-SHA256 with double-random construction
Input:     HMAC-SHA256(key=32_random_bytes, msg=tenant_id|timestamp_ns|32_random_bytes)
Output:    ng-<first 40 hex chars of digest>  (160-bit effective entropy)
```

Properties:

| Property | Guarantee |
|---|---|
| Entropy | 160 bits (40 hex characters) |
| Predictability | Unpredictable even if tenant_id and approximate timestamp are known |
| Collision resistance | 2^80 birthday bound (effectively zero for any practical workload) |
| Format | `ng-` prefix + 40 lowercase hex characters (43 chars total) |
| Determinism | Non-deterministic (fresh OS-level randomness per call) |

The double-random construction uses two independent 32-byte OS-level random values (one as the HMAC key, one as part of the payload), ensuring that compromise of any single input does not reveal the output.

### Principle of Least Privilege

All cloud templates grant **read-only** permissions:

- **AWS**: No `Create*`, `Delete*`, `Put*`, `Update*`, or `Modify*` actions. Only `Describe*`, `List*`, `Get*`.
- **Azure**: Reader role only (GUID `acdd72a7-3385-48ef-bd42-f606fba81ae7`). No write or delete capabilities.

### Authentication and Authorization

| Endpoint | Auth Required | Scope Required |
|---|---|---|
| `POST /generate-external-id` | Yes | `admin` |
| `POST /verify-aws` | Yes | `admin` |
| `POST /discover-preview` | Yes | `admin` |
| `POST /verify-azure` | Yes | `admin` |
| `GET /regions` | Yes | Any (read) |
| `GET /services` | Yes | Any (read) |

All mutating onboarding operations require `admin` scope. The `regions` and `services` endpoints are read-only reference data.

### Input Validation

All request bodies are validated by Pydantic v2 models with strict constraints:

| Field | Validation |
|---|---|
| `role_arn` | Min 20 chars, max 2,048 chars |
| `external_id` | Min 5 chars, max 256 chars |
| `regions` | Min 1 item, max 30 items |
| `azure_tenant_id` | UUID format regex: `^[0-9a-f-]{36}$` |
| `subscription_id` | UUID format regex: `^[0-9a-f-]{36}$` |
| `client_id` | Min 1 char |
| `client_secret` | Min 1 char |

### Credential Handling

- **AWS Role ARN**: Not a secret; identifies the role. Stored server-side for ongoing metric collection.
- **Azure Client Secret**: Transmitted over HTTPS. Stored server-side for ongoing authentication. Never exposed to non-admin users or in API responses after initial submission.
- **External ID**: Generated server-side, displayed to the admin for CloudFormation deployment. Stored alongside the cloud account configuration.
- **STS Session Credentials**: Temporary (900-second duration), never persisted, used only during verification and discovery.

---

## 5. Backend Implementation

### Module: `src/neoguard/services/onboarding/external_id.py`

**Purpose**: Generates cryptographically secure external IDs for AWS trust policies and Azure role assignments.

**Function**: `generate_external_id(tenant_id: str) -> str`

- Uses `os.urandom(32)` for both the HMAC key and the nonce (64 bytes of OS-level entropy total)
- Incorporates `time.time_ns()` as an additional uniqueness factor
- Returns format: `ng-<40 hex chars>`

### Module: `src/neoguard/services/onboarding/verify.py`

**Purpose**: Cloud credential verification and lightweight resource discovery.

Contains three functions:

#### `verify_aws_role(role_arn, external_id, region) -> dict`

1. Calls `sts:AssumeRole` with the provided role ARN and external ID (900-second session).
2. Extracts the AWS account ID from the assumed role ARN.
3. Probes 7 AWS services using the temporary credentials:

| Service Key | AWS Client | API Call | Label |
|---|---|---|---|
| `ec2` | `ec2` | `describe_instances(MaxResults=5)` | EC2 Instances |
| `rds` | `rds` | `describe_db_instances(MaxRecords=20)` | RDS Databases |
| `lambda` | `lambda` | `list_functions(MaxItems=10)` | Lambda Functions |
| `dynamodb` | `dynamodb` | `list_tables(Limit=10)` | DynamoDB Tables |
| `s3` | `s3` | `list_buckets()` | S3 Buckets |
| `elb` | `elbv2` | `describe_load_balancers(PageSize=10)` | Load Balancers |
| `cloudwatch` | `cloudwatch` | `list_metrics(RecentlyActive="PT3H")` | CloudWatch Metrics |

Each probe returns `{ok: bool, label: str, error: str | None}`.

**Boto3 configuration**: Adaptive retry (2 max attempts), 8-second connect timeout, 15-second read timeout.

**Error handling**:
- `AccessDenied`: Returns hint about external ID mismatch.
- `MalformedPolicyDocument`: Returns hint about trust policy configuration.
- Other `ClientError`: Returns error code and message.
- Per-service `AccessDeniedException`/`UnauthorizedAccess`/`AccessDenied`: Marks that service as missing permission.
- Unexpected exceptions: Truncated to 200 characters.

#### `discover_aws_preview(role_arn, external_id, regions) -> dict`

Lightweight multi-region scan that counts resources without persisting anything:

1. Assumes the IAM role once (us-east-1).
2. Iterates through each requested region, counting: EC2 instances, RDS databases, Lambda functions, DynamoDB tables, S3 buckets (us-east-1 only, since S3 is global), and ELB load balancers.
3. Returns per-region counts and totals.

Service exceptions are silently ignored per-service (a failing probe does not block other services or regions).

#### `verify_azure_sp(azure_tenant_id, client_id, client_secret, subscription_id) -> dict`

1. Authenticates via `ClientSecretCredential`.
2. Lists Resource Groups as the initial verification step.
3. Probes three additional services: Virtual Machines (`ComputeManagementClient`), SQL Databases (`SqlManagementClient`), Storage Accounts (`StorageManagementClient`).
4. Returns per-service status with resource counts on success.

Azure SDK imports are deferred (`from ... import` inside the function body) so that the module can be loaded even when Azure SDK packages are not installed.

### Module: `src/neoguard/api/routes/onboarding.py`

**Purpose**: FastAPI router with 6 endpoints under `/api/v1/onboarding`.

Key implementation details:

- All verification and discovery calls are wrapped in `asyncio.to_thread()` because the underlying boto3/Azure SDK clients are synchronous. This prevents blocking the FastAPI event loop.
- The `tenant_id` is extracted from the authenticated session via `get_tenant_id_required()` and passed to `generate_external_id()`.
- Template URLs point to the S3 bucket `neoguard-config-bucket`.

---

## 6. Frontend Implementation

### Component: `CloudAccountWizard.tsx`

**Location**: `frontend/src/components/onboarding/CloudAccountWizard.tsx` (808 lines)

A modal dialog component implementing a 6-step wizard with the following architecture:

#### State Management

All wizard state is held in a single `WizardState` interface:

```typescript
interface WizardState {
  provider: "aws" | "azure" | null;
  accountName: string;
  envTag: string;
  externalId: string;
  cftUrl: string;
  armUrl: string;
  neoguardAccountId: string;
  roleArn: string;                 // AWS
  azureTenantId: string;           // Azure
  clientId: string;                // Azure
  clientSecret: string;            // Azure
  subscriptionId: string;          // Azure
  verifyResult: VerifyAWSResponse | VerifyAzureResponse | null;
  discoveryResult: DiscoverPreviewResponse | null;
  selectedRegions: Set<string>;
  selectedServices: Set<string>;
}
```

#### Props

| Prop | Type | Description |
|---|---|---|
| `onClose` | `() => void` | Called when wizard is cancelled or overlay is clicked |
| `onSuccess` | `() => void` | Called when the user clicks "View Infrastructure" after success |

#### Key Behaviors

- **Escape key dismissal**: Global keydown listener closes the wizard on Escape.
- **Overlay click dismissal**: Clicking outside the wizard container closes it. Click propagation inside the container is stopped.
- **Copy to clipboard**: External ID and NeoGuard Account ID have one-click copy buttons with 2-second visual feedback.
- **Environment tag options**: No tag (skip), Production, Staging, Development, Testing, Sandbox.
- **Pre-selection logic**: After discovery preview, regions containing resources are automatically selected. All services are pre-selected by default.
- **Select All / Deselect All**: Toggle buttons for both regions and services.
- **Loading states**: Spinner icons on buttons during async operations. Buttons disabled during loading.
- **Error display**: Dismissible error banner at the top of the wizard body.
- **Reset**: "Add Another Account" resets all state to initial values and returns to Step 1.

#### Data Fetching

Two reference data calls are made on mount via `useApi`:

- `api.onboarding.regions()` -- fetches supported AWS and Azure regions
- `api.onboarding.services()` -- fetches monitorable service lists

#### Accessibility

- Dialog has `role="dialog"`, `aria-modal="true"`, and `aria-label="Add Cloud Account"`.
- Close button has `aria-label="Close wizard"`.
- Progress steps use semantic markup with active/complete states.
- All form inputs have associated `<label>` elements with `htmlFor`.

### Integration: `InfrastructurePage.tsx`

The Infrastructure page integrates the wizard via:

1. **"Add Cloud Account" button**: Renders in the accounts grid view header.
2. **Role-based visibility**:
   - Admin/Owner/SuperAdmin: Fully functional button.
   - Viewer/Member: Button rendered at 50% opacity with `cursor: not-allowed`. A tooltip reads "Reach out to your Admin or NeoGuard team".
3. **Wizard state**: `showWizard` boolean state controls modal visibility. `wizardKey` counter forces remount on success.
4. **Success handler**: Increments `wizardKey` to refresh the accounts grid, then closes the wizard.

### TypeScript Types

Nine interfaces defined in `frontend/src/types/index.ts`:

| Interface | Purpose |
|---|---|
| `GenerateExternalIdResponse` | Response from external ID generation |
| `VerifyAWSRequest` | Request body for AWS verification |
| `VerifyAWSResponse` | AWS verification result with per-service status |
| `DiscoverPreviewRequest` | Request body for multi-region discovery |
| `DiscoverPreviewResponse` | Discovery counts per region and service |
| `VerifyAzureRequest` | Request body for Azure verification |
| `VerifyAzureResponse` | Azure verification result with per-service status |
| `AvailableRegionsResponse` | Lists of supported AWS and Azure regions |
| `AvailableServicesResponse` | Lists of monitorable services with IDs and labels |

### API Client

Six methods in the `api.onboarding` namespace in `frontend/src/services/api.ts`:

| Method | HTTP | Endpoint |
|---|---|---|
| `generateExternalId()` | POST | `/onboarding/generate-external-id` |
| `verifyAws(data)` | POST | `/onboarding/verify-aws` |
| `discoverPreview(data)` | POST | `/onboarding/discover-preview` |
| `verifyAzure(data)` | POST | `/onboarding/verify-azure` |
| `regions()` | GET | `/onboarding/regions` |
| `services()` | GET | `/onboarding/services` |

---

## 7. Cloud Templates

### AWS CloudFormation Template

**File**: `templates/neoguard-monitoring-role.yaml`

**What it creates**: An IAM role named `NeoGuardMonitoringRole` with read-only permissions.

#### Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `ExternalId` | String | (required) | The external ID from NeoGuard onboarding (5-256 chars) |
| `NeoGuardAccountId` | String | `271547278517` | NeoGuard platform AWS account ID |

#### Trust Policy

The role can only be assumed by the NeoGuard AWS account (`271547278517`) and only when the correct `ExternalId` is provided via the `sts:ExternalId` condition.

#### IAM Permissions (10 Policy Statements)

| Sid | Actions | Purpose |
|---|---|---|
| `CloudWatchRead` | `cloudwatch:GetMetricData`, `GetMetricStatistics`, `ListMetrics`, `DescribeAlarms` | Metric collection |
| `EC2Read` | `ec2:DescribeInstances`, `DescribeVolumes`, `DescribeRegions`, `DescribeSecurityGroups`, `DescribeSubnets`, `DescribeVpcs`, `DescribeNatGateways`, `DescribeAddresses` | EC2 discovery |
| `RDSRead` | `rds:DescribeDBInstances`, `DescribeDBClusters`, `ListTagsForResource` | RDS discovery |
| `LambdaRead` | `lambda:ListFunctions`, `GetFunction`, `ListTags` | Lambda discovery |
| `DynamoDBRead` | `dynamodb:ListTables`, `DescribeTable`, `ListTagsOfResource` | DynamoDB discovery |
| `S3List` | `s3:ListAllMyBuckets`, `GetBucketLocation`, `GetBucketTagging` | S3 bucket listing (no object access) |
| `ELBRead` | `elasticloadbalancing:DescribeLoadBalancers`, `DescribeTargetGroups`, `DescribeTargetHealth`, `DescribeTags` | ELB discovery |
| `Route53Read` | `route53:ListHostedZones`, `ListResourceRecordSets` | DNS discovery |
| `TagRead` | `tag:GetResources`, `GetTagKeys`, `GetTagValues` | Tag-based resource discovery |
| `STSRead` | `sts:GetCallerIdentity` | Identity verification |

#### Outputs

| Output | Description |
|---|---|
| `RoleArn` | ARN of the created role -- user pastes this into NeoGuard |
| `ExternalId` | Echo of the external ID used |

#### Tags

The role is tagged with `ManagedBy: NeoGuard` and `Purpose: CloudMonitoring`.

### Azure ARM Template

**File**: `templates/neoguard-monitoring-role.json`

**What it creates**: A Reader role assignment for the NeoGuard service principal at the subscription level.

#### Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `servicePrincipalObjectId` | String | (required) | Object ID of the NeoGuard SP in the customer's Azure AD |
| `roleDefinitionId` | String | `acdd72a7-3385-48ef-bd42-f606fba81ae7` | Built-in Reader role GUID |

#### Outputs

| Output | Description |
|---|---|
| `roleAssignmentId` | GUID of the created role assignment |
| `assignedRole` | `Reader` |

---

## 8. API Reference

All endpoints are under the base path `/api/v1/onboarding`.

### POST /generate-external-id

Generates a cryptographic external ID for use in cloud trust policies.

**Authentication**: Required (session cookie or API key)  
**Authorization**: `admin` scope  
**Tenant**: Required (extracted from session)

**Request Body**: None

**Response** (`200 OK`):

```json
{
  "external_id": "ng-a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
  "cft_template_url": "https://neoguard-config-bucket.s3.amazonaws.com/templates/neoguard-monitoring-role.yaml",
  "arm_template_url": "https://neoguard-config-bucket.s3.amazonaws.com/templates/neoguard-monitoring-role.json",
  "cft_console_url": "https://console.aws.amazon.com/cloudformation/home#/stacks/quickcreate?templateURL=...&stackName=NeoGuardMonitoringRole&param_ExternalId=ng-...&param_NeoGuardAccountId=271547278517",
  "arm_portal_url": "https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2F...",
  "neoguard_account_id": "271547278517"
}
```

| Field | Type | Description |
|---|---|---|
| `external_id` | string | 43-character external ID (`ng-` + 40 hex chars) |
| `cft_template_url` | string | Raw S3 URL to the CloudFormation template (for inspection) |
| `arm_template_url` | string | Raw S3 URL to the ARM template (for inspection) |
| `cft_console_url` | string | AWS CloudFormation Console quick-create URL with all parameters pre-filled. Opens the user's AWS Console — they just click "Create stack". |
| `arm_portal_url` | string | Azure Portal custom template deployment URL. Opens the Azure Portal with the template pre-loaded. |
| `neoguard_account_id` | string | NeoGuard's AWS account ID for the trust policy |

> **Important**: The frontend uses `cft_console_url` and `arm_portal_url` for the deploy link — never the raw S3 URLs. Raw S3 URLs require public-read access on the bucket objects and would show an XML error page if accessed directly.

---

### POST /verify-aws

Verifies an AWS IAM role by attempting STS AssumeRole and probing per-service permissions.

**Authentication**: Required  
**Authorization**: `admin` scope  
**Tenant**: Required

**Request Body**:

```json
{
  "role_arn": "arn:aws:iam::123456789012:role/NeoGuardMonitoringRole",
  "external_id": "ng-a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
  "region": "us-east-1"
}
```

| Field | Type | Required | Validation | Default |
|---|---|---|---|---|
| `role_arn` | string | Yes | 20-2048 chars | -- |
| `external_id` | string | Yes | 5-256 chars | -- |
| `region` | string | No | -- | `us-east-1` |

**Response** (`200 OK`):

```json
{
  "success": true,
  "account_id": "123456789012",
  "role_arn": "arn:aws:iam::123456789012:role/NeoGuardMonitoringRole",
  "services": {
    "ec2": { "ok": true, "label": "EC2 Instances", "error": null },
    "rds": { "ok": true, "label": "RDS Databases", "error": null },
    "lambda": { "ok": true, "label": "Lambda Functions", "error": null },
    "dynamodb": { "ok": true, "label": "DynamoDB Tables", "error": null },
    "s3": { "ok": true, "label": "S3 Buckets", "error": null },
    "elb": { "ok": true, "label": "Load Balancers", "error": null },
    "cloudwatch": { "ok": true, "label": "CloudWatch Metrics", "error": null }
  },
  "error": null
}
```

**Error response** (role assumption failed):

```json
{
  "success": false,
  "account_id": null,
  "role_arn": "arn:aws:iam::123456789012:role/NeoGuardMonitoringRole",
  "services": {},
  "error": "Cannot assume the role. Verify the trust policy includes the correct external ID: ng-..."
}
```

---

### POST /discover-preview

Performs a lightweight multi-region resource count using the assumed IAM role. Does not persist any data.

**Authentication**: Required  
**Authorization**: `admin` scope  
**Tenant**: Required

**Request Body**:

```json
{
  "role_arn": "arn:aws:iam::123456789012:role/NeoGuardMonitoringRole",
  "external_id": "ng-a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
  "regions": ["us-east-1", "ap-south-1", "eu-west-1"]
}
```

| Field | Type | Required | Validation |
|---|---|---|---|
| `role_arn` | string | Yes | 20-2048 chars |
| `external_id` | string | Yes | 5-256 chars |
| `regions` | string[] | Yes | 1-30 items |

**Response** (`200 OK`):

```json
{
  "success": true,
  "regions": {
    "us-east-1": {
      "services": { "ec2": 12, "rds": 3, "s3": 47, "lambda": 8 },
      "total": 70
    },
    "ap-south-1": {
      "services": { "ec2": 5, "rds": 1 },
      "total": 6
    },
    "eu-west-1": {
      "services": {},
      "total": 0
    }
  },
  "totals": {
    "resources": 76,
    "regions_with_resources": 2
  },
  "error": null
}
```

Notes:
- S3 buckets are only counted in `us-east-1` (S3 is a global service).
- Regions with zero resources still appear in the response with `total: 0`.
- Service probe failures are silently ignored; only successfully counted resources appear.

---

### POST /verify-azure

Verifies Azure service principal credentials and probes per-service permissions.

**Authentication**: Required  
**Authorization**: `admin` scope  
**Tenant**: Required

**Request Body**:

```json
{
  "azure_tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "client_id": "12345678-abcd-ef01-2345-678901234567",
  "client_secret": "your-client-secret-value",
  "subscription_id": "abcdef01-2345-6789-abcd-ef0123456789"
}
```

| Field | Type | Required | Validation |
|---|---|---|---|
| `azure_tenant_id` | string | Yes | UUID format (`^[0-9a-f-]{36}$`) |
| `client_id` | string | Yes | Min 1 char |
| `client_secret` | string | Yes | Min 1 char |
| `subscription_id` | string | Yes | UUID format (`^[0-9a-f-]{36}$`) |

**Response** (`200 OK`):

```json
{
  "success": true,
  "subscription_id": "abcdef01-2345-6789-abcd-ef0123456789",
  "services": {
    "resource_groups": { "ok": true, "label": "Resource Groups", "count": 5 },
    "virtual_machines": { "ok": true, "label": "Virtual Machines", "count": 12 },
    "sql_databases": { "ok": true, "label": "SQL Databases", "count": 3 },
    "storage_accounts": { "ok": true, "label": "Storage Accounts", "count": 8 }
  },
  "error": null
}
```

**Error response** (invalid credentials):

```json
{
  "success": false,
  "subscription_id": "abcdef01-2345-6789-abcd-ef0123456789",
  "services": {},
  "error": "Invalid credentials. Check tenant ID, client ID, and client secret."
}
```

---

### GET /regions

Returns the list of supported regions for both AWS and Azure.

**Authentication**: Required  
**Authorization**: Any scope (read-only reference data)

**Response** (`200 OK`):

```json
{
  "aws": [
    "ap-south-1",
    "ap-southeast-1",
    "ap-southeast-2",
    "ap-northeast-1",
    "us-east-1",
    "us-east-2",
    "us-west-2",
    "eu-west-1",
    "eu-central-1"
  ],
  "azure": [
    "centralindia",
    "southindia",
    "westindia",
    "southeastasia",
    "eastasia",
    "japaneast",
    "australiaeast",
    "eastus",
    "eastus2",
    "westus2",
    "centralus",
    "westeurope",
    "northeurope",
    "uksouth"
  ]
}
```

---

### GET /services

Returns the list of monitorable services for both AWS and Azure, with human-readable labels.

**Authentication**: Required  
**Authorization**: Any scope (read-only reference data)

**Response** (`200 OK`):

```json
{
  "aws": [
    { "id": "ec2", "label": "EC2 Instances" },
    { "id": "rds", "label": "RDS Databases" },
    { "id": "lambda", "label": "Lambda Functions" },
    { "id": "dynamodb", "label": "DynamoDB Tables" },
    { "id": "s3", "label": "S3 Buckets" },
    { "id": "elb", "label": "Load Balancers (ALB/NLB)" },
    { "id": "ebs", "label": "EBS Volumes" },
    { "id": "nat_gateway", "label": "NAT Gateways" },
    { "id": "route53", "label": "Route 53 Hosted Zones" }
  ],
  "azure": [
    { "id": "virtual_machines", "label": "Virtual Machines" },
    { "id": "sql_databases", "label": "SQL Databases" },
    { "id": "functions", "label": "Azure Functions" },
    { "id": "storage_accounts", "label": "Storage Accounts" },
    { "id": "load_balancers", "label": "Load Balancers" },
    { "id": "cosmos_db", "label": "Cosmos DB" },
    { "id": "redis_cache", "label": "Azure Cache for Redis" },
    { "id": "app_services", "label": "App Services" },
    { "id": "aks", "label": "AKS Clusters" },
    { "id": "key_vault", "label": "Key Vaults" },
    { "id": "nsg", "label": "Network Security Groups" },
    { "id": "vnet", "label": "Virtual Networks" },
    { "id": "dns_zones", "label": "DNS Zones" },
    { "id": "disks", "label": "Managed Disks" },
    { "id": "app_gateway", "label": "Application Gateways" }
  ]
}
```

---

## 9. Role-Based Access Control

### Access Matrix

| Role | See "Add Cloud Account" button | Click button | Add accounts | View accounts |
|---|---|---|---|---|
| **SuperAdmin** | Yes | Yes | Yes (any tenant) | Yes (all tenants) |
| **Admin** | Yes | Yes | Yes (own tenant) | Yes (own tenant) |
| **Owner** | Yes | Yes | Yes (own tenant) | Yes (own tenant) |
| **Member** | Yes (grayed out) | No | No | Yes (own tenant) |
| **Viewer** | Yes (grayed out) | No | No | Yes (own tenant) |

### Frontend Implementation

The `InfrastructurePage` checks the user's role via the `useAuth` context:

- **Admin/Owner/SuperAdmin**: Button rendered normally. Clicking opens the `CloudAccountWizard` modal.
- **Member/Viewer**: Button rendered with `opacity: 0.5` and `cursor: not-allowed`. A tooltip is displayed: *"Reach out to your Admin or NeoGuard team"*.

### Backend Enforcement

All mutating onboarding endpoints use `require_scope("admin")` as a FastAPI dependency. This is enforced server-side regardless of frontend behavior, returning HTTP 403 for insufficient permissions.

---

## 10. Supported Regions and Services

### AWS Regions (9)

| Region Code | Location |
|---|---|
| `ap-south-1` | Mumbai, India |
| `ap-southeast-1` | Singapore |
| `ap-southeast-2` | Sydney, Australia |
| `ap-northeast-1` | Tokyo, Japan |
| `us-east-1` | N. Virginia, USA (global default) |
| `us-east-2` | Ohio, USA |
| `us-west-2` | Oregon, USA |
| `eu-west-1` | Ireland |
| `eu-central-1` | Frankfurt, Germany |

### Azure Regions (14)

| Region Code | Location |
|---|---|
| `centralindia` | Pune, India |
| `southindia` | Chennai, India |
| `westindia` | Mumbai, India |
| `southeastasia` | Singapore |
| `eastasia` | Hong Kong |
| `japaneast` | Tokyo, Japan |
| `australiaeast` | Sydney, Australia |
| `eastus` | Virginia, USA |
| `eastus2` | Virginia, USA |
| `westus2` | Washington, USA |
| `centralus` | Iowa, USA |
| `westeurope` | Netherlands |
| `northeurope` | Ireland |
| `uksouth` | London, UK |

### AWS Monitorable Services (9)

| ID | Label |
|---|---|
| `ec2` | EC2 Instances |
| `rds` | RDS Databases |
| `lambda` | Lambda Functions |
| `dynamodb` | DynamoDB Tables |
| `s3` | S3 Buckets |
| `elb` | Load Balancers (ALB/NLB) |
| `ebs` | EBS Volumes |
| `nat_gateway` | NAT Gateways |
| `route53` | Route 53 Hosted Zones |

### Azure Monitorable Services (15)

| ID | Label |
|---|---|
| `virtual_machines` | Virtual Machines |
| `sql_databases` | SQL Databases |
| `functions` | Azure Functions |
| `storage_accounts` | Storage Accounts |
| `load_balancers` | Load Balancers |
| `cosmos_db` | Cosmos DB |
| `redis_cache` | Azure Cache for Redis |
| `app_services` | App Services |
| `aks` | AKS Clusters |
| `key_vault` | Key Vaults |
| `nsg` | Network Security Groups |
| `vnet` | Virtual Networks |
| `dns_zones` | DNS Zones |
| `disks` | Managed Disks |
| `app_gateway` | Application Gateways |

---

## 11. Test Coverage

### Summary

| Category | File | Tests | Lines |
|---|---|---|---|
| Backend: External ID | `tests/unit/test_onboarding_external_id.py` | 18 | 122 |
| Backend: Verify & Discover | `tests/unit/test_onboarding_verify.py` | 40 | 1,247 |
| Backend: Routes | `tests/unit/test_onboarding_routes.py` | 53 | 656 |
| Frontend: Wizard Component | `frontend/src/components/onboarding/CloudAccountWizard.test.tsx` | 76 | 948 |
| **Total** | **4 test files** | **187** | **2,973** |

### Backend Test Breakdown

#### External ID Tests (18 tests)

- Format validation: prefix, length (43 chars), hex portion validity, regex match
- Uniqueness: same tenant produces different IDs, different tenants produce different IDs, 100 and 1,000 IDs all unique
- Edge cases: empty tenant ID, long tenant ID (10,000 chars), Unicode, special characters, newlines, null bytes, UUID-style tenant ID
- Security: tenant ID does not appear in output (plaintext or hex-encoded), output is lowercase hex only

#### Verify and Discover Tests (40 tests)

**AWS Role Verification (17 tests):**
- Success path: returns `success: true`, extracts account ID from ARN, probes all 7 services, service labels match config
- Credential handling: external ID passed to STS, empty external ID omitted, session uses assumed credentials
- Error handling: AccessDenied with hint, MalformedPolicyDocument, unknown ClientError, unexpected exceptions
- Per-service errors: AccessDeniedException, UnauthorizedAccess, non-access ClientError, truncation to 200 chars, mixed results
- Edge cases: account ID None when ARN too short, result key validation

**AWS Discovery Preview (12 tests):**
- Success path: returns counts per region and service, totals summed correctly
- S3 handling: only counted in us-east-1
- Edge cases: region with zero resources still appears, STS failure, unexpected errors
- Fault tolerance: service exceptions silently ignored, partial failures count survivors
- Multi-region: counts aggregated across regions, empty regions list handled

**Azure SP Verification (11 tests):**
- Success path: returns Resource Groups with count, all 4 probes run
- Auth errors: ImportError (SDK not installed), AADSTS error, unauthorized, generic auth failure, long error truncation
- Probe failures: VM probe failure returns `ok: false`, error messages truncated to 200 chars
- Result structure: correct keys on ImportError vs success

#### Route Tests (53 tests)

**Pydantic Validation (17 tests):**
- VerifyAWSRequest: role ARN min/max length, external ID min/max length, region default and custom
- DiscoverPreviewRequest: empty regions rejected, max 30 regions, boundary values
- VerifyAzureRequest: UUID format validation (tenant ID, subscription ID), uppercase UUIDs rejected, empty fields rejected
- Response models: default values, nullable fields

**Endpoint Logic (14 tests):**
- Regions: returns both AWS and Azure lists, includes expected regions, counts match source
- Services: returns 9 AWS and 15 Azure services, entries have id and label, includes expected services

**Integration (4 tests):**
- Template URL validation: S3 bucket, HTTPS scheme

**Route Handler (18 tests):**
- Generate External ID: 200 response, rejects read scope
- List Regions: 200 with correct structure
- List Services: 200 with correct structure
- Verify AWS: returns result, rejects short role ARN, rejects read scope
- Discover Preview: returns result, rejects empty regions
- Verify Azure: returns result, rejects invalid tenant UUID, rejects read scope

### Frontend Test Breakdown (76 tests)

**Initial Render (5 tests):** Dialog structure, ARIA attributes, progress labels, close button

**Escape/Overlay (4 tests):** Escape key, overlay click, container click isolation, X button

**Step 1 - Provider Selection (8 tests):** Heading, cards, service details, disabled Continue, selection class, enabled Continue, navigation, Cancel

**Step 2 - Account Details (8 tests):** Heading, provider-specific text, disabled Continue, input, env tag options, enabled Continue, API call on Continue, error handling, Back navigation

**Step 3 - Deploy Template AWS (11 tests):** Heading, external ID display, account ID display, copy buttons, clipboard write, deploy link, Role ARN input, verify call, empty ARN error, verify failure, success navigation, Back button

**Step 3 - Deploy Template Azure (5 tests):** ARM heading, credential fields, no Account ID shown, deploy link, empty fields error, verify call

**Step 4 - Verification Results (5 tests):** Heading, account ID, service status display, error text, Discover button, Back button

**Step 5 - Region/Service Selection (9 tests):** Heading, discovery totals, region checkboxes, service checkboxes, pre-selection, count badges, Select All toggle, region toggle, service toggle, disabled button

**Step 6 - Success (5 tests):** Heading, account name, View Infrastructure callback, reset wizard, no footer

**Error Handling (2 tests):** Dismissible errors, non-Error object handling

**Full Flow (1 test):** End-to-end 6-step AWS wizard flow

---

## 12. File Inventory

### Backend Files

| File | Lines | Description |
|---|---|---|
| `src/neoguard/services/onboarding/__init__.py` | -- | Package init |
| `src/neoguard/services/onboarding/external_id.py` | 31 | Cryptographic external ID generator (HMAC-SHA256) |
| `src/neoguard/services/onboarding/verify.py` | 376 | AWS role verification, discovery preview, Azure SP verification |
| `src/neoguard/api/routes/onboarding.py` | 207 | 6 API endpoints with Pydantic models |
| `src/neoguard/core/regions.py` | 63 | Default region lists for AWS (9), Azure (14), GCP (13) |

### Frontend Files

| File | Lines | Description |
|---|---|---|
| `frontend/src/components/onboarding/CloudAccountWizard.tsx` | 808 | 6-step wizard modal component |
| `frontend/src/pages/InfrastructurePage.tsx` | -- | Updated with Add Cloud Account button and role gating |
| `frontend/src/services/api.ts` | -- | Updated with `api.onboarding` namespace (6 methods) |
| `frontend/src/types/index.ts` | -- | Updated with 9 onboarding type interfaces |

### Cloud Templates

| File | Description |
|---|---|
| `templates/neoguard-monitoring-role.yaml` | AWS CloudFormation template (IAM role, 10 policy statements) |
| `templates/neoguard-monitoring-role.json` | Azure ARM template (Reader role assignment) |

### Test Files

| File | Lines | Tests | Description |
|---|---|---|---|
| `tests/unit/test_onboarding_external_id.py` | 122 | 18 | External ID format, uniqueness, edge cases, security |
| `tests/unit/test_onboarding_verify.py` | 1,247 | 40 | AWS/Azure verification and discovery (mocked boto3/Azure SDK) |
| `tests/unit/test_onboarding_routes.py` | 656 | 53 | Pydantic validation, endpoint logic, auth enforcement |
| `frontend/src/components/onboarding/CloudAccountWizard.test.tsx` | 948 | 76 | Component rendering, navigation, API mocking, accessibility |

---

## 13. Deployment Notes

### S3 Bucket Configuration

The CloudFormation and ARM templates must be hosted on S3 for the wizard's deploy links to work:

- **Bucket**: `neoguard-config-bucket`
- **CFT path**: `templates/neoguard-monitoring-role.yaml`
- **ARM path**: `templates/neoguard-monitoring-role.json`
- **Full CFT URL**: `https://neoguard-config-bucket.s3.amazonaws.com/templates/neoguard-monitoring-role.yaml`
- **Full ARM URL**: `https://neoguard-config-bucket.s3.amazonaws.com/templates/neoguard-monitoring-role.json`

The bucket must have public read access enabled for the template files (customers need to download/inspect them before deploying).

### NeoGuard AWS Account

- **Account ID**: `271547278517`
- This account ID is hardcoded in the CloudFormation template's trust policy and in the API response.
- If deploying NeoGuard from a different AWS account, update:
  1. `NeoGuardAccountId` default in `templates/neoguard-monitoring-role.yaml`
  2. `neoguard_account_id` field in `GenerateExternalIdResponse` model in `src/neoguard/api/routes/onboarding.py`

### Template Upload

```bash
# Upload templates to S3
aws s3 cp templates/neoguard-monitoring-role.yaml \
  s3://neoguard-config-bucket/templates/neoguard-monitoring-role.yaml \
  --content-type "application/x-yaml"

aws s3 cp templates/neoguard-monitoring-role.json \
  s3://neoguard-config-bucket/templates/neoguard-monitoring-role.json \
  --content-type "application/json"
```

### Environment Dependencies

| Dependency | Required For | Notes |
|---|---|---|
| `boto3` | AWS verification and discovery | Already in backend requirements |
| `azure-identity` | Azure SP authentication | Optional; ImportError handled gracefully |
| `azure-mgmt-resource` | Azure Resource Group listing | Optional |
| `azure-mgmt-compute` | Azure VM probe | Optional |
| `azure-mgmt-sql` | Azure SQL probe | Optional |
| `azure-mgmt-storage` | Azure Storage probe | Optional |

Azure SDK packages are imported lazily inside function bodies. If not installed, the Azure verification endpoint returns a clear "Azure SDK not installed" error rather than crashing.

---

## 14. Troubleshooting

### Common Issues

#### "Cannot assume the role" error

**Cause**: The IAM role's trust policy does not match the external ID or NeoGuard account ID.

**Resolution**:
1. Verify the CloudFormation stack deployed successfully (check Events tab for errors).
2. Confirm the External ID in the trust policy matches the one shown in the wizard.
3. Confirm the NeoGuard Account ID in the trust policy is `271547278517`.
4. Check that the stack was deployed in the correct AWS account.

#### "Missing permission for [service]" in verification results

**Cause**: The IAM role does not have the required read permissions for that specific service.

**Resolution**:
1. If using the NeoGuard CFT template, all permissions should be present. Check that the stack completed without errors.
2. If using a custom policy, compare against the permissions listed in Section 7.
3. Some services may require the region to be enabled (e.g., opt-in regions like ap-south-2).

#### "Invalid credentials" for Azure

**Cause**: One or more of the Azure credential fields is incorrect.

**Resolution**:
1. Verify the Tenant ID matches your Azure AD directory.
2. Verify the Client ID matches the App Registration's Application (client) ID.
3. Verify the Client Secret has not expired.
4. Verify the Subscription ID is correct and the service principal has Reader access.

#### "Azure SDK not installed" error

**Cause**: The Azure SDK packages are not installed in the backend environment.

**Resolution**:
```bash
pip install azure-identity azure-mgmt-resource azure-mgmt-compute azure-mgmt-sql azure-mgmt-storage
```

#### Wizard button grayed out for non-admin users

**Expected behavior**: Only users with Admin, Owner, or SuperAdmin roles can add cloud accounts. Members and Viewers see the button at reduced opacity with a tooltip directing them to contact an administrator.

#### Discovery preview shows zero resources

**Possible causes**:
1. Resources exist in regions not included in the default list (9 AWS, 14 Azure).
2. The IAM role lacks permissions for specific services.
3. Resources were recently created and may not yet be visible via the API.

**Resolution**: Verify that your resources exist in the regions listed in Section 10. If they are in other regions, those regions will need to be added to the region configuration.

#### STS session timeout during discovery

**Cause**: The discovery preview scans multiple regions sequentially. For accounts with many regions, the 900-second STS session may expire.

**Resolution**: The 30-region maximum on the `regions` field prevents excessively long scans. If this occurs, reduce the number of regions in a single request.

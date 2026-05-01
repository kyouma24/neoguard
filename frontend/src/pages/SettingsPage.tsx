import { useState, useMemo } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Cloud,
  Copy,
  Edit2,
  ExternalLink,
  Eye,
  EyeOff,
  Key,
  Bell,
  Plus,
  Power,
  Send,
  Trash2,
  X,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { useApi } from "../hooks/useApi";
import { api } from "../services/api";
import type {
  AWSAccount,
  AzureSubscription,
  NotificationChannel,
  NotificationChannelCreate,
  APIKey,
  APIKeyCreate,
  APIKeyCreated,
} from "../types";

type SettingsTab = "cloud" | "notifications" | "apikeys";

// ─── AWS default regions (matches backend core/regions.py) ────────────────
const AWS_REGIONS: { code: string; name: string }[] = [
  { code: "ap-south-1", name: "Mumbai" },
  { code: "ap-southeast-1", name: "Singapore" },
  { code: "ap-southeast-2", name: "Sydney" },
  { code: "ap-northeast-1", name: "Tokyo" },
  { code: "us-east-1", name: "N. Virginia" },
  { code: "us-east-2", name: "Ohio" },
  { code: "us-west-2", name: "Oregon" },
  { code: "eu-west-1", name: "Ireland" },
  { code: "eu-central-1", name: "Frankfurt" },
];

const AZURE_REGIONS: { code: string; name: string }[] = [
  { code: "centralindia", name: "Central India" },
  { code: "southindia", name: "South India" },
  { code: "westindia", name: "West India" },
  { code: "southeastasia", name: "Southeast Asia" },
  { code: "eastasia", name: "East Asia" },
  { code: "japaneast", name: "Japan East" },
  { code: "australiaeast", name: "Australia East" },
  { code: "eastus", name: "East US" },
  { code: "eastus2", name: "East US 2" },
  { code: "westus2", name: "West US 2" },
  { code: "centralus", name: "Central US" },
  { code: "westeurope", name: "West Europe" },
  { code: "northeurope", name: "North Europe" },
  { code: "uksouth", name: "UK South" },
];

const AWS_RESOURCE_TYPES: { key: string; label: string; description: string }[] = [
  { key: "ec2", label: "EC2", description: "Virtual machines" },
  { key: "ebs", label: "EBS", description: "Block storage volumes" },
  { key: "rds", label: "RDS", description: "Relational databases" },
  { key: "aurora", label: "Aurora", description: "MySQL/PostgreSQL clusters" },
  { key: "lambda", label: "Lambda", description: "Serverless functions" },
  { key: "alb", label: "ALB", description: "Application load balancers" },
  { key: "nlb", label: "NLB", description: "Network load balancers" },
  { key: "elb", label: "ELB", description: "Classic load balancers" },
  { key: "ecs_service", label: "ECS Services", description: "Container services" },
  { key: "ecs_cluster", label: "ECS Clusters", description: "Container clusters" },
  { key: "eks", label: "EKS", description: "Kubernetes clusters" },
  { key: "dynamodb", label: "DynamoDB", description: "NoSQL tables" },
  { key: "s3", label: "S3", description: "Object storage buckets" },
  { key: "sqs", label: "SQS", description: "Message queues" },
  { key: "sns", label: "SNS", description: "Notification topics" },
  { key: "elasticache", label: "ElastiCache", description: "Redis/Memcached clusters" },
  { key: "cloudfront", label: "CloudFront", description: "CDN distributions" },
  { key: "api_gateway", label: "API Gateway", description: "REST/HTTP APIs" },
  { key: "kinesis", label: "Kinesis", description: "Data streams" },
  { key: "redshift", label: "Redshift", description: "Data warehouse" },
  { key: "opensearch", label: "OpenSearch", description: "Search & analytics" },
  { key: "step_functions", label: "Step Functions", description: "Workflow orchestration" },
  { key: "nat_gateway", label: "NAT Gateway", description: "NAT gateways" },
  { key: "route53", label: "Route 53", description: "DNS hosted zones" },
  { key: "efs", label: "EFS", description: "File storage" },
  { key: "fsx", label: "FSx", description: "File systems" },
];

const AZURE_RESOURCE_TYPES: { key: string; label: string; description: string }[] = [
  { key: "azure_vm", label: "Virtual Machines", description: "Compute instances" },
  { key: "azure_disk", label: "Managed Disks", description: "Block storage" },
  { key: "azure_sql", label: "SQL Database", description: "SQL servers & databases" },
  { key: "azure_function", label: "Functions", description: "Serverless compute" },
  { key: "azure_app_service", label: "App Service", description: "Web apps & APIs" },
  { key: "azure_aks", label: "AKS", description: "Kubernetes clusters" },
  { key: "azure_storage", label: "Storage", description: "Blob/Queue/Table storage" },
  { key: "azure_lb", label: "Load Balancer", description: "Network load balancers" },
  { key: "azure_app_gw", label: "App Gateway", description: "Application gateway" },
  { key: "azure_cosmosdb", label: "Cosmos DB", description: "Globally distributed DB" },
  { key: "azure_redis", label: "Redis Cache", description: "In-memory cache" },
  { key: "azure_vnet", label: "VNet", description: "Virtual networks" },
  { key: "azure_nsg", label: "NSG", description: "Network security groups" },
  { key: "azure_dns_zone", label: "DNS Zone", description: "DNS management" },
  { key: "azure_key_vault", label: "Key Vault", description: "Secrets management" },
];

function generateExternalId(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  const hex = Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `ng-${hex.slice(0, 8)}-${hex.slice(8, 16)}-${hex.slice(16, 24)}-${hex.slice(24)}`;
}


const CHANNEL_TYPES = [
  { value: "webhook" as const, label: "Webhook", configFields: [{ key: "url", label: "URL", placeholder: "https://example.com/webhook" }] },
  { value: "slack" as const, label: "Slack", configFields: [{ key: "webhook_url", label: "Webhook URL", placeholder: "https://hooks.slack.com/services/..." }] },
  { value: "email" as const, label: "Email", configFields: [
    { key: "smtp_host", label: "SMTP Host", placeholder: "smtp.gmail.com" },
    { key: "smtp_port", label: "SMTP Port", placeholder: "587" },
    { key: "from", label: "From Address", placeholder: "neoguard@example.com" },
    { key: "to", label: "To Address(es)", placeholder: "ops@example.com" },
    { key: "username", label: "Username", placeholder: "user@example.com" },
    { key: "password", label: "Password", placeholder: "app-password" },
  ]},
  { value: "freshdesk" as const, label: "Freshdesk", configFields: [
    { key: "domain", label: "Domain", placeholder: "company.freshdesk.com" },
    { key: "api_key", label: "API Key", placeholder: "your-freshdesk-api-key" },
    { key: "group_id", label: "Group ID (optional)", placeholder: "12345" },
  ]},
];

const SCOPES = ["read", "write", "admin", "platform_admin"];

export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("cloud");

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Settings</h1>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "1px solid var(--border)" }}>
        {([
          { key: "cloud" as const, icon: Cloud, label: "Cloud Accounts" },
          { key: "notifications" as const, icon: Bell, label: "Notification Channels" },
          { key: "apikeys" as const, icon: Key, label: "API Keys" },
        ]).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 20px", fontSize: 14, fontWeight: tab === key ? 600 : 400,
              color: tab === key ? "var(--accent)" : "var(--text-secondary)",
              borderBottom: tab === key ? "2px solid var(--accent)" : "2px solid transparent",
              background: "transparent", border: "none", borderRadius: 0, cursor: "pointer",
            }}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {tab === "cloud" && <CloudAccountsTab />}
      {tab === "notifications" && <NotificationChannelsTab />}
      {tab === "apikeys" && <APIKeysTab />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CLOUD ACCOUNTS TAB
// ═══════════════════════════════════════════════════════════════════════════

function CloudAccountsTab() {
  const [showWizard, setShowWizard] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "aws" | "azure"; id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: awsAccounts, refetch: refetchAWS } = useApi<AWSAccount[]>(() => api.aws.listAccounts(), []);
  const { data: azureSubs, refetch: refetchAzure } = useApi<AzureSubscription[]>(() => api.azure.listSubscriptions(), []);

  const allAccounts: { type: "aws" | "azure"; id: string; name: string; provider: string; detail: string; regions: number; enabled: boolean; lastSync: string | null }[] = [
    ...(awsAccounts ?? []).map((a) => ({
      type: "aws" as const, id: a.id, name: a.name, provider: "AWS",
      detail: `Account ${a.account_id}`, regions: a.regions.length, enabled: a.enabled, lastSync: a.last_sync_at,
    })),
    ...(azureSubs ?? []).map((s) => ({
      type: "azure" as const, id: s.id, name: s.name, provider: "Azure",
      detail: `Subscription ${s.subscription_id.slice(0, 13)}...`, regions: s.regions.length, enabled: s.enabled, lastSync: s.last_sync_at,
    })),
  ];

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    try {
      if (deleteConfirm.type === "aws") {
        await api.aws.deleteAccount(deleteConfirm.id);
        refetchAWS();
      } else {
        await api.azure.deleteSubscription(deleteConfirm.id);
        refetchAzure();
      }
      setDeleteConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleToggle = async (type: "aws" | "azure", id: string, currentEnabled: boolean) => {
    try {
      if (type === "aws") {
        await api.aws.updateAccount(id, { enabled: !currentEnabled });
        refetchAWS();
      } else {
        await api.azure.updateSubscription(id, { enabled: !currentEnabled });
        refetchAzure();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Cloud Accounts</h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
            {allAccounts.length} account{allAccounts.length !== 1 ? "s" : ""} connected
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowWizard(true)}>
          <Plus size={14} /> Add Account
        </button>
      </div>

      {allAccounts.length > 0 ? (
        <div style={{ display: "grid", gap: 12 }}>
          {allAccounts.map((acct) => (
            <div key={`${acct.type}-${acct.id}`} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                  background: acct.type === "aws" ? "rgba(245, 158, 11, 0.1)" : "rgba(59, 130, 246, 0.1)",
                  fontSize: 11, fontWeight: 700, color: acct.type === "aws" ? "#f59e0b" : "#3b82f6",
                }}>
                  {acct.provider}
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{acct.name}</span>
                    <span className={`badge ${acct.enabled ? "badge-success" : "badge-warning"}`}>
                      {acct.enabled ? "Active" : "Disabled"}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", gap: 16 }}>
                    <span>{acct.detail}</span>
                    <span>{acct.regions} region{acct.regions !== 1 ? "s" : ""}</span>
                    {acct.lastSync && <span>Last sync: {format(new Date(acct.lastSync), "MMM dd HH:mm")}</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn" onClick={() => handleToggle(acct.type, acct.id, acct.enabled)} title={acct.enabled ? "Disable" : "Enable"}>
                  <Power size={14} color={acct.enabled ? "var(--success)" : "var(--text-muted)"} />
                </button>
                <button className="btn" onClick={() => setDeleteConfirm({ type: acct.type, id: acct.id, name: acct.name })}>
                  <Trash2 size={14} color="var(--error)" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
          <Cloud size={48} color="var(--text-muted)" style={{ marginBottom: 16, opacity: 0.5 }} />
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No cloud accounts connected</p>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
            Connect your AWS or Azure account to start monitoring your infrastructure
          </p>
          <button className="btn btn-primary" onClick={() => setShowWizard(true)}>
            <Plus size={14} /> Add Your First Account
          </button>
        </div>
      )}

      {showWizard && (
        <OnboardingWizard
          onClose={() => setShowWizard(false)}
          onComplete={() => { setShowWizard(false); refetchAWS(); refetchAzure(); }}
        />
      )}

      {deleteConfirm && (
        <ConfirmModal
          title={`Delete ${deleteConfirm.type === "aws" ? "AWS Account" : "Azure Subscription"}`}
          message={`Are you sure you want to delete "${deleteConfirm.name}"? This will stop all collection. Already-discovered resources will remain.`}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ONBOARDING WIZARD
// ═══════════════════════════════════════════════════════════════════════════

type WizardProvider = "aws" | "azure" | null;

const WIZARD_STEPS = {
  aws: ["Choose Provider", "Account Details", "Deploy IAM Role", "Select Regions", "Select Resources", "Review & Connect"],
  azure: ["Choose Provider", "Subscription Details", "Service Principal", "Select Regions", "Select Resources", "Review & Connect"],
};

function OnboardingWizard({ onClose, onComplete }: { onClose: () => void; onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState<WizardProvider>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AWS state
  const [awsName, setAwsName] = useState("");
  const [awsAccountId, setAwsAccountId] = useState("");
  const [awsExternalId] = useState(() => generateExternalId());
  const [awsRoleArn, setAwsRoleArn] = useState("");
  const [awsCftDeployed, setAwsCftDeployed] = useState(false);
  const [awsRegions, setAwsRegions] = useState<string[]>(AWS_REGIONS.map((r) => r.code));
  const [awsResources, setAwsResources] = useState<string[]>(AWS_RESOURCE_TYPES.map((r) => r.key));

  // Azure state
  const [azureName, setAzureName] = useState("");
  const [azureSubId, setAzureSubId] = useState("");
  const [azureTenantId, setAzureTenantId] = useState("");
  const [azureClientId, setAzureClientId] = useState("");
  const [azureClientSecret, setAzureClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [azureSpCreated, setAzureSpCreated] = useState(false);
  const [azureRegions, setAzureRegions] = useState<string[]>(AZURE_REGIONS.slice(0, 3).map((r) => r.code));
  const [azureResources, setAzureResources] = useState<string[]>(AZURE_RESOURCE_TYPES.map((r) => r.key));

  const steps = provider ? WIZARD_STEPS[provider] : ["Choose Provider"];
  const totalSteps = provider ? steps.length : 1;

  const canGoNext = useMemo(() => {
    if (step === 0) return provider !== null;
    if (!provider) return false;
    if (provider === "aws") {
      if (step === 1) return awsName.length > 0 && awsAccountId.length === 12;
      if (step === 2) return awsCftDeployed && awsRoleArn.length > 0;
      if (step === 3) return awsRegions.length > 0;
      if (step === 4) return awsResources.length > 0;
    } else {
      if (step === 1) return azureName.length > 0 && azureSubId.length > 0 && azureTenantId.length > 0;
      if (step === 2) return azureSpCreated && azureClientId.length > 0 && azureClientSecret.length > 0;
      if (step === 3) return azureRegions.length > 0;
      if (step === 4) return azureResources.length > 0;
    }
    return true;
  }, [step, provider, awsName, awsAccountId, awsCftDeployed, awsRoleArn, awsRegions, awsResources,
      azureName, azureSubId, azureTenantId, azureSpCreated, azureClientId, azureClientSecret, azureRegions, azureResources]);

  const handleFinish = async () => {
    setSaving(true);
    setError(null);
    try {
      if (provider === "aws") {
        await api.aws.createAccount({
          name: awsName,
          account_id: awsAccountId,
          role_arn: awsRoleArn,
          external_id: awsExternalId,
          regions: awsRegions,
        });
      } else {
        await api.azure.createSubscription({
          name: azureName,
          subscription_id: azureSubId,
          tenant_id: azureTenantId,
          client_id: azureClientId,
          client_secret: azureClientSecret,
          regions: azureRegions,
        });
      }
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const cftUrl = provider === "aws"
    ? `https://console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/quickcreate?stackName=NeoGuardCollectorRole&templateURL=https://neoguard-config-bucket.s3.ap-south-1.amazonaws.com/templates/neoguard-collector-role.yaml&param_ExternalId=${awsExternalId}`
    : "";

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--bg-secondary)", borderRadius: 12, width: "100%", maxWidth: 720, maxHeight: "90vh",
        display: "flex", flexDirection: "column", border: "1px solid var(--border)", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>Add Cloud Account</h2>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
              Step {step + 1} of {totalSteps}: {steps[step]}
            </p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
            <X size={18} />
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, background: "var(--bg-tertiary)" }}>
          <div style={{ height: "100%", width: `${((step + 1) / totalSteps) * 100}%`, background: "var(--accent)", transition: "width 0.3s" }} />
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
          {error && <ErrorBanner message={error} onClose={() => setError(null)} />}

          {/* Step 0: Choose Provider */}
          {step === 0 && (
            <div>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24 }}>
                Select your cloud provider to get started. NeoGuard will guide you through setting up
                secure, read-only access to monitor your infrastructure.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <ProviderCard
                  name="Amazon Web Services"
                  shortName="AWS"
                  color="#f59e0b"
                  description="EC2, RDS, Lambda, S3, ECS, EKS, DynamoDB, and 20+ more services"
                  selected={provider === "aws"}
                  onClick={() => setProvider("aws")}
                />
                <ProviderCard
                  name="Microsoft Azure"
                  shortName="Azure"
                  color="#3b82f6"
                  description="Virtual Machines, SQL, Functions, AKS, Storage, Cosmos DB, and 10+ more"
                  selected={provider === "azure"}
                  onClick={() => setProvider("azure")}
                />
              </div>
            </div>
          )}

          {/* AWS Step 1: Account Details */}
          {step === 1 && provider === "aws" && (
            <div>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 20 }}>
                Enter a friendly name and your 12-digit AWS account ID.
              </p>
              <FormField label="Account Name" required>
                <input className="input" value={awsName} onChange={(e) => setAwsName(e.target.value)}
                  placeholder="e.g., Production, Staging, Development" />
              </FormField>
              <FormField label="AWS Account ID" required>
                <input className="input" value={awsAccountId}
                  onChange={(e) => setAwsAccountId(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  placeholder="271547278517" maxLength={12} style={{ fontFamily: "monospace" }} />
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                  Find this in your AWS Console under Account Settings, or run: <code style={{ background: "var(--bg-tertiary)", padding: "1px 4px", borderRadius: 3 }}>aws sts get-caller-identity</code>
                </p>
              </FormField>
            </div>
          )}

          {/* AWS Step 2: Deploy IAM Role */}
          {step === 2 && provider === "aws" && (
            <div>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 20 }}>
                NeoGuard needs a read-only IAM role in your account. Click the button below to deploy
                the CloudFormation stack automatically.
              </p>

              <div className="card" style={{ marginBottom: 20, padding: 20 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>What gets deployed</h4>
                <ul style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 2, paddingLeft: 20 }}>
                  <li>An IAM Role named <code style={{ background: "var(--bg-tertiary)", padding: "1px 4px", borderRadius: 3 }}>NeoGuardCollectorRole</code></li>
                  <li>Read-only access to CloudWatch, EC2, RDS, Lambda, S3, ECS, EKS, and other services</li>
                  <li>Cross-account trust policy secured with a unique External ID</li>
                  <li>No write permissions — NeoGuard cannot modify your resources</li>
                </ul>
              </div>

              <FormField label="Unique External ID (auto-generated, cryptographically secure)">
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="input" value={awsExternalId} readOnly style={{ fontFamily: "monospace", fontSize: 13, background: "var(--bg-tertiary)" }} />
                  <button className="btn" onClick={() => navigator.clipboard.writeText(awsExternalId)} title="Copy">
                    <Copy size={14} />
                  </button>
                </div>
              </FormField>

              <a
                href={cftUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "12px 20px", background: "#f59e0b", color: "#000", borderRadius: 8,
                  fontWeight: 600, fontSize: 14, textDecoration: "none", marginBottom: 20,
                }}
              >
                <ExternalLink size={16} />
                Deploy CloudFormation Stack in AWS Console
              </a>

              <div style={{ background: "var(--bg-tertiary)", borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
                  After the stack creates successfully, come back here and enter the IAM Role ARN
                  from the stack outputs.
                </p>
              </div>

              <FormField label="IAM Role ARN (from CloudFormation stack outputs)" required>
                <input className="input" value={awsRoleArn} onChange={(e) => setAwsRoleArn(e.target.value)}
                  placeholder="arn:aws:iam::271547278517:role/NeoGuardCollectorRole" style={{ fontFamily: "monospace", fontSize: 13 }} />
              </FormField>

              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
                <input type="checkbox" checked={awsCftDeployed} onChange={(e) => setAwsCftDeployed(e.target.checked)} />
                I have deployed the CloudFormation stack and entered the Role ARN
              </label>
            </div>
          )}

          {/* AWS Step 3: Regions */}
          {step === 3 && provider === "aws" && (
            <RegionSelector
              title="Select AWS Regions to Monitor"
              description="NeoGuard will discover and collect metrics from resources in these regions. You can change this later."
              regions={AWS_REGIONS}
              selected={awsRegions}
              onToggle={(code) => setAwsRegions((prev) => prev.includes(code) ? prev.filter((r) => r !== code) : [...prev, code])}
              onSelectAll={() => setAwsRegions(AWS_REGIONS.map((r) => r.code))}
              onClearAll={() => setAwsRegions([])}
            />
          )}

          {/* AWS Step 4: Resources */}
          {step === 4 && provider === "aws" && (
            <ResourceSelector
              title="Select AWS Services to Monitor"
              description="Choose which resource types NeoGuard should discover and collect metrics for."
              resources={AWS_RESOURCE_TYPES}
              selected={awsResources}
              onToggle={(key) => setAwsResources((prev) => prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key])}
              onSelectAll={() => setAwsResources(AWS_RESOURCE_TYPES.map((r) => r.key))}
              onClearAll={() => setAwsResources([])}
            />
          )}

          {/* AWS Step 5: Review */}
          {step === 5 && provider === "aws" && (
            <ReviewStep
              provider="AWS"
              items={[
                { label: "Account Name", value: awsName },
                { label: "Account ID", value: awsAccountId, mono: true },
                { label: "IAM Role ARN", value: awsRoleArn, mono: true },
                { label: "External ID", value: awsExternalId, mono: true },
                { label: "Regions", value: `${awsRegions.length} selected` },
                { label: "Resources", value: `${awsResources.length} of ${AWS_RESOURCE_TYPES.length} types` },
              ]}
            />
          )}

          {/* Azure Step 1: Subscription Details */}
          {step === 1 && provider === "azure" && (
            <div>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 20 }}>
                Enter your Azure subscription details. You can find these in the Azure Portal under Subscriptions.
              </p>
              <FormField label="Friendly Name" required>
                <input className="input" value={azureName} onChange={(e) => setAzureName(e.target.value)}
                  placeholder="e.g., Production, Staging" />
              </FormField>
              <FormField label="Subscription ID" required>
                <input className="input" value={azureSubId} onChange={(e) => setAzureSubId(e.target.value)}
                  placeholder="2fd5b44e-b6cc-4877-bd13-4a8154f814d8" style={{ fontFamily: "monospace", fontSize: 13 }} />
              </FormField>
              <FormField label="Azure Tenant ID (Directory ID)" required>
                <input className="input" value={azureTenantId} onChange={(e) => setAzureTenantId(e.target.value)}
                  placeholder="ae3f91d7-c809-4dc6-a72c-f7b067658ed0" style={{ fontFamily: "monospace", fontSize: 13 }} />
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                  Azure Portal → Microsoft Entra ID → Properties → Tenant ID
                </p>
              </FormField>
            </div>
          )}

          {/* Azure Step 2: Service Principal */}
          {step === 2 && provider === "azure" && (
            <div>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 20 }}>
                NeoGuard needs a Service Principal with Reader access. Follow these steps in the Azure Portal:
              </p>

              <div className="card" style={{ marginBottom: 20, padding: 20 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Setup Instructions</h4>
                <ol style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 2.2, paddingLeft: 20 }}>
                  <li>Go to <strong>Microsoft Entra ID → App registrations → New registration</strong></li>
                  <li>Name it <code style={{ background: "var(--bg-tertiary)", padding: "1px 4px", borderRadius: 3 }}>NeoGuardMonitoring</code>, set supported account types to single tenant</li>
                  <li>After creation, copy the <strong>Application (client) ID</strong></li>
                  <li>Go to <strong>Certificates & secrets → New client secret</strong>, copy the secret value</li>
                  <li>Go to your <strong>Subscription → Access control (IAM) → Add role assignment</strong></li>
                  <li>Assign the <strong>Reader</strong> role to the <code style={{ background: "var(--bg-tertiary)", padding: "1px 4px", borderRadius: 3 }}>NeoGuardMonitoring</code> app</li>
                  <li>Also assign <strong>Monitoring Reader</strong> for Azure Monitor metrics access</li>
                </ol>
              </div>

              <a
                href={`https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "12px 20px", background: "#3b82f6", color: "#fff", borderRadius: 8,
                  fontWeight: 600, fontSize: 14, textDecoration: "none", marginBottom: 20,
                }}
              >
                <ExternalLink size={16} />
                Open Azure App Registrations
              </a>

              <FormField label="Application (Client) ID" required>
                <input className="input" value={azureClientId} onChange={(e) => setAzureClientId(e.target.value)}
                  placeholder="33486acd-8631-4af8-a92b-f54413c1da52" style={{ fontFamily: "monospace", fontSize: 13 }} />
              </FormField>

              <FormField label="Client Secret" required>
                <div style={{ position: "relative" }}>
                  <input className="input" type={showSecret ? "text" : "password"}
                    value={azureClientSecret} onChange={(e) => setAzureClientSecret(e.target.value)}
                    placeholder="Your client secret value" style={{ paddingRight: 36, fontFamily: "monospace", fontSize: 13 }} />
                  <button onClick={() => setShowSecret(!showSecret)}
                    style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                    {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </FormField>

              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 14 }}>
                <input type="checkbox" checked={azureSpCreated} onChange={(e) => setAzureSpCreated(e.target.checked)} />
                I have created the Service Principal and assigned Reader + Monitoring Reader roles
              </label>
            </div>
          )}

          {/* Azure Step 3: Regions */}
          {step === 3 && provider === "azure" && (
            <RegionSelector
              title="Select Azure Regions to Monitor"
              description="NeoGuard will discover and collect metrics from resources in these regions."
              regions={AZURE_REGIONS}
              selected={azureRegions}
              onToggle={(code) => setAzureRegions((prev) => prev.includes(code) ? prev.filter((r) => r !== code) : [...prev, code])}
              onSelectAll={() => setAzureRegions(AZURE_REGIONS.map((r) => r.code))}
              onClearAll={() => setAzureRegions([])}
            />
          )}

          {/* Azure Step 4: Resources */}
          {step === 4 && provider === "azure" && (
            <ResourceSelector
              title="Select Azure Services to Monitor"
              description="Choose which resource types NeoGuard should discover and collect metrics for."
              resources={AZURE_RESOURCE_TYPES}
              selected={azureResources}
              onToggle={(key) => setAzureResources((prev) => prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key])}
              onSelectAll={() => setAzureResources(AZURE_RESOURCE_TYPES.map((r) => r.key))}
              onClearAll={() => setAzureResources([])}
            />
          )}

          {/* Azure Step 5: Review */}
          {step === 5 && provider === "azure" && (
            <ReviewStep
              provider="Azure"
              items={[
                { label: "Account Name", value: azureName },
                { label: "Subscription ID", value: azureSubId, mono: true },
                { label: "Tenant ID", value: azureTenantId, mono: true },
                { label: "Client ID", value: azureClientId, mono: true },
                { label: "Client Secret", value: "••••••••" },
                { label: "Regions", value: `${azureRegions.length} selected` },
                { label: "Resources", value: `${azureResources.length} of ${AZURE_RESOURCE_TYPES.length} types` },
              ]}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 24px", borderTop: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <button className="btn" onClick={step === 0 ? onClose : () => setStep(step - 1)}>
            {step === 0 ? "Cancel" : <><ArrowLeft size={14} /> Back</>}
          </button>
          <div style={{ display: "flex", gap: 4 }}>
            {Array.from({ length: totalSteps }, (_, i) => (
              <div key={i} style={{
                width: 8, height: 8, borderRadius: "50%",
                background: i === step ? "var(--accent)" : i < step ? "var(--success)" : "var(--bg-tertiary)",
                transition: "background 0.2s",
              }} />
            ))}
          </div>
          {step < totalSteps - 1 ? (
            <button className="btn btn-primary" onClick={() => setStep(step + 1)} disabled={!canGoNext}>
              Next <ArrowRight size={14} />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleFinish} disabled={saving}>
              {saving ? "Connecting..." : <><CheckCircle2 size={14} /> Connect Account</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Wizard Sub-Components ────────────────────────────────────────────────

function ProviderCard({ name, shortName, color, description, selected, onClick }: {
  name: string; shortName: string; color: string; description: string; selected: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: 24, borderRadius: 12, border: `2px solid ${selected ? color : "var(--border)"}`,
        background: selected ? `${color}10` : "var(--bg-primary)", cursor: "pointer",
        textAlign: "left", transition: "all 0.15s",
      }}
    >
      <div style={{
        width: 56, height: 56, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
        background: `${color}20`, marginBottom: 16, fontSize: 16, fontWeight: 800, color,
      }}>
        {shortName}
      </div>
      <h4 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: "var(--text-primary)" }}>{name}</h4>
      <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>{description}</p>
      {selected && (
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6, color, fontSize: 13, fontWeight: 600 }}>
          <CheckCircle2 size={16} /> Selected
        </div>
      )}
    </button>
  );
}

function RegionSelector({ title, description, regions, selected, onToggle, onSelectAll, onClearAll }: {
  title: string; description: string; regions: { code: string; name: string }[];
  selected: string[]; onToggle: (code: string) => void; onSelectAll: () => void; onClearAll: () => void;
}) {
  return (
    <div>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>{description}</p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h4 style={{ fontSize: 14, fontWeight: 600 }}>{title}</h4>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={onSelectAll} style={{ fontSize: 12, padding: "4px 10px" }}>Select All</button>
          <button className="btn" onClick={onClearAll} style={{ fontSize: 12, padding: "4px 10px" }}>Clear</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {regions.map((r) => (
          <button
            key={r.code}
            className="btn"
            onClick={() => onToggle(r.code)}
            style={{
              padding: "10px 12px", textAlign: "left", fontSize: 13,
              background: selected.includes(r.code) ? "rgba(99, 91, 255, 0.1)" : "var(--bg-primary)",
              borderColor: selected.includes(r.code) ? "var(--accent)" : "var(--border)",
              color: selected.includes(r.code) ? "var(--accent)" : "var(--text-secondary)",
            }}
          >
            <div style={{ fontWeight: 500 }}>{r.name}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, fontFamily: "monospace" }}>{r.code}</div>
          </button>
        ))}
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
        {selected.length} of {regions.length} regions selected
      </p>
    </div>
  );
}

function ResourceSelector({ title, description, resources, selected, onToggle, onSelectAll, onClearAll }: {
  title: string; description: string; resources: { key: string; label: string; description: string }[];
  selected: string[]; onToggle: (key: string) => void; onSelectAll: () => void; onClearAll: () => void;
}) {
  return (
    <div>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>{description}</p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h4 style={{ fontSize: 14, fontWeight: 600 }}>{title}</h4>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={onSelectAll} style={{ fontSize: 12, padding: "4px 10px" }}>Select All</button>
          <button className="btn" onClick={onClearAll} style={{ fontSize: 12, padding: "4px 10px" }}>Clear</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {resources.map((r) => (
          <button
            key={r.key}
            className="btn"
            onClick={() => onToggle(r.key)}
            style={{
              padding: "10px 12px", textAlign: "left", fontSize: 13,
              background: selected.includes(r.key) ? "rgba(99, 91, 255, 0.1)" : "var(--bg-primary)",
              borderColor: selected.includes(r.key) ? "var(--accent)" : "var(--border)",
              color: selected.includes(r.key) ? "var(--accent)" : "var(--text-secondary)",
            }}
          >
            <div style={{ fontWeight: 500 }}>{r.label}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{r.description}</div>
          </button>
        ))}
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
        {selected.length} of {resources.length} resource types selected
      </p>
    </div>
  );
}

function ReviewStep({ provider, items }: { provider: string; items: { label: string; value: string; mono?: boolean }[] }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <CheckCircle2 size={32} color="var(--success)" />
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Ready to Connect</h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Review your {provider} account configuration before connecting.
          </p>
        </div>
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {items.map((item, i) => (
          <div key={item.label} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 16px", borderBottom: i < items.length - 1 ? "1px solid var(--border)" : "none",
          }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{item.label}</span>
            <span style={{ fontSize: 13, fontWeight: 500, fontFamily: item.mono ? "monospace" : "inherit" }}>{item.value}</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 16, lineHeight: 1.6 }}>
        After connecting, NeoGuard will begin discovering resources and collecting metrics automatically.
        The first discovery run will start within 5 minutes.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATION CHANNELS TAB
// ═══════════════════════════════════════════════════════════════════════════

function NotificationChannelsTab() {
  const [showModal, setShowModal] = useState(false);
  const [editChannel, setEditChannel] = useState<NotificationChannel | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: channels, refetch } = useApi<NotificationChannel[]>(() => api.notifications.listChannels(), []);

  const handleToggle = async (ch: NotificationChannel) => {
    try {
      await api.notifications.updateChannel(ch.id, { enabled: !ch.enabled });
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await api.notifications.deleteChannel(deleteConfirm.id);
      setDeleteConfirm(null);
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const result = await api.notifications.testChannel(id);
      setTestResult({ id, success: result.success });
    } catch {
      setTestResult({ id, success: false });
    } finally {
      setTestingId(null);
    }
  };

  const channelTypeLabel = (type: string) => CHANNEL_TYPES.find((t) => t.value === type)?.label ?? type;

  return (
    <div>
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>Notification Channels</h3>
        <button className="btn btn-primary" onClick={() => { setEditChannel(null); setShowModal(true); }}>
          <Plus size={14} /> Add Channel
        </button>
      </div>

      {channels && channels.length > 0 ? (
        <div style={{ display: "grid", gap: 12 }}>
          {channels.map((ch) => (
            <div key={ch.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{ch.name}</span>
                  <span className="badge" style={{ background: "var(--bg-tertiary)", fontSize: 11 }}>
                    {channelTypeLabel(ch.channel_type)}
                  </span>
                  <span className={`badge ${ch.enabled ? "badge-success" : "badge-warning"}`}>
                    {ch.enabled ? "Enabled" : "Disabled"}
                  </span>
                  {testResult?.id === ch.id && (
                    <span className={`badge ${testResult.success ? "badge-success" : "badge-error"}`}>
                      {testResult.success ? "Test OK" : "Test Failed"}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {ch.channel_type === "webhook" && ch.config.url}
                  {ch.channel_type === "slack" && ch.config.webhook_url?.replace(/\/[^/]+$/, "/***")}
                  {ch.channel_type === "email" && `${ch.config.from ?? ""} → ${ch.config.to ?? ""}`}
                  {ch.channel_type === "freshdesk" && ch.config.domain}
                  <span style={{ marginLeft: 12 }}>
                    Created {format(new Date(ch.created_at), "MMM dd, yyyy")}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="btn"
                  onClick={() => handleTest(ch.id)}
                  disabled={testingId === ch.id}
                  title="Send test notification"
                >
                  <Send size={14} color={testingId === ch.id ? "var(--text-muted)" : "var(--info)"} />
                </button>
                <button className="btn" onClick={() => handleToggle(ch)} title={ch.enabled ? "Disable" : "Enable"}>
                  <Power size={14} color={ch.enabled ? "var(--success)" : "var(--text-muted)"} />
                </button>
                <button className="btn" onClick={() => { setEditChannel(ch); setShowModal(true); }}>
                  <Edit2 size={14} />
                </button>
                <button className="btn" onClick={() => setDeleteConfirm({ id: ch.id, name: ch.name })}>
                  <Trash2 size={14} color="var(--error)" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="No notification channels configured" />
      )}

      {showModal && (
        <NotificationChannelModal
          channel={editChannel}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); refetch(); }}
        />
      )}

      {deleteConfirm && (
        <ConfirmModal
          title="Delete Notification Channel"
          message={`Are you sure you want to delete "${deleteConfirm.name}"? Active alerts will no longer send to this channel.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

// ─── Notification Channel Modal ───────────────────────────────────────────

function NotificationChannelModal({ channel, onClose, onSaved }: { channel: NotificationChannel | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = channel !== null;
  const [name, setName] = useState(channel?.name ?? "");
  const [channelType, setChannelType] = useState<NotificationChannelCreate["channel_type"]>(channel?.channel_type ?? "webhook");
  const [config, setConfig] = useState<Record<string, string>>(channel?.config ?? {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentType = CHANNEL_TYPES.find((t) => t.value === channelType)!;

  const updateConfig = (key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await api.notifications.updateChannel(channel.id, { name, config });
      } else {
        await api.notifications.createChannel({ name, channel_type: channelType, config });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={isEdit ? "Edit Notification Channel" : "Add Notification Channel"} onClose={onClose}>
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}

      <FormField label="Name" required>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Production Slack" />
      </FormField>

      <FormField label="Channel Type" required>
        <select
          className="input"
          value={channelType}
          onChange={(e) => { setChannelType(e.target.value as NotificationChannelCreate["channel_type"]); setConfig({}); }}
          disabled={isEdit}
        >
          {CHANNEL_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </FormField>

      {currentType.configFields.map((field) => (
        <FormField key={field.key} label={field.label} required={!field.label.includes("optional")}>
          <input
            className="input"
            type={field.key === "password" || field.key === "api_key" ? "password" : "text"}
            value={config[field.key] ?? ""}
            onChange={(e) => updateConfig(field.key, e.target.value)}
            placeholder={field.placeholder}
          />
        </FormField>
      ))}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={saving || !name}>
          {saving ? "Saving..." : isEdit ? "Update" : "Create"}
        </button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// API KEYS TAB
// ═══════════════════════════════════════════════════════════════════════════

function APIKeysTab() {
  const [showModal, setShowModal] = useState(false);
  const [newKey, setNewKey] = useState<APIKeyCreated | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: keys, refetch } = useApi<APIKey[]>(() => api.apiKeys.list(), []);

  const handleToggle = async (key: APIKey) => {
    try {
      await api.apiKeys.update(key.id, { enabled: !key.enabled });
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await api.apiKeys.delete(deleteConfirm.id);
      setDeleteConfirm(null);
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleCreated = (created: APIKeyCreated) => {
    setShowModal(false);
    setNewKey(created);
    refetch();
  };

  return (
    <div>
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}

      {/* New key banner — shown once after creation */}
      {newKey && (
        <div
          style={{
            background: "rgba(34, 197, 94, 0.1)",
            border: "1px solid var(--success)",
            borderRadius: "var(--radius)",
            padding: "16px",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Key size={16} color="var(--success)" />
              <span style={{ fontWeight: 600 }}>API Key Created — Copy it now, it won't be shown again</span>
            </div>
            <button className="btn" onClick={() => setNewKey(null)} style={{ padding: 4 }}>
              <X size={14} />
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-primary)", padding: "8px 12px", borderRadius: "var(--radius-sm)", fontFamily: "monospace", fontSize: 13 }}>
            <span style={{ flex: 1, wordBreak: "break-all" }}>{newKey.raw_key}</span>
            <button
              className="btn"
              onClick={() => navigator.clipboard.writeText(newKey.raw_key)}
              title="Copy to clipboard"
              style={{ padding: 4 }}
            >
              <Copy size={14} />
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>API Keys</h3>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={14} /> Create API Key
        </button>
      </div>

      {keys && keys.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 12 }}>
              <th style={{ textAlign: "left", padding: "8px" }}>Name</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Prefix</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Scopes</th>
              <th style={{ textAlign: "center", padding: "8px" }}>Rate Limit</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Status</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Expires</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Last Used</th>
              <th style={{ textAlign: "right", padding: "8px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "8px", fontWeight: 500 }}>{k.name}</td>
                <td style={{ padding: "8px", fontFamily: "monospace", color: "var(--text-muted)" }}>{k.key_prefix}...</td>
                <td style={{ padding: "8px" }}>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {k.scopes.map((s) => (
                      <span key={s} className="badge" style={{
                        fontSize: 10,
                        background: s === "platform_admin" ? "rgba(239, 68, 68, 0.15)" : s === "admin" ? "rgba(245, 158, 11, 0.15)" : "var(--bg-tertiary)",
                        color: s === "platform_admin" ? "var(--error)" : s === "admin" ? "var(--warning)" : "var(--text-secondary)",
                      }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </td>
                <td style={{ padding: "8px", textAlign: "center", fontFamily: "monospace" }}>{k.rate_limit}/min</td>
                <td style={{ padding: "8px" }}>
                  <span className={`badge ${k.enabled ? "badge-success" : "badge-warning"}`}>
                    {k.enabled ? "Active" : "Disabled"}
                  </span>
                </td>
                <td style={{ padding: "8px", color: "var(--text-muted)" }}>
                  {k.expires_at ? format(new Date(k.expires_at), "MMM dd, yyyy") : "Never"}
                </td>
                <td style={{ padding: "8px", color: "var(--text-muted)" }}>
                  {k.last_used_at ? format(new Date(k.last_used_at), "MMM dd HH:mm") : "Never"}
                </td>
                <td style={{ padding: "8px", textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <button className="btn" onClick={() => handleToggle(k)} title={k.enabled ? "Disable" : "Enable"} style={{ padding: 4 }}>
                      <Power size={14} color={k.enabled ? "var(--success)" : "var(--text-muted)"} />
                    </button>
                    <button className="btn" onClick={() => setDeleteConfirm({ id: k.id, name: k.name })} style={{ padding: 4 }}>
                      <Trash2 size={14} color="var(--error)" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState message="No API keys created" />
      )}

      {showModal && (
        <APIKeyCreateModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}

      {deleteConfirm && (
        <ConfirmModal
          title="Delete API Key"
          message={`Are you sure you want to delete "${deleteConfirm.name}"? Any systems using this key will lose access immediately.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

// ─── API Key Create Modal ─────────────────────────────────────────────────

function APIKeyCreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (key: APIKeyCreated) => void }) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read", "write"]);
  const [rateLimit, setRateLimit] = useState(1000);
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleScope = (scope: string) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const data: APIKeyCreate = { name, scopes, rate_limit: rateLimit };
      if (expiresAt) data.expires_at = new Date(expiresAt).toISOString();
      const created = await api.apiKeys.create(data);
      onCreated(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Create API Key" onClose={onClose}>
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}

      <FormField label="Name" required>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="CI/CD Pipeline Key" />
      </FormField>

      <FormField label="Scopes">
        <div style={{ display: "flex", gap: 8 }}>
          {SCOPES.map((s) => (
            <button
              key={s}
              className="btn"
              onClick={() => toggleScope(s)}
              style={{
                fontSize: 12, padding: "6px 12px",
                background: scopes.includes(s) ? (s === "platform_admin" ? "rgba(239, 68, 68, 0.15)" : s === "admin" ? "rgba(245, 158, 11, 0.15)" : "var(--accent)") : "var(--bg-tertiary)",
                color: scopes.includes(s) ? (s === "platform_admin" ? "var(--error)" : s === "admin" ? "var(--warning)" : "#fff") : "var(--text-muted)",
                borderColor: scopes.includes(s) ? "transparent" : "var(--border)",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </FormField>

      <FormField label="Rate Limit (requests/min)">
        <input
          className="input"
          type="number"
          min={10}
          max={100000}
          value={rateLimit}
          onChange={(e) => setRateLimit(Number(e.target.value))}
        />
      </FormField>

      <FormField label="Expires At (optional)">
        <input
          className="input"
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
        />
      </FormField>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={saving || !name || scopes.length === 0}>
          {saving ? "Creating..." : "Create Key"}
        </button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex",
        alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--bg-secondary)", borderRadius: "var(--radius)", padding: 24,
        width: "100%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto",
        border: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, onConfirm, onCancel }: { title: string; message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex",
        alignItems: "center", justifyContent: "center", zIndex: 1001,
      }}
    >
      <div style={{
        background: "var(--bg-secondary)", borderRadius: "var(--radius)", padding: 24,
        width: "100%", maxWidth: 420, border: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <AlertTriangle size={18} color="var(--error)" />
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>{title}</h3>
        </div>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn" onClick={onConfirm} style={{ background: "var(--error)", color: "#fff", borderColor: "var(--error)" }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 4, color: "var(--text-secondary)" }}>
        {label}{required && <span style={{ color: "var(--error)" }}> *</span>}
      </label>
      {children}
    </div>
  );
}

function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div style={{
      background: "rgba(239, 68, 68, 0.1)", border: "1px solid var(--error)",
      borderRadius: "var(--radius)", padding: "10px 16px", marginBottom: 16,
      display: "flex", justifyContent: "space-between", alignItems: "center",
      fontSize: 13, color: "var(--error)",
    }}>
      <span>{message}</span>
      <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--error)" }}>
        <X size={14} />
      </button>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: 48, color: "var(--text-muted)", fontSize: 14 }}>
      {message}
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import {
  Cloud,
  Server,
  Shield,
  Check,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  AlertCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  Tag,
  X,
} from "lucide-react";
import { api } from "../../services/api";
import { useApi } from "../../hooks/useApi";
import type {
  VerifyAWSResponse,
  VerifyAzureResponse,
  DiscoverPreviewResponse,
  AvailableRegionsResponse,
  AvailableServicesResponse,
} from "../../types";

type CloudProvider = "aws" | "azure";
type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

type AzureSetupMode = "cli" | "manual";

interface WizardState {
  provider: CloudProvider | null;
  accountName: string;
  envTag: string;
  externalId: string;
  cftUrl: string;
  armUrl: string;
  cftConsoleUrl: string;
  armPortalUrl: string;
  neoguardAccountId: string;
  // AWS
  roleArn: string;
  // Azure
  azureTenantId: string;
  clientId: string;
  clientSecret: string;
  subscriptionId: string;
  azureSetupMode: AzureSetupMode;
  cliOutput: string;
  cliParsed: boolean;
  // Verification results
  verifyResult: VerifyAWSResponse | VerifyAzureResponse | null;
  // Discovery
  discoveryResult: DiscoverPreviewResponse | null;
  selectedRegions: Set<string>;
  selectedServices: Set<string>;
}

interface CloudAccountWizardProps {
  onClose: () => void;
  onSuccess: () => void;
}

const ENV_OPTIONS = [
  { value: "", label: "No tag (skip)" },
  { value: "production", label: "Production" },
  { value: "staging", label: "Staging" },
  { value: "development", label: "Development" },
  { value: "testing", label: "Testing" },
  { value: "sandbox", label: "Sandbox" },
];

const INITIAL_STATE: WizardState = {
  provider: null,
  accountName: "",
  envTag: "",
  externalId: "",
  cftUrl: "",
  armUrl: "",
  cftConsoleUrl: "",
  armPortalUrl: "",
  neoguardAccountId: "",
  roleArn: "",
  azureTenantId: "",
  clientId: "",
  clientSecret: "",
  subscriptionId: "",
  azureSetupMode: "cli",
  cliOutput: "",
  cliParsed: false,
  verifyResult: null,
  discoveryResult: null,
  selectedRegions: new Set(),
  selectedServices: new Set(),
};

function parseAzureCliOutput(raw: string): {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  subscriptionId: string;
} | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const obj = JSON.parse(jsonMatch[0]);
    const tenantId = obj.tenant || obj.tenantId || "";
    const clientId = obj.appId || obj.clientId || "";
    const clientSecret = obj.password || obj.clientSecret || "";
    if (!tenantId || !clientId || !clientSecret) return null;
    return { tenantId, clientId, clientSecret, subscriptionId: "" };
  } catch {
    return null;
  }
}

const LOADING_CONFIGS: Record<string, { messages: string[]; estimate: string }> = {
  verify_aws: {
    messages: [
      "Connecting to your AWS account…",
      "Checking permissions for EC2, RDS, Lambda…",
      "Verifying read-only access…",
      "Almost there…",
    ],
    estimate: "This usually takes 10–20 seconds",
  },
  verify_azure: {
    messages: [
      "Connecting to your Azure subscription…",
      "Checking service principal permissions…",
      "Verifying read access to resources…",
      "Almost there…",
    ],
    estimate: "This usually takes 10–20 seconds",
  },
  discover: {
    messages: [
      "Scanning your AWS regions…",
      "Looking for servers, databases, storage…",
      "Counting resources in each region…",
      "Building your infrastructure map…",
    ],
    estimate: "Scanning usually takes 20–40 seconds",
  },
  create: {
    messages: [
      "Saving your account configuration…",
      "Setting up monitoring connections…",
      "Almost done…",
    ],
    estimate: "Just a few more seconds",
  },
};

export function CloudAccountWizard({ onClose, onSuccess }: CloudAccountWizardProps) {
  const [step, setStep] = useState<WizardStep>(1);
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<string | null>(null);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showTechDetails, setShowTechDetails] = useState(false);

  const { data: regionsData } = useApi<AvailableRegionsResponse>(
    () => api.onboarding.regions(),
    [],
  );
  const { data: servicesData } = useApi<AvailableServicesResponse>(
    () => api.onboarding.services(),
    [],
  );

  const update = useCallback(
    (patch: Partial<WizardState>) => setState((s) => ({ ...s, ...patch })),
    [],
  );

  useEffect(() => {
    if (!loadingPhase) {
      setLoadingMsgIdx(0);
      return;
    }
    setLoadingMsgIdx(0);
    const interval = setInterval(() => {
      const config = LOADING_CONFIGS[loadingPhase];
      if (!config) return;
      setLoadingMsgIdx((prev) => Math.min(prev + 1, config.messages.length - 1));
    }, 3000);
    return () => clearInterval(interval);
  }, [loadingPhase]);

  const currentLoadingConfig = loadingPhase ? LOADING_CONFIGS[loadingPhase] : null;
  const currentLoadingMessage = currentLoadingConfig?.messages[loadingMsgIdx] ?? "";
  const currentLoadingEstimate = currentLoadingConfig?.estimate ?? "";

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const azureCliCommand =
    'az ad sp create-for-rbac --name "NeoGuard Monitor" --role Reader --scopes /subscriptions/YOUR_SUBSCRIPTION_ID';

  const ARM_TEMPLATE_URL =
    "https://neoguard-config-bucket.s3.amazonaws.com/templates/neoguard-monitoring-role.json";
  const azureArmPortalUrl =
    "https://portal.azure.com/#create/Microsoft.Template/uri/" +
    encodeURIComponent(ARM_TEMPLATE_URL);

  const handleCliPaste = useCallback(
    (raw: string) => {
      const parsed = parseAzureCliOutput(raw);
      if (parsed) {
        update({
          cliOutput: raw,
          cliParsed: true,
          azureTenantId: parsed.tenantId,
          clientId: parsed.clientId,
          clientSecret: parsed.clientSecret,
          subscriptionId: parsed.subscriptionId,
        });
        setError(null);
      } else {
        update({ cliOutput: raw, cliParsed: false });
        setError(
          "Could not parse the output. Make sure you pasted the full JSON block from the az command.",
        );
      }
    },
    [update],
  );

  const handleNameContinue = async () => {
    if (!state.accountName.trim()) return;
    if (state.provider === "azure") {
      setStep(3);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.onboarding.generateExternalId();
      update({
        externalId: res.external_id,
        cftUrl: res.cft_template_url,
        armUrl: res.arm_template_url,
        cftConsoleUrl: res.cft_console_url,
        armPortalUrl: res.arm_portal_url,
        neoguardAccountId: res.neoguard_account_id,
      });
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to prepare your account setup");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setError(null);
    if (state.provider === "aws") {
      if (!state.roleArn.trim()) {
        setError("Please paste the Role ARN from your CloudFormation stack.");
        return;
      }
    } else if (state.azureSetupMode === "cli") {
      if (!state.cliParsed) {
        setError("Please paste the JSON output from the az command first.");
        return;
      }
      if (!state.subscriptionId.trim()) {
        setError("Please enter your Subscription ID.");
        return;
      }
    } else {
      if (
        !state.subscriptionId.trim() ||
        !state.clientId.trim() ||
        !state.clientSecret.trim() ||
        !state.azureTenantId.trim()
      ) {
        setError("Please fill in all the fields above.");
        return;
      }
    }

    setLoadingPhase(state.provider === "aws" ? "verify_aws" : "verify_azure");
    try {
      if (state.provider === "aws") {
        const result = await api.onboarding.verifyAws({
          role_arn: state.roleArn,
          external_id: state.externalId,
        });
        update({ verifyResult: result });
        if (result.success) setStep(4);
        else setError(result.error || "Verification failed");
      } else {
        const result = await api.onboarding.verifyAzure({
          azure_tenant_id: state.azureTenantId,
          client_id: state.clientId,
          client_secret: state.clientSecret,
          subscription_id: state.subscriptionId,
        });
        update({ verifyResult: result });
        if (result.success) setStep(4);
        else setError(result.error || "Verification failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setLoadingPhase(null);
    }
  };

  const handleDiscoverPreview = async () => {
    if (state.provider === "azure") {
      const azureRegions = regionsData?.azure ?? [];
      const azureServices = servicesData?.azure ?? [];
      update({
        selectedRegions: new Set(azureRegions),
        selectedServices: new Set(azureServices.map((s) => s.id)),
      });
      setStep(5);
      return;
    }

    setLoadingPhase("discover");
    setError(null);
    try {
      const regions = regionsData?.aws ?? [];
      const result = await api.onboarding.discoverPreview({
        role_arn: state.roleArn,
        external_id: state.externalId,
        regions,
      });
      update({ discoveryResult: result });

      const allServices = servicesData?.aws ?? [];
      update({
        selectedRegions: new Set(regions),
        selectedServices: new Set(allServices.map((s) => s.id)),
      });
      setStep(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Discovery failed");
    } finally {
      setLoadingPhase(null);
    }
  };

  const handleCreateAccount = async () => {
    setLoadingPhase("create");
    setError(null);
    try {
      const regions = Array.from(state.selectedRegions);
      const services = Array.from(state.selectedServices);
      const collectConfig: Record<string, unknown> = { services };
      if (state.envTag) collectConfig.env = state.envTag;

      if (state.provider === "aws") {
        await api.aws.createAccount({
          name: state.accountName,
          account_id: (state.verifyResult as VerifyAWSResponse)?.account_id ?? "",
          role_arn: state.roleArn,
          external_id: state.externalId,
          regions,
        });
      } else {
        await api.azure.createSubscription({
          name: state.accountName,
          subscription_id: state.subscriptionId,
          tenant_id: state.azureTenantId,
          client_id: state.clientId,
          client_secret: state.clientSecret,
          regions,
        });
      }
      setStep(6);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create account");
    } finally {
      setLoadingPhase(null);
    }
  };

  const toggleRegion = (region: string) => {
    setState((s) => {
      const next = new Set(s.selectedRegions);
      if (next.has(region)) next.delete(region);
      else next.add(region);
      return { ...s, selectedRegions: next };
    });
  };

  const toggleService = (svcId: string) => {
    setState((s) => {
      const next = new Set(s.selectedServices);
      if (next.has(svcId)) next.delete(svcId);
      else next.add(svcId);
      return { ...s, selectedServices: next };
    });
  };

  const toggleAllRegions = () => {
    const all = state.provider === "aws" ? regionsData?.aws : regionsData?.azure;
    if (!all) return;
    const allSelected = all.every((r) => state.selectedRegions.has(r));
    update({
      selectedRegions: allSelected ? new Set<string>() : new Set(all),
    });
  };

  const toggleAllServices = () => {
    const all = state.provider === "aws" ? servicesData?.aws : servicesData?.azure;
    if (!all) return;
    const allSelected = all.every((s) => state.selectedServices.has(s.id));
    update({
      selectedServices: allSelected ? new Set<string>() : new Set(all.map((s) => s.id)),
    });
  };

  const stepLabels = ["Choose Cloud", "Name It", "Connect", "Confirm", "Pick Services", "All Done"];

  return (
    <div className="wizard-overlay" onClick={onClose}>
      <div
        className="wizard-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add Cloud Account"
      >
        {/* Header */}
        <div className="wizard-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Cloud size={22} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Add Cloud Account</h2>
          </div>
          <button
            className="wizard-close-btn"
            onClick={onClose}
            aria-label="Close wizard"
          >
            <X size={18} />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="wizard-progress">
          {stepLabels.map((label, i) => {
            const stepNum = (i + 1) as WizardStep;
            const isActive = step === stepNum;
            const isComplete = step > stepNum;
            return (
              <div
                key={label}
                className={`wizard-progress-step ${isActive ? "active" : ""} ${isComplete ? "complete" : ""}`}
              >
                <div className="wizard-progress-dot">
                  {isComplete ? <Check size={12} /> : i + 1}
                </div>
                <span className="wizard-progress-label">{label}</span>
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="wizard-body">
          {error && !loadingPhase && (
            <div className="wizard-error">
              <AlertCircle size={16} />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="wizard-error-dismiss">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Loading overlay — shown during long operations */}
          {loadingPhase ? (
            <div className="wizard-loading-state" data-testid="loading-overlay">
              <Loader2 size={40} className="wizard-spinner" />
              <p className="wizard-loading-msg">{currentLoadingMessage}</p>
              <p className="wizard-loading-est">{currentLoadingEstimate}</p>
            </div>
          ) : (
            <>
              {/* Step 1: Choose Provider */}
              {step === 1 && (
                <div className="wizard-step">
                  <h3 className="wizard-step-title">Which cloud do you use?</h3>
                  <p className="wizard-step-desc">
                    Select the cloud platform you&apos;d like to connect to NeoGuard.
                  </p>
                  <div className="wizard-provider-grid">
                    <button
                      className={`wizard-provider-card ${state.provider === "aws" ? "selected" : ""}`}
                      onClick={() => update({ provider: "aws" })}
                    >
                      <div
                        className="wizard-provider-icon"
                        style={{ background: "#ff990020", color: "#ff9900" }}
                      >
                        <Cloud size={32} />
                      </div>
                      <div className="wizard-provider-name">Amazon Web Services</div>
                      <div className="wizard-provider-detail">
                        EC2, RDS, Lambda, S3, DynamoDB, and more
                      </div>
                    </button>
                    <button
                      className={`wizard-provider-card ${state.provider === "azure" ? "selected" : ""}`}
                      onClick={() => update({ provider: "azure" })}
                    >
                      <div
                        className="wizard-provider-icon"
                        style={{ background: "#0089d620", color: "#0089d6" }}
                      >
                        <Server size={32} />
                      </div>
                      <div className="wizard-provider-name">Microsoft Azure</div>
                      <div className="wizard-provider-detail">
                        VMs, SQL, Functions, AKS, Storage, and more
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Account Name + Env Tag */}
              {step === 2 && (
                <div className="wizard-step">
                  <h3 className="wizard-step-title">Give it a name</h3>
                  <p className="wizard-step-desc">
                    A friendly name so your team can recognize this{" "}
                    {state.provider === "aws" ? "AWS account" : "Azure subscription"}.
                  </p>
                  <div className="wizard-field">
                    <label className="wizard-label" htmlFor="account-name">
                      Account Name <span className="wizard-required">*</span>
                    </label>
                    <input
                      id="account-name"
                      type="text"
                      className="wizard-input"
                      placeholder={
                        state.provider === "aws"
                          ? "e.g., Production AWS"
                          : "e.g., Production Azure"
                      }
                      value={state.accountName}
                      onChange={(e) => update({ accountName: e.target.value })}
                      maxLength={256}
                      autoFocus
                    />
                  </div>
                  <div className="wizard-field">
                    <label className="wizard-label" htmlFor="env-tag">
                      <Tag size={14} style={{ marginRight: 6 }} />
                      Environment Tag <span className="wizard-optional">(optional)</span>
                    </label>
                    <select
                      id="env-tag"
                      className="wizard-select"
                      value={state.envTag}
                      onChange={(e) => update({ envTag: e.target.value })}
                    >
                      {ENV_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <p className="wizard-hint">
                      Tagging helps organize accounts when you have multiple environments.
                    </p>
                  </div>
                </div>
              )}

              {/* Step 3: Connect — Deploy Template + Enter Credentials */}
              {step === 3 && (
                <div className="wizard-step">
                  <h3 className="wizard-step-title">
                    Connect your {state.provider === "aws" ? "AWS account" : "Azure subscription"}
                  </h3>
                  <p className="wizard-step-desc" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Shield size={15} style={{ flexShrink: 0, color: "#22c55e" }} />
                    <span>
                      We only request <strong>read-only</strong> access &mdash; NeoGuard will never
                      modify your resources.
                    </span>
                  </p>

                  {state.provider === "aws" ? (
                    <>
                      <ol className="wizard-instructions">
                        <li>
                          <strong>Click the button below</strong> to open AWS in a new tab
                        </li>
                        <li>
                          Scroll down and click <strong>&quot;Create stack&quot;</strong> &mdash;
                          everything is pre-filled for you
                        </li>
                        <li>
                          <strong>Wait about 2 minutes</strong> for AWS to finish setting up
                        </li>
                        <li>
                          When the status shows <strong>&quot;CREATE_COMPLETE&quot;</strong>, click
                          the <strong>&quot;Outputs&quot;</strong> tab
                        </li>
                        <li>
                          Copy the value next to <strong>&quot;RoleArn&quot;</strong> and paste it
                          below
                        </li>
                      </ol>

                      <a
                        href={state.cftConsoleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="wizard-deploy-link"
                      >
                        <ExternalLink size={16} />
                        <span>Open AWS Console</span>
                      </a>
                      <p className="wizard-hint" style={{ marginTop: 8 }}>
                        Opens in a new tab. Come back here when you&apos;re done.
                      </p>

                      <div className="wizard-divider" />

                      <div className="wizard-field">
                        <label className="wizard-label" htmlFor="role-arn">
                          Role ARN from the stack outputs{" "}
                          <span className="wizard-required">*</span>
                        </label>
                        <input
                          id="role-arn"
                          type="text"
                          className="wizard-input"
                          placeholder="arn:aws:iam::123456789012:role/NeoGuardMonitoringRole"
                          value={state.roleArn}
                          onChange={(e) => update({ roleArn: e.target.value })}
                        />
                        <p className="wizard-hint">
                          Find this in the &quot;Outputs&quot; tab of your completed CloudFormation
                          stack.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Azure setup mode tabs */}
                      <div className="wizard-mode-tabs">
                        <button
                          className={`wizard-mode-tab ${state.azureSetupMode === "cli" ? "active" : ""}`}
                          onClick={() => update({ azureSetupMode: "cli" })}
                        >
                          Quick Setup (CLI)
                        </button>
                        <button
                          className={`wizard-mode-tab ${state.azureSetupMode === "manual" ? "active" : ""}`}
                          onClick={() => update({ azureSetupMode: "manual" })}
                        >
                          Manual Setup
                        </button>
                      </div>

                      {state.azureSetupMode === "cli" ? (
                        <>
                          <p className="wizard-step-desc" style={{ marginBottom: 16, marginTop: 0 }}>
                            One command creates the app, generates a secret, and grants Reader access.
                          </p>

                          <div className="wizard-step-card">
                            <div className="wizard-step-card-num">1</div>
                            <div className="wizard-step-card-body">
                              <div className="wizard-step-card-title">Run this in your terminal</div>
                              <div className="wizard-cli-block">
                                <code>{azureCliCommand}</code>
                                <button
                                  className="wizard-copy-btn"
                                  onClick={() => copyToClipboard(azureCliCommand, "cli-cmd")}
                                  title="Copy command"
                                >
                                  {copied === "cli-cmd" ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                              </div>
                              <p className="wizard-hint">
                                Replace <code className="wizard-inline-code">YOUR_SUBSCRIPTION_ID</code> with
                                your Azure Subscription ID.
                              </p>
                              <p className="wizard-hint">
                                No Azure CLI?{" "}
                                <a
                                  href="https://learn.microsoft.com/en-us/cli/azure/install-azure-cli"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="wizard-link"
                                >
                                  Install it
                                </a>{" "}
                                or use Manual Setup.
                              </p>
                            </div>
                          </div>

                          <div className="wizard-step-card">
                            <div className="wizard-step-card-num">2</div>
                            <div className="wizard-step-card-body">
                              <div className="wizard-step-card-title">Paste the JSON output</div>
                              <textarea
                                id="cli-output"
                                className="wizard-input wizard-textarea"
                                placeholder={'{\n  "appId": "...",\n  "password": "...",\n  "tenant": "..."\n}'}
                                value={state.cliOutput}
                                onChange={(e) => handleCliPaste(e.target.value)}
                                rows={5}
                                spellCheck={false}
                              />
                              {state.cliParsed && (
                                <div className="wizard-cli-parsed">
                                  <CheckCircle2 size={14} />
                                  Parsed &mdash; Tenant ID, Client ID, and Secret extracted.
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="wizard-step-card">
                            <div className="wizard-step-card-num">3</div>
                            <div className="wizard-step-card-body">
                              <label className="wizard-step-card-title" htmlFor="subscription-id">
                                Confirm your Subscription ID
                              </label>
                              <input
                                id="subscription-id"
                                type="text"
                                className="wizard-input"
                                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                                value={state.subscriptionId}
                                onChange={(e) => update({ subscriptionId: e.target.value })}
                              />
                              <p className="wizard-hint">
                                Same ID you used in the command above.
                              </p>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="wizard-step-card">
                            <div className="wizard-step-card-num">1</div>
                            <div className="wizard-step-card-body">
                              <div className="wizard-step-card-title">Create an App Registration</div>
                              <p className="wizard-step-card-text">
                                Azure Portal &rarr; <strong>Microsoft Entra ID</strong> &rarr; <strong>App registrations</strong> &rarr; <strong>New registration</strong>
                              </p>
                              <p className="wizard-step-card-text">
                                Name it <strong>&quot;NeoGuard Monitor&quot;</strong> and click <strong>Register</strong>.
                              </p>
                            </div>
                          </div>

                          <div className="wizard-step-card">
                            <div className="wizard-step-card-num">2</div>
                            <div className="wizard-step-card-body">
                              <div className="wizard-step-card-title">Copy IDs from the Overview page</div>
                              <p className="wizard-step-card-text">
                                You need the <strong>Application (client) ID</strong> and <strong>Directory (tenant) ID</strong>.
                              </p>
                            </div>
                          </div>

                          <div className="wizard-step-card">
                            <div className="wizard-step-card-num">3</div>
                            <div className="wizard-step-card-body">
                              <div className="wizard-step-card-title">Create a client secret</div>
                              <p className="wizard-step-card-text">
                                <strong>Certificates &amp; secrets</strong> &rarr; <strong>New client secret</strong> &rarr; copy the <strong>Value</strong> immediately (shown only once).
                              </p>
                            </div>
                          </div>

                          <div className="wizard-step-card">
                            <div className="wizard-step-card-num">4</div>
                            <div className="wizard-step-card-body">
                              <div className="wizard-step-card-title">Assign Reader role</div>
                              <p className="wizard-step-card-text">
                                Click below to deploy our template. It will ask for the <strong>Service Principal Object Id</strong>.
                              </p>
                              <p className="wizard-step-card-text">
                                Find it at: <strong>Enterprise applications</strong> &rarr; search &quot;NeoGuard Monitor&quot; &rarr; copy the <strong>Object ID</strong>.
                              </p>
                              <a
                                href={azureArmPortalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="wizard-deploy-link"
                                style={{ marginTop: 8 }}
                              >
                                <ExternalLink size={16} />
                                Open Azure Portal
                              </a>
                            </div>
                          </div>

                          <div className="wizard-divider" />

                          <div className="wizard-field">
                            <label className="wizard-label" htmlFor="azure-tenant-id">
                              Directory (Tenant) ID <span className="wizard-required">*</span>
                            </label>
                            <input
                              id="azure-tenant-id"
                              type="text"
                              className="wizard-input"
                              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                              value={state.azureTenantId}
                              onChange={(e) => update({ azureTenantId: e.target.value })}
                              autoComplete="off"
                            />
                          </div>
                          <div className="wizard-field">
                            <label className="wizard-label" htmlFor="client-id">
                              Application (Client) ID <span className="wizard-required">*</span>
                            </label>
                            <input
                              id="client-id"
                              type="text"
                              className="wizard-input"
                              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                              value={state.clientId}
                              onChange={(e) => update({ clientId: e.target.value })}
                              autoComplete="off"
                            />
                          </div>
                          <div className="wizard-field">
                            <label className="wizard-label" htmlFor="client-secret">
                              Client Secret Value <span className="wizard-required">*</span>
                            </label>
                            <input
                              id="client-secret"
                              type="text"
                              className="wizard-input"
                              placeholder="Paste the secret value here"
                              value={state.clientSecret}
                              onChange={(e) => update({ clientSecret: e.target.value })}
                              autoComplete="off"
                            />
                          </div>
                          <div className="wizard-field">
                            <label className="wizard-label" htmlFor="subscription-id">
                              Subscription ID <span className="wizard-required">*</span>
                            </label>
                            <input
                              id="subscription-id"
                              type="text"
                              className="wizard-input"
                              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                              value={state.subscriptionId}
                              onChange={(e) => update({ subscriptionId: e.target.value })}
                            />
                          </div>
                        </>
                      )}
                    </>
                  )}

                  {/* Expandable technical details — AWS only */}
                  {state.provider === "aws" && (
                  <>
                  <button
                    className="wizard-details-toggle"
                    onClick={() => setShowTechDetails(!showTechDetails)}
                  >
                    {showTechDetails ? (
                      <ChevronUp size={14} />
                    ) : (
                      <ChevronDown size={14} />
                    )}
                    {showTechDetails ? "Hide" : "Show"} technical details
                  </button>
                  {showTechDetails && (
                    <div className="wizard-info-box" style={{ marginTop: 12 }}>
                      <div className="wizard-info-row">
                        <span className="wizard-info-label">External ID</span>
                        <div className="wizard-info-value">
                          <code>{state.externalId}</code>
                          <button
                            className="wizard-copy-btn"
                            onClick={() => copyToClipboard(state.externalId, "external-id")}
                            title="Copy External ID"
                          >
                            {copied === "external-id" ? (
                              <Check size={14} />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="wizard-info-row">
                        <span className="wizard-info-label">NeoGuard Account ID</span>
                        <div className="wizard-info-value">
                          <code>{state.neoguardAccountId}</code>
                          <button
                            className="wizard-copy-btn"
                            onClick={() =>
                              copyToClipboard(state.neoguardAccountId, "account-id")
                            }
                            title="Copy Account ID"
                          >
                            {copied === "account-id" ? (
                              <Check size={14} />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  </>
                  )}
                </div>
              )}

              {/* Step 4: Connection Confirmed */}
              {step === 4 && (
                <div className="wizard-step">
                  <h3 className="wizard-step-title">Connection confirmed!</h3>
                  <p className="wizard-step-desc">
                    We successfully connected to your{" "}
                    {state.provider === "aws" ? "AWS account" : "Azure subscription"}. Here are the
                    services we can monitor for you:
                  </p>

                  {state.verifyResult && (
                    <div className="wizard-verify-results">
                      {"account_id" in state.verifyResult && state.verifyResult.account_id && (
                        <div className="wizard-info-row" style={{ marginBottom: 16 }}>
                          <span className="wizard-info-label">AWS Account ID</span>
                          <code>{state.verifyResult.account_id}</code>
                        </div>
                      )}
                      <div className="wizard-services-grid">
                        {Object.entries(state.verifyResult.services).map(([key, svc]) => (
                          <div
                            key={key}
                            className={`wizard-service-item ${svc.ok ? "ok" : "failed"}`}
                          >
                            {svc.ok ? (
                              <CheckCircle2 size={16} className="wizard-service-icon ok" />
                            ) : (
                              <XCircle size={16} className="wizard-service-icon failed" />
                            )}
                            <span className="wizard-service-label">{svc.label}</span>
                            {!svc.ok && svc.error && (
                              <span className="wizard-service-error">{svc.error}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 5: Select Regions & Services */}
              {step === 5 && (
                <div className="wizard-step">
                  <h3 className="wizard-step-title">What should we monitor?</h3>
                  <p className="wizard-step-desc">
                    Choose the regions and services you&apos;d like NeoGuard to keep an eye on.
                    {state.discoveryResult &&
                      ` We found ${state.discoveryResult.totals.resources} resources across ${state.discoveryResult.totals.regions_with_resources} regions.`}
                  </p>

                  {/* Regions */}
                  <div className="wizard-selection-section">
                    <div className="wizard-selection-header">
                      <h4>Regions</h4>
                      <button className="wizard-select-all-btn" onClick={toggleAllRegions}>
                        {(state.provider === "aws"
                          ? regionsData?.aws
                          : regionsData?.azure
                        )?.every((r) => state.selectedRegions.has(r))
                          ? "Deselect All"
                          : "Select All"}
                      </button>
                    </div>
                    <div className="wizard-checkbox-grid">
                      {(state.provider === "aws"
                        ? regionsData?.aws
                        : regionsData?.azure
                      )?.map((region) => {
                        const regionData = state.discoveryResult?.regions[region];
                        const count = regionData?.total ?? 0;
                        return (
                          <label key={region} className="wizard-checkbox-item">
                            <input
                              type="checkbox"
                              checked={state.selectedRegions.has(region)}
                              onChange={() => toggleRegion(region)}
                            />
                            <span className="wizard-checkbox-label">
                              {region}
                              {count > 0 && (
                                <span className="wizard-checkbox-count">{count}</span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Services */}
                  <div className="wizard-selection-section">
                    <div className="wizard-selection-header">
                      <h4>Services</h4>
                      <button className="wizard-select-all-btn" onClick={toggleAllServices}>
                        {(state.provider === "aws"
                          ? servicesData?.aws
                          : servicesData?.azure
                        )?.every((s) => state.selectedServices.has(s.id))
                          ? "Deselect All"
                          : "Select All"}
                      </button>
                    </div>
                    <div className="wizard-checkbox-grid">
                      {(state.provider === "aws"
                        ? servicesData?.aws
                        : servicesData?.azure
                      )?.map((svc) => (
                        <label key={svc.id} className="wizard-checkbox-item">
                          <input
                            type="checkbox"
                            checked={state.selectedServices.has(svc.id)}
                            onChange={() => toggleService(svc.id)}
                          />
                          <span className="wizard-checkbox-label">{svc.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 6: Success */}
              {step === 6 && (
                <div
                  className="wizard-step"
                  style={{ textAlign: "center", padding: "40px 20px" }}
                >
                  <div className="wizard-success-icon-wrap">
                    <CheckCircle2 size={48} />
                  </div>
                  <h3 className="wizard-step-title" style={{ marginTop: 20 }}>
                    You&apos;re all set!
                  </h3>
                  <p className="wizard-step-desc">
                    <strong>{state.accountName}</strong> is now connected to NeoGuard.
                    {state.envTag && (
                      <>
                        {" "}
                        Tagged as <code>{state.envTag}</code>.
                      </>
                    )}
                    <br />
                    We&apos;re collecting data right now &mdash; your servers, databases, and other
                    resources will show up on your dashboard within a few minutes.
                  </p>
                  <div className="wizard-success-actions">
                    <button className="wizard-btn primary" onClick={onSuccess}>
                      See My Infrastructure
                    </button>
                    <button
                      className="wizard-btn secondary"
                      onClick={() => {
                        setState(INITIAL_STATE);
                        setStep(1);
                        setError(null);
                        setShowTechDetails(false);
                      }}
                    >
                      Connect Another Account
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {step < 6 && !loadingPhase && (
          <div className="wizard-footer">
            <button
              className="wizard-btn secondary"
              onClick={() => {
                if (step === 1) onClose();
                else setStep((s) => (s - 1) as WizardStep);
              }}
            >
              <ChevronLeft size={16} />
              {step === 1 ? "Cancel" : "Back"}
            </button>

            {step === 1 && (
              <button
                className="wizard-btn primary"
                disabled={!state.provider}
                onClick={() => setStep(2)}
              >
                Next
                <ChevronRight size={16} />
              </button>
            )}

            {step === 2 && (
              <button
                className="wizard-btn primary"
                disabled={!state.accountName.trim() || loading}
                onClick={handleNameContinue}
              >
                {loading ? <Loader2 size={16} className="wizard-spinner" /> : null}
                Next
                <ChevronRight size={16} />
              </button>
            )}

            {step === 3 && (
              <button
                className="wizard-btn primary"
                onClick={handleVerify}
              >
                <Shield size={16} />
                Test Connection
              </button>
            )}

            {step === 4 && (
              <button
                className="wizard-btn primary"
                onClick={handleDiscoverPreview}
              >
                Scan My Infrastructure
                <ChevronRight size={16} />
              </button>
            )}

            {step === 5 && (
              <button
                className="wizard-btn primary"
                disabled={
                  state.selectedRegions.size === 0 || state.selectedServices.size === 0
                }
                onClick={handleCreateAccount}
              >
                <Check size={16} />
                Start Monitoring
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

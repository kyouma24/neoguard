import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { CloudAccountWizard } from "./CloudAccountWizard";
import { api } from "../../services/api";
import { useApi } from "../../hooks/useApi";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("../../services/api", () => ({
  api: {
    onboarding: {
      regions: vi.fn(),
      services: vi.fn(),
      generateExternalId: vi.fn(),
      verifyAws: vi.fn(),
      verifyAzure: vi.fn(),
      discoverPreview: vi.fn(),
    },
    aws: { createAccount: vi.fn() },
    azure: { createSubscription: vi.fn() },
  },
}));

vi.mock("../../hooks/useApi", () => ({
  useApi: vi.fn(),
}));

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_REGIONS = {
  aws: ["us-east-1", "us-west-2", "eu-west-1"],
  azure: ["eastus", "westeurope"],
};

const MOCK_SERVICES = {
  aws: [
    { id: "ec2", label: "EC2" },
    { id: "rds", label: "RDS" },
    { id: "s3", label: "S3" },
  ],
  azure: [
    { id: "vm", label: "Virtual Machines" },
    { id: "sql", label: "SQL Databases" },
  ],
};

const MOCK_EXTERNAL_ID_RESPONSE = {
  external_id: "ng-test-external-id-12345",
  cft_template_url: "https://neoguard-config-bucket.s3.amazonaws.com/templates/neoguard-monitoring-role.yaml",
  arm_template_url: "https://neoguard-config-bucket.s3.amazonaws.com/templates/neoguard-monitoring-role.json",
  cft_console_url: "https://console.aws.amazon.com/cloudformation/home#/stacks/quickcreate?templateURL=test&stackName=NeoGuardMonitoringRole&param_ExternalId=ng-test-external-id-12345",
  arm_portal_url: "https://portal.azure.com/#create/Microsoft.Template/uri/test",
  neoguard_account_id: "123456789012",
};

const MOCK_VERIFY_AWS_SUCCESS = {
  success: true,
  account_id: "111222333444",
  role_arn: "arn:aws:iam::111222333444:role/NeoGuardRole",
  services: {
    ec2: { ok: true, label: "EC2" },
    rds: { ok: true, label: "RDS" },
    s3: { ok: false, label: "S3", error: "Access denied" },
  },
  error: null,
};

const MOCK_VERIFY_AWS_FAILURE = {
  success: false,
  account_id: null,
  role_arn: "",
  services: {},
  error: "Unable to assume role",
};

const MOCK_VERIFY_AZURE_SUCCESS = {
  success: true,
  subscription_id: "sub-aaaa-bbbb-cccc-dddd",
  services: {
    vm: { ok: true, label: "Virtual Machines", count: 5 },
    sql: { ok: true, label: "SQL Databases", count: 2 },
  },
  error: null,
};

const MOCK_DISCOVER_PREVIEW = {
  success: true,
  regions: {
    "us-east-1": { services: { ec2: 5, rds: 2 }, total: 7 },
    "us-west-2": { services: { ec2: 1 }, total: 1 },
    "eu-west-1": { services: {}, total: 0 },
  },
  totals: { resources: 8, regions_with_resources: 2 },
  error: null,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function setupUseApiMock() {
  let callIndex = 0;
  (useApi as Mock).mockImplementation(() => {
    const idx = callIndex++;
    if (idx % 2 === 0) {
      return { data: MOCK_REGIONS, loading: false, error: null, refetch: vi.fn() };
    }
    return { data: MOCK_SERVICES, loading: false, error: null, refetch: vi.fn() };
  });
}

const user = userEvent.setup({ delay: null });

function renderWizard(props?: Partial<{ onClose: () => void; onSuccess: () => void }>) {
  const onClose = props?.onClose ?? vi.fn();
  const onSuccess = props?.onSuccess ?? vi.fn();
  const result = render(<CloudAccountWizard onClose={onClose} onSuccess={onSuccess} />);
  return { ...result, onClose, onSuccess };
}

async function goToStep2(provider: "aws" | "azure" = "aws") {
  const providerText = provider === "aws" ? "Amazon Web Services" : "Microsoft Azure";
  await user.click(screen.getByText(providerText));
  await user.click(screen.getByRole("button", { name: /next/i }));
}

async function goToStep3Aws() {
  (api.onboarding.generateExternalId as Mock).mockResolvedValue(MOCK_EXTERNAL_ID_RESPONSE);
  await goToStep2("aws");
  const nameInput = screen.getByLabelText(/account name/i);
  await user.type(nameInput, "My AWS Account");
  await user.click(screen.getByRole("button", { name: /next/i }));
  await waitFor(() => {
    expect(screen.getByText(/Connect your AWS account/i)).toBeInTheDocument();
  });
}

async function goToStep4Aws() {
  (api.onboarding.verifyAws as Mock).mockResolvedValue(MOCK_VERIFY_AWS_SUCCESS);
  await goToStep3Aws();
  const arnInput = screen.getByLabelText(/role arn/i);
  await user.type(arnInput, "arn:aws:iam::111222333444:role/NeoGuardRole");
  await user.click(screen.getByRole("button", { name: /test connection/i }));
  await waitFor(() => {
    expect(screen.getByText(/Connection confirmed/i)).toBeInTheDocument();
  });
}

async function goToStep5Aws() {
  (api.onboarding.discoverPreview as Mock).mockResolvedValue(MOCK_DISCOVER_PREVIEW);
  await goToStep4Aws();
  await user.click(screen.getByRole("button", { name: /scan my infrastructure/i }));
  await waitFor(() => {
    expect(screen.getByText(/What should we monitor/i)).toBeInTheDocument();
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("CloudAccountWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupUseApiMock();
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: mockWriteText },
      writable: true,
      configurable: true,
    });
  });

  // ── Initial render ───────────────────────────────────────────────────

  describe("initial render", () => {
    it("renders with 'Add Cloud Account' heading", () => {
      renderWizard();
      expect(screen.getByText("Add Cloud Account")).toBeInTheDocument();
    });

    it("has dialog role and aria-modal", () => {
      renderWizard();
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute("aria-modal", "true");
    });

    it("has aria-label on the dialog", () => {
      renderWizard();
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-label", "Add Cloud Account");
    });

    it("shows the progress step labels", () => {
      renderWizard();
      expect(screen.getByText("Choose Cloud")).toBeInTheDocument();
      expect(screen.getByText("Name It")).toBeInTheDocument();
      expect(screen.getByText("Connect")).toBeInTheDocument();
      expect(screen.getByText("Confirm")).toBeInTheDocument();
      expect(screen.getByText("Pick Services")).toBeInTheDocument();
      expect(screen.getByText("All Done")).toBeInTheDocument();
    });

    it("has a close button with aria-label", () => {
      renderWizard();
      expect(screen.getByLabelText("Close wizard")).toBeInTheDocument();
    });
  });

  // ── Escape key & overlay ─────────────────────────────────────────────

  describe("escape key and overlay", () => {
    it("calls onClose when Escape key is pressed", () => {
      const { onClose } = renderWizard();
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when clicking the overlay", async () => {
      const { onClose, container } = renderWizard();
      const overlay = container.querySelector(".wizard-overlay");
      expect(overlay).not.toBeNull();
      await user.click(overlay!);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not call onClose when clicking inside the container", async () => {
      const { onClose } = renderWizard();
      const dialog = screen.getByRole("dialog");
      await user.click(dialog);
      expect(onClose).not.toHaveBeenCalled();
    });

    it("calls onClose when clicking the X close button", async () => {
      const { onClose } = renderWizard();
      await user.click(screen.getByLabelText("Close wizard"));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ── Step 1: Provider Selection ───────────────────────────────────────

  describe("step 1 - provider selection", () => {
    it("shows 'Which cloud do you use?' heading", () => {
      renderWizard();
      expect(screen.getByText("Which cloud do you use?")).toBeInTheDocument();
    });

    it("shows AWS and Azure provider cards", () => {
      renderWizard();
      expect(screen.getByText("Amazon Web Services")).toBeInTheDocument();
      expect(screen.getByText("Microsoft Azure")).toBeInTheDocument();
    });

    it("shows AWS service details", () => {
      renderWizard();
      expect(screen.getByText("EC2, RDS, Lambda, S3, DynamoDB, and more")).toBeInTheDocument();
    });

    it("shows Azure service details", () => {
      renderWizard();
      expect(screen.getByText("VMs, SQL, Functions, AKS, Storage, and more")).toBeInTheDocument();
    });

    it("Next button is disabled when no provider is selected", () => {
      renderWizard();
      const btn = screen.getByRole("button", { name: /next/i });
      expect(btn).toBeDisabled();
    });

    it("selecting AWS adds 'selected' class to the AWS card", async () => {
      renderWizard();
      const awsCard = screen.getByText("Amazon Web Services").closest("button");
      expect(awsCard).not.toBeNull();
      expect(awsCard!.className).not.toContain("selected");

      await user.click(awsCard!);
      expect(awsCard!.className).toContain("selected");
    });

    it("selecting Azure adds 'selected' class to the Azure card", async () => {
      renderWizard();
      const azureCard = screen.getByText("Microsoft Azure").closest("button");
      await user.click(azureCard!);
      expect(azureCard!.className).toContain("selected");
    });

    it("selecting AWS enables the Next button", async () => {
      renderWizard();
      await user.click(screen.getByText("Amazon Web Services"));
      const btn = screen.getByRole("button", { name: /next/i });
      expect(btn).not.toBeDisabled();
    });

    it("clicking Next moves to step 2", async () => {
      renderWizard();
      await goToStep2("aws");
      expect(screen.getByText("Give it a name")).toBeInTheDocument();
    });

    it("Cancel button on step 1 calls onClose", async () => {
      const { onClose } = renderWizard();
      await user.click(screen.getByRole("button", { name: /cancel/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ── Step 2: Account Name + Env Tag ───────────────────────────────────

  describe("step 2 - account details", () => {
    beforeEach(() => {
      (api.onboarding.generateExternalId as Mock).mockResolvedValue(MOCK_EXTERNAL_ID_RESPONSE);
    });

    it("shows 'Give it a name' heading", async () => {
      renderWizard();
      await goToStep2("aws");
      expect(screen.getByText("Give it a name")).toBeInTheDocument();
    });

    it("shows provider-specific description for AWS", async () => {
      renderWizard();
      await goToStep2("aws");
      expect(screen.getByText(/AWS account/)).toBeInTheDocument();
    });

    it("shows provider-specific description for Azure", async () => {
      renderWizard();
      await goToStep2("azure");
      expect(screen.getByText(/Azure subscription/)).toBeInTheDocument();
    });

    it("Next button is disabled when account name is empty", async () => {
      renderWizard();
      await goToStep2("aws");
      const buttons = screen.getAllByRole("button", { name: /next/i });
      const nextBtn = buttons[buttons.length - 1];
      expect(nextBtn).toBeDisabled();
    });

    it("can type an account name", async () => {
      renderWizard();
      await goToStep2("aws");
      const nameInput = screen.getByLabelText(/account name/i);
      await user.type(nameInput, "Prod Account");
      expect(nameInput).toHaveValue("Prod Account");
    });

    it("shows environment tag select with 6 options", async () => {
      renderWizard();
      await goToStep2("aws");
      const select = screen.getByLabelText(/environment tag/i);
      expect(select).toBeInTheDocument();
      const options = select.querySelectorAll("option");
      expect(options).toHaveLength(6);
    });

    it("environment tag options include the expected values", async () => {
      renderWizard();
      await goToStep2("aws");
      expect(screen.getByText("No tag (skip)")).toBeInTheDocument();
      expect(screen.getByText("Production")).toBeInTheDocument();
      expect(screen.getByText("Staging")).toBeInTheDocument();
      expect(screen.getByText("Development")).toBeInTheDocument();
      expect(screen.getByText("Testing")).toBeInTheDocument();
      expect(screen.getByText("Sandbox")).toBeInTheDocument();
    });

    it("Next is enabled after typing a name", async () => {
      renderWizard();
      await goToStep2("aws");
      const nameInput = screen.getByLabelText(/account name/i);
      await user.type(nameInput, "Test");
      const buttons = screen.getAllByRole("button", { name: /next/i });
      const nextBtn = buttons[buttons.length - 1];
      expect(nextBtn).not.toBeDisabled();
    });

    it("Next calls generateExternalId and moves to step 3", async () => {
      renderWizard();
      await goToStep2("aws");
      const nameInput = screen.getByLabelText(/account name/i);
      await user.type(nameInput, "My Account");
      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(api.onboarding.generateExternalId).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(screen.getByText(/Connect your AWS account/i)).toBeInTheDocument();
      });
    });

    it("shows error if generateExternalId fails", async () => {
      (api.onboarding.generateExternalId as Mock).mockRejectedValue(
        new Error("Network error"),
      );
      renderWizard();
      await goToStep2("aws");
      const nameInput = screen.getByLabelText(/account name/i);
      await user.type(nameInput, "My Account");
      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText("Network error")).toBeInTheDocument();
      });
    });

    it("Back button returns to step 1", async () => {
      renderWizard();
      await goToStep2("aws");
      await user.click(screen.getByRole("button", { name: /back/i }));
      expect(screen.getByText("Which cloud do you use?")).toBeInTheDocument();
    });
  });

  // ── Step 3: Connect (AWS) ───────────────────────────────────────────

  describe("step 3 - connect account (AWS)", () => {
    beforeEach(() => {
      (api.onboarding.verifyAws as Mock).mockResolvedValue(MOCK_VERIFY_AWS_SUCCESS);
    });

    it("shows 'Connect your AWS account' heading", async () => {
      renderWizard();
      await goToStep3Aws();
      expect(screen.getByText("Connect your AWS account")).toBeInTheDocument();
    });

    it("shows read-only security reassurance", async () => {
      renderWizard();
      await goToStep3Aws();
      expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    });

    it("shows numbered instructions", async () => {
      renderWizard();
      await goToStep3Aws();
      expect(screen.getByText(/Click the button below/i)).toBeInTheDocument();
      expect(screen.getByText(/Create stack/i)).toBeInTheDocument();
      expect(screen.getByText(/CREATE_COMPLETE/i)).toBeInTheDocument();
      expect(screen.getByText(/RoleArn/i)).toBeInTheDocument();
    });

    it("has a deploy link to AWS CloudFormation console", async () => {
      renderWizard();
      await goToStep3Aws();
      const link = screen.getByText("Open AWS Console");
      expect(link.closest("a")).toHaveAttribute("href", MOCK_EXTERNAL_ID_RESPONSE.cft_console_url);
      expect(link.closest("a")).toHaveAttribute("target", "_blank");
    });

    it("deploy link does NOT point to raw S3", async () => {
      renderWizard();
      await goToStep3Aws();
      const link = screen.getByText("Open AWS Console");
      const href = link.closest("a")?.getAttribute("href") ?? "";
      expect(href).not.toMatch(/^https:\/\/neoguard-config-bucket\.s3/);
      expect(href).toContain("console.aws.amazon.com");
    });

    it("has Role ARN input with helpful hint", async () => {
      renderWizard();
      await goToStep3Aws();
      expect(screen.getByLabelText(/role arn/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Outputs/i).length).toBeGreaterThanOrEqual(1);
    });

    it("has tech details toggle that reveals External ID", async () => {
      renderWizard();
      await goToStep3Aws();
      const toggle = screen.getByText(/show technical details/i);
      expect(toggle).toBeInTheDocument();
      await user.click(toggle);
      expect(screen.getByText("ng-test-external-id-12345")).toBeInTheDocument();
      expect(screen.getByText("123456789012")).toBeInTheDocument();
    });

    it("has copy buttons in tech details", async () => {
      renderWizard();
      await goToStep3Aws();
      await user.click(screen.getByText(/show technical details/i));
      const copyButtons = screen.getAllByTitle(/copy/i);
      expect(copyButtons.length).toBeGreaterThanOrEqual(2);
    });

    it("copy button writes external ID to clipboard", async () => {
      renderWizard();
      await goToStep3Aws();
      await user.click(screen.getByText(/show technical details/i));
      const copyBtn = screen.getByTitle("Copy External ID");
      await user.click(copyBtn);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("ng-test-external-id-12345");
    });

    it("copy button writes Account ID to clipboard", async () => {
      renderWizard();
      await goToStep3Aws();
      await user.click(screen.getByText(/show technical details/i));
      const copyBtn = screen.getByTitle("Copy Account ID");
      await user.click(copyBtn);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("123456789012");
    });

    it("Test Connection button calls verifyAws with correct params", async () => {
      renderWizard();
      await goToStep3Aws();
      const arnInput = screen.getByLabelText(/role arn/i);
      await user.type(arnInput, "arn:aws:iam::111222333444:role/NeoGuardRole");
      await user.click(screen.getByRole("button", { name: /test connection/i }));

      await waitFor(() => {
        expect(api.onboarding.verifyAws).toHaveBeenCalledWith({
          role_arn: "arn:aws:iam::111222333444:role/NeoGuardRole",
          external_id: "ng-test-external-id-12345",
        });
      });
    });

    it("shows loading state during verification", async () => {
      let resolveVerify!: (v: typeof MOCK_VERIFY_AWS_SUCCESS) => void;
      (api.onboarding.verifyAws as Mock).mockReturnValue(
        new Promise((res) => { resolveVerify = res; }),
      );
      renderWizard();
      await goToStep3Aws();
      const arnInput = screen.getByLabelText(/role arn/i);
      await user.type(arnInput, "arn:aws:iam::111222333444:role/NeoGuardRole");
      await user.click(screen.getByRole("button", { name: /test connection/i }));

      await waitFor(() => {
        expect(screen.getByTestId("loading-overlay")).toBeInTheDocument();
        expect(screen.getByText(/Connecting to your AWS account/i)).toBeInTheDocument();
        expect(screen.getByText(/10–20 seconds/i)).toBeInTheDocument();
      });

      resolveVerify(MOCK_VERIFY_AWS_SUCCESS);
      await waitFor(() => {
        expect(screen.queryByTestId("loading-overlay")).not.toBeInTheDocument();
      });
    });

    it("shows error when Role ARN is empty and verify is clicked", async () => {
      renderWizard();
      await goToStep3Aws();
      await user.click(screen.getByRole("button", { name: /test connection/i }));

      await waitFor(() => {
        expect(screen.getByText(/Please paste the Role ARN/i)).toBeInTheDocument();
      });
    });

    it("shows error when verifyAws returns failure", async () => {
      (api.onboarding.verifyAws as Mock).mockResolvedValue(MOCK_VERIFY_AWS_FAILURE);
      renderWizard();
      await goToStep3Aws();
      const arnInput = screen.getByLabelText(/role arn/i);
      await user.type(arnInput, "arn:aws:iam::bad-role");
      await user.click(screen.getByRole("button", { name: /test connection/i }));

      await waitFor(() => {
        expect(screen.getByText("Unable to assume role")).toBeInTheDocument();
      });
    });

    it("shows error when verifyAws throws", async () => {
      (api.onboarding.verifyAws as Mock).mockRejectedValue(
        new Error("Connection timed out"),
      );
      renderWizard();
      await goToStep3Aws();
      const arnInput = screen.getByLabelText(/role arn/i);
      await user.type(arnInput, "arn:aws:iam::111222333444:role/NeoGuardRole");
      await user.click(screen.getByRole("button", { name: /test connection/i }));

      await waitFor(() => {
        expect(screen.getByText("Connection timed out")).toBeInTheDocument();
      });
    });

    it("moves to step 4 on successful verification", async () => {
      renderWizard();
      await goToStep3Aws();
      const arnInput = screen.getByLabelText(/role arn/i);
      await user.type(arnInput, "arn:aws:iam::111222333444:role/NeoGuardRole");
      await user.click(screen.getByRole("button", { name: /test connection/i }));

      await waitFor(() => {
        expect(screen.getByText(/Connection confirmed/i)).toBeInTheDocument();
      });
    });

    it("Back button returns to step 2", async () => {
      renderWizard();
      await goToStep3Aws();
      await user.click(screen.getByRole("button", { name: /back/i }));
      expect(screen.getByText("Give it a name")).toBeInTheDocument();
    });
  });

  // ── Step 3: Connect (Azure — CLI mode, default) ──────────────────────

  describe("step 3 - connect account (Azure CLI mode)", () => {
    beforeEach(() => {
      (api.onboarding.generateExternalId as Mock).mockResolvedValue(MOCK_EXTERNAL_ID_RESPONSE);
    });

    async function goToStep3Azure() {
      await goToStep2("azure");
      const nameInput = screen.getByLabelText(/account name/i);
      await user.type(nameInput, "My Azure Sub");
      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByText(/Connect your Azure subscription/i)).toBeInTheDocument();
      });
    }

    it("shows 'Connect your Azure subscription' heading for Azure", async () => {
      renderWizard();
      await goToStep3Azure();
      expect(screen.getByText("Connect your Azure subscription")).toBeInTheDocument();
    });

    it("defaults to Quick Setup (CLI) tab", async () => {
      renderWizard();
      await goToStep3Azure();
      expect(screen.getByText("Quick Setup (CLI)")).toBeInTheDocument();
      expect(screen.getByText("Manual Setup")).toBeInTheDocument();
      expect(screen.getByText(/One command creates/i)).toBeInTheDocument();
    });

    it("shows the az CLI command to copy", async () => {
      renderWizard();
      await goToStep3Azure();
      expect(screen.getByText(/az ad sp create-for-rbac/i)).toBeInTheDocument();
    });

    it("shows Subscription ID field in CLI mode", async () => {
      renderWizard();
      await goToStep3Azure();
      expect(screen.getByLabelText(/subscription id/i)).toBeInTheDocument();
    });

    it("shows error when clicking Test Connection without CLI output", async () => {
      renderWizard();
      await goToStep3Azure();
      await user.click(screen.getByRole("button", { name: /test connection/i }));

      await waitFor(() => {
        expect(screen.getByText(/paste the JSON output from the az command first/i)).toBeInTheDocument();
      });
    });

    it("parses valid az CLI JSON output and shows success", async () => {
      renderWizard();
      await goToStep3Azure();
      const textarea = screen.getByPlaceholderText(/appId/);
      const cliJson = JSON.stringify({
        appId: "client-aaa",
        password: "secret-bbb",
        tenant: "tenant-ccc",
      });
      fireEvent.change(textarea, { target: { value: cliJson } });

      await waitFor(() => {
        expect(screen.getByText(/Parsed/)).toBeInTheDocument();
      });
    });

    it("shows error for invalid JSON pasted", async () => {
      renderWizard();
      await goToStep3Azure();
      const textarea = screen.getByPlaceholderText(/appId/);
      fireEvent.change(textarea, { target: { value: "not json at all" } });

      await waitFor(() => {
        expect(screen.getByText(/Could not parse/i)).toBeInTheDocument();
      });
    });

    it("shows error when CLI parsed but no subscription ID entered", async () => {
      renderWizard();
      await goToStep3Azure();
      const textarea = screen.getByPlaceholderText(/appId/);
      const cliJson = JSON.stringify({
        appId: "client-aaa",
        password: "secret-bbb",
        tenant: "tenant-ccc",
      });
      fireEvent.change(textarea, { target: { value: cliJson } });
      await waitFor(() => expect(screen.getByText(/Parsed/)).toBeInTheDocument());

      await user.click(screen.getByRole("button", { name: /test connection/i }));

      await waitFor(() => {
        expect(screen.getByText(/enter your Subscription ID/i)).toBeInTheDocument();
      });
    });

    it("calls verifyAzure with parsed CLI values", async () => {
      (api.onboarding.verifyAzure as Mock).mockResolvedValue(MOCK_VERIFY_AZURE_SUCCESS);
      renderWizard();
      await goToStep3Azure();

      const textarea = screen.getByPlaceholderText(/appId/);
      const cliJson = JSON.stringify({
        appId: "client-aaa",
        password: "secret-bbb",
        tenant: "tenant-ccc",
      });
      fireEvent.change(textarea, { target: { value: cliJson } });
      await waitFor(() => expect(screen.getByText(/Parsed/)).toBeInTheDocument());

      await user.type(screen.getByLabelText(/subscription id/i), "sub-ddd");
      await user.click(screen.getByRole("button", { name: /test connection/i }));

      await waitFor(() => {
        expect(api.onboarding.verifyAzure).toHaveBeenCalledWith({
          azure_tenant_id: "tenant-ccc",
          client_id: "client-aaa",
          client_secret: "secret-bbb",
          subscription_id: "sub-ddd",
        });
      });
    });

    it("does not show technical details toggle for Azure", async () => {
      renderWizard();
      await goToStep3Azure();
      expect(screen.queryByText(/show technical details/i)).not.toBeInTheDocument();
    });

    it("does not call generateExternalId for Azure", async () => {
      renderWizard();
      await goToStep3Azure();
      expect(api.onboarding.generateExternalId).not.toHaveBeenCalled();
    });
  });

  // ── Step 3: Connect (Azure — Manual mode) ──────────────────────────

  describe("step 3 - connect account (Azure Manual mode)", () => {
    beforeEach(() => {
      (api.onboarding.generateExternalId as Mock).mockResolvedValue(MOCK_EXTERNAL_ID_RESPONSE);
    });

    async function goToStep3AzureManual() {
      await goToStep2("azure");
      const nameInput = screen.getByLabelText(/account name/i);
      await user.type(nameInput, "My Azure Sub");
      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(screen.getByText(/Connect your Azure subscription/i)).toBeInTheDocument();
      });
      await user.click(screen.getByText("Manual Setup"));
    }

    it("switching to Manual Setup shows credential fields", async () => {
      renderWizard();
      await goToStep3AzureManual();
      expect(screen.getByLabelText(/directory \(tenant\) id/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/application \(client\) id/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/client secret/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/subscription id/i)).toBeInTheDocument();
    });

    it("shows numbered step cards in manual mode", async () => {
      renderWizard();
      await goToStep3AzureManual();
      expect(screen.getByText("Create an App Registration")).toBeInTheDocument();
      expect(screen.getByText("Copy IDs from the Overview page")).toBeInTheDocument();
      expect(screen.getByText("Create a client secret")).toBeInTheDocument();
      expect(screen.getByText("Assign Reader role")).toBeInTheDocument();
    });

    it("shows deploy link to Azure Portal in manual mode", async () => {
      renderWizard();
      await goToStep3AzureManual();
      const link = screen.getByText("Open Azure Portal");
      expect(link.closest("a")).toHaveAttribute("target", "_blank");
      expect(link.closest("a")?.getAttribute("href")).toContain("portal.azure.com");
    });

    it("shows error when fields are empty and verify is clicked", async () => {
      renderWizard();
      await goToStep3AzureManual();
      await user.click(screen.getByRole("button", { name: /test connection/i }));

      await waitFor(() => {
        expect(screen.getByText(/Please fill in all the fields/i)).toBeInTheDocument();
      });
    });

    it("calls verifyAzure with manual field values", async () => {
      (api.onboarding.verifyAzure as Mock).mockResolvedValue(MOCK_VERIFY_AZURE_SUCCESS);
      renderWizard();
      await goToStep3AzureManual();

      await user.type(screen.getByLabelText(/directory \(tenant\) id/i), "tenant-123");
      await user.type(screen.getByLabelText(/application \(client\) id/i), "client-456");
      await user.type(screen.getByLabelText(/client secret/i), "secret-789");
      await user.type(screen.getByLabelText(/subscription id/i), "sub-000");
      await user.click(screen.getByRole("button", { name: /test connection/i }));

      await waitFor(() => {
        expect(api.onboarding.verifyAzure).toHaveBeenCalledWith({
          azure_tenant_id: "tenant-123",
          client_id: "client-456",
          client_secret: "secret-789",
          subscription_id: "sub-000",
        });
      });
    });

    it("shows enterprise application instructions for Object ID", async () => {
      renderWizard();
      await goToStep3AzureManual();
      expect(screen.getByText(/Enterprise applications/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Object ID/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Step 4: Connection Confirmed ────────────────────────────────────

  describe("step 4 - connection confirmed", () => {
    it("shows 'Connection confirmed!' heading", async () => {
      renderWizard();
      await goToStep4Aws();
      expect(screen.getByText("Connection confirmed!")).toBeInTheDocument();
    });

    it("shows the AWS account ID", async () => {
      renderWizard();
      await goToStep4Aws();
      expect(screen.getByText("111222333444")).toBeInTheDocument();
    });

    it("shows service verification results with ok status", async () => {
      renderWizard();
      await goToStep4Aws();
      expect(screen.getByText("EC2")).toBeInTheDocument();
      expect(screen.getByText("RDS")).toBeInTheDocument();
      expect(screen.getByText("S3")).toBeInTheDocument();
    });

    it("shows error text for failed services", async () => {
      renderWizard();
      await goToStep4Aws();
      expect(screen.getByText("Access denied")).toBeInTheDocument();
    });

    it("has a 'Scan My Infrastructure' button", async () => {
      renderWizard();
      await goToStep4Aws();
      expect(screen.getByRole("button", { name: /scan my infrastructure/i })).toBeInTheDocument();
    });

    it("Back button returns to step 3", async () => {
      renderWizard();
      await goToStep4Aws();
      await user.click(screen.getByRole("button", { name: /back/i }));
      expect(screen.getByText(/Connect your AWS account/i)).toBeInTheDocument();
    });
  });

  // ── Step 5: Region & Service Selection ───────────────────────────────

  describe("step 5 - region and service selection", () => {
    it("shows 'What should we monitor?' heading", async () => {
      renderWizard();
      await goToStep5Aws();
      expect(screen.getByText("What should we monitor?")).toBeInTheDocument();
    });

    it("shows discovery totals in description", async () => {
      renderWizard();
      await goToStep5Aws();
      expect(screen.getByText(/8 resources across 2 regions/)).toBeInTheDocument();
    });

    it("shows region checkboxes", async () => {
      renderWizard();
      await goToStep5Aws();
      expect(screen.getByText("us-east-1")).toBeInTheDocument();
      expect(screen.getByText("us-west-2")).toBeInTheDocument();
      expect(screen.getByText("eu-west-1")).toBeInTheDocument();
    });

    it("shows service checkboxes", async () => {
      renderWizard();
      await goToStep5Aws();
      expect(screen.getByText("EC2")).toBeInTheDocument();
      expect(screen.getByText("RDS")).toBeInTheDocument();
      expect(screen.getByText("S3")).toBeInTheDocument();
    });

    it("pre-selects all regions by default", async () => {
      renderWizard();
      await goToStep5Aws();
      for (const region of MOCK_REGIONS.aws) {
        const label = screen.getByText(region).closest("label");
        const checkbox = label?.querySelector("input[type='checkbox']");
        expect(checkbox).toBeChecked();
      }
    });

    it("shows resource count badges on regions", async () => {
      renderWizard();
      await goToStep5Aws();
      expect(screen.getByText("7")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    it("has Select All / Deselect All toggle for regions", async () => {
      renderWizard();
      await goToStep5Aws();
      const selectAllButtons = screen.getAllByText(/select all/i);
      expect(selectAllButtons.length).toBeGreaterThanOrEqual(1);
    });

    it("can toggle a region checkbox", async () => {
      renderWizard();
      await goToStep5Aws();
      const usEast1Label = screen.getByText("us-east-1").closest("label");
      const checkbox = usEast1Label?.querySelector("input[type='checkbox']") as HTMLInputElement;
      expect(checkbox.checked).toBe(true);
      await user.click(checkbox);
      expect(checkbox.checked).toBe(false);
    });

    it("can toggle a service checkbox", async () => {
      renderWizard();
      await goToStep5Aws();
      const ec2Label = screen.getByText("EC2").closest("label");
      const checkbox = ec2Label?.querySelector("input[type='checkbox']") as HTMLInputElement;
      expect(checkbox.checked).toBe(true);
      await user.click(checkbox);
      expect(checkbox.checked).toBe(false);
    });

    it("Start Monitoring button is disabled when no regions selected", async () => {
      renderWizard();
      await goToStep5Aws();
      for (const region of MOCK_REGIONS.aws) {
        const checkbox = screen.getByText(region).closest("label")?.querySelector("input") as HTMLInputElement;
        await user.click(checkbox);
      }

      const btn = screen.getByRole("button", { name: /start monitoring/i });
      expect(btn).toBeDisabled();
    });

    it("calls createAccount with selected regions and services on submit", async () => {
      (api.aws.createAccount as Mock).mockResolvedValue({ id: "acc-1" });
      renderWizard();
      await goToStep5Aws();

      await user.click(screen.getByRole("button", { name: /start monitoring/i }));

      await waitFor(() => {
        expect(api.aws.createAccount).toHaveBeenCalledTimes(1);
        const callArgs = (api.aws.createAccount as Mock).mock.calls[0][0];
        expect(callArgs.name).toBe("My AWS Account");
        expect(callArgs.role_arn).toBe("arn:aws:iam::111222333444:role/NeoGuardRole");
        expect(callArgs.external_id).toBe("ng-test-external-id-12345");
        expect(callArgs.regions).toEqual(expect.arrayContaining(["us-east-1", "us-west-2"]));
      });
    });

    it("shows error when createAccount fails", async () => {
      (api.aws.createAccount as Mock).mockRejectedValue(new Error("Quota exceeded"));
      renderWizard();
      await goToStep5Aws();

      await user.click(screen.getByRole("button", { name: /start monitoring/i }));

      await waitFor(() => {
        expect(screen.getByText("Quota exceeded")).toBeInTheDocument();
      });
    });
  });

  // ── Step 6: Success ──────────────────────────────────────────────────

  describe("step 6 - success", () => {
    async function goToStep6Aws() {
      (api.aws.createAccount as Mock).mockResolvedValue({ id: "acc-1" });
      await goToStep5Aws();
      await user.click(screen.getByRole("button", { name: /start monitoring/i }));
      await waitFor(() => {
        expect(screen.getByText(/You're all set!/i)).toBeInTheDocument();
      });
    }

    it("shows 'You're all set!' heading", async () => {
      renderWizard();
      await goToStep6Aws();
      expect(screen.getByText(/You're all set!/i)).toBeInTheDocument();
    });

    it("shows the account name", async () => {
      renderWizard();
      await goToStep6Aws();
      expect(screen.getByText("My AWS Account")).toBeInTheDocument();
    });

    it("'See My Infrastructure' button calls onSuccess", async () => {
      const { onSuccess } = renderWizard();
      await goToStep6Aws();
      await user.click(screen.getByRole("button", { name: /see my infrastructure/i }));
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });

    it("'Connect Another Account' resets wizard to step 1", async () => {
      renderWizard();
      await goToStep6Aws();
      await user.click(screen.getByRole("button", { name: /connect another account/i }));

      expect(screen.getByText("Which cloud do you use?")).toBeInTheDocument();
      const nextBtn = screen.getByRole("button", { name: /next/i });
      expect(nextBtn).toBeDisabled();
    });

    it("does not show footer navigation buttons on step 6", async () => {
      renderWizard();
      await goToStep6Aws();
      expect(screen.queryByRole("button", { name: /back/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    });
  });

  // ── Error dismissal ──────────────────────────────────────────────────

  describe("error handling", () => {
    it("error message can be dismissed", async () => {
      (api.onboarding.generateExternalId as Mock).mockRejectedValue(
        new Error("Server error"),
      );
      renderWizard();
      await goToStep2("aws");
      const nameInput = screen.getByLabelText(/account name/i);
      await user.type(nameInput, "Test");
      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText("Server error")).toBeInTheDocument();
      });

      const dismissBtn = screen.getByText("Server error")
        .closest(".wizard-error")
        ?.querySelector(".wizard-error-dismiss");
      expect(dismissBtn).not.toBeNull();
      await user.click(dismissBtn!);

      expect(screen.queryByText("Server error")).not.toBeInTheDocument();
    });

    it("handles non-Error thrown objects gracefully", async () => {
      (api.onboarding.generateExternalId as Mock).mockRejectedValue("string error");
      renderWizard();
      await goToStep2("aws");
      const nameInput = screen.getByLabelText(/account name/i);
      await user.type(nameInput, "Test");
      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText("Failed to prepare your account setup")).toBeInTheDocument();
      });
    });
  });

  // ── Full AWS flow end-to-end ─────────────────────────────────────────

  describe("full AWS wizard flow", () => {
    it("completes the entire 6-step AWS flow", async () => {
      (api.onboarding.generateExternalId as Mock).mockResolvedValue(MOCK_EXTERNAL_ID_RESPONSE);
      (api.onboarding.verifyAws as Mock).mockResolvedValue(MOCK_VERIFY_AWS_SUCCESS);
      (api.onboarding.discoverPreview as Mock).mockResolvedValue(MOCK_DISCOVER_PREVIEW);
      (api.aws.createAccount as Mock).mockResolvedValue({ id: "acc-final" });

      const { onSuccess } = renderWizard();

      // Step 1: Select AWS
      await user.click(screen.getByText("Amazon Web Services"));
      await user.click(screen.getByRole("button", { name: /next/i }));

      // Step 2: Name account
      await waitFor(() => expect(screen.getByText("Give it a name")).toBeInTheDocument());
      await user.type(screen.getByLabelText(/account name/i), "E2E Test Account");
      await user.click(screen.getByRole("button", { name: /next/i }));

      // Step 3: Connect + Test
      await waitFor(() =>
        expect(screen.getByText("Connect your AWS account")).toBeInTheDocument(),
      );
      await user.type(
        screen.getByLabelText(/role arn/i),
        "arn:aws:iam::111222333444:role/NeoGuardRole",
      );
      await user.click(screen.getByRole("button", { name: /test connection/i }));

      // Step 4: Confirmation
      await waitFor(() => expect(screen.getByText("Connection confirmed!")).toBeInTheDocument());
      await user.click(screen.getByRole("button", { name: /scan my infrastructure/i }));

      // Step 5: Pick services
      await waitFor(() => expect(screen.getByText("What should we monitor?")).toBeInTheDocument());
      await user.click(screen.getByRole("button", { name: /start monitoring/i }));

      // Step 6: Success
      await waitFor(() =>
        expect(screen.getByText(/You're all set!/i)).toBeInTheDocument(),
      );
      expect(screen.getByText("E2E Test Account")).toBeInTheDocument();

      // Click See My Infrastructure
      await user.click(screen.getByRole("button", { name: /see my infrastructure/i }));
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });
});

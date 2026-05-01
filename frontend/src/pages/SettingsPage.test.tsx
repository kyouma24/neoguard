import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { SettingsPage } from "./SettingsPage";
import { api } from "../services/api";
import type { AWSAccount, AzureSubscription, NotificationChannel, APIKey } from "../types";

vi.mock("../services/api", () => ({
  api: {
    aws: {
      listAccounts: vi.fn(),
      createAccount: vi.fn(),
      updateAccount: vi.fn(),
      deleteAccount: vi.fn(),
    },
    azure: {
      listSubscriptions: vi.fn(),
      createSubscription: vi.fn(),
      updateSubscription: vi.fn(),
      deleteSubscription: vi.fn(),
    },
    notifications: {
      listChannels: vi.fn(),
      createChannel: vi.fn(),
      updateChannel: vi.fn(),
      deleteChannel: vi.fn(),
      testChannel: vi.fn(),
    },
    apiKeys: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// ─── Test fixtures ────────────────────────────────────────────────────────

const AWS_ACCOUNT: AWSAccount = {
  id: "acc-1",
  tenant_id: "default",
  name: "Production AWS",
  account_id: "271547278517",
  role_arn: "arn:aws:iam::271547278517:role/NeoGuardCollectorRole",
  external_id: "ng-a1b2c3d4-e5f6a7b8-c9d0e1f2-a3b4c5d6",
  regions: ["ap-south-1", "us-east-1"],
  enabled: true,
  collect_config: {},
  last_sync_at: "2026-04-30T08:59:24.696066Z",
  created_at: "2026-04-30T06:16:17.376447Z",
  updated_at: "2026-04-30T06:19:14.036724Z",
};

const AZURE_SUB: AzureSubscription = {
  id: "sub-1",
  tenant_id: "default",
  name: "Production Azure",
  subscription_id: "2fd5b44e-b6cc-4877-bd13-4a8154f814d8",
  azure_tenant_id: "ae3f91d7-c809-4dc6-a72c-f7b067658ed0",
  client_id: "33486acd-8631-4af8-a92b-f54413c1da52",
  regions: ["centralindia"],
  enabled: true,
  collect_config: {},
  last_sync_at: "2026-04-30T08:59:38.200991Z",
  created_at: "2026-04-30T08:15:28.377170Z",
  updated_at: "2026-04-30T08:15:28.377170Z",
};

const WEBHOOK_CHANNEL: NotificationChannel = {
  id: "ch-1",
  tenant_id: "default",
  name: "Ops Webhook",
  channel_type: "webhook",
  config: { url: "https://hooks.example.com/alerts" },
  enabled: true,
  created_at: "2026-04-30T10:00:00Z",
};

const SLACK_CHANNEL: NotificationChannel = {
  id: "ch-2",
  tenant_id: "default",
  name: "Alerts Slack",
  channel_type: "slack",
  config: { webhook_url: "https://hooks.slack.com/services/T00/B00/xxxx" },
  enabled: false,
  created_at: "2026-04-30T11:00:00Z",
};

const API_KEY: APIKey = {
  id: "key-1",
  tenant_id: "default",
  name: "CI/CD Pipeline",
  key_prefix: "ng_abc12",
  scopes: ["read", "write"],
  rate_limit: 1000,
  enabled: true,
  expires_at: null,
  last_used_at: "2026-04-30T12:00:00Z",
  created_at: "2026-04-30T06:00:00Z",
};

const ADMIN_KEY: APIKey = {
  id: "key-2",
  tenant_id: "default",
  name: "Admin Console",
  key_prefix: "ng_xyz99",
  scopes: ["admin"],
  rate_limit: 5000,
  enabled: true,
  expires_at: "2026-12-31T23:59:59Z",
  last_used_at: null,
  created_at: "2026-04-30T07:00:00Z",
};

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

function mockDefaults() {
  (api.aws.listAccounts as Mock).mockResolvedValue([AWS_ACCOUNT]);
  (api.azure.listSubscriptions as Mock).mockResolvedValue([AZURE_SUB]);
  (api.notifications.listChannels as Mock).mockResolvedValue([WEBHOOK_CHANNEL, SLACK_CHANNEL]);
  (api.apiKeys.list as Mock).mockResolvedValue([API_KEY, ADMIN_KEY]);
}

function mockEmpty() {
  (api.aws.listAccounts as Mock).mockResolvedValue([]);
  (api.azure.listSubscriptions as Mock).mockResolvedValue([]);
  (api.notifications.listChannels as Mock).mockResolvedValue([]);
  (api.apiKeys.list as Mock).mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS PAGE — TAB NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════

describe("Settings Page — Tabs", () => {
  it("renders with Cloud Accounts tab active by default", async () => {
    mockDefaults();
    renderPage();
    expect(screen.getAllByText("Cloud Accounts").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Notification Channels")).toBeInTheDocument();
    expect(screen.getByText("API Keys")).toBeInTheDocument();
  });

  it("switches to Notification Channels tab", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText("Notification Channels"));

    await waitFor(() => {
      expect(screen.getByText("Add Channel")).toBeInTheDocument();
    });
  });

  it("switches to API Keys tab", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByText("API Keys"));

    await waitFor(() => {
      expect(screen.getByText("Create API Key")).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CLOUD ACCOUNTS TAB
// ═══════════════════════════════════════════════════════════════════════════

describe("Cloud Accounts Tab", () => {
  it("shows unified list of AWS and Azure accounts", async () => {
    mockDefaults();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Production AWS")).toBeInTheDocument();
      expect(screen.getByText("Production Azure")).toBeInTheDocument();
    });
  });

  it("shows provider badges", async () => {
    mockDefaults();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("AWS")).toBeInTheDocument();
      expect(screen.getByText("Azure")).toBeInTheDocument();
    });
  });

  it("shows account details (account IDs, regions)", async () => {
    mockDefaults();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Account 271547278517")).toBeInTheDocument();
      expect(screen.getByText(/2 regions/)).toBeInTheDocument();
      expect(screen.getByText(/1 region$/)).toBeInTheDocument();
    });
  });

  it("shows Active/Disabled badges", async () => {
    mockDefaults();
    renderPage();

    await waitFor(() => {
      const badges = screen.getAllByText("Active");
      expect(badges.length).toBe(2);
    });
  });

  it("shows empty state when no accounts exist", async () => {
    mockEmpty();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("No cloud accounts connected")).toBeInTheDocument();
      expect(screen.getByText("Add Your First Account")).toBeInTheDocument();
    });
  });

  it("shows account count", async () => {
    mockDefaults();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("2 accounts connected")).toBeInTheDocument();
    });
  });

  it("has a single 'Add Account' button", async () => {
    mockDefaults();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Add Account")).toBeInTheDocument();
    });
    expect(screen.queryByText("Add AWS Account")).not.toBeInTheDocument();
    expect(screen.queryByText("Add Azure Subscription")).not.toBeInTheDocument();
  });

  it("can toggle account enabled status", async () => {
    mockDefaults();
    (api.aws.updateAccount as Mock).mockResolvedValue({ ...AWS_ACCOUNT, enabled: false });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Production AWS")).toBeInTheDocument();
    });

    const toggleBtns = screen.getAllByTitle("Disable");
    await user.click(toggleBtns[0]);

    expect(api.aws.updateAccount).toHaveBeenCalledWith("acc-1", { enabled: false });
  });

  it("shows delete confirmation before deleting", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Production AWS")).toBeInTheDocument();
    });

    const deleteBtns = screen.getAllByRole("button");
    const trashBtn = deleteBtns.find((btn) => btn.querySelector('[class*="lucide-trash"]') !== null
      || btn.innerHTML.includes("trash"));

    const awsCard = screen.getByText("Production AWS").closest(".card") as HTMLElement;
    const cardBtns = within(awsCard).getAllByRole("button");
    await user.click(cardBtns[cardBtns.length - 1]);

    await waitFor(() => {
      expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ONBOARDING WIZARD
// ═══════════════════════════════════════════════════════════════════════════

describe("Onboarding Wizard", () => {
  it("opens wizard when clicking 'Add Account'", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Add Account")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Add Account"));

    await waitFor(() => {
      expect(screen.getByText("Add Cloud Account")).toBeInTheDocument();
      expect(screen.getByText("Step 1 of 1: Choose Provider")).toBeInTheDocument();
    });
  });

  it("shows AWS and Azure provider cards", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Add Account")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Account"));

    await waitFor(() => {
      expect(screen.getByText("Amazon Web Services")).toBeInTheDocument();
      expect(screen.getByText("Microsoft Azure")).toBeInTheDocument();
    });
  });

  it("selecting AWS updates step count to 6", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Add Account")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Account"));

    await waitFor(() => {
      expect(screen.getByText("Amazon Web Services")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Amazon Web Services"));

    expect(screen.getByText("Step 1 of 6: Choose Provider")).toBeInTheDocument();
    expect(screen.getByText("Selected")).toBeInTheDocument();
  });

  it("selecting Azure updates step count to 6", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Add Account")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Account"));

    await waitFor(() => {
      expect(screen.getByText("Microsoft Azure")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Microsoft Azure"));

    expect(screen.getByText("Step 1 of 6: Choose Provider")).toBeInTheDocument();
  });

  it("navigates through AWS wizard steps", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Add Account")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Account"));

    // Step 1: Choose AWS
    await waitFor(() => {
      expect(screen.getByText("Amazon Web Services")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Amazon Web Services"));
    await user.click(screen.getByText(/Next/));

    // Step 2: Account Details
    await waitFor(() => {
      expect(screen.getByText("Step 2 of 6: Account Details")).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText(/Production, Staging/), "My AWS Prod");
    await user.type(screen.getByPlaceholderText("271547278517"), "123456789012");
    await user.click(screen.getByText(/Next/));

    // Step 3: Deploy IAM Role
    await waitFor(() => {
      expect(screen.getByText("Step 3 of 6: Deploy IAM Role")).toBeInTheDocument();
      expect(screen.getByText("Deploy CloudFormation Stack in AWS Console")).toBeInTheDocument();
    });
  });

  it("AWS step 2 validates 12-digit account ID", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Add Account")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Account"));

    await waitFor(() => {
      expect(screen.getByText("Amazon Web Services")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Amazon Web Services"));
    await user.click(screen.getByText(/Next/));

    // Only enter name, no account ID
    await user.type(screen.getByPlaceholderText(/Production, Staging/), "Test");

    // Next should be disabled
    const nextBtn = screen.getByText(/Next/).closest("button");
    expect(nextBtn).toBeDisabled();
  });

  it("generates cryptographic external ID in ng-xxxx format", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Add Account")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Account"));
    await waitFor(() => {
      expect(screen.getByText("Amazon Web Services")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Amazon Web Services"));
    await user.click(screen.getByText(/Next/));

    // Fill step 2
    await user.type(screen.getByPlaceholderText(/Production, Staging/), "Test");
    await user.type(screen.getByPlaceholderText("271547278517"), "123456789012");
    await user.click(screen.getByText(/Next/));

    // Step 3 — should see an external ID
    await waitFor(() => {
      const externalIdInput = screen.getByDisplayValue(/^ng-[a-f0-9]{8}-[a-f0-9]{8}-[a-f0-9]{8}-[a-f0-9]{8}$/);
      expect(externalIdInput).toBeInTheDocument();
    });
  });

  it("CFT deploy link contains real S3 bucket URL", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Add Account")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Account"));
    await waitFor(() => {
      expect(screen.getByText("Amazon Web Services")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Amazon Web Services"));
    await user.click(screen.getByText(/Next/));
    await user.type(screen.getByPlaceholderText(/Production, Staging/), "Test");
    await user.type(screen.getByPlaceholderText("271547278517"), "123456789012");
    await user.click(screen.getByText(/Next/));

    await waitFor(() => {
      const link = screen.getByText("Deploy CloudFormation Stack in AWS Console").closest("a");
      expect(link).toHaveAttribute("href", expect.stringContaining("neoguard-config-bucket.s3.ap-south-1.amazonaws.com"));
      expect(link).toHaveAttribute("href", expect.stringContaining("param_ExternalId=ng-"));
      expect(link).toHaveAttribute("target", "_blank");
    });
  });

  it("navigates through Azure wizard steps", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Add Account")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Account"));

    // Step 1: Choose Azure
    await waitFor(() => {
      expect(screen.getByText("Microsoft Azure")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Microsoft Azure"));
    await user.click(screen.getByText(/Next/));

    // Step 2: Subscription Details
    await waitFor(() => {
      expect(screen.getByText("Step 2 of 6: Subscription Details")).toBeInTheDocument();
    });
    await user.type(screen.getByPlaceholderText(/Production, Staging/), "My Azure");
    await user.type(screen.getByPlaceholderText("2fd5b44e-b6cc-4877-bd13-4a8154f814d8"), "aaaa-bbbb");
    await user.type(screen.getByPlaceholderText("ae3f91d7-c809-4dc6-a72c-f7b067658ed0"), "cccc-dddd");
    await user.click(screen.getByText(/Next/));

    // Step 3: Service Principal
    await waitFor(() => {
      expect(screen.getByText("Step 3 of 6: Service Principal")).toBeInTheDocument();
      expect(screen.getByText("Open Azure App Registrations")).toBeInTheDocument();
    });
  });

  it("Back button returns to previous step", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Add Account")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Account"));
    await waitFor(() => {
      expect(screen.getByText("Amazon Web Services")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Amazon Web Services"));
    await user.click(screen.getByText(/Next/));

    // On step 2
    await waitFor(() => {
      expect(screen.getByText(/Account Details/)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Back/));

    // Back to step 1
    await waitFor(() => {
      expect(screen.getByText("Amazon Web Services")).toBeInTheDocument();
      expect(screen.getByText("Microsoft Azure")).toBeInTheDocument();
    });
  });

  it("Cancel button on step 1 closes wizard", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Add Account")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Account"));

    await waitFor(() => {
      expect(screen.getByText("Add Cloud Account")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Cancel"));

    await waitFor(() => {
      expect(screen.queryByText("Add Cloud Account")).not.toBeInTheDocument();
    });
  });

  it("AWS region selector has Select All / Clear", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Add Account")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Account"));
    await waitFor(() => {
      expect(screen.getByText("Amazon Web Services")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Amazon Web Services"));
    await user.click(screen.getByText(/Next/));

    // Step 2: fill account details
    await user.type(screen.getByPlaceholderText(/Production, Staging/), "Test");
    await user.type(screen.getByPlaceholderText("271547278517"), "123456789012");
    await user.click(screen.getByText(/Next/));

    // Step 3: IAM role — check confirm + fill ARN
    await waitFor(() => {
      expect(screen.getByText(/Deploy IAM Role/)).toBeInTheDocument();
    });
    await user.click(screen.getByRole("checkbox"));
    await user.type(screen.getByPlaceholderText(/arn:aws/), "arn:aws:iam::123456789012:role/NeoGuardCollectorRole");
    await user.click(screen.getByText(/Next/));

    // Step 4: Regions
    await waitFor(() => {
      expect(screen.getByText("Select All")).toBeInTheDocument();
      expect(screen.getByText("Clear")).toBeInTheDocument();
      expect(screen.getByText("Mumbai")).toBeInTheDocument();
      expect(screen.getByText("ap-south-1")).toBeInTheDocument();
    });
  });

  it("AWS resource selector shows all resource types", async () => {
    mockDefaults();
    (api.aws.createAccount as Mock).mockResolvedValue(AWS_ACCOUNT);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Add Account")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Account"));
    await waitFor(() => {
      expect(screen.getByText("Amazon Web Services")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Amazon Web Services"));
    await user.click(screen.getByText(/Next/));

    await user.type(screen.getByPlaceholderText(/Production, Staging/), "Test");
    await user.type(screen.getByPlaceholderText("271547278517"), "123456789012");
    await user.click(screen.getByText(/Next/));

    await user.click(screen.getByRole("checkbox"));
    await user.type(screen.getByPlaceholderText(/arn:aws/), "arn:aws:iam::123456789012:role/Test");
    await user.click(screen.getByText(/Next/));

    // Skip regions (already all selected)
    await user.click(screen.getByText(/Next/));

    // Step 5: Resources
    await waitFor(() => {
      expect(screen.getByText("EC2")).toBeInTheDocument();
      expect(screen.getByText("Virtual machines")).toBeInTheDocument();
      expect(screen.getByText("RDS")).toBeInTheDocument();
      expect(screen.getByText("Lambda")).toBeInTheDocument();
      expect(screen.getByText("S3")).toBeInTheDocument();
      expect(screen.getByText("DynamoDB")).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATION CHANNELS TAB
// ═══════════════════════════════════════════════════════════════════════════

describe("Notification Channels Tab", () => {
  it("lists all channels with type badges", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("Notification Channels"));

    await waitFor(() => {
      expect(screen.getByText("Ops Webhook")).toBeInTheDocument();
      expect(screen.getByText("Alerts Slack")).toBeInTheDocument();
      expect(screen.getByText("Webhook")).toBeInTheDocument();
      expect(screen.getByText("Slack")).toBeInTheDocument();
    });
  });

  it("shows enabled/disabled status", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("Notification Channels"));

    await waitFor(() => {
      expect(screen.getByText("Enabled")).toBeInTheDocument();
      expect(screen.getByText("Disabled")).toBeInTheDocument();
    });
  });

  it("shows channel config details", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("Notification Channels"));

    await waitFor(() => {
      expect(screen.getByText(/hooks\.example\.com/)).toBeInTheDocument();
    });
  });

  it("shows empty state when no channels exist", async () => {
    mockEmpty();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("Notification Channels"));

    await waitFor(() => {
      expect(screen.getByText("No notification channels configured")).toBeInTheDocument();
    });
  });

  it("opens create channel modal", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("Notification Channels"));

    await waitFor(() => {
      expect(screen.getByText("Add Channel")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Channel"));

    await waitFor(() => {
      expect(screen.getByText("Add Notification Channel")).toBeInTheDocument();
      expect(screen.getByText("Channel Type")).toBeInTheDocument();
    });
  });

  it("shows webhook config fields by default", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("Notification Channels"));
    await waitFor(() => {
      expect(screen.getByText("Add Channel")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Add Channel"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("https://example.com/webhook")).toBeInTheDocument();
    });
  });

  it("can toggle channel enabled status", async () => {
    mockDefaults();
    (api.notifications.updateChannel as Mock).mockResolvedValue({ ...WEBHOOK_CHANNEL, enabled: false });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("Notification Channels"));

    await waitFor(() => {
      expect(screen.getByText("Ops Webhook")).toBeInTheDocument();
    });

    const enableBtns = screen.getAllByTitle("Disable");
    await user.click(enableBtns[0]);

    expect(api.notifications.updateChannel).toHaveBeenCalledWith("ch-1", { enabled: false });
  });

  it("test button calls test endpoint", async () => {
    mockDefaults();
    (api.notifications.testChannel as Mock).mockResolvedValue({ success: true });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("Notification Channels"));

    await waitFor(() => {
      expect(screen.getByText("Ops Webhook")).toBeInTheDocument();
    });

    const testBtns = screen.getAllByTitle("Send test notification");
    await user.click(testBtns[0]);

    await waitFor(() => {
      expect(api.notifications.testChannel).toHaveBeenCalledWith("ch-1");
      expect(screen.getByText("Test OK")).toBeInTheDocument();
    });
  });

  it("shows test failed badge on test failure", async () => {
    mockDefaults();
    (api.notifications.testChannel as Mock).mockRejectedValue(new Error("timeout"));
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("Notification Channels"));

    await waitFor(() => {
      expect(screen.getByText("Ops Webhook")).toBeInTheDocument();
    });

    const testBtns = screen.getAllByTitle("Send test notification");
    await user.click(testBtns[0]);

    await waitFor(() => {
      expect(screen.getByText("Test Failed")).toBeInTheDocument();
    });
  });

  it("delete shows confirmation dialog", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("Notification Channels"));

    await waitFor(() => {
      expect(screen.getByText("Ops Webhook")).toBeInTheDocument();
    });

    // Find webhook card and click its last button (trash)
    const card = screen.getByText("Ops Webhook").closest(".card") as HTMLElement;
    const btns = within(card).getAllByRole("button");
    await user.click(btns[btns.length - 1]);

    await waitFor(() => {
      expect(screen.getByText("Delete Notification Channel")).toBeInTheDocument();
      expect(screen.getByText(/Active alerts will no longer send/)).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// API KEYS TAB
// ═══════════════════════════════════════════════════════════════════════════

describe("API Keys Tab", () => {
  it("lists all keys in a table", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("API Keys"));

    await waitFor(() => {
      expect(screen.getByText("CI/CD Pipeline")).toBeInTheDocument();
      expect(screen.getByText("Admin Console")).toBeInTheDocument();
    });
  });

  it("shows key prefix with ellipsis", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("API Keys"));

    await waitFor(() => {
      expect(screen.getByText("ng_abc12...")).toBeInTheDocument();
      expect(screen.getByText("ng_xyz99...")).toBeInTheDocument();
    });
  });

  it("shows scope badges with color coding", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("API Keys"));

    await waitFor(() => {
      expect(screen.getByText("read")).toBeInTheDocument();
      expect(screen.getByText("write")).toBeInTheDocument();
      expect(screen.getByText("admin")).toBeInTheDocument();
    });
  });

  it("shows rate limit per key", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("API Keys"));

    await waitFor(() => {
      expect(screen.getByText("1000/min")).toBeInTheDocument();
      expect(screen.getByText("5000/min")).toBeInTheDocument();
    });
  });

  it("shows 'Never' for keys with no expiry", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("API Keys"));

    await waitFor(() => {
      const neverCells = screen.getAllByText("Never");
      expect(neverCells.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows empty state when no keys exist", async () => {
    mockEmpty();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("API Keys"));

    await waitFor(() => {
      expect(screen.getByText("No API keys created")).toBeInTheDocument();
    });
  });

  it("opens create key modal", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("API Keys"));

    await waitFor(() => {
      expect(screen.getByText("Create API Key")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Create API Key"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("CI/CD Pipeline Key")).toBeInTheDocument();
    });
  });

  it("create modal has scope toggles", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("API Keys"));
    await waitFor(() => {
      expect(screen.getByText("Create API Key")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Create API Key"));

    await waitFor(() => {
      // Scope buttons in the modal
      const btns = screen.getAllByRole("button");
      const scopeBtns = btns.filter((b) =>
        ["read", "write", "admin", "platform_admin"].includes(b.textContent ?? "")
      );
      expect(scopeBtns.length).toBe(4);
    });
  });

  it("creates key and shows raw key banner", async () => {
    mockDefaults();
    (api.apiKeys.create as Mock).mockResolvedValue({
      ...API_KEY,
      raw_key: "ng_live_abc123def456ghi789",
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("API Keys"));
    await waitFor(() => {
      expect(screen.getByText("Create API Key")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Create API Key"));

    await user.type(screen.getByPlaceholderText("CI/CD Pipeline Key"), "New Key");
    await user.click(screen.getByText("Create Key"));

    await waitFor(() => {
      expect(screen.getByText("ng_live_abc123def456ghi789")).toBeInTheDocument();
      expect(screen.getByText(/Copy it now, it won't be shown again/)).toBeInTheDocument();
    });
  });

  it("can toggle key enabled status", async () => {
    mockDefaults();
    (api.apiKeys.update as Mock).mockResolvedValue({ ...API_KEY, enabled: false });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("API Keys"));

    await waitFor(() => {
      expect(screen.getByText("CI/CD Pipeline")).toBeInTheDocument();
    });

    const toggleBtns = screen.getAllByTitle("Disable");
    await user.click(toggleBtns[0]);

    expect(api.apiKeys.update).toHaveBeenCalledWith("key-1", { enabled: false });
  });

  it("delete key shows confirmation", async () => {
    mockDefaults();
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("API Keys"));

    await waitFor(() => {
      expect(screen.getByText("CI/CD Pipeline")).toBeInTheDocument();
    });

    // Find the row and click its trash button
    const row = screen.getByText("CI/CD Pipeline").closest("tr") as HTMLElement;
    const btns = within(row).getAllByRole("button");
    await user.click(btns[btns.length - 1]);

    await waitFor(() => {
      expect(screen.getByText("Delete API Key")).toBeInTheDocument();
      expect(screen.getByText(/lose access immediately/)).toBeInTheDocument();
    });
  });

  it("confirming delete calls API", async () => {
    mockDefaults();
    (api.apiKeys.delete as Mock).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("API Keys"));

    await waitFor(() => {
      expect(screen.getByText("CI/CD Pipeline")).toBeInTheDocument();
    });

    const row = screen.getByText("CI/CD Pipeline").closest("tr") as HTMLElement;
    const btns = within(row).getAllByRole("button");
    await user.click(btns[btns.length - 1]);

    await waitFor(() => {
      expect(screen.getByText("Delete API Key")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(api.apiKeys.delete).toHaveBeenCalledWith("key-1");
  });
});

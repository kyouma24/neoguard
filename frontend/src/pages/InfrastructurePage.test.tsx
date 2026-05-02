import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { InfrastructurePage } from "./InfrastructurePage";
import { api } from "../services/api";
import type { AWSAccount, AzureSubscription, Resource } from "../types";

vi.mock("../services/api", () => ({
  api: {
    resources: {
      summary: vi.fn(),
      list: vi.fn(),
    },
    aws: { listAccounts: vi.fn() },
    azure: { listSubscriptions: vi.fn() },
    metrics: { query: vi.fn() },
  },
  formatError: (e: unknown) => e instanceof Error ? e.message : String(e),
}));

vi.mock("../components/TimeSeriesChart", () => ({
  TimeSeriesChart: () => <div data-testid="chart" />,
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "test@test.com", name: "Test", is_super_admin: false, is_active: true, email_verified: true, created_at: "2026-01-01" },
    tenant: { id: "t1", slug: "test", name: "Test Org", tier: "free", status: "active", created_at: "2026-01-01" },
    role: "owner",
    loading: false,
  }),
}));

const AWS_ACCOUNT: AWSAccount = {
  id: "acc-1",
  tenant_id: "default",
  name: "NeoNxt Production",
  account_id: "271547278517",
  role_arn: "arn:aws:iam::271547278517:role/NeoGuardCollectorRole",
  external_id: "neoguard-monitoring-2026",
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
  name: "NeoGuard Testing",
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

const EC2_RESOURCE: Resource = {
  id: "r-1",
  tenant_id: "default",
  resource_type: "ec2",
  provider: "aws",
  region: "ap-south-1",
  account_id: "271547278517",
  name: "web-server-1",
  external_id: "i-0abc123",
  tags: { Name: "web-server-1" },
  metadata: {
    instance_type: "t3.large",
    availability_zone: "ap-south-1a",
    private_ip: "10.0.1.5",
    vpc_id: "vpc-abc",
  },
  status: "active",
  last_seen_at: "2026-04-30T08:59:44.749511Z",
  created_at: "2026-04-30T06:20:20.038668Z",
  updated_at: "2026-04-30T08:59:44.749511Z",
};

const AZURE_VM_RESOURCE: Resource = {
  id: "r-2",
  tenant_id: "default",
  resource_type: "azure_vm",
  provider: "azure",
  region: "centralindia",
  account_id: "2fd5b44e-b6cc-4877-bd13-4a8154f814d8",
  name: "cpvm1",
  external_id: "/subscriptions/2fd5b44e/resourceGroups/RG/providers/Microsoft.Compute/virtualMachines/cpvm1",
  tags: { monitoring: "neoguard" },
  metadata: { vm_size: "Standard_D16s_v4", os_type: "linux" },
  status: "active",
  last_seen_at: "2026-04-30T08:59:25.749592Z",
  created_at: "2026-04-30T08:15:46.478310Z",
  updated_at: "2026-04-30T08:59:25.749592Z",
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/infrastructure"]}>
      <InfrastructurePage />
    </MemoryRouter>
  );
}

function mockDefaults(overrides?: {
  awsAccounts?: AWSAccount[];
  azureSubs?: AzureSubscription[];
  resources?: Resource[];
}) {
  (api.resources.summary as Mock).mockResolvedValue({
    total: (overrides?.resources ?? []).length,
    by_type: {},
    by_provider: {},
    by_status: {},
  });
  (api.aws.listAccounts as Mock).mockResolvedValue(
    overrides?.awsAccounts ?? [AWS_ACCOUNT]
  );
  (api.azure.listSubscriptions as Mock).mockResolvedValue(
    overrides?.azureSubs ?? [AZURE_SUB]
  );
  (api.resources.list as Mock).mockResolvedValue(
    overrides?.resources ?? [EC2_RESOURCE, AZURE_VM_RESOURCE]
  );
  (api.metrics.query as Mock).mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Accounts Grid View
// ─────────────────────────────────────────────────────────────────────────────

describe("AccountsGridView", () => {
  it("shows loading spinner before accounts load", () => {
    (api.resources.summary as Mock).mockReturnValue(new Promise(() => {}));
    (api.aws.listAccounts as Mock).mockReturnValue(new Promise(() => {}));
    (api.azure.listSubscriptions as Mock).mockReturnValue(new Promise(() => {}));
    (api.resources.list as Mock).mockReturnValue(new Promise(() => {}));

    renderPage();
    expect(screen.getByText("Loading cloud accounts...")).toBeInTheDocument();
  });

  it("shows both AWS and Azure account cards after loading", async () => {
    mockDefaults();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("NeoNxt Production")).toBeInTheDocument();
    });
    expect(screen.getByText("NeoGuard Testing")).toBeInTheDocument();
  });

  it("does NOT auto-navigate when multiple accounts exist", async () => {
    mockDefaults();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("NeoNxt Production")).toBeInTheDocument();
    });
    expect(screen.getByText("NeoGuard Testing")).toBeInTheDocument();
    expect(screen.getByText("Infrastructure")).toBeInTheDocument();
    expect(screen.queryByText("EC2")).not.toBeInTheDocument();
  });

  it("does NOT auto-navigate when only one account exists", async () => {
    mockDefaults({ awsAccounts: [AWS_ACCOUNT], azureSubs: [] });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("NeoNxt Production")).toBeInTheDocument();
    });
    expect(screen.queryByText("EC2")).not.toBeInTheDocument();
  });

  it("shows empty state when no accounts exist", async () => {
    mockDefaults({ awsAccounts: [], azureSubs: [], resources: [] });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("No cloud accounts connected")).toBeInTheDocument();
    });
  });

  it("displays resource count per account card", async () => {
    mockDefaults({ resources: [EC2_RESOURCE, EC2_RESOURCE, AZURE_VM_RESOURCE] });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("NeoNxt Production")).toBeInTheDocument();
    });

    const awsCard = screen.getByText("NeoNxt Production").closest(".card") as HTMLElement;
    const awsResLabel = within(awsCard).getByText("Resources");
    expect(awsResLabel.nextElementSibling).toHaveTextContent("2");

    const azureCard = screen.getByText("NeoGuard Testing").closest(".card") as HTMLElement;
    const azureResLabel = within(azureCard).getByText("Resources");
    expect(azureResLabel.nextElementSibling).toHaveTextContent("1");
  });

  it("displays region count per account card", async () => {
    mockDefaults();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("NeoNxt Production")).toBeInTheDocument();
    });

    const awsCard = screen.getByText("NeoNxt Production").closest(".card") as HTMLElement;
    const awsRegLabel = within(awsCard).getByText("Regions");
    expect(awsRegLabel.nextElementSibling).toHaveTextContent("2");

    const azureCard = screen.getByText("NeoGuard Testing").closest(".card") as HTMLElement;
    const azureRegLabel = within(azureCard).getByText("Regions");
    expect(azureRegLabel.nextElementSibling).toHaveTextContent("1");
  });

  it("shows provider badges (AWS / AZURE)", async () => {
    mockDefaults();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("aws")).toBeInTheDocument();
      expect(screen.getByText("azure")).toBeInTheDocument();
    });
  });

  it("shows account ID on each card", async () => {
    mockDefaults();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("271547278517")).toBeInTheDocument();
      expect(
        screen.getByText("2fd5b44e-b6cc-4877-bd13-4a8154f814d8")
      ).toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Navigation: Accounts → Resources → Back
// ─────────────────────────────────────────────────────────────────────────────

describe("Navigation", () => {
  it("clicking an account card shows the resources view", async () => {
    mockDefaults({ resources: [EC2_RESOURCE] });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("NeoNxt Production")).toBeInTheDocument();
    });

    await user.click(screen.getByText("NeoNxt Production"));

    await waitFor(() => {
      expect(screen.getByText("EC2")).toBeInTheDocument();
    });
  });

  it("shows provider-specific service tabs (AWS has EC2, Azure has VMs)", async () => {
    mockDefaults({ resources: [AZURE_VM_RESOURCE] });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("NeoGuard Testing")).toBeInTheDocument();
    });

    await user.click(screen.getByText("NeoGuard Testing"));

    await waitFor(() => {
      expect(screen.getByText("VMs")).toBeInTheDocument();
      expect(screen.getByText("Disks")).toBeInTheDocument();
      expect(screen.getByText("NSG")).toBeInTheDocument();
    });
    expect(screen.queryByText("EC2")).not.toBeInTheDocument();
  });

  it("clicking back button returns to accounts grid", async () => {
    mockDefaults({ resources: [EC2_RESOURCE] });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("NeoNxt Production")).toBeInTheDocument();
    });
    await user.click(screen.getByText("NeoNxt Production"));

    await waitFor(() => {
      expect(screen.getByText("EC2")).toBeInTheDocument();
    });

    const backBtn = screen.getByRole("button", { name: "" });
    await user.click(backBtn);

    await waitFor(() => {
      expect(screen.getByText("NeoNxt Production")).toBeInTheDocument();
      expect(screen.getByText("NeoGuard Testing")).toBeInTheDocument();
    });
  });

  it("clicking Infrastructure breadcrumb returns to accounts grid", async () => {
    mockDefaults({ resources: [EC2_RESOURCE] });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("NeoNxt Production")).toBeInTheDocument();
    });
    await user.click(screen.getByText("NeoNxt Production"));

    await waitFor(() => {
      expect(screen.getByText("EC2")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Infrastructure"));

    await waitFor(() => {
      expect(screen.getByText("NeoNxt Production")).toBeInTheDocument();
      expect(screen.getByText("NeoGuard Testing")).toBeInTheDocument();
    });
  });

  it("shows breadcrumb with account name in resources view", async () => {
    mockDefaults({ resources: [EC2_RESOURCE] });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("NeoNxt Production")).toBeInTheDocument();
    });
    await user.click(screen.getByText("NeoNxt Production"));

    await waitFor(() => {
      expect(screen.getByText("NeoNxt Production")).toBeInTheDocument();
      expect(screen.getByText("Infrastructure")).toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Resource Table
// ─────────────────────────────────────────────────────────────────────────────

describe("Resource Table", () => {
  it("displays resources in the table for the selected service tab", async () => {
    mockDefaults({ resources: [EC2_RESOURCE] });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("NeoNxt Production")).toBeInTheDocument();
    });
    await user.click(screen.getByText("NeoNxt Production"));

    await waitFor(() => {
      expect(screen.getByText("web-server-1")).toBeInTheDocument();
    });
    expect(screen.getByText("t3.large")).toBeInTheDocument();
    expect(screen.getByText("ap-south-1a")).toBeInTheDocument();
  });

  it("shows 'No resources discovered' for empty service types", async () => {
    mockDefaults({ resources: [] });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("NeoNxt Production")).toBeInTheDocument();
    });
    await user.click(screen.getByText("NeoNxt Production"));

    await waitFor(() => {
      expect(screen.getByText(/No EC2 resources discovered/)).toBeInTheDocument();
    });
  });

  it("switches service tabs correctly", async () => {
    const ebsResource: Resource = {
      ...EC2_RESOURCE,
      id: "r-ebs",
      resource_type: "ebs",
      name: "my-volume",
      metadata: { volume_type: "gp3", size_gb: 100, state: "in-use" },
    };
    (api.resources.summary as Mock).mockResolvedValue({
      total: 2,
      by_type: { ec2: 1, ebs: 1 },
      by_provider: {},
      by_status: {},
    });
    (api.aws.listAccounts as Mock).mockResolvedValue([AWS_ACCOUNT]);
    (api.azure.listSubscriptions as Mock).mockResolvedValue([AZURE_SUB]);
    (api.resources.list as Mock)
      .mockResolvedValueOnce([EC2_RESOURCE, ebsResource])
      .mockResolvedValueOnce([EC2_RESOURCE])
      .mockResolvedValueOnce([ebsResource]);
    (api.metrics.query as Mock).mockResolvedValue([]);

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("NeoNxt Production")).toBeInTheDocument();
    });
    await user.click(screen.getByText("NeoNxt Production"));

    await waitFor(() => {
      expect(screen.getByText("web-server-1")).toBeInTheDocument();
    });

    await user.click(screen.getByText("EBS"));

    await waitFor(() => {
      expect(screen.getByText("my-volume")).toBeInTheDocument();
    });
  });

  it("filters resources by search input", async () => {
    const r2 = { ...EC2_RESOURCE, id: "r-3", name: "database-server" };
    (api.resources.summary as Mock).mockResolvedValue({ total: 2, by_type: { ec2: 2 }, by_provider: {}, by_status: {} });
    (api.aws.listAccounts as Mock).mockResolvedValue([AWS_ACCOUNT]);
    (api.azure.listSubscriptions as Mock).mockResolvedValue([]);
    (api.resources.list as Mock).mockResolvedValue([EC2_RESOURCE, r2]);
    (api.metrics.query as Mock).mockResolvedValue([]);

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("NeoNxt Production")).toBeInTheDocument();
    });
    await user.click(screen.getByText("NeoNxt Production"));

    await waitFor(() => {
      expect(screen.getByText("web-server-1")).toBeInTheDocument();
      expect(screen.getByText("database-server")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search EC2/);
    await user.type(searchInput, "database");

    await waitFor(() => {
      expect(screen.getByText("database-server")).toBeInTheDocument();
      expect(screen.queryByText("web-server-1")).not.toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Resource Drill-Down
// ─────────────────────────────────────────────────────────────────────────────

describe("Resource Drill-Down", () => {
  it("clicking a resource row shows detail view", async () => {
    mockDefaults({ resources: [EC2_RESOURCE] });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("NeoNxt Production")).toBeInTheDocument();
    });
    await user.click(screen.getByText("NeoNxt Production"));

    await waitFor(() => {
      expect(screen.getByText("web-server-1")).toBeInTheDocument();
    });

    await user.click(screen.getByText("web-server-1"));

    await waitFor(() => {
      expect(screen.getByText("Resource Details")).toBeInTheDocument();
      expect(screen.getByText("i-0abc123")).toBeInTheDocument();
    });
  });

  it("shows tags in drill-down view", async () => {
    mockDefaults({ resources: [EC2_RESOURCE] });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("NeoNxt Production")).toBeInTheDocument();
    });
    await user.click(screen.getByText("NeoNxt Production"));
    await waitFor(() => {
      expect(screen.getByText("web-server-1")).toBeInTheDocument();
    });
    await user.click(screen.getByText("web-server-1"));

    await waitFor(() => {
      expect(screen.getByText("Tags (1)")).toBeInTheDocument();
    });
  });

  it("clicking back from drill-down returns to resource table", async () => {
    mockDefaults({ resources: [EC2_RESOURCE] });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("NeoNxt Production")).toBeInTheDocument();
    });
    await user.click(screen.getByText("NeoNxt Production"));
    await waitFor(() => {
      expect(screen.getByText("web-server-1")).toBeInTheDocument();
    });
    await user.click(screen.getByText("web-server-1"));
    await waitFor(() => {
      expect(screen.getByText("Resource Details")).toBeInTheDocument();
    });

    const backBtn = screen.getByRole("button", { name: "" });
    await user.click(backBtn);

    await waitFor(() => {
      expect(screen.getByText("web-server-1")).toBeInTheDocument();
      expect(screen.queryByText("Resource Details")).not.toBeInTheDocument();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge Cases
// ─────────────────────────────────────────────────────────────────────────────

describe("Edge Cases", () => {
  it("handles API failure for AWS accounts gracefully", async () => {
    (api.resources.summary as Mock).mockResolvedValue({ total: 0, by_type: {}, by_provider: {}, by_status: {} });
    (api.aws.listAccounts as Mock).mockRejectedValue(new Error("Network error"));
    (api.azure.listSubscriptions as Mock).mockResolvedValue([AZURE_SUB]);
    (api.resources.list as Mock).mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("NeoGuard Testing")).toBeInTheDocument();
    });
  });

  it("handles API failure for Azure subscriptions gracefully", async () => {
    (api.resources.summary as Mock).mockResolvedValue({ total: 0, by_type: {}, by_provider: {}, by_status: {} });
    (api.aws.listAccounts as Mock).mockResolvedValue([AWS_ACCOUNT]);
    (api.azure.listSubscriptions as Mock).mockRejectedValue(new Error("Network error"));
    (api.resources.list as Mock).mockResolvedValue([]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("NeoNxt Production")).toBeInTheDocument();
    });
  });

  it("shows disabled status for disabled accounts", async () => {
    const disabledAccount = { ...AWS_ACCOUNT, enabled: false };
    mockDefaults({ awsAccounts: [disabledAccount] });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("NeoNxt Production")).toBeInTheDocument();
    });
    expect(screen.getByText("stopped")).toBeInTheDocument();
  });

  it("shows 'Never' for accounts that haven't synced", async () => {
    const neverSynced = { ...AWS_ACCOUNT, last_sync_at: null };
    mockDefaults({ awsAccounts: [neverSynced] });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Never")).toBeInTheDocument();
    });
  });
});

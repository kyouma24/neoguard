import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SignupPage } from "./SignupPage";

const mockSignup = vi.fn();
const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ signup: mockSignup }),
}));

vi.mock("../services/api", () => ({
  formatError: (e: unknown) => e instanceof Error ? e.message : String(e),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <SignupPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SignupPage", () => {
  it("renders the signup form with all fields", () => {
    renderPage();
    expect(screen.getByText("NeoGuard")).toBeInTheDocument();
    expect(screen.getByText("Create your account")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("John Doe")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@company.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Min 8 chars, 1 uppercase, 1 number")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Re-enter your password")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Acme Corp")).toBeInTheDocument();
  });

  it("shows required asterisks on all fields", () => {
    renderPage();
    const asterisks = screen.getAllByText("*");
    expect(asterisks.length).toBe(5);
  });

  it("has link to login page", () => {
    renderPage();
    const link = screen.getByText("Sign in instead");
    expect(link).toHaveAttribute("href", "/login");
  });

  it("calls signup with all fields on successful submit", async () => {
    mockSignup.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("John Doe"), "Test User");
    await user.type(screen.getByPlaceholderText("you@company.com"), "test@test.com");
    await user.type(screen.getByPlaceholderText("Min 8 chars, 1 uppercase, 1 number"), "Password1");
    await user.type(screen.getByPlaceholderText("Re-enter your password"), "Password1");
    await user.type(screen.getByPlaceholderText("Acme Corp"), "Acme Corp");
    await user.click(screen.getByRole("button", { name: /Create account/ }));

    await waitFor(() => {
      expect(mockSignup).toHaveBeenCalledWith("test@test.com", "Password1", "Test User", "Acme Corp");
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  it("shows loading state while submitting", async () => {
    mockSignup.mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("John Doe"), "Test");
    await user.type(screen.getByPlaceholderText("you@company.com"), "t@t.com");
    await user.type(screen.getByPlaceholderText("Min 8 chars, 1 uppercase, 1 number"), "Password1");
    await user.type(screen.getByPlaceholderText("Re-enter your password"), "Password1");
    await user.type(screen.getByPlaceholderText("Acme Corp"), "TestOrg");
    await user.click(screen.getByRole("button", { name: /Create account/ }));

    expect(screen.getByText("Creating account...")).toBeInTheDocument();
  });

  it("shows error on signup failure", async () => {
    mockSignup.mockRejectedValue(new Error("Email already registered"));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("John Doe"), "Test");
    await user.type(screen.getByPlaceholderText("you@company.com"), "t@t.com");
    await user.type(screen.getByPlaceholderText("Min 8 chars, 1 uppercase, 1 number"), "Password1");
    await user.type(screen.getByPlaceholderText("Re-enter your password"), "Password1");
    await user.type(screen.getByPlaceholderText("Acme Corp"), "TestOrg");
    await user.click(screen.getByRole("button", { name: /Create account/ }));

    await waitFor(() => {
      expect(screen.getByText("Email already registered")).toBeInTheDocument();
    });
  });

  it("name field has autofocus", () => {
    renderPage();
    expect(screen.getByPlaceholderText("John Doe")).toHaveFocus();
  });

  it("validates required name field", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /Create account/ }));

    expect(screen.getByText("Full name is required")).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  it("validates email format", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("John Doe"), "Test");
    await user.type(screen.getByPlaceholderText("you@company.com"), "not-an-email");
    await user.click(screen.getByRole("button", { name: /Create account/ }));

    expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  it("validates password minimum length", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("John Doe"), "Test");
    await user.type(screen.getByPlaceholderText("you@company.com"), "t@t.com");
    await user.type(screen.getByPlaceholderText("Min 8 chars, 1 uppercase, 1 number"), "Short1");
    await user.click(screen.getByRole("button", { name: /Create account/ }));

    expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  it("validates password requires uppercase", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("John Doe"), "Test");
    await user.type(screen.getByPlaceholderText("you@company.com"), "t@t.com");
    await user.type(screen.getByPlaceholderText("Min 8 chars, 1 uppercase, 1 number"), "lowercase1");
    await user.click(screen.getByRole("button", { name: /Create account/ }));

    expect(screen.getByText("Password must contain at least one uppercase letter")).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  it("validates password requires number", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("John Doe"), "Test");
    await user.type(screen.getByPlaceholderText("you@company.com"), "t@t.com");
    await user.type(screen.getByPlaceholderText("Min 8 chars, 1 uppercase, 1 number"), "Nonumber");
    await user.click(screen.getByRole("button", { name: /Create account/ }));

    expect(screen.getByText("Password must contain at least one number")).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  it("validates passwords must match", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("John Doe"), "Test");
    await user.type(screen.getByPlaceholderText("you@company.com"), "t@t.com");
    await user.type(screen.getByPlaceholderText("Min 8 chars, 1 uppercase, 1 number"), "Password1");
    await user.type(screen.getByPlaceholderText("Re-enter your password"), "Different1");
    await user.type(screen.getByPlaceholderText("Acme Corp"), "TestOrg");
    await user.click(screen.getByRole("button", { name: /Create account/ }));

    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(mockSignup).not.toHaveBeenCalled();
  });

  it("clears field error when user types in that field", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /Create account/ }));
    expect(screen.getByText("Full name is required")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("John Doe"), "A");
    expect(screen.queryByText("Full name is required")).not.toBeInTheDocument();
  });

  it("has NeoGuard branding on left panel", () => {
    renderPage();
    expect(screen.getByText("NeoGuard")).toBeInTheDocument();
    expect(screen.getByText(/Start monitoring your cloud/)).toBeInTheDocument();
  });
});

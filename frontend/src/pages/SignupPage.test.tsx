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
  it("renders the signup form", () => {
    renderPage();
    expect(screen.getByText("NeoGuard")).toBeInTheDocument();
    expect(screen.getByText("Create your account")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("John Doe")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@company.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Min 8 characters")).toBeInTheDocument();
  });

  it("has organization name field", () => {
    renderPage();
    expect(screen.getByPlaceholderText("Acme Corp")).toBeInTheDocument();
  });

  it("has link to login page", () => {
    renderPage();
    const link = screen.getByText("Sign in");
    expect(link).toHaveAttribute("href", "/login");
  });

  it("calls signup with all fields on submit", async () => {
    mockSignup.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("John Doe"), "Test User");
    await user.type(screen.getByPlaceholderText("you@company.com"), "test@test.com");
    await user.type(screen.getByPlaceholderText("Min 8 characters"), "password123");
    await user.type(screen.getByPlaceholderText("Acme Corp"), "Acme Corp");
    await user.click(screen.getByRole("button", { name: /Create account/ }));

    await waitFor(() => {
      expect(mockSignup).toHaveBeenCalledWith("test@test.com", "password123", "Test User", "Acme Corp");
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  it("shows loading state while submitting", async () => {
    mockSignup.mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("John Doe"), "Test");
    await user.type(screen.getByPlaceholderText("you@company.com"), "t@t.com");
    await user.type(screen.getByPlaceholderText("Min 8 characters"), "pass1234");
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
    await user.type(screen.getByPlaceholderText("Min 8 characters"), "pass1234");
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

  it("password field requires minimum 8 characters", () => {
    renderPage();
    const input = screen.getByPlaceholderText("Min 8 characters");
    expect(input).toHaveAttribute("minLength", "8");
  });
});

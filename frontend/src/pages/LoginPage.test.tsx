import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LoginPage } from "./LoginPage";

const mockLogin = vi.fn();
const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ login: mockLogin }),
}));

vi.mock("../services/api", () => ({
  formatError: (e: unknown) => e instanceof Error ? e.message : String(e),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LoginPage", () => {
  it("renders the login form with all fields", () => {
    renderPage();
    expect(screen.getByText("NeoGuard")).toBeInTheDocument();
    expect(screen.getByText("Sign in to your account")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@company.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter your password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("has link to signup page", () => {
    renderPage();
    const link = screen.getByText("Create one");
    expect(link).toHaveAttribute("href", "/signup");
  });

  it("has link to forgot password page", () => {
    renderPage();
    const link = screen.getByText("Forgot your password?");
    expect(link).toHaveAttribute("href", "/forgot-password");
  });

  it("email input has correct type and required attribute", () => {
    renderPage();
    const input = screen.getByPlaceholderText("you@company.com");
    expect(input).toHaveAttribute("type", "email");
    expect(input).toBeRequired();
  });

  it("password input has correct type, minLength, and required", () => {
    renderPage();
    const input = screen.getByPlaceholderText("Enter your password");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("minLength", "8");
  });

  it("calls login and navigates to / on successful submit", async () => {
    mockLogin.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("you@company.com"), "test@test.com");
    await user.type(screen.getByPlaceholderText("Enter your password"), "password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("test@test.com", "password123");
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });

  it("shows loading state while submitting", async () => {
    mockLogin.mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("you@company.com"), "test@test.com");
    await user.type(screen.getByPlaceholderText("Enter your password"), "password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(screen.getByText("Signing in...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
  });

  it("displays error message on failed login", async () => {
    mockLogin.mockRejectedValue(new Error("Invalid credentials"));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("you@company.com"), "test@test.com");
    await user.type(screen.getByPlaceholderText("Enter your password"), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("clears error on new submission", async () => {
    mockLogin.mockRejectedValueOnce(new Error("Bad request"));
    mockLogin.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("you@company.com"), "test@test.com");
    await user.type(screen.getByPlaceholderText("Enter your password"), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText("Bad request")).toBeInTheDocument();
    });

    await user.clear(screen.getByPlaceholderText("Enter your password"));
    await user.type(screen.getByPlaceholderText("Enter your password"), "correct1");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.queryByText("Bad request")).not.toBeInTheDocument();
    });
  });

  it("email field has autofocus", () => {
    renderPage();
    const input = screen.getByPlaceholderText("you@company.com");
    expect(input).toHaveFocus();
  });
});

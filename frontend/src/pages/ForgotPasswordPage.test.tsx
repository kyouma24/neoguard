import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { ForgotPasswordPage } from "./ForgotPasswordPage";
import { api } from "../services/api";

vi.mock("../services/api", () => ({
  api: {
    auth: {
      requestPasswordReset: vi.fn(),
    },
  },
  formatError: (e: unknown) => e instanceof Error ? e.message : String(e),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ForgotPasswordPage", () => {
  it("renders the reset password form", () => {
    renderPage();
    expect(screen.getByText("NeoGuard")).toBeInTheDocument();
    expect(screen.getByText("Reset your password")).toBeInTheDocument();
    expect(screen.getByText(/Enter your email address/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("you@company.com")).toBeInTheDocument();
  });

  it("has link back to login", () => {
    renderPage();
    const link = screen.getByText("Back to sign in");
    expect(link).toHaveAttribute("href", "/login");
  });

  it("shows send reset link button", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /send reset link/i })).toBeInTheDocument();
  });

  it("submits and shows success message (anti-enumeration)", async () => {
    (api.auth.requestPasswordReset as Mock).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("you@company.com"), "test@test.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText("Check your email")).toBeInTheDocument();
      expect(screen.getByText(/If an account exists for test@test.com/)).toBeInTheDocument();
    });
  });

  it("shows generic success even if email doesn't exist (anti-enumeration)", async () => {
    (api.auth.requestPasswordReset as Mock).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("you@company.com"), "nonexist@test.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText("Check your email")).toBeInTheDocument();
      expect(screen.getByText(/If an account exists/)).toBeInTheDocument();
    });
  });

  it("shows loading state while sending", async () => {
    (api.auth.requestPasswordReset as Mock).mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("you@company.com"), "test@test.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(screen.getByText("Sending...")).toBeInTheDocument();
  });

  it("shows error on API failure", async () => {
    (api.auth.requestPasswordReset as Mock).mockRejectedValue(new Error("Server error"));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("you@company.com"), "test@test.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  it("email field is required", () => {
    renderPage();
    const input = screen.getByPlaceholderText("you@company.com");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("type", "email");
  });
});

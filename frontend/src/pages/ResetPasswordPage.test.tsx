import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { ResetPasswordPage } from "./ResetPasswordPage";
import { api } from "../services/api";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../services/api", () => ({
  api: {
    auth: {
      confirmPasswordReset: vi.fn(),
    },
  },
  formatError: (e: unknown) => e instanceof Error ? e.message : String(e),
}));

function renderPage(url = "/reset-password?token=valid-reset-token") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ResetPasswordPage", () => {
  it("renders the reset password form", () => {
    renderPage();
    expect(screen.getByText("NeoGuard")).toBeInTheDocument();
    expect(screen.getByText("Set new password")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("At least 8 characters")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Repeat your password")).toBeInTheDocument();
  });

  it("has link back to login", () => {
    renderPage();
    const link = screen.getByText("Back to sign in");
    expect(link).toHaveAttribute("href", "/login");
  });

  it("shows Reset password button", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /Reset password/ })).toBeInTheDocument();
  });

  it("password fields have minLength 8", () => {
    renderPage();
    expect(screen.getByPlaceholderText("At least 8 characters")).toHaveAttribute("minLength", "8");
    expect(screen.getByPlaceholderText("Repeat your password")).toHaveAttribute("minLength", "8");
  });

  it("shows error when passwords don't match", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("At least 8 characters"), "password1");
    await user.type(screen.getByPlaceholderText("Repeat your password"), "password2");
    await user.click(screen.getByRole("button", { name: /Reset password/ }));

    await waitFor(() => {
      expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    });
    expect(api.auth.confirmPasswordReset).not.toHaveBeenCalled();
  });

  it("calls confirmPasswordReset on valid submit", async () => {
    (api.auth.confirmPasswordReset as Mock).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("At least 8 characters"), "newpass123");
    await user.type(screen.getByPlaceholderText("Repeat your password"), "newpass123");
    await user.click(screen.getByRole("button", { name: /Reset password/ }));

    await waitFor(() => {
      expect(api.auth.confirmPasswordReset).toHaveBeenCalledWith("valid-reset-token", "newpass123");
    });
  });

  it("shows success message after reset", async () => {
    (api.auth.confirmPasswordReset as Mock).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("At least 8 characters"), "newpass123");
    await user.type(screen.getByPlaceholderText("Repeat your password"), "newpass123");
    await user.click(screen.getByRole("button", { name: /Reset password/ }));

    await waitFor(() => {
      expect(screen.getByText("Password reset successful")).toBeInTheDocument();
      expect(screen.getByText("Redirecting to sign in...")).toBeInTheDocument();
    });
  });

  it("shows loading state while resetting", async () => {
    (api.auth.confirmPasswordReset as Mock).mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("At least 8 characters"), "newpass123");
    await user.type(screen.getByPlaceholderText("Repeat your password"), "newpass123");
    await user.click(screen.getByRole("button", { name: /Reset password/ }));

    expect(screen.getByText("Resetting...")).toBeInTheDocument();
  });

  it("shows error on API failure", async () => {
    (api.auth.confirmPasswordReset as Mock).mockRejectedValue(new Error("Token expired"));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("At least 8 characters"), "newpass123");
    await user.type(screen.getByPlaceholderText("Repeat your password"), "newpass123");
    await user.click(screen.getByRole("button", { name: /Reset password/ }));

    await waitFor(() => {
      expect(screen.getByText("Token expired")).toBeInTheDocument();
    });
  });
});

describe("ResetPasswordPage — no token", () => {
  it("shows missing token error when no token in URL", () => {
    renderPage("/reset-password");
    expect(screen.getByText(/No reset token found/)).toBeInTheDocument();
  });

  it("submit button is disabled without token", () => {
    renderPage("/reset-password");
    const btn = screen.getByRole("button", { name: /Reset password/ });
    expect(btn).toBeDisabled();
  });
});

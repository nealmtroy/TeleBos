import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorView } from "./error-view";
import { useAuthStore } from "@/store/auth-store";
import { useI18nStore } from "@/lib/i18n";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe("ErrorView Component", () => {
  beforeEach(() => {
    useI18nStore.setState({ locale: "en" });
    useAuthStore.setState({ user: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders 401 Unauthorized page with login action", () => {
    render(<ErrorView statusCode={401} />);

    expect(screen.getByText("401")).toBeInTheDocument();
    expect(screen.getByText(/401 • Unauthorized/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Session Expired or Login Required/i);
    const loginLink = screen.getByRole("link", { name: /Sign In Now/i });
    expect(loginLink).toHaveAttribute("href", "/login");
  });

  it("renders 403 Access Forbidden page with dashboard and support actions", () => {
    render(<ErrorView statusCode={403} />);

    expect(screen.getByText("403")).toBeInTheDocument();
    expect(screen.getByText(/403 • Access Forbidden/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Access Forbidden/i);
    const dashboardLink = screen.getByRole("link", { name: /Go to Dashboard/i });
    expect(dashboardLink).toHaveAttribute("href", "/dashboard");
  });

  it("renders 404 Not Found page with back home action", () => {
    render(<ErrorView statusCode={404} />);

    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText(/404 • Not Found/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Page Not Found/i);
    const homeLink = screen.getByRole("link", { name: /Back to Home/i });
    expect(homeLink).toHaveAttribute("href", "/");
  });

  it("renders 500 Internal Server Error page with retry action and error details", () => {
    const handleReset = vi.fn();
    render(
      <ErrorView
        statusCode={500}
        error={new Error("Database connection timeout")}
        reset={handleReset}
      />
    );

    expect(screen.getByText("500")).toBeInTheDocument();
    expect(screen.getByText(/500 • Server Error/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Internal Server Error/i);

    const retryBtn = screen.getByRole("button", { name: /Reload Page/i });
    fireEvent.click(retryBtn);
    expect(handleReset).toHaveBeenCalledTimes(1);

    // Check collapsible technical details
    const detailsToggle = screen.getByText(/Technical Details/i);
    fireEvent.click(detailsToggle);
    expect(screen.getByText(/Database connection timeout/i)).toBeInTheDocument();
  });

  it("renders 503 Service Unavailable page", () => {
    const handleReset = vi.fn();
    render(<ErrorView statusCode={503} reset={handleReset} />);

    expect(screen.getByText("503")).toBeInTheDocument();
    expect(screen.getByText(/503 • Service Unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Service Under Maintenance/i);

    const retryBtn = screen.getByRole("button", { name: /Try Again/i });
    fireEvent.click(retryBtn);
    expect(handleReset).toHaveBeenCalledTimes(1);
  });

  it("supports Indonesian localization", () => {
    useI18nStore.setState({ locale: "id" });
    render(<ErrorView statusCode={404} />);

    expect(screen.getByText(/404 • Tidak Ditemukan/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Halaman Tidak Ditemukan/i);
    expect(
      screen.getByText(/Halaman yang Anda tuju tidak ditemukan, tautan rusak, atau telah dipindahkan/i)
    ).toBeInTheDocument();
  });

  it("is fully synchronized with Light and Dark themes", () => {
    const { container } = render(<ErrorView statusCode={500} />);

    // Outer container has light and dark theme background classes
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("bg-slate-50/70");
    expect(wrapper.className).toContain("dark:bg-slate-950");
    expect(wrapper.className).toContain("text-slate-900");
    expect(wrapper.className).toContain("dark:text-slate-100");

    // Header has theme toggle control
    expect(screen.getByRole("button", { name: /Ganti tema|Tema|Toggle theme|Theme/i })).toBeInTheDocument();

    // Header has language switcher control
    expect(screen.getByRole("button", { name: /Bahasa|Language/i })).toBeInTheDocument();

    // Status badge has dark mode variant
    const badge = screen.getByText(/500 • Server Error/i).closest("span");
    expect(badge?.className).toContain("dark:bg-red-950/60");
    expect(badge?.className).toContain("dark:text-red-300");
  });
});

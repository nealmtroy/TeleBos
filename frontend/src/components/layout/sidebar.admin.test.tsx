import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Sidebar } from "@/components/layout/sidebar";

const mockPathname = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock("next/link", () => ({
  default: require("react").forwardRef(({ children, href, ...rest }: any, ref: any) => (
    <a ref={ref} href={href} {...rest}>
      {children}
    </a>
  )),
}));

vi.mock("@/store/auth-store", () => ({
  useAuthStore: (selector: any) =>
    selector({
      user: { id: "u1", role: "owner", full_name: "Owner One", email: "owner@telebos.com" },
      logout: vi.fn(),
    }),
}));

vi.mock("@/store/app-store", () => ({
  useAppStore: (selector: any) =>
    selector({
      sidebarOpen: true,
      toggleSidebar: vi.fn(),
      closeSidebar: vi.fn(),
    }),
}));

import { useAppStore } from "@/store/app-store";
(useAppStore as any).setState = vi.fn();

vi.mock("@/lib/i18n", () => ({
  useI18nStore: (selector: any) => selector({ locale: "id" }),
  useT: () => (key: string) => key,
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));

vi.mock("@/components/ui/brand-logo", () => ({
  BrandLogo: () => <span>BrandLogo</span>,
}));

describe("Sidebar Contextual Mode (Owner)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows regular user sidebar when on /dashboard, with Panel Admin button", () => {
    mockPathname.mockReturnValue("/dashboard");
    render(<Sidebar />);

    // Regular user sections exist
    expect(screen.getByText("MENU UTAMA")).toBeDefined();
    expect(screen.getByText("AUTOMASI")).toBeDefined();

    // Panel Admin entry button exists for owner
    expect(screen.getByText("Panel Admin")).toBeDefined();

    // Admin-only group headers do not exist in regular mode
    expect(screen.queryByText("IKHTISAR")).toBeNull();
    expect(screen.queryByText("TELEGRAM & BOT")).toBeNull();
  });

  it("switches to admin-only sidebar when on /admin/dashboard", () => {
    mockPathname.mockReturnValue("/admin/dashboard");
    render(<Sidebar />);

    // Admin headers and items exist
    expect(screen.getByText("IKHTISAR")).toBeDefined();
    expect(screen.getByText("TELEGRAM & BOT")).toBeDefined();
    expect(screen.getByText("LAYANAN SMM")).toBeDefined();

    // Context switch button to return to user app exists
    expect(screen.getByText("Kembali ke Aplikasi")).toBeDefined();

    // Regular user sections are not shown
    expect(screen.queryByText("MENU UTAMA")).toBeNull();
    expect(screen.queryByText("AUTOMASI")).toBeNull();
  });
});

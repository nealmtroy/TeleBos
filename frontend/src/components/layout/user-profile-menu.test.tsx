import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { UserProfileMenu } from "@/components/layout/user-profile-menu";
import { UserAvatar, getUserInitials } from "@/components/ui/user-avatar";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/dashboard",
}));

const mockLogout = vi.fn();
const mockUser = {
  id: "u-123",
  email: "alex@telebos.com",
  full_name: "Alex Doe",
  role: "premium",
  is_active: true,
  balance: 250000,
  onboarding_completed: true,
};

vi.mock("@/store/auth-store", () => ({
  useAuthStore: (selector: any) =>
    selector({
      user: mockUser,
      logout: mockLogout,
    }),
}));

vi.mock("@/lib/i18n", () => ({
  useT: () => (key: string) => key,
  useI18nStore: (selector: any) => selector({ locale: "id" }),
}));

describe("UserAvatar", () => {
  afterEach(() => {
    cleanup();
  });

  it("computes initials correctly", () => {
    expect(getUserInitials("Alex Doe", "alex@telebos.com")).toBe("AD");
    expect(getUserInitials("Budi", "budi@telebos.com")).toBe("BU");
    expect(getUserInitials("", "hello@world.com")).toBe("HE");
    expect(getUserInitials(null, null)).toBe("U");
  });

  it("renders image when provided", () => {
    const { container } = render(
      <UserAvatar user={{ ...mockUser, image: "https://example.com/avatar.jpg" }} size="md" />
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://example.com/avatar.jpg");
  });

  it("renders initials fallback when no image is provided", () => {
    render(<UserAvatar user={mockUser} size="md" />);
    expect(screen.getByText("AD")).toBeDefined();
  });
});

describe("UserProfileMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders navbar variant with compact round avatar button", () => {
    render(<UserProfileMenu variant="navbar" />);

    // Trigger button exists with initials
    const trigger = screen.getByRole("button", { name: /user profile menu/i });
    expect(trigger).toBeDefined();
    expect(screen.getByText("AD")).toBeDefined();
  });

  it("renders sidebar collapsed variant with compact avatar button", () => {
    render(<UserProfileMenu variant="sidebar" collapsed={true} />);

    const button = screen.getByRole("button", { name: /user profile menu/i });
    expect(button).toBeDefined();
    expect(screen.getByText("AD")).toBeDefined();
  });

  it("renders sidebar expanded variant with user info and chevrons", () => {
    render(<UserProfileMenu variant="sidebar" collapsed={false} />);

    const trigger = screen.getByRole("button", { name: /user profile menu/i });
    expect(trigger).toBeDefined();
    expect(screen.getByText("Alex Doe")).toBeDefined();
    expect(screen.getByText("alex@telebos.com")).toBeDefined();
  });
});

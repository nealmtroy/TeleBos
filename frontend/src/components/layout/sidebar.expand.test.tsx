/**
 * Regression tests for sidebar section auto-expand.
 *
 * Group Lists, Text Lists, and Auto Join are standalone navigation items in the
 * sidebar and must NOT expand the Broadcast or Groups & Channels accordion
 * sections when opened.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
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
      user: { id: "u1", role: "owner", full_name: "Owner One", email: "o@x.io" },
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
  // Sidebar calls useAppStore.setState directly to force-open on desktop mount.
  useAppStore_: null,
}));

// useAppStore.setState is a static on the real store; stub it on the mock fn.
import { useAppStore } from "@/store/app-store";
(useAppStore as any).setState = vi.fn();

vi.mock("@/lib/i18n", () => ({
  useI18nStore: (selector: any) => selector({ locale: "id" }),
  // Return the key verbatim so assertions can target a specific sub-item
  // without depending on the translation catalogue.
  useT: () => (key: string) => key,
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));

function renderSidebarAt(pathname: string) {
  mockPathname.mockReturnValue(pathname);
  return render(<Sidebar />);
}

/** The submenu link label, e.g. nav.newBroadcast. */
function submenuLabels(): string[] {
  return screen
    .queryAllByRole("link")
    .map((el) => el.textContent?.trim() ?? "")
    .filter(Boolean);
}

/**
 * Reproduce a real in-app navigation.
 *
 * Next.js keeps the Sidebar mounted across route changes -- it lives in the
 * dashboard layout, so moving between pages never re-runs the useState
 * initialiser. A freshly rendered sidebar at the target path would therefore
 * pass even with the auto-expand effect removed, because useState(isBroadcastPage)
 * already seeds the correct value. These helpers mount at a neutral page first,
 * then move the pathname, which is the only way to exercise the effect.
 */
function renderThenNavigateTo(from: string, to: string) {
  mockPathname.mockReturnValue(from);
  const view = render(<Sidebar />);
  mockPathname.mockReturnValue(to);
  view.rerender(<Sidebar />);
  return view;
}

const BROADCAST_SUBITEMS = [
  "nav.newBroadcast",
  "nav.broadcastHistory",
  "nav.broadcastLogs",
];
const GROUPS_SUBITEMS = ["groupsChannels.myChats", "groupsChannels.publicIndex"];

describe("sidebar section auto-expand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // This project does not enable vitest `globals`, so RTL's automatic
  // afterEach cleanup is not registered. Without an explicit cleanup the
  // rendered sidebars pile up in document.body and every test sees the union of
  // all previous renders -- which turns a failing assertion into a false pass.
  afterEach(() => {
    cleanup();
  });

  // ── In-app navigation ──────────────────────────────────────────────────

  it("does not expand the Broadcast section when navigating to the group lists page", () => {
    renderThenNavigateTo("/dashboard", "/broadcast/group-lists");

    expect(submenuLabels()).not.toEqual(expect.arrayContaining(BROADCAST_SUBITEMS));
  });

  it("does not expand the Broadcast section when navigating to the text lists page", () => {
    renderThenNavigateTo("/dashboard", "/broadcast/text-lists");

    expect(submenuLabels()).not.toEqual(expect.arrayContaining(BROADCAST_SUBITEMS));
  });

  it("does not expand the Groups & Channels section when navigating to auto join", () => {
    renderThenNavigateTo("/dashboard", "/groups-channels/auto-join");

    expect(submenuLabels()).not.toEqual(expect.arrayContaining(GROUPS_SUBITEMS));
  });

  it("expands the Broadcast section when navigating to a broadcast page", () => {
    renderThenNavigateTo("/dashboard", "/broadcast/new");

    expect(submenuLabels()).toEqual(expect.arrayContaining(BROADCAST_SUBITEMS));
  });

  it("expands the Groups & Channels section when navigating to my chats", () => {
    renderThenNavigateTo("/dashboard", "/groups-channels");

    expect(submenuLabels()).toEqual(expect.arrayContaining(GROUPS_SUBITEMS));
  });

  it("keeps an expanded section open while navigating within it", () => {
    renderThenNavigateTo("/broadcast/new", "/broadcast/history");

    expect(submenuLabels()).toEqual(expect.arrayContaining(BROADCAST_SUBITEMS));
  });

  it("collapses the Broadcast section when navigating from broadcast to group lists", async () => {
    renderThenNavigateTo("/broadcast/new", "/broadcast/group-lists");

    await waitFor(() => expect(submenuLabels()).not.toContain("nav.newBroadcast"));
  });

  it("collapses the Groups & Channels section when navigating from my chats to auto join", async () => {
    renderThenNavigateTo("/groups-channels", "/groups-channels/auto-join");

    await waitFor(() => expect(submenuLabels()).not.toContain("groupsChannels.myChats"));
  });

  it("expands a section reached from a collapsed sidebar after a manual collapse", async () => {
    mockPathname.mockReturnValue("/dashboard");
    const view = render(<Sidebar />);

    mockPathname.mockReturnValue("/broadcast/new");
    view.rerender(<Sidebar />);
    expect(submenuLabels()).toEqual(expect.arrayContaining(BROADCAST_SUBITEMS));

    // Click the section header to collapse it. The submenu is wrapped in
    // AnimatePresence, so the links linger in the DOM through the exit
    // animation -- assert on eventual removal rather than immediate absence.
    fireEvent.click(screen.getByText("nav.broadcast").closest("button")!);
    await waitFor(() => expect(submenuLabels()).not.toContain("nav.newBroadcast"));

    // A sibling page inside the same section must bring it back.
    mockPathname.mockReturnValue("/broadcast/history");
    view.rerender(<Sidebar />);
    expect(submenuLabels()).toEqual(expect.arrayContaining(BROADCAST_SUBITEMS));
  });

  // ── Direct load / remount ───────────────────────────────────────────────

  it("leaves the Broadcast section collapsed on a direct load of the group lists page", () => {
    renderSidebarAt("/broadcast/group-lists");
    expect(submenuLabels()).not.toContain("nav.newBroadcast");
  });

  it("leaves the Broadcast section collapsed on a direct load of the text lists page", () => {
    renderSidebarAt("/broadcast/text-lists");
    expect(submenuLabels()).not.toContain("nav.newBroadcast");
  });

  it("leaves the Groups & Channels section collapsed on a direct load of auto join", () => {
    renderSidebarAt("/groups-channels/auto-join");
    expect(submenuLabels()).not.toContain("groupsChannels.myChats");
  });

  // ── Negative case ───────────────────────────────────────────────────────

  it("leaves sections collapsed when the active page is not under any of them", () => {
    renderSidebarAt("/dashboard");

    expect(submenuLabels()).not.toContain("nav.newBroadcast");
    expect(submenuLabels()).not.toContain("groupsChannels.myChats");
  });
});
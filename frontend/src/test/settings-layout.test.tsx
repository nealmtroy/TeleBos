import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

/**
 * Verifies the reference two-column /settings layout: sticky secondary nav on
 * the left, every summary card rendered at once on the right, and the detail
 * editors hidden behind a dialog instead of a full-page tab swap.
 */

const openSection = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { name: "Yudha Prihardana", twoFactorEnabled: false } }, isPending: false }),
    listAccounts: async () => ({ data: [{ providerId: "credential", updatedAt: "2025-09-12T14:32:00Z" }] }),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/api", () => {
  const get = vi.fn(async (url: string) => {
    if (url === "/api-keys") return { data: [] };
    return { data: {} };
  });
  return { default: { get, post: vi.fn(), delete: vi.fn() } };
});

vi.mock("@/store/auth-store", () => ({
  useAuthStore: (sel: (s: unknown) => unknown) =>
    sel({
      user: {
        id: "u1",
        email: "admin@telebos.site",
        full_name: "Yudha Prihardana",
        role: "admin",
        is_active: true,
        balance: 0,
        created_at: "2025-09-12T00:00:00Z",
      },
      fetchMe: vi.fn(),
    }),
}));

vi.mock("@/store/bank-account-store", () => ({
  useBankAccountStore: () => ({
    accounts: [
      { id: "b1", type: "bank", provider: "BCA", accountNumber: "8820192833", accountHolder: "Yudha", isDefault: true, createdAt: "" },
    ],
    addAccount: vi.fn(),
    deleteAccount: vi.fn(),
    setDefaultAccount: vi.fn(),
    hydrate: vi.fn(),
  }),
}));

// Capture what the page hands to <SettingsNav>, so we can drive selection.
vi.mock("@/components/settings/settings-nav", async () => {
  const actual = await vi.importActual<typeof import("@/components/settings/settings-nav")>(
    "@/components/settings/settings-nav"
  );
  return {
    ...actual,
    SettingsNav: (props: { onSelect: (k: string) => void }) => (
      <actual.SettingsNav active="profile" onSelect={props.onSelect} />
    ),
  };
});

import SettingsPage from "@/app/(dashboard)/settings/page";
import { useI18nStore } from "@/lib/i18n";

describe("/settings reference layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom reports en-US, which would make every assertion locale-dependent.
    useI18nStore.setState({ locale: "id", preference: "id" });
  });

  // Base UI portals the dialog to document.body, so an explicit unmount is the
  // only thing that guarantees a later test does not see the previous popup.
  afterEach(() => {
    cleanup();
  });

  it("renders all seven section cards on first paint (no tab hiding)", () => {
    render(<SettingsPage />);

    // Every card title from the reference design must be visible simultaneously.
    expect(screen.getByText("Profil & Pengaturan")).toBeInTheDocument();

    for (const label of [
      "Profil",
      "Ubah Kata Sandi",
      "Autentikasi Dua Faktor",
      "Kunci API Integrasi",
      "Rekening Bank",
      "Tampilan",
      "Bahasa",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("shows the sticky secondary nav with icon + description per row", () => {
    render(<SettingsPage />);
    // Scope to the nav: the summary cards repeat the same labels on purpose.
    const nav = screen.getAllByRole("navigation", { name: "Pengaturan" })[0];
    expect(nav).toBeInTheDocument();
    expect(within(nav).getByText("Informasi akun dan data pribadi")).toBeInTheDocument();
    expect(within(nav).getByText("Perbarui kata sandi akun Anda")).toBeInTheDocument();

    // Every nav row carries a leading icon, per the reference design.
    const rows = within(nav).getAllByRole("button");
    expect(rows).toHaveLength(7);
    rows.forEach((row) => {
      expect(row.querySelector("svg")).toBeTruthy();
    });
  });

  it("keeps the detail editors closed on first paint", () => {
    render(<SettingsPage />);
    // The password form's fields must NOT be visible until a card is opened.
    expect(screen.queryByLabelText(/Kata Sandi Saat Ini/i)).not.toBeInTheDocument();
  });

  it("hands off from a summary card to its editor dialog", async () => {
    const userEvt = userEvent.setup();
    render(<SettingsPage />);

    // The summary card's own action button (the nav row shares the label).
    const cards = screen.getAllByRole("button", { name: /Atur 2FA/i });
    await userEvt.click(cards[cards.length - 1]);

    // Dialog opens with the 2FA editor inside. This string appears only in the
    // 2FA editor body, never in the dashboard cards, so it identifies the swap.
    const TWO_FA_EDITOR_TEXT = /Mendukung Google Authenticator, Microsoft Authenticator/i;
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(TWO_FA_EDITOR_TEXT)).toBeInTheDocument();
    // The password form is a different editor — it must NOT be mounted.
    expect(within(dialog).queryByLabelText(/Kata Sandi Saat Ini/i)).not.toBeInTheDocument();
  });

  it("swaps the editor contents when another section is opened", async () => {
    const userEvt = userEvent.setup();
    render(<SettingsPage />);

    const TWO_FA_EDITOR_TEXT = /Mendukung Google Authenticator, Microsoft Authenticator/i;

    await userEvt.click(screen.getAllByRole("button", { name: /Atur 2FA/i }).pop()!);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(TWO_FA_EDITOR_TEXT)).toBeInTheDocument();

    // Close the modal first: while it is open, Base UI marks the rest of the
    // page inert, so a card underneath cannot receive a real pointer event.
    await userEvt.click(within(dialog).getByRole("button", { name: /close/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    await userEvt.click(screen.getAllByRole("button", { name: /Ubah Kata Sandi/i }).pop()!);
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    const reopened = screen.getByRole("dialog");
    expect(within(reopened).getByLabelText(/Kata Sandi Saat Ini/i)).toBeInTheDocument();
    expect(within(reopened).queryByText(TWO_FA_EDITOR_TEXT)).not.toBeInTheDocument();
  });
});
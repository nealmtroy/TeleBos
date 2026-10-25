import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { helpSections } from "@/data/help-sections";
import { useI18nStore } from "@/lib/i18n";

import HelpPage from "./page";
import HelpDetailPage from "./[slug]/page";

// Mock useParams from next/navigation
let currentSlug: string | undefined = undefined;
vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: currentSlug }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => `/help/${currentSlug || ""}`,
}));

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  useI18nStore.setState({ locale: "en" });
  currentSlug = undefined;
});

describe("HelpPage", () => {
  it("renders the help center header and search input", () => {
    render(<HelpPage />);

    expect(screen.getByRole("heading", { level: 1, name: /Help & Documentation/i })).toBeDefined();
    expect(screen.getByRole("searchbox")).toBeDefined();
  });

  it("renders all 12 help topic categories in the navigation and grid", () => {
    render(<HelpPage />);

    expect(helpSections).toHaveLength(12);

    for (const section of helpSections) {
      const topicLinks = screen.getAllByRole("link").filter((link) =>
        link.getAttribute("href") === `/help/${section.slug}`
      );
      // Each section should be linked in both the nav pill list and the cards grid
      expect(topicLinks.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("renders the API documentation entry card", () => {
    render(<HelpPage />);

    const apiLinks = screen.getAllByRole("link", { name: /API Documentation/i });
    expect(apiLinks.some((l) => l.getAttribute("href") === "/help/api")).toBe(true);
  });

  it("dispatches telebos:open-support when clicking still stuck contact button", () => {
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    render(<HelpPage />);

    const supportBtn = screen.getByRole("button", { name: /Chat with AI Support/i });
    fireEvent.click(supportBtn);

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "telebos:open-support" })
    );
    dispatchSpy.mockRestore();
  });
});

describe("HelpDetailPage", () => {
  it("renders topic detail for a valid slug", () => {
    currentSlug = "getting-started";
    render(<HelpDetailPage params={{ slug: currentSlug }} />);

    expect(screen.getByRole("heading", { level: 1, name: /Getting Started/i })).toBeDefined();
    expect(screen.getByRole("navigation", { name: /Breadcrumb/i })).toBeDefined();
  });

  it("renders newly added topic detail (marketplace)", () => {
    currentSlug = "marketplace";
    render(<HelpDetailPage params={{ slug: currentSlug }} />);

    expect(screen.getByRole("heading", { level: 1, name: /Account Marketplace/i })).toBeDefined();
  });

  it("renders 404 state when topic does not exist", () => {
    currentSlug = "non-existent-topic";
    render(<HelpDetailPage params={{ slug: currentSlug }} />);

    expect(screen.getByRole("heading", { level: 1, name: /Help topic not found/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /Back to Help/i })).toHaveAttribute("href", "/help");
  });
});

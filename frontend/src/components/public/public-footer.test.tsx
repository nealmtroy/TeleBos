import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useI18nStore } from "@/lib/i18n";
import { PublicFooter } from "./public-footer";

beforeEach(() => {
  localStorage.clear();
  useI18nStore.setState({ locale: "en" });
});

describe("PublicFooter", () => {
  it("renders the public navigation destinations", () => {
    render(<PublicFooter compact />);

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Help" })).toHaveAttribute("href", "/help");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy-policy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms-of-service");
  });

  it("renders the Telegram channel link in full footer mode", () => {
    render(<PublicFooter compact={false} />);

    const tgLink = screen.getByRole("link", { name: /Join TeleBos Telegram Channel!/i });
    expect(tgLink).toHaveAttribute("href", "https://t.me/telebos_official");
    expect(tgLink).toHaveAttribute("target", "_blank");
  });
});

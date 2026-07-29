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
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/tos");
  });
});

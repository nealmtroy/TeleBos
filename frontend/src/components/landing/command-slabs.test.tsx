import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useI18nStore } from "@/lib/i18n";

import { CommandSlabs } from "./command-slabs";

beforeEach(() => {
  localStorage.clear();
  useI18nStore.setState({ locale: "en" });
});

describe("CommandSlabs", () => {
  it("exposes the expanded panel through accordion semantics", () => {
    render(<CommandSlabs />);

    const accounts = screen.getByRole("button", { name: /Account control/i });
    const broadcast = screen.getByRole("button", { name: /Broadcast orchestration/i });
    expect(accounts).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region")).toHaveAttribute("aria-labelledby", accounts.id);

    fireEvent.click(broadcast);
    expect(accounts).toHaveAttribute("aria-expanded", "false");
    expect(broadcast).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region")).toHaveAttribute("id", "command-panel-broadcast");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useI18nStore } from "@/lib/i18n";

import { BroadcastProgress } from "./broadcast-progress";

describe("BroadcastProgress", () => {
  it("renders progress totals and status", () => {
    useI18nStore.setState({ locale: "en" });
    const { container } = render(
      <BroadcastProgress
        progress={65}
        totalGroups={20}
        sentCount={13}
        failCount={2}
        status="running"
      />
    );

    expect(screen.getByText("65%")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("13")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
    expect(container.querySelector('[style="width: 65%;"]')).toBeInTheDocument();
  });
});

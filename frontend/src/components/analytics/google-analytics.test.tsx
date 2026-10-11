import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GoogleAnalytics } from "./google-analytics";

// Mock next/script
vi.mock("next/script", () => ({
  default: ({
    src,
    id,
    dangerouslySetInnerHTML,
  }: {
    src?: string;
    id?: string;
    dangerouslySetInnerHTML?: { __html: string };
  }) => {
    return (
      <script
        data-testid={id || "next-script"}
        src={src}
        dangerouslySetInnerHTML={dangerouslySetInnerHTML}
      />
    );
  },
}));

describe("GoogleAnalytics Component", () => {
  it("renders scripts when gaId is provided", () => {
    const { getByTestId } = render(<GoogleAnalytics gaId="G-SR0FJEE8YR" />);
    const script = getByTestId("google-analytics");
    expect(script).toBeDefined();
    expect(script.innerHTML).toContain("G-SR0FJEE8YR");
  });

  it("renders nothing when gaId is empty or undefined", () => {
    const { container } = render(<GoogleAnalytics gaId="" />);
    expect(container.firstChild).toBeNull();
  });
});

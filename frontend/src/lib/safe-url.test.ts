import { describe, expect, it } from "vitest";
import { safeHttpUrl } from "./safe-url";

describe("safeHttpUrl", () => {
  it("keeps http and https URLs", () => {
    expect(safeHttpUrl("https://t.me/channel")).toBe("https://t.me/channel");
    expect(safeHttpUrl("http://example.com/x")).toBe("http://example.com/x");
    expect(safeHttpUrl("  https://t.me/x  ")).toBe("https://t.me/x");
  });

  it("drops dangerous or non-http schemes", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeHttpUrl("data:text/html,<script>1</script>")).toBeUndefined();
    expect(safeHttpUrl("t.me/channel")).toBeUndefined();
  });

  it("returns undefined for empty input", () => {
    expect(safeHttpUrl("")).toBeUndefined();
    expect(safeHttpUrl(null)).toBeUndefined();
    expect(safeHttpUrl(undefined)).toBeUndefined();
  });
});

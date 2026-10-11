import { beforeEach, describe, expect, it, vi } from "vitest";
import { event, GA_TRACKING_ID, pageview } from "./gtag";

describe("gtag helpers", () => {
  beforeEach(() => {
    window.gtag = vi.fn();
  });

  it("exports a valid GA_TRACKING_ID", () => {
    expect(GA_TRACKING_ID).toBeTruthy();
  });

  it("calls gtag config on pageview", () => {
    pageview("/test-path");
    expect(window.gtag).toHaveBeenCalledWith("config", GA_TRACKING_ID, {
      page_path: "/test-path",
    });
  });

  it("calls gtag event on event", () => {
    event("login", { method: "telegram" });
    expect(window.gtag).toHaveBeenCalledWith("event", "login", {
      method: "telegram",
    });
  });
});

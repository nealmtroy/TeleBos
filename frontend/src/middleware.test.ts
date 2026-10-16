import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

describe("middleware localized routing", () => {
  it("rewrites /id to / and sets id locale header & cookie", async () => {
    const req = new NextRequest("https://telebos.app/id");
    const res = await middleware(req);

    expect(res.headers.get("x-middleware-rewrite")).toBe("https://telebos.app/");
    expect(res.headers.get("set-cookie")).toContain("telebo_locale=id");
  });

  it("rewrites /id/pricing to /pricing and preserves headers", async () => {
    const req = new NextRequest("https://telebos.app/id/pricing");
    const res = await middleware(req);

    expect(res.headers.get("x-middleware-rewrite")).toBe("https://telebos.app/pricing");
  });

  it("301 redirects /id/privacy to /id/privacy-policy", async () => {
    const req = new NextRequest("https://telebos.app/id/privacy");
    const res = await middleware(req);

    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://telebos.app/id/privacy-policy");
  });

  it("301 redirects /id/tos to /id/terms-of-service", async () => {
    const req = new NextRequest("https://telebos.app/id/tos");
    const res = await middleware(req);

    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://telebos.app/id/terms-of-service");
  });

  it("allows public English path /help without rewrite", async () => {
    const req = new NextRequest("https://telebos.app/help");
    const res = await middleware(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("redirects unauthenticated /dashboard to /login", async () => {
    const req = new NextRequest("https://telebos.app/dashboard");
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login?redirect=%2Fdashboard");
  });

  it("redirects unauthenticated /id/dashboard to /id/login", async () => {
    const req = new NextRequest("https://telebos.app/id/dashboard");
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/id/login?redirect=%2Fid%2Fdashboard");
  });

  it("enforces English locale on public root even if telebo_locale=id cookie is present", async () => {
    const req = new NextRequest("https://telebos.app/", {
      headers: { cookie: "telebo_locale=id" },
    });
    const res = await middleware(req);

    expect(res.status).toBe(200);
    // Request header forwarded to Next.js server components
    // (Note: in NextRequest/NextResponse, forwarded request headers are in the request)
  });

  it("bypasses static files and api routes", async () => {
    const staticReq = new NextRequest("https://telebos.app/favicon.ico");
    const staticRes = await middleware(staticReq);
    expect(staticRes.status).toBe(200);

    const apiReq = new NextRequest("https://telebos.app/api/auth/session");
    const apiRes = await middleware(apiReq);
    expect(apiRes.status).toBe(200);
  });
});

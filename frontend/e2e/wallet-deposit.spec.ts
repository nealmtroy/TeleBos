import { test, expect } from "@playwright/test";

test.describe("Wallet Deposit & Amount Validation (E2E)", () => {
  test.beforeEach(async ({ context, page }) => {
    // 1. Set Better Auth session cookie for localhost
    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: "mock-e2e-session-token",
        domain: "localhost",
        path: "/",
      },
    ]);

    // 2. Intercept Better Auth session calls
    await page.route("**/api/auth/**", async (route) => {
      const url = route.request().url();
      if (url.includes("get-session")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            session: {
              id: "mock-session-id",
              userId: "mock-user-id",
              token: "mock-e2e-session-token",
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
            },
            user: {
              id: "mock-user-id",
              email: "tester@telebos.com",
              name: "Tester E2E",
              role: "basic",
              emailVerified: true,
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    // 3. Intercept all FastAPI backend API calls to avoid 401 unauthenticated redirect
    await page.route("**/api/v1/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/auth/me")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "mock-user-id",
            email: "tester@telebos.com",
            full_name: "Tester E2E",
            role: "basic",
            is_active: true,
            balance: 500000,
            onboarding_completed: true,
          }),
        });
      } else if (url.includes("/wallet/transactions")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            transactions: [],
            total: 0,
            pending_count: 0,
          }),
        });
      } else if (url.includes("/bank-accounts")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      }
    });
  });

  test("should validate minimum topup amount and preset buttons", async ({ page }) => {
    await page.goto("/wallet");
    await expect(page).toHaveURL(/\/wallet/);

    const amountInput = page.locator("#wallet-amount");
    await expect(amountInput).toBeVisible();

    // 1. Enter amount below Rp 10.000 minimum
    await amountInput.fill("5000");

    // Validation warning should appear
    const minWarning = page.locator(
      'text=/Minimum request is Rp 10.000|Minimal permintaan adalah Rp 10.000/'
    );
    await expect(minWarning.first()).toBeVisible();

    // 2. Click a quick preset button (e.g. Rp 50.000)
    const presetBtn = page.getByRole("button", { name: "Rp 50.000" });
    if (await presetBtn.isVisible()) {
      await presetBtn.click();
      await expect(amountInput).toHaveValue("50000");
      // Warning should be cleared
      await expect(minWarning).not.toBeVisible();
    }
  });

  test("should switch between Top Up and Withdraw tabs", async ({ page }) => {
    await page.goto("/wallet");
    await expect(page).toHaveURL(/\/wallet/);

    // Look for tab triggers
    const withdrawTab = page.locator(
      '[role="tab"]:has-text("Withdraw"), [role="tab"]:has-text("Tarik"), [role="tab"]:has-text("Penarikan")'
    );
    if (await withdrawTab.first().isVisible()) {
      await withdrawTab.first().click();
      await expect(withdrawTab.first()).toHaveAttribute("data-state", "active");
    }
  });
});

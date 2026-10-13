import { test, expect } from "@playwright/test";

test.describe("Account Settings View & Navigation (E2E)", () => {
  test.beforeEach(async ({ context, page }) => {
    // 1. Authenticated session cookie for localhost
    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: "mock-e2e-session-token",
        domain: "localhost",
        path: "/",
      },
    ]);

    // 2. Intercept Better Auth session endpoint
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
              email: "settings_tester@telebos.com",
              name: "Settings Tester",
              role: "basic",
              emailVerified: true,
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    // 3. Intercept all FastAPI backend calls to avoid 401 unauthenticated redirect
    await page.route("**/api/v1/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/auth/me")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "mock-user-id",
            email: "settings_tester@telebos.com",
            full_name: "Settings Tester",
            role: "basic",
            is_active: true,
            balance: 100000,
            onboarding_completed: true,
          }),
        });
      } else if (url.includes("/bank-accounts")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      } else if (url.includes("/api-keys")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      } else if (url.includes("/auth/2fa/status")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ enabled: false }),
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

  test("should render settings layout and identity summary card", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings/);

    // Identity summary shows user email
    await expect(page.locator("text=settings_tester@telebos.com").first()).toBeVisible();

    // Verify settings navigation is present
    const settingsNav = page.locator("nav");
    await expect(settingsNav.first()).toBeVisible();
  });

  test("should switch settings tabs across sections", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings/);

    // Click on Appearance or Language navigation item
    const appearanceBtn = page.locator(
      'button:has-text("Tampilan"), button:has-text("Appearance")'
    );
    if (await appearanceBtn.first().isVisible()) {
      await appearanceBtn.first().click();
      await expect(appearanceBtn.first()).toHaveAttribute("aria-current", "page");
    }

    const languageBtn = page.locator(
      'button:has-text("Bahasa"), button:has-text("Language")'
    );
    if (await languageBtn.first().isVisible()) {
      await languageBtn.first().click();
      await expect(languageBtn.first()).toHaveAttribute("aria-current", "page");
    }
  });
});

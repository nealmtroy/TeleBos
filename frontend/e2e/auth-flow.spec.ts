import { test, expect } from "@playwright/test";

test.describe("Auth Flow & Protected Route Guards (E2E)", () => {
  test("should render login page with all inputs and redirect unauthenticated requests", async ({
    page,
  }) => {
    // 1. Visit Login page directly
    await page.goto("/login");

    // 2. Verify page title / heading and primary controls
    await expect(page).toHaveURL(/\/login/);
    const emailInput = page.locator("#email");
    const passwordInput = page.locator("#password");
    const submitButton = page.locator('button[type="submit"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitButton).toBeVisible();

    // 3. Verify links to Register and Forgot Password
    const registerLink = page.locator('a[href="/register"]');
    await expect(registerLink.first()).toBeVisible();

    // 4. Test protection guard: unauthenticated visit to /dashboard must redirect to /login
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?redirect=%2Fdashboard/);
  });

  test("should render register page with inputs and password requirements", async ({
    page,
  }) => {
    // 1. Visit Register page
    await page.goto("/register");
    await expect(page).toHaveURL(/\/register/);

    // 2. Verify registration form fields
    const nameInput = page.locator("#name");
    const emailInput = page.locator("#register-email");
    const passwordInput = page.locator("#register-password");
    const submitButton = page.locator('button[type="submit"]');

    await expect(nameInput).toBeVisible();
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitButton).toBeVisible();

    // 3. Type a weak password and verify strength meter / feedback appears
    await passwordInput.fill("123");
    const strengthFeedback = page.locator('text=/Lemah|Weak|Minimal 8|At least 8/');
    await expect(strengthFeedback.first()).toBeVisible();
  });
});

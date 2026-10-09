import { describe, expect, it } from "vitest";
import {
  getVerificationEmailHtml,
  getResetPasswordEmailHtml,
  getUnknownSignupAlertEmailHtml,
  getAccountLockedEmailHtml,
  getSuspiciousLoginActivityEmailHtml,
} from "./email";

describe("Email Templates", () => {
  it("renders verification email with TeleBos logo, button, and anti-phishing footer", () => {
    const html = getVerificationEmailHtml("Alex", "https://telebos.id/verify?token=123");

    expect(html).toContain("telebos_logo.PNG");
    expect(html).toContain("Alex");
    expect(html).toContain("https://telebos.id/verify?token=123");
    expect(html).toContain("Verifikasi Email Saya");
    expect(html).toContain("Pemberitahuan Keamanan");
    expect(html).toContain("TeleBos tidak akan pernah meminta kata sandi");
    expect(html).toContain("<!DOCTYPE html");
    expect(html).toContain("viewport");
  });

  it("renders reset password email with proper link and 1 hour expiry notice", () => {
    const html = getResetPasswordEmailHtml("Budi", "https://telebos.id/reset?token=xyz");

    expect(html).toContain("telebos_logo.PNG");
    expect(html).toContain("Budi");
    expect(html).toContain("https://telebos.id/reset?token=xyz");
    expect(html).toContain("Atur Ulang Kata Sandi");
    expect(html).toContain("1 jam");
    expect(html).toContain("Pemberitahuan Keamanan");
  });

  it("renders unknown signup alert with clear reassurance and no alarmist emoji in logo", () => {
    const html = getUnknownSignupAlertEmailHtml("Siti", "siti@example.com");

    expect(html).toContain("telebos_logo.PNG");
    expect(html).toContain("siti@example.com");
    expect(html).toContain("Akun Anda Tetap Aman");
    expect(html).not.toContain("⚠️ TeleBos");
    expect(html).toContain("Verifikasi Dua Langkah (2FA)");
  });

  it("renders account locked email with formatted time and remaining minutes", () => {
    const lockTime = new Date(Date.now() + 15 * 60 * 1000); // 15 mins from now
    const html = getAccountLockedEmailHtml("Andi", "andi@example.com", lockTime, 5);

    expect(html).toContain("telebos_logo.PNG");
    expect(html).toContain("andi@example.com");
    expect(html).toContain("5 kali");
    expect(html).toContain("menit lagi");
    expect(html).not.toContain("🔒 TeleBos");
  });

  it("renders suspicious login warning email with clean details table", () => {
    const html = getSuspiciousLoginActivityEmailHtml("Rudi", "rudi@example.com", 3);

    expect(html).toContain("telebos_logo.PNG");
    expect(html).toContain("rudi@example.com");
    expect(html).toContain("3 kali");
    expect(html).toContain("5 kali");
    expect(html).toContain("Peringatan Dini Keamanan");
  });
});

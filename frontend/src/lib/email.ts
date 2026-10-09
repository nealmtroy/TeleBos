/**
 * TeleBos — Resend Email Utility & Responsive HTML Email Templates
 *
 * Handles sending transactional emails using Resend's REST API.
 * Features ultra-clean, mobile-responsive, professional email designs
 * engineered for high trust, anti-phishing aesthetics, and cross-client compatibility.
 */

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * Returns the configured base URL for links and media in emails.
 */
function getBaseUrl(): string {
  const url =
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_URL ||
    "https://telebos.id";
  return url.replace(/\/$/, "");
}

/**
 * Sends an email using Resend's REST API.
 */
export async function sendEmail({ to, subject, html }: SendEmailParams) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  if (!apiKey) {
    console.error("❌ [Resend] RESEND_API_KEY is not defined in environment variables.");
    return { success: false, error: "RESEND_API_KEY missing" };
  }

  // Format the sender address nicely.
  const from = `TeleBos <${fromEmail}>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ [Resend] API Error Response:", data);
      return { success: false, error: data };
    }

    console.log(`✓ [Resend] Email successfully sent to ${to}. Message ID: ${data.id}`);
    return { success: true, id: data.id };
  } catch (err) {
    console.error("❌ [Resend] Request failed:", err);
    return { success: false, error: err };
  }
}

interface ShellOptions {
  title: string;
  preheader: string;
  badgeText: string;
  badgeTone?: "blue" | "amber" | "rose";
  contentHtml: string;
}

/**
 * Standardized responsive email wrapper with cross-client table layout,
 * TeleBos branding, typography, and anti-phishing footer.
 */
function renderEmailShell({
  title,
  preheader,
  badgeText,
  badgeTone = "blue",
  contentHtml,
}: ShellOptions): string {
  const baseUrl = getBaseUrl();
  const logoUrl = `${baseUrl}/telebos_logo.PNG`;
  const currentYear = new Date().getFullYear();

  const toneConfig = {
    blue: {
      accentGradient: "linear-gradient(90deg, #2563eb 0%, #3b82f6 100%)",
      badgeBg: "#eff6ff",
      badgeBorder: "#bfdbfe",
      badgeText: "#1d4ed8",
    },
    amber: {
      accentGradient: "linear-gradient(90deg, #d97706 0%, #f59e0b 100%)",
      badgeBg: "#fffbeb",
      badgeBorder: "#fde68a",
      badgeText: "#b45309",
    },
    rose: {
      accentGradient: "linear-gradient(90deg, #dc2626 0%, #ef4444 100%)",
      badgeBg: "#fef2f2",
      badgeBorder: "#fecaca",
      badgeText: "#b91c1c",
    },
  }[badgeTone];

  return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="id">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${title}</title>
  <style type="text/css">
    body {
      margin: 0 !important;
      padding: 0 !important;
      background-color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    td, p, a, span { mso-line-height-rule: exactly; }
    img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
    a { text-decoration: none; }
    @media only screen and (max-width: 600px) {
      .email-wrapper { padding: 16px 8px !important; }
      .email-card { width: 100% !important; border-radius: 8px !important; }
      .email-header { padding: 24px 20px 16px 20px !important; }
      .email-body { padding: 24px 20px !important; }
      .email-footer { padding: 20px 20px !important; }
      .email-h1 { font-size: 20px !important; line-height: 28px !important; }
      .btn-container { width: 100% !important; }
      .btn-link { display: block !important; width: 100% !important; text-align: center !important; padding: 14px 20px !important; box-sizing: border-box !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9;">
  <!-- Preheader text for inbox previews -->
  <div style="display: none; max-height: 0px; overflow: hidden; font-size: 1px; line-height: 1px; color: #fff; opacity: 0;">
    ${preheader}
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9;" class="email-wrapper">
    <tr>
      <td align="center" style="padding: 40px 12px;">
        <!-- Email Container -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 16px -2px rgba(15, 23, 42, 0.05); overflow: hidden;" class="email-card">
          <!-- Top Accent Stripe -->
          <tr>
            <td height="4" style="background: ${toneConfig.accentGradient}; line-height: 4px; font-size: 4px;">&nbsp;</td>
          </tr>

          <!-- Header with TeleBos Logo -->
          <tr>
            <td align="center" style="padding: 32px 32px 20px 32px; border-bottom: 1px solid #f1f5f9;" class="email-header">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
                <tr>
                  <td align="center">
                    <a href="${baseUrl}" target="_blank" style="text-decoration: none; display: inline-block;">
                      <img src="${logoUrl}" alt="TeleBos" width="128" style="display: block; max-width: 128px; width: 128px; height: auto; border: 0; outline: none;" />
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 8px;">
                    <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; font-weight: 500; color: #94a3b8; letter-spacing: 0.05em; text-transform: uppercase;">
                      Telegram Multi-Account Platform
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content Body -->
          <tr>
            <td style="padding: 36px 36px 28px 36px;" class="email-body">
              <!-- Category Badge -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 16px;">
                <tr>
                  <td style="background-color: ${toneConfig.badgeBg}; border: 1px solid ${toneConfig.badgeBorder}; border-radius: 9999px; padding: 4px 12px;">
                    <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; font-weight: 600; color: ${toneConfig.badgeText}; letter-spacing: 0.04em; text-transform: uppercase;">
                      ${badgeText}
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Injected Content -->
              ${contentHtml}
            </td>
          </tr>

          <!-- Anti-Phishing Security & Signature Footer -->
          <tr>
            <td style="padding: 24px 36px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;" class="email-footer">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom: 12px;">
                    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; line-height: 18px; color: #64748b; margin: 0;">
                      <strong style="color: #475569;">Pemberitahuan Keamanan:</strong> TeleBos tidak akan pernah meminta kata sandi Anda melalui email. Pastikan tautan selalu mengarah ke domain resmi kami.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="border-top: 1px solid #e2e8f0; padding-top: 12px;">
                    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; line-height: 18px; color: #94a3b8; margin: 0 0 4px 0;">
                      Email ini dikirim otomatis oleh sistem keamanan resmi TeleBos.
                    </p>
                    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; line-height: 16px; color: #94a3b8; margin: 0;">
                      &copy; ${currentYear} TeleBos. Seluruh hak cipta dilindungi undang-undang.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Generates an email verification HTML template.
 */
export function getVerificationEmailHtml(name: string, url: string): string {
  const contentHtml = `
    <h1 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 30px; margin: 0 0 16px 0; letter-spacing: -0.02em;" class="email-h1">
      Verifikasi Alamat Email Anda
    </h1>
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 24px; color: #334155; margin: 0 0 16px 0;">
      Halo <strong>${name || "Pengguna TeleBos"}</strong>,
    </p>
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 24px; color: #334155; margin: 0 0 24px 0;">
      Terima kasih telah mendaftar di TeleBos. Untuk mengaktifkan akun Anda dan mulai mengelola akun Telegram Anda dengan aman, silakan konfirmasi alamat email ini dengan menekan tombol berikut:
    </p>

    <!-- Primary Button -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 28px 0;" class="btn-container">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" style="border-radius: 8px; background-color: #2563eb;">
                <a href="${url}" target="_blank" class="btn-link" style="display: inline-block; padding: 14px 36px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; font-weight: 600; color: #ffffff !important; text-decoration: none; border-radius: 8px; background-color: #2563eb; letter-spacing: -0.01em;">
                  Verifikasi Email Saya &rarr;
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Security Info Box -->
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 20px; color: #475569; margin: 0;">
        <strong style="color: #0f172a;">Catatan:</strong> Tautan verifikasi ini berlaku selama <strong>24 jam</strong>. Jika Anda tidak merasa mendaftar di TeleBos, Anda dapat mengabaikan email ini dengan aman tanpa tindakan lebih lanjut.
      </p>
    </div>

    <!-- URL Fallback -->
    <div style="border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 24px;">
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; line-height: 18px; color: #64748b; margin: 0 0 8px 0;">
        Jika tombol di atas tidak berfungsi, salin dan tempel tautan berikut ke browser web Anda:
      </p>
      <div style="background-color: #f1f5f9; border-radius: 6px; padding: 10px 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; line-height: 16px; color: #2563eb; word-break: break-all;">
        <a href="${url}" target="_blank" style="color: #2563eb; text-decoration: underline;">${url}</a>
      </div>
    </div>
  `;

  return renderEmailShell({
    title: "Verifikasi Alamat Email Anda - TeleBos",
    preheader: "Konfirmasi alamat email Anda untuk mengaktifkan akun TeleBos.",
    badgeText: "Aktivasi Akun",
    badgeTone: "blue",
    contentHtml,
  });
}

/**
 * Generates a password reset HTML template.
 */
export function getResetPasswordEmailHtml(name: string, url: string): string {
  const contentHtml = `
    <h1 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 30px; margin: 0 0 16px 0; letter-spacing: -0.02em;" class="email-h1">
      Atur Ulang Kata Sandi Akun
    </h1>
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 24px; color: #334155; margin: 0 0 16px 0;">
      Halo <strong>${name || "Pengguna TeleBos"}</strong>,
    </p>
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 24px; color: #334155; margin: 0 0 24px 0;">
      Kami menerima permintaan untuk mengatur ulang kata sandi akun TeleBos Anda. Tekan tombol di bawah ini untuk membuat kata sandi baru yang aman:
    </p>

    <!-- Primary Button -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 28px 0;" class="btn-container">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td align="center" style="border-radius: 8px; background-color: #2563eb;">
                <a href="${url}" target="_blank" class="btn-link" style="display: inline-block; padding: 14px 36px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; font-weight: 600; color: #ffffff !important; text-decoration: none; border-radius: 8px; background-color: #2563eb; letter-spacing: -0.01em;">
                  Atur Ulang Kata Sandi &rarr;
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Security Info Box -->
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 20px; color: #475569; margin: 0;">
        <strong style="color: #0f172a;">Keamanan:</strong> Tautan ini hanya berlaku selama <strong>1 jam</strong>. Jika Anda tidak mengajukan permintaan ini, kata sandi akun Anda tetap aman dan tidak ada perubahan yang terjadi.
      </p>
    </div>

    <!-- URL Fallback -->
    <div style="border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 24px;">
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; line-height: 18px; color: #64748b; margin: 0 0 8px 0;">
        Jika tombol di atas tidak berfungsi, salin dan tempel tautan berikut ke browser web Anda:
      </p>
      <div style="background-color: #f1f5f9; border-radius: 6px; padding: 10px 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; line-height: 16px; color: #2563eb; word-break: break-all;">
        <a href="${url}" target="_blank" style="color: #2563eb; text-decoration: underline;">${url}</a>
      </div>
    </div>
  `;

  return renderEmailShell({
    title: "Atur Ulang Kata Sandi - TeleBos",
    preheader: "Permintaan untuk mengatur ulang kata sandi akun TeleBos Anda.",
    badgeText: "Keamanan Akun",
    badgeTone: "blue",
    contentHtml,
  });
}

/**
 * Generates a security alert HTML template when someone attempts to re-register
 * with an existing user's email address.
 */
export function getUnknownSignupAlertEmailHtml(name: string, email: string): string {
  const contentHtml = `
    <h1 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 30px; margin: 0 0 16px 0; letter-spacing: -0.02em;" class="email-h1">
      Pemberitahuan Percobaan Pendaftaran
    </h1>
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 24px; color: #334155; margin: 0 0 16px 0;">
      Halo <strong>${name || "Pengguna TeleBos"}</strong>,
    </p>
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 24px; color: #334155; margin: 0 0 20px 0;">
      Sistem keamanan kami mendeteksi adanya upaya pendaftaran akun baru menggunakan alamat email Anda (<strong>${email}</strong>) di TeleBos.
    </p>

    <!-- Information Card -->
    <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 16px 20px; margin: 24px 0;">
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 600; color: #92400e; margin: 0 0 6px 0;">
        Akun Anda Tetap Aman
      </p>
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 20px; color: #b45309; margin: 0;">
        Pendaftaran ganda telah dicegah secara otomatis oleh sistem pertahanan kami. Tidak ada akun baru yang dibuat dan data Anda tidak terpengaruh.
      </p>
    </div>

    <!-- Recommendations -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0;">
      <tr>
        <td style="padding-bottom: 12px;">
          <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 22px; color: #334155; margin: 0;">
            • <strong>Jika ini adalah Anda:</strong> Anda sudah memiliki akun TeleBos. Silakan langsung masuk menggunakan halaman login. Jika Anda lupa kata sandi, gunakan fitur Lupa Kata Sandi.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom: 12px;">
          <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 22px; color: #334155; margin: 0;">
            • <strong>Jika bukan Anda:</strong> Anda tidak perlu melakukan apa pun. Tidak ada pihak yang dapat mengakses akun Anda tanpa kata sandi Anda.
          </p>
        </td>
      </tr>
    </table>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-top: 16px;">
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; line-height: 18px; color: #64748b; margin: 0;">
        💡 <strong>Saran Keamanan:</strong> Untuk perlindungan maksimal terhadap akun Anda, pastikan Anda telah mengaktifkan <strong>Verifikasi Dua Langkah (2FA)</strong> di menu Pengaturan Akun.
      </p>
    </div>
  `;

  return renderEmailShell({
    title: "Percobaan Pendaftaran - TeleBos",
    preheader: "Peringatan keamanan mengenai percobaan pendaftaran dengan email Anda.",
    badgeText: "Keamanan Akun",
    badgeTone: "amber",
    contentHtml,
  });
}

/**
 * Generates an account locked notification HTML template.
 * Sent when an account is temporarily locked due to excessive failed login attempts.
 */
export function getAccountLockedEmailHtml(
  name: string,
  email: string,
  lockedUntil: Date,
  failedAttempts: number,
): string {
  const remainingMinutes = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
  const formattedTime = lockedUntil.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "full",
    timeStyle: "long",
  });

  const contentHtml = `
    <h1 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 30px; margin: 0 0 16px 0; letter-spacing: -0.02em;" class="email-h1">
      Akun Dikunci Sementara Waktu
    </h1>
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 24px; color: #334155; margin: 0 0 16px 0;">
      Halo <strong>${name || "Pengguna TeleBos"}</strong>,
    </p>
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 24px; color: #334155; margin: 0 0 20px 0;">
      Sistem pertahanan otomatis kami mendeteksi adanya <strong>${failedAttempts} kali percobaan masuk gagal</strong> secara beruntun pada akun Anda (<strong>${email}</strong>). Demi melindungi keamanan data Anda dari potensi serangan kata sandi (brute-force), akun Anda telah <strong>dikunci sementara</strong>.
    </p>

    <!-- Lock Status Card -->
    <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #dc2626; border-radius: 8px; padding: 16px 20px; margin: 24px 0;">
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 600; color: #991b1b; margin: 0 0 4px 0;">
        Jadwal Buka Kunci Otomatis
      </p>
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 20px; color: #b91c1c; margin: 0;">
        Akun akan dibuka kembali secara otomatis pada: <strong>${formattedTime}</strong> (sekitar ${remainingMinutes} menit lagi).
      </p>
    </div>

    <!-- Details Table -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
      <tr style="background-color: #f8fafc;">
        <td style="padding: 12px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">
          Alamat Email
        </td>
        <td align="right" style="padding: 12px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0;">
          ${email}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">
          Percobaan Gagal Terdeteksi
        </td>
        <td align="right" style="padding: 12px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; font-weight: 600; color: #dc2626; border-bottom: 1px solid #e2e8f0;">
          ${failedAttempts} kali
        </td>
      </tr>
      <tr style="background-color: #f8fafc;">
        <td style="padding: 12px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; color: #64748b;">
          Status Akun
        </td>
        <td align="right" style="padding: 12px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; font-weight: 600; color: #b91c1c;">
          Terkunci Sementara
        </td>
      </tr>
    </table>

    <!-- Next Actions -->
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 22px; color: #334155; margin: 20px 0 8px 0;">
      <strong>Langkah selanjutnya:</strong>
    </p>
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 20px; color: #475569; margin: 0 0 10px 0;">
      • Jika Anda lupa kata sandi, silakan gunakan fitur <strong>Lupa Kata Sandi</strong> setelah masa kunci berakhir untuk mengatur ulang kata sandi dengan aman.
    </p>
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 20px; color: #475569; margin: 0;">
      • Jika Anda tidak melakukan percobaan ini, kemungkinan seseorang mencoba menebak kredensial Anda. Kami sangat menyarankan untuk segera memperbarui kata sandi Anda setelah akun terbuka kembali.
    </p>
  `;

  return renderEmailShell({
    title: "Akun Dikunci Sementara - TeleBos",
    preheader: "Pemberitahuan penguncian sementara akun TeleBos Anda demi keamanan.",
    badgeText: "Perlindungan Akun",
    badgeTone: "rose",
    contentHtml,
  });
}

/**
 * Generates an early security warning HTML template when multiple failed login
 * attempts are detected before the account is locked.
 */
export function getSuspiciousLoginActivityEmailHtml(
  name: string,
  email: string,
  failedAttempts: number,
): string {
  const contentHtml = `
    <h1 style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 30px; margin: 0 0 16px 0; letter-spacing: -0.02em;" class="email-h1">
      Pemberitahuan Percobaan Masuk Gagal
    </h1>
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 24px; color: #334155; margin: 0 0 16px 0;">
      Halo <strong>${name || "Pengguna TeleBos"}</strong>,
    </p>
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 24px; color: #334155; margin: 0 0 20px 0;">
      Sistem kami mendeteksi <strong>${failedAttempts} kali percobaan masuk gagal</strong> ke akun Anda (<strong>${email}</strong>).
    </p>

    <!-- Warning Card -->
    <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 16px 20px; margin: 24px 0;">
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 600; color: #92400e; margin: 0 0 4px 0;">
        Peringatan Dini Keamanan
      </p>
      <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 20px; color: #b45309; margin: 0;">
        Jika terjadi 5 kali percobaan gagal berturut-turut, akun Anda akan dikunci otomatis demi mencegah akses tidak sah.
      </p>
    </div>

    <!-- Details Table -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
      <tr style="background-color: #f8fafc;">
        <td style="padding: 12px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">
          Alamat Email
        </td>
        <td align="right" style="padding: 12px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0;">
          ${email}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">
          Percobaan Gagal Saat Ini
        </td>
        <td align="right" style="padding: 12px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; font-weight: 600; color: #f59e0b; border-bottom: 1px solid #e2e8f0;">
          ${failedAttempts} kali
        </td>
      </tr>
      <tr style="background-color: #f8fafc;">
        <td style="padding: 12px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; color: #64748b;">
          Batas Maksimum Sebelum Terkunci
        </td>
        <td align="right" style="padding: 12px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; font-weight: 600; color: #0f172a;">
          5 kali
        </td>
      </tr>
    </table>

    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 22px; color: #334155; margin: 20px 0 8px 0;">
      <strong>Apa yang perlu Anda lakukan?</strong>
    </p>
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 20px; color: #475569; margin: 0 0 10px 0;">
      • <strong>Jika ini adalah Anda:</strong> Harap pastikan Anda memasukkan kata sandi yang benar. Jika lupa, silakan gunakan fitur <strong>Lupa Kata Sandi</strong> sebelum akun terkunci.
    </p>
    <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 20px; color: #475569; margin: 0;">
      • <strong>Jika bukan Anda:</strong> Akun Anda saat ini masih aman. Namun kami menyarankan Anda untuk memantau aktivitas atau memperbarui kata sandi dengan kombinasi yang lebih kuat.
    </p>
  `;

  return renderEmailShell({
    title: "Percobaan Masuk Gagal - TeleBos",
    preheader: "Peringatan dini aktivitas masuk gagal pada akun TeleBos Anda.",
    badgeText: "Aktivitas Masuk",
    badgeTone: "amber",
    contentHtml,
  });
}

/**
 * TeleBos — Resend Email Utility
 *
 * Handles sending emails using Resend's REST API.
 * Includes beautifully styled premium HTML templates for verification and password reset.
 */

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
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
  // Note: onboarding@resend.dev can only send to the account owner's email address in sandbox mode.
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

/**
 * Generates a premium HTML email template for email verification.
 */
export function getVerificationEmailHtml(name: string, url: string): string {
  const brandColor = "#2563eb"; // TeleBos Blue
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verifikasi Email - TeleBos</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #f8fafc;
      color: #1e293b;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #f8fafc;
      padding: 40px 20px;
      box-sizing: border-box;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #1e1b4b, #1d4ed8);
      padding: 32px;
      text-align: center;
    }
    .logo {
      font-size: 28px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.05em;
      margin: 0;
      text-decoration: none;
    }
    .content {
      padding: 40px 32px;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 16px;
    }
    p {
      font-size: 16px;
      line-height: 24px;
      color: #475569;
      margin-top: 0;
      margin-bottom: 24px;
    }
    .btn-container {
      text-align: center;
      margin: 32px 0;
    }
    .btn {
      display: inline-block;
      background-color: ${brandColor};
      color: #ffffff !important;
      font-weight: 600;
      font-size: 15px;
      text-decoration: none;
      padding: 12px 32px;
      border-radius: 8px;
      box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);
      transition: background-color 0.2s;
    }
    .divider {
      height: 1px;
      background-color: #f1f5f9;
      margin: 32px 0;
    }
    .fallback-text {
      font-size: 13px;
      color: #64748b;
      word-break: break-all;
      line-height: 20px;
    }
    .footer {
      background-color: #f8fafc;
      padding: 24px 32px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    .footer p {
      font-size: 12px;
      color: #94a3b8;
      margin: 0;
      line-height: 18px;
    }
    .footer a {
      color: #64748b;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="logo">TeleBos</div>
      </div>
      <div class="content">
        <h1>Halo ${name || "Pengguna"},</h1>
        <p>Terima kasih telah mendaftar di TeleBos! Langkah terakhir untuk mengaktifkan akun Anda adalah dengan memverifikasi alamat email Anda.</p>
        <p>Silakan klik tombol di bawah ini untuk memverifikasi email Anda:</p>
        <div class="btn-container">
          <a href="${url}" target="_blank" class="btn">Verifikasi Email</a>
        </div>
        <p>Tautan verifikasi ini akan kedaluwarsa dalam 24 jam.</p>
        <div class="divider"></div>
        <p class="fallback-text">
          Jika tombol tidak bekerja, salin dan tempel URL berikut ke browser Anda:<br>
          <a href="${url}" target="_blank" style="color: ${brandColor};">${url}</a>
        </p>
      </div>
      <div class="footer">
        <p>Jika Anda tidak merasa mendaftar di TeleBos, silakan abaikan email ini.</p>
        <p style="margin-top: 8px;">&copy; ${new Date().getFullYear()} TeleBos. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generates a premium HTML email template for unknown sign-up alerts.
 * Sent to existing users when someone tries to register with their email address.
 */
export function getUnknownSignupAlertEmailHtml(name: string, email: string): string {
  const brandColor = "#2563eb";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Percobaan Pendaftaran - TeleBos</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #f8fafc;
      color: #1e293b;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #f8fafc;
      padding: 40px 20px;
      box-sizing: border-box;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #b91c1c, #dc2626);
      padding: 32px;
      text-align: center;
    }
    .logo {
      font-size: 28px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.05em;
      margin: 0;
      text-decoration: none;
    }
    .content {
      padding: 40px 32px;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 16px;
    }
    p {
      font-size: 16px;
      line-height: 24px;
      color: #475569;
      margin-top: 0;
      margin-bottom: 24px;
    }
    .alert-box {
      background-color: #fef2f2;
      border: 1px solid #fecaca;
      border-left: 4px solid #dc2626;
      border-radius: 8px;
      padding: 16px 20px;
      margin: 24px 0;
    }
    .alert-box p {
      color: #991b1b;
      margin: 0;
      font-size: 14px;
    }
    .footer {
      background-color: #f8fafc;
      padding: 24px 32px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    .footer p {
      font-size: 12px;
      color: #94a3b8;
      margin: 0;
      line-height: 18px;
    }
    .footer a {
      color: #64748b;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="logo">⚠️ TeleBos</div>
      </div>
      <div class="content">
        <h1>Halo ${name || "Pengguna"},</h1>
        <p>Kami mendeteksi adanya percobaan pendaftaran akun baru menggunakan alamat email Anda (<strong>${email}</strong>) di TeleBos.</p>
        <div class="alert-box">
          <p><strong>Jika ini adalah Anda:</strong> Anda sudah memiliki akun. Silakan login menggunakan email dan kata sandi Anda yang sudah terdaftar. Tidak perlu mendaftar ulang.</p>
        </div>
        <p>Jika Anda <strong>tidak</strong> melakukan pendaftaran ini, Anda dapat mengabaikan email ini dengan aman. Akun Anda tetap terlindungi dan tidak ada perubahan yang dilakukan.</p>
        <p>Untuk keamanan tambahan, kami sarankan untuk mengaktifkan otentikasi dua faktor (2FA) di pengaturan akun Anda jika belum.</p>
      </div>
      <div class="footer">
        <p>Email ini dikirim secara otomatis oleh sistem keamanan TeleBos.</p>
        <p style="margin-top: 8px;">&copy; ${new Date().getFullYear()} TeleBos. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generates a premium HTML email template for password reset.
 */
export function getResetPasswordEmailHtml(name: string, url: string): string {
  const brandColor = "#2563eb"; // TeleBos Blue
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Atur Ulang Kata Sandi - TeleBos</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #f8fafc;
      color: #1e293b;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #f8fafc;
      padding: 40px 20px;
      box-sizing: border-box;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #1e1b4b, #1d4ed8);
      padding: 32px;
      text-align: center;
    }
    .logo {
      font-size: 28px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.05em;
      margin: 0;
      text-decoration: none;
    }
    .content {
      padding: 40px 32px;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 16px;
    }
    p {
      font-size: 16px;
      line-height: 24px;
      color: #475569;
      margin-top: 0;
      margin-bottom: 24px;
    }
    .btn-container {
      text-align: center;
      margin: 32px 0;
    }
    .btn {
      display: inline-block;
      background-color: ${brandColor};
      color: #ffffff !important;
      font-weight: 600;
      font-size: 15px;
      text-decoration: none;
      padding: 12px 32px;
      border-radius: 8px;
      box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);
      transition: background-color 0.2s;
    }
    .divider {
      height: 1px;
      background-color: #f1f5f9;
      margin: 32px 0;
    }
    .fallback-text {
      font-size: 13px;
      color: #64748b;
      word-break: break-all;
      line-height: 20px;
    }
    .footer {
      background-color: #f8fafc;
      padding: 24px 32px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    .footer p {
      font-size: 12px;
      color: #94a3b8;
      margin: 0;
      line-height: 18px;
    }
    .footer a {
      color: #64748b;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="logo">TeleBos</div>
      </div>
      <div class="content">
        <h1>Halo ${name || "Pengguna"},</h1>
        <p>Kami menerima permintaan untuk mengatur ulang kata sandi akun TeleBos Anda. Klik tombol di bawah ini untuk menetapkan kata sandi baru:</p>
        <div class="btn-container">
          <a href="${url}" target="_blank" class="btn">Atur Ulang Sandi</a>
        </div>
        <p>Tautan ini hanya berlaku selama 1 jam. Jika Anda tidak mengajukan permintaan ini, Anda dapat mengabaikan email ini dengan aman.</p>
        <div class="divider"></div>
        <p class="fallback-text">
          Jika tombol tidak bekerja, salin dan tempel URL berikut ke browser Anda:<br>
          <a href="${url}" target="_blank" style="color: ${brandColor};">${url}</a>
        </p>
      </div>
      <div class="footer">
        <p>Jika Anda memiliki pertanyaan, silakan hubungi tim dukungan kami.</p>
        <p style="margin-top: 8px;">&copy; ${new Date().getFullYear()} TeleBos. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

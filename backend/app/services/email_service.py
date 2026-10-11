"""Email service for TeleBos.

Supports:
1. SMTP (async via asyncio.to_thread with STARTTLS/SSL support)
2. Resend API (async via httpx if RESEND_API_KEY is configured)
3. Fallback / Dev mode: logs email and OTP clearly without failing when no provider is set.
"""

import asyncio
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import logging
import smtplib
from typing import Any
import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


def mask_email(email: str) -> str:
    """Mask email for privacy, e.g. 'johndoe@example.com' -> 'jo***@example.com'."""
    if not email or "@" not in email:
        return "***"
    username, domain = email.split("@", 1)
    if len(username) <= 2:
        masked_user = f"{username[0]}***"
    else:
        masked_user = f"{username[:2]}***"
    return f"{masked_user}@{domain}"


def _send_smtp_sync(
    host: str,
    port: int,
    user: str,
    password: str,
    from_addr: str,
    to_addr: str,
    subject: str,
    html_content: str,
    text_content: str,
    use_tls: bool,
    use_ssl: bool,
) -> bool:
    """Synchronous SMTP sender invoked via asyncio.to_thread."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr

    if text_content:
        msg.attach(MIMEText(text_content, "plain", "utf-8"))
    if html_content:
        msg.attach(MIMEText(html_content, "html", "utf-8"))

    try:
        if use_ssl:
            server: smtplib.SMTP = smtplib.SMTP_SSL(host, port, timeout=10.0)
        else:
            server = smtplib.SMTP(host, port, timeout=10.0)

        with server:
            if use_tls and not use_ssl:
                server.starttls()
            if user and password:
                server.login(user, password)
            server.sendmail(from_addr, [to_addr], msg.as_string())
        return True
    except Exception as exc:
        logger.error("Failed to send email via SMTP to %s: %s", to_addr, exc)
        return False


class EmailService:
    def __init__(self) -> None:
        pass

    async def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: str = "",
    ) -> bool:
        """Send an email using configured provider (Resend or SMTP or Dev Logger)."""
        settings = get_settings()

        # 1. Try Resend if API key is provided
        if settings.RESEND_API_KEY and settings.RESEND_API_KEY.strip() and not settings.RESEND_API_KEY.startswith("xxxx"):
            try:
                from_header = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
                payload = {
                    "from": from_header,
                    "to": [to_email],
                    "subject": subject,
                    "html": html_content,
                    "text": text_content,
                }
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(
                        "https://api.resend.com/emails",
                        headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
                        json=payload,
                    )
                    if resp.status_code in (200, 201):
                        logger.info("Email sent to %s via Resend API", mask_email(to_email))
                        return True
                    else:
                        logger.warning("Resend API error %s: %s", resp.status_code, resp.text)
            except Exception as exc:
                logger.error("Error dispatching email via Resend: %s", exc)

        # 2. Try SMTP if host is provided
        if settings.SMTP_HOST and settings.SMTP_HOST.strip():
            from_addr = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            success = await asyncio.to_thread(
                _send_smtp_sync,
                settings.SMTP_HOST,
                settings.SMTP_PORT,
                settings.SMTP_USER,
                settings.SMTP_PASSWORD,
                from_addr,
                to_email,
                subject,
                html_content,
                text_content,
                settings.SMTP_USE_TLS,
                settings.SMTP_USE_SSL,
            )
            if success:
                logger.info("Email sent to %s via SMTP (%s:%s)", mask_email(to_email), settings.SMTP_HOST, settings.SMTP_PORT)
                return True

        # 3. Fallback / Dev / Test Mode
        logger.warning(
            "[EMAIL SERVICE - DEV/FALLBACK] To: %s | Subject: %s\nText preview:\n%s",
            mask_email(to_email),
            subject,
            text_content,
        )
        return True

    async def send_withdraw_otp(
        self,
        to_email: str,
        otp_code: str,
        amount: int,
        method: str,
        note: str,
    ) -> bool:
        """Send a standardized 6-digit verification OTP email for wallet withdrawal."""
        formatted_amount = f"Rp {amount:,.0f}".replace(",", ".")
        subject = f"[{otp_code}] Kode Verifikasi Penarikan Dana TeleBos"

        text_content = (
            f"Halo,\n\n"
            f"Kami menerima permintaan penarikan dana dari akun TeleBos Anda.\n"
            f"Detail Penarikan:\n"
            f"- Nominal: {formatted_amount}\n"
            f"- Metode: {method}\n"
            f"- Rekening: {note}\n\n"
            f"Kode OTP Anda: {otp_code}\n\n"
            f"Kode ini berlaku selama 5 menit. Jangan pernah membagikan kode OTP ini "
            f"kepada siapa pun termasuk staf TeleBos.\n"
            f"Jika Anda tidak merasa melakukan permintaan ini, segera amankan akun Anda.\n\n"
            f"Salam,\n"
            f"TeleBos Security Team"
        )

        html_content = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Verifikasi Penarikan Dana</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); padding: 28px 32px; text-align: left;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">TeleBos Security</h1>
              <p style="margin: 4px 0 0; color: #e0f2fe; font-size: 13px;">Otentikasi Dua Faktor (2FA / Step-Up)</p>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.5; color: #334155;">
                Halo, kami menerima permintaan penarikan dana dari saldo dompet TeleBos Anda. Gunakan kode verifikasi di bawah ini untuk menyelesaikan transaksi:
              </p>

              <!-- Transaction Summary Box -->
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 20px 0;">
                <table width="100%" style="font-size: 13px; color: #475569;">
                  <tr>
                    <td style="padding: 4px 0; color: #64748b;">Nominal:</td>
                    <td style="padding: 4px 0; font-weight: 700; color: #0f172a; text-align: right; font-family: monospace; font-size: 14px;">{formatted_amount}</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; color: #64748b;">Metode:</td>
                    <td style="padding: 4px 0; font-weight: 600; color: #1e293b; text-align: right;">{method}</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; color: #64748b;">Rekening Tujuan:</td>
                    <td style="padding: 4px 0; font-weight: 500; color: #334155; text-align: right;">{note}</td>
                  </tr>
                </table>
              </div>

              <!-- OTP Code Display -->
              <div style="text-align: center; margin: 28px 0;">
                <span style="display: inline-block; background-color: #f0fdf4; border: 2px dashed #22c55e; border-radius: 12px; padding: 14px 28px; font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #15803d;">
                  {otp_code}
                </span>
                <p style="margin: 10px 0 0; font-size: 12px; color: #64748b;">
                  Kode ini berlaku selama <strong>5 menit</strong>.
                </p>
              </div>

              <!-- Security Notice -->
              <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 6px; padding: 12px 14px; margin-top: 24px;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #991b1b;">
                  <strong>Peringatan Keamanan:</strong> Jangan berikan kode OTP ini kepada siapa pun termasuk staf atau admin TeleBos. Jika Anda tidak melakukan permintaan ini, segera ganti kata sandi akun Anda.
                </p>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 32px; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                Email ini dikirim otomatis oleh TeleBos Security System. Mohon untuk tidak membalas email ini.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""
        return await self.send_email(
            to_email=to_email,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
        )


email_service = EmailService()

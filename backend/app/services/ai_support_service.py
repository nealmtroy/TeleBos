"""AI Support Service — handles customer queries, guardrails, order context, and Groq LLM completions."""

import logging
import re
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.order import Order
from app.models.support_ticket import SupportTicket
from app.models.user import User
from app.schemas.support import (
    ChatMessage,
    OrderSummaryItem,
    SupportChatResponse,
)

logger = logging.getLogger(__name__)
settings = get_settings()

# SENSITIVE DATA REGEX PATTERNS (PII & TELEGRAM CREDENTIALS)
SESSION_STRING_PATTERN = re.compile(r"1[0-9A-Za-z_-]{200,}")
OTP_CODE_PATTERN = re.compile(r"\b\d{5}\b")  # Telegram 5-digit login code
CREDIT_CARD_PATTERN = re.compile(r"\b(?:\d{4}[ -]?){3}\d{4}\b")

# KNOWLEDGE BASE BASELINE (TELEBOS PLATFORM)
TELEBOS_KB = """
[TELEBOS KNOWLEDGE BASE]
1. Tentang TeleBos:
- Platform manajemen multi-akun Telegram profesional untuk broadcast, invite member massal, auto-reply, manajemen folder, proxy, dan pesanan SMM (Telegram Views, Members, Reactions).

2. Akun & Sesi Telegram:
- Menghubungkan akun menggunakan nomor telepon + kode OTP Telegram atau Import Session String (Telethon).
- Akun disimpan dengan enkripsi Fernet. Keamanan 2FA didukung.
- Jika akun terkena "PeerFlood" atau "SpamBlock", gunakan menu Spam Appeals untuk mengajukan banding otomatis dengan AI ke @SpamBot.

3. Broadcast & Auto-Reply:
- Broadcast mendukung rotasi multi-akun, delay acak, loop mode, dan template pesan dinamis.
- Gunakan delay minimal 5-10 detik per pesan untuk menghindari flood wait Telegram.
- Auto-reply membalas pesan masuk secara otomatis berdasarkan kata kunci atau mode LLM cerdas.

4. Pesanan SMM (BuzzerPanel):
- Layanan mencakup: Telegram Channel Members, Post Views, Reactions, Group Members.
- Status Pesanan:
  * Pending: Pesanan diterima sistem dan sedang mengantre di server provider.
  * Processing / In progress: Pesanan sedang dikirim ke target channel/group.
  * Success / Completed: Pesanan telah selesai dikirim 100%.
  * Partial: Sebagian kuota gagal dikirim. Sistem otomatis me-refund sisa saldo ke Dompet TeleBos!
  * Error / Canceled: Pesanan dibatalkan atau gagal (misal link channel privat / salah format). Saldo otomatis kembali 100% ke Dompet TeleBos.
- Rata-rata waktu proses: 15 menit s/d 24 jam tergantung kecepatan server dan antrean.

5. Saldo & Billing:
- Top up saldo menggunakan kode voucher (Redeem Code) atau transfer melalui Admin.
- Saldo dompet dapat dicek di menu Dompet / Dashboard.
"""


def sanitize_sensitive_input(text: str) -> tuple[str, bool]:
    """Detect and mask sensitive Telegram credentials or OTPs."""
    detected = False

    if SESSION_STRING_PATTERN.search(text):
        text = SESSION_STRING_PATTERN.sub("[SENSITIVE_SESSION_STRING_MASKED]", text)
        detected = True

    if OTP_CODE_PATTERN.search(text):
        text = OTP_CODE_PATTERN.sub("[OTP_CODE_MASKED]", text)
        detected = True

    if CREDIT_CARD_PATTERN.search(text):
        text = CREDIT_CARD_PATTERN.sub("[CARD_MASKED]", text)
        detected = True

    return text, detected


async def get_user_recent_orders(
    db: AsyncSession, user_id: UUID, limit: int = 5
) -> list[Order]:
    """Fetch user's recent orders safely scoped to user_id."""
    query = (
        select(Order)
        .where(Order.user_id == user_id)
        .order_by(desc(Order.created_at))
        .limit(limit)
    )
    result = await db.execute(query)
    return list(result.scalars().all())


def build_system_prompt(user: User | None, orders: list[Order]) -> str:
    """Construct hardened system prompt with guardrails and multi-tenant isolation."""
    user_status = "PENGUNJUNG TAMU (BELUM LOGIN)"
    orders_context = "Tidak ada (User belum login)."

    if user:
        user_name = user.full_name or user.email.split("@")[0]
        user_status = (
            f"USER TERAUTENTIKASI:\n"
            f"- Nama: {user_name}\n"
            f"- Email: {user.email}\n"
            f"- Role: {user.role}\n"
            f"- Saldo: Rp {user.balance:,}\n"
        )

        if orders:
            order_lines = []
            for o in orders:
                created_str = o.created_at.strftime("%Y-%m-%d %H:%M") if o.created_at else "-"
                remains_str = f", Sisa: {o.remains}" if o.remains is not None else ""
                order_lines.append(
                    f"  * ID: {o.id} | SMM ID: {o.smm_order_id or '-'} | Layanan: {o.service_name} | "
                    f"Target: {o.data_target} | Qty: {o.quantity:,} | Status: {o.status}{remains_str} | Waktu: {created_str}"
                )
            orders_context = "DAFTAR 5 PESANAN TERAKHIR USER INI:\n" + "\n".join(order_lines)
        else:
            orders_context = "User ini belum memiliki riwayat pesanan SMM."

    return f"""Kamu adalah "TeleBos AI Support", asisten resmi cerdas dan ramah dari TeleBos.
Tugas utamamu adalah membantu pengguna memahami fitur TeleBos, memeriksa kendala pesanan, dan memandu solusi kendala umum.

=== STATUS PENGGUNA SAAT INI ===
{user_status}

=== DATA PESANAN USER INI ===
{orders_context}

=== BASIS PENGETAHUAN PLATFORM ===
{TELEBOS_KB}

=== ATURAN MUTLAK & GUARDRAILS (KEAMANAN TINGKAT TINGGI) ===
1. [ANTI-HALUSINASI FINANSIAL & LARANGAN JANJI REFUND]:
   - Kamu DILARANG KERAS menjanjikan refund uang, kompensasi finansial, saldo gratis, atau garansi bahwa pesanan pasti selesai dalam X menit.
   - Kamu BUKAN pemegang kewenangan finansial.
   - Jika pesanan berstatus 'Partial' atau 'Error', jelaskan fakta sistem: bahwa sistem SMM secara otomatis mengembalikan sisa saldo yang gagal ke Saldo Dompet TeleBos user. Sarankan cek menu Dompet.
   - Jika user menuntut refund manual atau komplain saldo tidak masuk, arahkan dengan sopan untuk mengeskalasikan ke Tim Admin melalui tombol "Hubungi Admin".

2. [PROTEKSI AKSES GUEST / BELUM LOGIN]:
   - Jika status pengguna adalah PENGUNJUNG TAMU (BELUM LOGIN) dan dia menanyakan pesanan, saldo, atau detail akun, beri tahu dengan sopan: "Untuk memeriksa pesanan atau akun Anda, silakan Login terlebih dahulu ke akun TeleBos Anda."

3. [PROTEKSI KREDENSIAL TELEGRAM & PII]:
   - Jangan pernah meminta kode OTP Telegram, string sesi login, atau password 2FA pengguna.
   - Jika user mengirimkannya, ingatkan mereka bahwa TeleBos tidak pernah meminta kode OTP/kredensial di chat bantuan.

4. [GAYA KOMUNIKASI]:
   - Berbahasa Indonesia yang sopan, ramah, to-the-point, dan solutif.
   - Gunakan format markdown rapi (bold untuk poin penting, bullet list).
   - Jangan menulis jawaban yang terlalu panjang atau bertele-tele. Maksimal 2-3 paragraf singkat.

5. [KRITERIA ESKALASI KE ADMIN]:
   - Tawarkan bantuan admin jika:
     * User merasa tidak puas atau kendala tidak terselesaikan.
     * Masalah saldo/pembayaran macet yang butuh verifikasi manual.
     * Pesanan berstatus Error / macet lebih dari 24 jam.
     * User secara eksplisit meminta berbicara dengan admin/manusia.
"""


async def get_groq_completion(messages: list[dict[str, str]]) -> str:
    """Call Groq API using rotating keys and models."""
    api_keys = [
        ("GROQ_API_KEY_1", getattr(settings, "GROQ_API_KEY_1", "")),
        ("GROQ_API_KEY_2", getattr(settings, "GROQ_API_KEY_2", "")),
        ("GROQ_API_KEY_3", getattr(settings, "GROQ_API_KEY_3", "")),
    ]
    active_keys = [(name, k.strip()) for name, k in api_keys if k and k.strip()]

    if not active_keys:
        return (
            "Halo! Layanan AI Support saat ini sedang dalam pemeliharaan konfigurasi API. "
            "Silakan gunakan tombol 'Hubungi Admin' di bawah untuk bantuan langsung dari tim kami."
        )

    configured_model = getattr(settings, "GROQ_MODEL", "llama-3.3-70b-versatile") or "llama-3.3-70b-versatile"
    models_to_try = [
        configured_model,
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "openai/gpt-oss-20b",
    ]
    seen = set()
    unique_models = [m for m in models_to_try if m and not (m in seen or seen.add(m))]

    url = "https://api.groq.com/openai/v1/chat/completions"

    for key_name, api_key in active_keys:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        for model in unique_models:
            payload = {
                "model": model,
                "messages": messages,
                "temperature": 0.4,  # Lower temperature for factual support consistency
                "max_tokens": 500,
            }
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.post(url, json=payload, headers=headers, timeout=20.0)
                    if resp.status_code == 200:
                        data = resp.json()
                        text = data["choices"][0]["message"]["content"].strip()
                        if "<think>" in text and "</think>" in text:
                            text = text.split("</think>")[-1].strip()
                        return text
                    elif resp.status_code == 404:
                        logger.warning("Groq model %s not found on %s, trying next...", model, key_name)
                        continue
                    elif resp.status_code == 429:
                        logger.warning("Groq rate limit on %s, trying next key...", key_name)
                        break
                    else:
                        logger.warning("Groq error %d (%s): %s", resp.status_code, key_name, resp.text)
                        break
            except Exception as e:
                logger.warning("Groq request exception with %s/%s: %s", key_name, model, e)
                break

    return (
        "Mohon maaf, saat ini sistem AI sedang mengalami lonjakan antrean. "
        "Silakan coba tanyakan kembali beberapa saat lagi atau klik 'Hubungi Admin' jika mendesak."
    )


async def handle_support_chat(
    db: AsyncSession,
    user: User | None,
    message: str,
    history: list[ChatMessage],
    context_page: str | None = None,
) -> SupportChatResponse:
    """Process incoming chat query with security guardrails and order context."""
    # 1. Sanitize user input
    cleaned_message, has_sensitive = sanitize_sensitive_input(message)

    # 2. Fetch orders if authenticated
    user_orders: list[Order] = []
    order_items: list[OrderSummaryItem] = []
    if user:
        user_orders = await get_user_recent_orders(db, user.id, limit=5)
        for o in user_orders:
            order_items.append(
                OrderSummaryItem(
                    id=str(o.id),
                    service_name=o.service_name,
                    category=o.category,
                    data_target=o.data_target,
                    quantity=o.quantity,
                    status=o.status,
                    price=o.price,
                    remains=o.remains,
                    created_at=o.created_at.strftime("%d %b %Y %H:%M") if o.created_at else "-",
                )
            )

    # 3. Build system prompt
    system_prompt = build_system_prompt(user, user_orders)

    # 4. Construct messages payload
    llm_messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]

    # Include recent history (max 6 messages to stay focused & fast)
    recent_history = history[-6:] if history else []
    for h in recent_history:
        cleaned_hist, _ = sanitize_sensitive_input(h.content)
        llm_messages.append({"role": h.role, "content": cleaned_hist})

    # Add current user prompt
    user_prompt = cleaned_message
    if has_sensitive:
        user_prompt += "\n(Catatan sistem: Pengguna sempat menyertakan data sensitif/OTP yang telah disensor otomatis)."
    if context_page:
        user_prompt += f"\n(Pengguna saat ini sedang melihat halaman: {context_page})"

    llm_messages.append({"role": "user", "content": user_prompt})

    # 5. Get LLM response
    reply_text = await get_groq_completion(llm_messages)

    # If sensitive data was detected, prepend security caution
    if has_sensitive:
        reply_text = (
            "⚠️ **Peringatan Keamanan**: Kami mendeteksi format kredensial/kode verifikasi dalam pesan Anda. "
            "Data tersebut telah disensor demi keamanan. Jangan pernah membagikan kode OTP atau sesi login akun Anda kepada siapa pun!\n\n"
            + reply_text
        )

    # 6. Escalation triggers & suggestions
    lower_query = message.lower()
    lower_reply = reply_text.lower()
    escalate_keywords = ["admin", "cs", "manusia", "refund", "batal", "komplain", "rusak", "error terus", "tidak masuk"]
    can_escalate = any(k in lower_query for k in escalate_keywords) or "hubungi admin" in lower_reply

    # Build suggested actions
    suggested_actions = []
    if user:
        if any(w in lower_query for w in ["order", "pesan", "status", "cek"]):
            suggested_actions.append("📦 Status Pesanan Terakhir")
        suggested_actions.extend(["⚡ Broadcast Bermasalah", "🆘 Hubungi Admin"])
    else:
        suggested_actions.extend(["🔑 Login ke Akun", "📖 Cara Pakai TeleBos", "🆘 Hubungi Admin"])

    return SupportChatResponse(
        reply=reply_text,
        can_escalate=can_escalate,
        suggested_actions=suggested_actions[:3],
        order_data=order_items if (user and any(k in lower_query for k in ["order", "pesan", "status", "cek", "smm"])) else None,
        is_authenticated=user is not None,
        user_name=user.full_name or user.email.split("@")[0] if user else None,
    )

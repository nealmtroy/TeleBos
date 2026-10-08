"""Unit tests for AI Support service, guardrails, and ticket escalation."""

import uuid
from app.models.order import Order
from app.models.user import User
from app.services.ai_support_service import (
    build_system_prompt,
    sanitize_sensitive_input,
)
from app.services.support_ticket_service import generate_ticket_number


def test_sanitize_sensitive_input_masks_credentials():
    # Telegram OTP code (5 digits)
    msg_otp = "Ini kodenya 48291 tolong bantu"
    cleaned, detected = sanitize_sensitive_input(msg_otp)
    assert detected is True
    assert "48291" not in cleaned
    assert "[OTP_CODE_MASKED]" in cleaned

    # Telegram session string
    fake_session = "1" + "A" * 250
    msg_session = f"Tolong cek session saya: {fake_session}"
    cleaned_s, detected_s = sanitize_sensitive_input(msg_session)
    assert detected_s is True
    assert fake_session not in cleaned_s
    assert "[SENSITIVE_SESSION_STRING_MASKED]" in cleaned_s

    # Clean message
    msg_normal = "Bagaimana cara melakukan broadcast di TeleBos?"
    cleaned_n, detected_n = sanitize_sensitive_input(msg_normal)
    assert detected_n is False
    assert cleaned_n == msg_normal


def test_build_system_prompt_guest():
    prompt = build_system_prompt(None, [])
    assert "PENGUNJUNG TAMU (BELUM LOGIN)" in prompt
    assert "ANTI-HALUSINASI FINANSIAL & LARANGAN JANJI REFUND" in prompt
    assert "DILARANG KERAS menjanjikan refund uang" in prompt


def test_build_system_prompt_authenticated_with_orders():
    user = User(
        id=uuid.uuid4(),
        email="testuser@telebos.com",
        full_name="Budi Santoso",
        role="pro",
        balance=150000,
    )
    fake_order = Order(
        id=uuid.uuid4(),
        user_id=user.id,
        service_id=101,
        service_name="Telegram Subscribers High Quality",
        category="Telegram",
        data_target="https://t.me/mychannel",
        quantity=500,
        status="Processing",
        remains=200,
    )

    prompt = build_system_prompt(user, [fake_order])
    assert "Budi Santoso" in prompt
    assert "testuser@telebos.com" in prompt
    assert "Telegram Subscribers High Quality" in prompt
    assert "Processing" in prompt


def test_generate_ticket_number_format():
    ticket_num = generate_ticket_number()
    assert ticket_num.startswith("TB-")
    assert len(ticket_num) == 8  # TB- + 5 digits

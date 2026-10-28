"""Admin wallet transaction settlement, approval workflows, and ledger reconciliation."""

from datetime import datetime, timezone
import hmac
import json
import logging
import secrets
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import require_role
from app.models.user import User
from app.models.wallet_transaction import WalletTransaction
from app.schemas.wallet import (
    AdminTransactionStatusUpdate,
    BalanceReconciliationResponse,
    CryptoRateUpdateRequest,
    CryptoWalletPublicInfoResponse,
    CryptoWalletRevealOtpResponse,
    CryptoWalletRevealRequest,
    CryptoWalletSecretsResponse,
    WalletTransactionListResponse,
    WalletTransactionResponse,
)
from app.services.email_service import email_service, mask_email
from app.services.ledger_service import (
    reconcile_user_balance,
    record_ledger_entry,
)
from app.services.notification_service import create_notification
from app.services.paymenku_service import is_paymenku_configured
from app.services.usdt_payment_service import (
    ensure_master_crypto_wallet,
    get_decrypted_master_crypto_secrets,
    update_usdt_rate_idr,
)
from app.services.wallet_service import fulfill_wallet_transaction
from app.utils.rate_limiter import rate_limiter
from app.utils.redis import redis_client

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/admin/transactions", response_model=WalletTransactionListResponse)
async def admin_list_transactions(
    type: str | None = Query(None),
    status: str | None = Query(None),
    search: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """List all wallet transactions across all users. Owner only."""
    query = select(WalletTransaction).options(selectinload(WalletTransaction.user))
    count_query = select(func.count(WalletTransaction.id))

    if type:
        query = query.where(WalletTransaction.type == type)
        count_query = count_query.where(WalletTransaction.type == type)
    if status:
        query = query.where(WalletTransaction.status == status)
        count_query = count_query.where(WalletTransaction.status == status)

    if search:
        search_term = f"%{search}%"
        # Join user for search on email
        query = query.join(User, WalletTransaction.user_id == User.id)
        count_query = count_query.join(User, WalletTransaction.user_id == User.id)
        search_filter = (
            WalletTransaction.id.ilike(search_term)
            | WalletTransaction.method.ilike(search_term)
            | WalletTransaction.note.ilike(search_term)
            | User.email.ilike(search_term)
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    total_res = await db.execute(count_query)
    total = total_res.scalar() or 0

    query = query.order_by(WalletTransaction.created_at.desc()).offset(offset).limit(limit)
    res = await db.execute(query)
    txs = res.scalars().all()

    items = [
        WalletTransactionResponse(
            id=tx.id,
            user_id=tx.user_id,
            user_email=tx.user.email if tx.user else None,
            type=tx.type,
            amount=tx.amount,
            total_amount=tx.total_amount,
            method=tx.method,
            note=tx.note,
            status=tx.status,
            qris_url=tx.qris_url,
            qris_image=tx.qris_image,
            provider_trx_id=tx.provider_trx_id,
            crypto_currency=tx.crypto_currency,
            crypto_network=tx.crypto_network,
            crypto_amount=tx.crypto_amount,
            crypto_address=tx.crypto_address,
            tx_hash=tx.tx_hash,
            exchange_rate=tx.exchange_rate,
            expired_at=tx.expired_at,
            admin_note=tx.admin_note,
            created_at=tx.created_at,
            processed_at=tx.processed_at,
        )
        for tx in txs
    ]

    return WalletTransactionListResponse(transactions=items, total=total)


@router.put("/admin/transactions/{tx_id}/status", response_model=WalletTransactionResponse)
async def admin_update_transaction_status(
    tx_id: str,
    payload: AdminTransactionStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Approve or reject a wallet transaction. Owner only."""
    if payload.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="Status must be 'approved' or 'rejected'")

    res = await db.execute(
        select(WalletTransaction)
        .where(WalletTransaction.id == tx_id)
        .options(selectinload(WalletTransaction.user))
        .with_for_update()
    )
    tx = res.scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if tx.status != "pending":
        raise HTTPException(status_code=400, detail=f"Transaction already has status '{tx.status}'")

    # Lock user row for balance adjustments
    user_res = await db.execute(select(User).where(User.id == tx.user_id).with_for_update())
    user = user_res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.now(timezone.utc)

    if tx.type == "withdraw":
        if payload.status == "approved":
            tx.status = "approved"
            tx.admin_note = payload.admin_note or "Disetujui oleh Administrator"
            tx.processed_at = now
            create_notification(
                db,
                user.id,
                "wallet.withdraw_approved",
                kind="success",
                data={
                    "tx_id": tx.id,
                    "amount": tx.amount,
                    "method": tx.method,
                    "note": payload.admin_note or "",
                },
                href="/wallet",
            )
        elif payload.status == "rejected":
            # Refund balance back to user via double-entry ledger
            await record_ledger_entry(
                db=db,
                user=user,
                amount=tx.amount,
                entry_type="CREDIT",
                category="withdraw_refund",
                reference_id=tx.id,
                description=f"Pengembalian dana penarikan ditolak admin: {payload.admin_note or 'Ditolak'}",
            )
            tx.status = "rejected"
            tx.admin_note = payload.admin_note or "Ditolak oleh Administrator"
            tx.processed_at = now
            create_notification(
                db,
                user.id,
                "wallet.withdraw_rejected",
                kind="error",
                data={
                    "tx_id": tx.id,
                    "amount": tx.amount,
                    "method": tx.method,
                    "reason": payload.admin_note or "Ditolak oleh Admin",
                },
                href="/wallet",
            )
        await db.flush()

    elif tx.type in ("topup", "subscription", "smm", "marketplace"):
        # Transaksi pembayaran dan deposit diproses otomatis oleh payment gateway.
        # Jika admin secara eksplisit melakukan intervensi manual/override:
        if payload.status == "approved":
            total_paid = tx.total_amount or tx.amount
            await fulfill_wallet_transaction(
                db=db,
                tx=tx,
                user=user,
                total_paid=total_paid,
                now_utc=now,
            )
            tx.admin_note = payload.admin_note or f"Disetujui manual oleh admin ({current_user.email})"
            await db.flush()
        elif payload.status == "rejected":
            tx.status = "rejected"
            tx.admin_note = payload.admin_note or f"Dibatalkan manual oleh admin ({current_user.email})"
            tx.processed_at = now
            create_notification(
                db,
                user.id,
                f"wallet.{tx.type}_rejected",
                kind="warning",
                data={
                    "tx_id": tx.id,
                    "amount": tx.amount,
                    "method": tx.method,
                    "reason": payload.admin_note or "Dibatalkan oleh Admin",
                },
                href="/wallet",
            )
            await db.flush()

    return WalletTransactionResponse(
        id=tx.id,
        user_id=tx.user_id,
        user_email=user.email,
        type=tx.type,
        amount=tx.amount,
        total_amount=tx.total_amount,
        method=tx.method,
        note=tx.note,
        status=tx.status,
        qris_url=tx.qris_url,
        qris_image=tx.qris_image,
        expired_at=tx.expired_at,
        admin_note=tx.admin_note,
        created_at=tx.created_at or datetime.now(timezone.utc),
        processed_at=tx.processed_at,
    )


@router.get("/admin/wallet/reconcile/{user_id}", response_model=BalanceReconciliationResponse)
async def admin_reconcile_user_balance(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Verify mathematical reconciliation: sum(CREDIT) - sum(DEBIT) == user.balance."""
    try:
        result = await reconcile_user_balance(db, user_id)
        return BalanceReconciliationResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/admin/crypto-wallet", response_model=CryptoWalletPublicInfoResponse)
async def admin_get_crypto_wallet_info(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Get Master Crypto Wallet public addresses and fixed USDT rate. Owner only."""
    info = await ensure_master_crypto_wallet(db)
    await db.commit()
    return CryptoWalletPublicInfoResponse(
        evm_address=info["evm_address"],
        tron_address=info["tron_address"],
        usdt_rate_idr=info["usdt_rate_idr"],
        networks=info["networks"],
        paymenku_configured=is_paymenku_configured(),
    )


@router.put("/admin/crypto-wallet/rate", response_model=CryptoWalletPublicInfoResponse)
async def admin_update_crypto_wallet_rate(
    payload: CryptoRateUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Update the fixed IDR per 1 USDT exchange rate. Owner only."""
    try:
        await update_usdt_rate_idr(db, payload.usdt_rate_idr)
        info = await ensure_master_crypto_wallet(db)
        await db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return CryptoWalletPublicInfoResponse(
        evm_address=info["evm_address"],
        tron_address=info["tron_address"],
        usdt_rate_idr=info["usdt_rate_idr"],
        networks=info["networks"],
        paymenku_configured=is_paymenku_configured(),
    )


@router.post("/admin/crypto-wallet/reveal/otp", response_model=CryptoWalletRevealOtpResponse)
async def admin_request_crypto_wallet_reveal_otp(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Send a 6-digit OTP to the Owner's email to authorize viewing the Master Wallet Seed Phrase & Private Keys."""
    ip = request.client.host if request.client else "unknown"
    if not await rate_limiter.check(f"crypto_reveal:otp:ip:{ip}", max_requests=5, window_seconds=60):
        raise HTTPException(
            status_code=429,
            detail="Terlalu banyak permintaan OTP. Silakan tunggu sebentar.",
        )

    cooldown_key = f"crypto_wallet:otp:cooldown:{current_user.id}"
    ttl_cooldown = await redis_client.ttl(cooldown_key)
    if ttl_cooldown and ttl_cooldown > 0:
        raise HTTPException(
            status_code=429,
            detail=f"Harap tunggu {ttl_cooldown} detik sebelum meminta kode OTP baru.",
        )

    await ensure_master_crypto_wallet(db)
    await db.commit()

    otp_code = f"{secrets.randbelow(1_000_000):06d}"
    otp_key = f"crypto_wallet:otp:{current_user.id}"
    otp_data = {
        "code": otp_code,
        "attempts": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await redis_client.set(otp_key, json.dumps(otp_data), ex=300)
    await redis_client.set(cooldown_key, "1", ex=60)

    subject = "[TeleBos Security] Kode OTP Akses Seed Phrase & Private Key Master Wallet"
    text_body = (
        f"Kode OTP Anda untuk melihat Seed Phrase & Private Key Master Wallet USDT adalah: {otp_code}\n\n"
        f"Kode ini berlaku selama 5 menit. Jangan pernah membagikan kode ini kepada siapa pun."
    )
    html_body = (
        f"<div style='font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;'>"
        f"<h2 style='margin:0 0 12px;font-size:18px;color:#111827;'>Verifikasi Akses Master Crypto Wallet</h2>"
        f"<p style='font-size:14px;color:#4b5563;line-height:1.5;'>Anda meminta akses untuk melihat <strong>12-Word Seed Phrase &amp; Private Key</strong> Master Wallet USDT TeleBos.</p>"
        f"<div style='margin:20px 0;padding:16px;background:#f3f4f6;border-radius:8px;text-align:center;font-family:monospace;font-size:28px;font-weight:700;letter-spacing:6px;color:#111827;'>{otp_code}</div>"
        f"<p style='font-size:12px;color:#6b7280;'>Kode ini berlaku selama 5 menit. Jika Anda tidak melakukan permintaan ini, segera amankan akun Owner Anda.</p>"
        f"</div>"
    )
    await email_service.send_email(
        to_email=current_user.email,
        subject=subject,
        html_content=html_body,
        text_content=text_body,
    )

    return CryptoWalletRevealOtpResponse(
        message="Kode OTP keamanan telah dikirim ke email Owner Anda.",
        email_masked=mask_email(current_user.email),
        expires_in_seconds=300,
        cooldown_seconds=60,
    )


@router.post("/admin/crypto-wallet/reveal", response_model=CryptoWalletSecretsResponse)
async def admin_reveal_crypto_wallet_secrets(
    request: Request,
    payload: CryptoWalletRevealRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(["owner"])),
):
    """Verify Owner Email OTP and return decrypted 12-word Seed Phrase + EVM/TRON Private Keys."""
    ip = request.client.host if request.client else "unknown"
    if not await rate_limiter.check(f"crypto_reveal:verify:ip:{ip}", max_requests=10, window_seconds=60):
        raise HTTPException(status_code=429, detail="Terlalu banyak percobaan verifikasi. Coba lagi nanti.")

    otp_key = f"crypto_wallet:otp:{current_user.id}"
    otp_raw = await redis_client.get(otp_key)
    if not otp_raw:
        raise HTTPException(
            status_code=400,
            detail="Kode OTP tidak ditemukan atau sudah kedaluwarsa. Silakan minta kode OTP baru.",
        )

    try:
        otp_data = json.loads(otp_raw)
    except Exception:
        await redis_client.delete(otp_key)
        raise HTTPException(status_code=400, detail="Data OTP tidak valid. Silakan minta kode OTP baru.")

    attempts = int(otp_data.get("attempts", 0))
    if attempts >= 3:
        await redis_client.delete(otp_key)
        raise HTTPException(
            status_code=400,
            detail="Kode OTP hangus karena terlalu banyak percobaan salah. Silakan minta kode OTP baru.",
        )

    submitted_code = (payload.otp_code or "").strip()
    expected_code = str(otp_data.get("code", ""))
    if not hmac.compare_digest(submitted_code, expected_code):
        attempts += 1
        otp_data["attempts"] = attempts
        remaining_ttl = await redis_client.ttl(otp_key)
        await redis_client.set(otp_key, json.dumps(otp_data), ex=max(remaining_ttl or 60, 1))
        raise HTTPException(
            status_code=400,
            detail=f"Kode OTP salah. Sisa percobaan: {max(0, 3 - attempts)} kali.",
        )

    # Burn OTP immediately after successful verification
    await redis_client.delete(otp_key)

    secrets_dict = await get_decrypted_master_crypto_secrets(db)
    logger.warning("Owner %s (%s) revealed Master Crypto Wallet seed phrase & private keys", current_user.id, current_user.email)
    return CryptoWalletSecretsResponse(**secrets_dict)


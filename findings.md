# 🔒 TeleBos Security Audit Findings

**Auditor:** AI Security Pentester  
**Scope:** Full static analysis — Backend (`backend/`), Frontend (`frontend/`), Infrastructure (`docker-compose.yml`)  
**Date:** 2026-06-19  

---

## 📋 Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 **Critical** | 4 |
| 🟠 **High** | 6 |
| 🟡 **Medium** | 4 |
| 🔵 **Low** | 3 |
| **Total** | **17** |

---

## 🔴 CRITICAL

### C-01: Live Telegram API Credentials Committed to Repository

- **File:** `backend/.env` (lines 21–22), `backend/app/config.py` (lines 38–39)
- **Type:** Exposed Credentials

**Description:**  
The `.env` file is in the working tree and contains **live** Telegram API credentials:

```
TELEGRAM_API_ID=38788295
TELEGRAM_API_HASH=cc5226635e0773dd22cf53f8973a5f23
```

**Impact:**  
Anyone with repository access can make Telegram API calls as this application — creating unauthorized Telethon clients, triggering Telegram rate limits, or acting fraudulently on the app's behalf.

**Remediation:**  
1. Immediately rotate the credentials at [my.telegram.org](https://my.telegram.org/apps)  
2. Ensure `git rm --cached backend/.env` has been run to stop tracking  
3. Only inject secrets via environment variables in production  

---

### C-02: Default JWT Secret Key in Production

- **File:** `backend/.env` (line 12), `backend/app/config.py` (line 24)
- **Type:** Hardcoded Credentials / Weak Secret

**Description:**  
The JWT signing key is still the default:

```
JWT_SECRET_KEY=change-this-secret-key-in-production
```

**Impact:**  
**Critical — full authentication bypass.** An attacker can forge arbitrary JWTs, impersonate any user, access all Telegram accounts, and perform broadcast/invite operations without credentials.

**Remediation:**  
Generate a strong random key immediately:
```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```
Set it in the production environment (never in a committed file).

---

### C-03: Encryption Key Exposed and Destructive Fallback

- **File:** `backend/.env` (line 15), `backend/app/utils/encryption.py` (lines 22–26)
- **Type:** Exposed Credentials / Data Corruption Risk

**Description:**  
The Fernet encryption key is in plaintext in `.env`:

```
ENCRYPTION_KEY=KD7O_1jTRBuQo4OUWGAajQmjYmHIUlBpODwaffzn5XI=
```

Additionally, `encryption.py` has a **silent fallback** that auto-generates a new key if the configured one is invalid:

```python
except (ValueError, Exception):
    logger.warning("ENCRYPTION_KEY is invalid or not set — generating a new one")
    _cipher = Fernet(Fernet.generate_key())
```

**Impact:**  
1. The exposed key allows anyone with database access to **decrypt all Telegram session strings and 2FA passwords**.  
2. The auto-generate fallback means a misconfiguration at startup **silently corrupts all encrypted data** — permanent lockout for all users.

**Remediation:**  
- Rotate the encryption key and re-encrypt all session strings  
- Remove the silent fallback; validate the key at startup and refuse to start on mismatch  
- Back up the encryption key in a secrets vault  

---

### C-04: WebSocket Endpoints Have Zero Authentication

- **File:** `backend/app/api/ws.py` (lines 49, 68, 86)
- **Type:** Missing Authentication

**Description:**  
All three WebSocket endpoints accept connections with **no JWT verification**:

```
/ws/broadcast/{job_id}
/ws/chats/{account_id}
/ws/invite/{job_id}
```

**Impact:**  
Anyone who discovers a `job_id` or `account_id` can:
- Listen to **all real-time Telegram chat messages** relayed through the system  
- Monitor all broadcast/invite job progress and see sent message text  
- Receive auto-reply notifications including private DM content  

UUID channel IDs are not a sufficient mitigation — IDs can leak via logs, network traffic, or frontend source.

**Remediation:**  
Add JWT token validation via `?token=` query parameter in the WebSocket handshake:
```python
@router.websocket("/ws/chats/{account_id}")
async def ws_chats(websocket: WebSocket, account_id: str, token: str = Query(...)):
    # Validate JWT and verify user owns the account_id before accepting
```

---

## 🟠 HIGH

### H-01: No Rate Limiting on Authentication Endpoints

- **File:** `backend/app/api/auth.py`, `backend/app/api/accounts.py`, `backend/app/utils/rate_limiter.py`
- **Type:** No Rate Limiting

**Description:**  
An `InMemoryRateLimiter` class exists but is **never applied** to any endpoint. Login and OTP send-code endpoints have zero brute-force protection.

**Impact:**  
- Unlimited password brute-force against `/auth/login`  
- Unlimited OTP spam against `/accounts/send-code`  
- Phone number enumeration via error message differences  

**Remediation:**  
Apply rate limiting to login and send-code (IP + account based):
```python
from app.utils.rate_limiter import rate_limiter

@router.post("/login")
async def login(request: Request, ...):
    ip = request.client.host
    if not rate_limiter.check(f"login:{ip}"):
        raise HTTPException(status_code=429, detail="Too many attempts")
```

---

### H-02: No Server-Side Token Revocation on Logout

- **File:** `frontend/src/store/auth-store.ts` (lines 48–51), `frontend/src/lib/api.ts` (lines 26–31)
- **Type:** Missing Auth Check / Session Mgmt

**Description:**  
Logout only clears client-side `localStorage`. There is **no `/auth/logout` endpoint** and no server-side token blacklist.

```typescript
logout: () => {
    clearTokens();
    set({ user: null, isAuthenticated: false });
};
```

**Impact:**  
JWT tokens remain valid until expiry. A stolen token cannot be revoked — the attacker retains access for up to 7 days (refresh token lifetime).

**Remediation:**  
- Add a `/auth/logout` endpoint  
- Maintain a Redis-based token denylist (`jti` claim)  
- Check denylist in `get_current_user`  

---

### H-03: Refresh Tokens Don't Rotate

- **File:** `backend/app/services/auth_service.py` (lines 76–89)
- **Type:** Weak Session Management

**Description:**  
`refresh_access_token()` issues a completely new token pair but the old refresh token remains valid — no rotation or family tracking.

**Impact:**  
A stolen refresh token can be reused repeatedly for 7 days to generate fresh access tokens — **persistent session hijacking**.

**Remediation:**  
Implement refresh token rotation: issue a new refresh token on each use and invalidate the previous one in a token family chain.

---

### H-04: Role-Based Access Control Not Enforced

- **File:** `backend/app/dependencies.py`, `backend/app/models/user.py`
- **Type:** Broken Access Control

**Description:**  
The `User` model has a `role` field (default `"operator"`) but it is **never checked** by `get_current_user` or any endpoint. All authenticated users have identical privileges.

**Impact:**  
No admin/operator separation exists. Any user can access all features. The role field suggests future intent but currently provides no security boundary.

**Remediation:**  
Create a `require_role("admin")` dependency and enforce it on admin-level operations.

---

### H-05: Chat Photo Endpoint Reimplements Auth Insecurely

- **File:** `backend/app/api/chats.py` (lines 344–406), `backend/app/api/accounts.py` (lines 232–286)
- **Type:** Broken Access Control

**Description:**  
Two endpoints manually decode the JWT token inline instead of using the `get_current_user` dependency:

```python
@router.get("/accounts/{account_id}/chats/{chat_id}/photo")
async def get_chat_photo(..., token: str | None = Query(None), ...):
    # Manual JWT decode — NOT using get_current_user
```

**Impact:**  
Dual authentication code paths increase the attack surface. If the inline decode differs (different error handling, missing `is_active` check, missing ownership verification), it could allow unauthorized access.

**Remediation:**  
Refactor to use `get_current_user`. For `?token=` support, create a separate reusable dependency.

---

### H-06: Profile Photo Upload Has Minimal Validation

- **File:** `backend/app/api/accounts.py` (lines 211–229)
- **Type:** Input Validation

**Description:**  
File upload validation only checks the content-type prefix — which is client-supplied:

```python
if file.content_type is None or not file.content_type.startswith("image/"):
    raise HTTPException(...)
```

No validation for: file size, actual file content, dimensions, or re-encoding.

**Impact:**  
An attacker can upload non-image files (SVG with JS, zip bombs, polyglots) by spoofing the `Content-Type` header.

**Remediation:**  
```python
if len(data) > 5 * 1024 * 1024:
    raise HTTPException(413, "File too large")
from PIL import Image
try:
    Image.open(io.BytesIO(data)).verify()
except Exception:
    raise HTTPException(400, "Invalid image")
```

---

## 🟡 MEDIUM

### M-01: Auto-Reply Sends Messages Without Rate Control

- **File:** `backend/app/services/event_relay.py` (lines 144–196)
- **Type:** Missing Rate Limiting / Abuse Potential

**Description:**  
The auto-reply system automatically replies to every first DM from any user with no rate limiting, daily cap, or cooldown per account.

**Impact:**  
A compromised account could be used to spam thousands of users via auto-reply. The only dedup is a per-user lifetime check (one reply per user, ever).

**Remediation:**  
Add rate limiting (`max_replies_per_hour`) and a cooldown delay to auto-reply.

---

### M-02: OTP Pending Logins Have No TTL

- **File:** `backend/app/api/accounts.py` (line 32)
- **Type:** Resource Leak

**Description:**  
The `_pending_logins` dict stores unauth Telethon clients keyed by phone number with **no expiration**:

```python
_pending_logins: dict[str, object] = {}
```

**Impact:**  
Abandoned OTP flows leak in-memory client objects indefinitely, causing eventual memory exhaustion.

**Remediation:**  
Add a background cleanup task that removes entries older than 5 minutes, or use a TTL-based cache.

---

### M-03: User-Controlled Input in LIKE Query Without Escape

- **File:** `backend/app/services/broadcast_service.py` (lines 306–308)
- **Type:** No SQL Injection (ORM mitigates), LIKE wildcard risk

**Description:**  
User-controlled input is interpolated into a LIKE pattern:

```python
search = f"%{filters['search']}%"
query = query.where(BroadcastLog.group_identifier.ilike(search))
```

SQLAlchemy ORM parameterizes the query, so classic SQL injection is prevented. However, LIKE wildcards (`%`, `_`) in user input are not escaped.

**Impact:**  
Low — unintended pattern matches from `%` and `_` in search input. No database-level injection.

**Remediation:**  
Escape LIKE special characters:
```python
search = filters['search'].replace('%', '\\%').replace('_', '\\_')
```

---

### M-04: WebSocket Messages Relayed Without Sanitization (XSS Risk)

- **File:** `backend/app/services/event_relay.py` (lines 122–142)
- **Type:** XSS (Potential)

**Description:**  
Incoming Telegram message text is broadcast over WebSocket without sanitization:

```python
await manager.broadcast(channel, {
    "type": "new_message",
    "text": msg.text or "[media]",
})
```

**Impact:**  
If any frontend component renders this text unsafely (e.g., `dangerouslySetInnerHTML`), an attacker sending a crafted Telegram message could execute arbitrary JS in the TeleBos dashboard.

**Remediation:**  
- Audit frontend for unsafe rendering of message text  
- React's default JSX escaping is normally sufficient — verify no bypasses exist  
- Add server-side output encoding as defense in depth  

---

## 🔵 LOW

### L-01: Weak PostgreSQL Password in docker-compose

- **File:** `docker-compose.yml`
- **Type:** Infrastructure Weakness

**Description:**  
```yaml
POSTGRES_PASSWORD: postgres
```

**Remediation:** Use a strong generated password injected via environment variable.

---

### L-02: Redis Has No Authentication

- **File:** `docker-compose.yml`, `backend/.env`
- **Type:** Infrastructure Weakness

**Description:**  
```
REDIS_URL=redis://localhost:6379/0
```

Any process reaching the Redis port can read/write Celery task data and job state.

**Remediation:** Configure `REDIS_PASSWORD` and use `redis://:password@host:port/db`.

---

### L-03: No Input Validation on Chat Send Media

- **File:** `backend/app/api/chats.py` (lines 89–115)
- **Type:** Input Validation

**Description:**  
The media send endpoint accepts arbitrary file uploads with no validation:

```python
file_bytes = await file.read()
result = await chat_service.send_media(account, chat_id, file_bytes, ...)
```

No file size limit, content type check, or filename sanitization.

**Remediation:** Add file size limits and content type validation.

---

## 📊 Summary by Vulnerability Class

| Class | Count | Key Findings |
|---|---|---|
| **Exposed Credentials / Secrets** | 3 | C-01, C-02, C-03 |
| **Missing Authentication** | 2 | C-04, H-02 |
| **Broken Access Control** | 2 | H-04, H-05 |
| **No Rate Limiting** | 2 | H-01, M-01 |
| **Weak Session Management** | 1 | H-03 |
| **XSS Risk** | 1 | M-04 |
| **Input Validation** | 2 | H-06, L-03 |
| **Resource Leak** | 1 | M-02 |
| **LIKE Injection (Low)** | 1 | M-03 |
| **Infrastructure** | 2 | L-01, L-02 |

---

## 🏁 Recommended Immediate Actions

1. **Rotate** `JWT_SECRET_KEY`, `ENCRYPTION_KEY`, and `TELEGRAM_API_HASH` immediately  
2. **Add authentication** to all 3 WebSocket endpoints (`/ws/broadcast`, `/ws/chats`, `/ws/invite`)  
3. **Apply rate limiting** to `/auth/login` and `/accounts/send-code`  
4. **Validate profile photo uploads** (file size limit + content verification)  
5. **Implement token blacklisting** for server-side logout  
6. **Fix the encryption key fallback** — validate at startup, never auto-generate  

---

## 🔧 Secure Deployment Checklist

- [ ] Generate strong `JWT_SECRET_KEY` (not the default)
- [ ] Generate and **back up** `ENCRYPTION_KEY`
- [ ] Rotate compromised Telegram API credentials
- [ ] Add WebSocket JWT authentication
- [ ] Apply rate limiting to auth endpoints
- [ ] Implement token revocation on logout
- [ ] Add file upload validation (size + content)
- [ ] Set strong PostgreSQL and Redis passwords
- [ ] Use TLS in production (reverse proxy)
- [ ] Never commit `.env` files

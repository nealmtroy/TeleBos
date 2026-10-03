"""URL security and SSRF protection utilities."""

import ipaddress
import logging
import re
import socket
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Allowed schemes for outgoing requests
ALLOWED_SCHEMES = {"https"}

# Allowed domains for Telegram captcha / appeals
ALLOWED_TELEGRAM_DOMAINS = {"telegram.org", "t.me"}


def is_prohibited_ip(ip_str: str) -> bool:
    """Check if an IP string is loopback, private, link-local, multicast, or reserved.

    Returns True if the IP is dangerous (SSRF target).
    """
    try:
        ip = ipaddress.ip_address(ip_str.strip())
        return (
            ip.is_loopback
            or ip.is_private
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        )
    except ValueError:
        # Invalid IP string
        return True


def is_safe_ip_address(ip_obj: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Check if an ipaddress object is globally routable and safe."""
    return not (
        ip_obj.is_loopback
        or ip_obj.is_private
        or ip_obj.is_link_local
        or ip_obj.is_multicast
        or ip_obj.is_reserved
        or ip_obj.is_unspecified
    )


def validate_safe_captcha_url(url: str, check_dns: bool = True) -> str:
    """Validate that a URL is a legitimate, safe Telegram captcha URL and not an SSRF attempt.

    Requirements:
    1. Scheme must be strictly HTTPS.
    2. Host must be strictly 'telegram.org', a subdomain of 'telegram.org', or 't.me'.
    3. No userinfo (e.g. user:pass@host).
    4. Port must be standard (None or 443).
    5. Path must start with '/captcha'.
    6. No path traversal (e.g. '/..').
    7. Host must not resolve to any loopback, private, link-local (e.g. 169.254.169.254),
       multicast, or reserved IP addresses.

    Raises:
        ValueError: If the URL is invalid or violates SSRF security rules.
    """
    if not url or not isinstance(url, str):
        raise ValueError("URL must be a non-empty string.")

    cleaned_url = url.strip()
    if len(cleaned_url) > 2048:
        raise ValueError("URL exceeds maximum length.")

    try:
        parsed = urlparse(cleaned_url)
    except Exception as exc:
        raise ValueError(f"Malformed URL: {exc}") from exc

    # 1. Scheme check
    if not parsed.scheme or parsed.scheme.lower() not in ALLOWED_SCHEMES:
        raise ValueError(f"Prohibited URL scheme '{parsed.scheme}'. Only HTTPS is allowed.")

    # 2. Userinfo check
    if parsed.username or parsed.password:
        raise ValueError("URLs with embedded userinfo/credentials are not permitted.")

    # 3. Host check
    hostname = (parsed.hostname or "").lower().strip()
    if not hostname:
        raise ValueError("Missing hostname in URL.")

    # Reject literal IP addresses as hostnames for captcha URLs
    try:
        ip_direct = ipaddress.ip_address(hostname)
        raise ValueError("Direct IP address access is prohibited for captcha URLs.")
    except ValueError as e:
        if "Direct IP address" in str(e):
            raise
        pass  # Hostname is not a literal IP, proceed

    # Verify hostname matches allowed domain or subdomains
    is_allowed_domain = False
    for domain in ALLOWED_TELEGRAM_DOMAINS:
        if hostname == domain or hostname.endswith(f".{domain}"):
            is_allowed_domain = True
            break

    if not is_allowed_domain:
        raise ValueError(
            f"Prohibited host '{hostname}'. Only official Telegram domains are allowed."
        )

    # 4. Port check
    if parsed.port is not None and parsed.port != 443:
        raise ValueError(f"Prohibited port '{parsed.port}'. Only standard HTTPS port 443 is allowed.")

    # 5. Path check
    path = parsed.path or ""
    # Normalise path
    if not (path == "/captcha" or path.startswith("/captcha/")):
        raise ValueError("Prohibited URL path. Must begin with '/captcha'.")

    # Reject path traversal
    if "/../" in path or path.endswith("/..") or "\\..\\" in path or "\\.." in path:
        raise ValueError("Path traversal detected in URL.")

    # 6. DNS resolution check (SSRF / DNS Rebinding / Private network protection)
    if check_dns:
        try:
            addr_info = socket.getaddrinfo(hostname, 443, proto=socket.IPPROTO_TCP)
            if not addr_info:
                raise ValueError(f"Unable to resolve host '{hostname}'.")

            for family, _, _, _, sockaddr in addr_info:
                ip_str = sockaddr[0]
                ip_obj = ipaddress.ip_address(ip_str)
                if not is_safe_ip_address(ip_obj):
                    logger.warning(
                        "SSRF attempt blocked: host '%s' resolved to private/reserved IP '%s'",
                        hostname,
                        ip_str,
                    )
                    raise ValueError(
                        f"SSRF blocked: Host resolves to private/reserved address '{ip_str}'."
                    )
        except socket.gaierror as exc:
            raise ValueError(f"DNS resolution failed for host '{hostname}': {exc}") from exc

    return cleaned_url

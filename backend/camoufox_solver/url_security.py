"""URL security and SSRF protection utilities for camoufox solver."""

import ipaddress
import logging
import socket
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

ALLOWED_SCHEMES = {"https"}
ALLOWED_TELEGRAM_DOMAINS = {"telegram.org", "t.me"}


def is_prohibited_ip(ip_str: str) -> bool:
    """Check if an IP string is loopback, private, link-local, multicast, or reserved."""
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


def is_prohibited_target(target_url: str) -> bool:
    """Return True if target_url points to a private or prohibited destination."""
    try:
        parsed = urlparse(target_url)
        scheme = (parsed.scheme or "").lower()
        if scheme not in ("http", "https"):
            return True

        host = (parsed.hostname or "").lower().strip()
        if not host:
            return True

        # Check if direct IP
        try:
            ip_obj = ipaddress.ip_address(host)
            return not is_safe_ip_address(ip_obj)
        except ValueError:
            pass

        # Check localhost and common local names
        if host in ("localhost", "local", "internal", "metadata", "ip6-localhost", "ip6-loopback"):
            return True

        # Check resolution
        addr_info = socket.getaddrinfo(host, None)
        for _, _, _, _, sockaddr in addr_info:
            ip_str = sockaddr[0]
            if is_prohibited_ip(ip_str):
                return True

        return False
    except Exception:
        return True


def validate_safe_captcha_url(url: str, check_dns: bool = True) -> str:
    """Validate that a URL is a legitimate, safe Telegram captcha URL and not an SSRF attempt."""
    if not url or not isinstance(url, str):
        raise ValueError("URL must be a non-empty string.")

    cleaned_url = url.strip()
    if len(cleaned_url) > 2048:
        raise ValueError("URL exceeds maximum length.")

    try:
        parsed = urlparse(cleaned_url)
    except Exception as exc:
        raise ValueError(f"Malformed URL: {exc}") from exc

    if not parsed.scheme or parsed.scheme.lower() not in ALLOWED_SCHEMES:
        raise ValueError(f"Prohibited URL scheme '{parsed.scheme}'. Only HTTPS is allowed.")

    if parsed.username or parsed.password:
        raise ValueError("URLs with embedded userinfo/credentials are not permitted.")

    hostname = (parsed.hostname or "").lower().strip()
    if not hostname:
        raise ValueError("Missing hostname in URL.")

    try:
        ip_direct = ipaddress.ip_address(hostname)
        raise ValueError("Direct IP address access is prohibited for captcha URLs.")
    except ValueError as e:
        if "Direct IP address" in str(e):
            raise
        pass

    is_allowed_domain = False
    for domain in ALLOWED_TELEGRAM_DOMAINS:
        if hostname == domain or hostname.endswith(f".{domain}"):
            is_allowed_domain = True
            break

    if not is_allowed_domain:
        raise ValueError(
            f"Prohibited host '{hostname}'. Only official Telegram domains are allowed."
        )

    if parsed.port is not None and parsed.port != 443:
        raise ValueError(f"Prohibited port '{parsed.port}'. Only standard HTTPS port 443 is allowed.")

    path = parsed.path or ""
    if not (path == "/captcha" or path.startswith("/captcha/")):
        raise ValueError("Prohibited URL path. Must begin with '/captcha'.")

    if "/../" in path or path.endswith("/..") or "\\..\\" in path or "\\.." in path:
        raise ValueError("Path traversal detected in URL.")

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

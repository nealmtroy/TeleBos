"""Centralized domain enumerations for TeleBos.

Inheriting from StrEnum ensures automatic JSON serialization compatibility,
raw string query compatibility in SQLAlchemy, and strict type safety.
"""

from enum import StrEnum


class JobStatus(StrEnum):
    """Execution status for BroadcastJob and InviteJob."""
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    FAILED = "failed"


class UserRole(StrEnum):
    """User membership roles."""
    BASIC = "basic"
    PRO = "pro"
    PREMIUM = "premium"
    OWNER = "owner"


class SMMStatus(StrEnum):
    """Upstream order statuses from SMM BuzzerPanel."""
    PENDING = "Pending"
    PROCESSING = "Processing"
    IN_PROGRESS = "In progress"
    COMPLETED = "Completed"
    PARTIAL = "Partial"
    FAILED = "Failed"
    CANCELLED = "Canceled"


class MarketplaceDefaults:
    """Centralized constants for marketplace account listings."""
    DEFAULT_ACCOUNT_PRICE = 5500

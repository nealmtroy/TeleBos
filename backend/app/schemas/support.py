"""Pydantic schemas for AI Support and Escalation Tickets."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str = Field(..., max_length=3000)


class SupportChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1500)
    history: list[ChatMessage] = Field(default_factory=list)
    context_page: str | None = Field(default=None, max_length=100)


class OrderSummaryItem(BaseModel):
    id: str
    service_name: str
    category: str
    data_target: str
    quantity: int
    status: str
    price: int | None = None
    remains: int | None = None
    created_at: str


class SupportChatResponse(BaseModel):
    reply: str
    can_escalate: bool = False
    suggested_actions: list[str] = Field(default_factory=list)
    order_data: list[OrderSummaryItem] | None = None
    is_authenticated: bool = False
    user_name: str | None = None


class SupportEscalateRequest(BaseModel):
    subject: str = Field(..., min_length=3, max_length=200)
    category: str = Field("general", max_length=50)
    related_order_id: str | None = None
    guest_name: str | None = Field(default=None, max_length=100)
    guest_contact: str | None = Field(default=None, max_length=150)
    escalation_reason: str | None = Field(default=None, max_length=500)
    transcript: list[ChatMessage] = Field(default_factory=list)


class SupportTicketResponse(BaseModel):
    id: UUID
    ticket_number: str
    user_id: UUID | None = None
    user_email: str | None = None
    guest_name: str | None = None
    guest_contact: str | None = None
    category: str
    status: str
    priority: str
    subject: str
    summary: str | None = None
    transcript: list[dict[str, Any]] = Field(default_factory=list)
    related_order_id: UUID | None = None
    escalation_reason: str | None = None
    admin_notes: str | None = None
    resolved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SupportTicketUpdate(BaseModel):
    status: Literal["open", "in_progress", "resolved", "closed"] | None = None
    priority: Literal["low", "normal", "high", "urgent"] | None = None
    admin_notes: str | None = Field(default=None, max_length=2000)

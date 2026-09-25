"""Contact schemas — list, detail, request/response models."""

from pydantic import BaseModel


class ContactItem(BaseModel):
    """A single contact from the contact list."""
    contact_id: int
    first_name: str
    last_name: str | None = None
    username: str | None = None
    phone: str | None = None
    mutual: bool = False
    photo_version: int | None = None

    model_config = {"from_attributes": True}


class ContactListResponse(BaseModel):
    """Paginated contact list response."""
    contacts: list[ContactItem]
    total: int
    page: int
    page_size: int


class ContactDetail(BaseModel):
    """Full contact detail with bio and extra info."""
    contact_id: int
    first_name: str
    last_name: str | None = None
    username: str | None = None
    phone: str | None = None
    about: str | None = None
    mutual: bool = False
    common_chats_count: int = 0
    photo_version: int | None = None

    model_config = {"from_attributes": True}


class ContactImportItem(BaseModel):
    phone: str
    first_name: str | None = None
    last_name: str | None = None


class ContactImportRequest(BaseModel):
    contacts: list[ContactImportItem]


class ContactImportResponse(BaseModel):
    total_submitted: int
    imported_count: int
    imported_users: list[ContactItem] = []

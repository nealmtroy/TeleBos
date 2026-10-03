from pydantic import BaseModel, Field


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
    phone: str = Field(..., min_length=3, max_length=50)
    first_name: str | None = Field(None, max_length=150)
    last_name: str | None = Field(None, max_length=150)


class ContactImportRequest(BaseModel):
    contacts: list[ContactImportItem] = Field(..., min_length=1, max_length=500)


class ContactImportResponse(BaseModel):
    total_submitted: int
    imported_count: int
    imported_users: list[ContactItem] = []

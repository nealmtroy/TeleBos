"""Settings-related Pydantic schemas."""

from pydantic import BaseModel


class PrivacySettingsResponse(BaseModel):
    last_seen: str
    profile_photo: str
    bio: str
    phone_number: str
    phone_call: str
    added_by_phone: str
    voice_messages: str
    chat_invite: str
    forwards: str
    birthday: str
    suggest_frequent_contacts: bool


class PrivacySettingsUpdate(BaseModel):
    last_seen: str | None = None
    profile_photo: str | None = None
    bio: str | None = None
    phone_number: str | None = None
    phone_call: str | None = None
    added_by_phone: str | None = None
    voice_messages: str | None = None
    chat_invite: str | None = None
    forwards: str | None = None
    birthday: str | None = None
    suggest_frequent_contacts: bool | None = None


class TwoFAStatusResponse(BaseModel):
    enabled: bool
    has_recovery: bool | None = None
    hint: str | None = None
    login_email_pattern: str | None = None
    unconfirmed_email_pattern: str | None = None


class TwoFAEnableRequest(BaseModel):
    password: str


class TwoFADisableRequest(BaseModel):
    password: str


class TwoFAChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class TwoFARequestRecoveryResponse(BaseModel):
    email_pattern: str | None = None
    message: str


class TwoFARecoverRequest(BaseModel):
    recovery_code: str
    new_password: str


class TwoFAEmailRequest(BaseModel):
    password: str
    email: str


class TwoFAEmailResponse(BaseModel):
    message: str = "Recovery email set"
    needs_confirmation: bool = False
    code_length: int | None = None


class TwoFAEmailConfirmRequest(BaseModel):
    code: str


class LoginEmailSetRequest(BaseModel):
    email: str


class DeviceInfo(BaseModel):
    hash: str
    app_name: str
    app_version: str | None
    device_model: str | None
    platform: str | None
    system_version: str | None
    ip: str | None
    country: str | None
    region: str | None
    city: str | None
    current: bool = False
    created: str | None  # ISO datetime string


class DeviceListResponse(BaseModel):
    devices: list[DeviceInfo]

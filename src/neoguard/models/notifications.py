from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field, model_validator


class ChannelType(StrEnum):
    WEBHOOK = "webhook"
    SLACK = "slack"
    EMAIL = "email"
    FRESHDESK = "freshdesk"
    PAGERDUTY = "pagerduty"
    MSTEAMS = "msteams"


_REQUIRED_CONFIG_KEYS: dict[str, list[str]] = {
    "webhook": ["url"],
    "slack": ["webhook_url"],
    "email": ["smtp_host", "to"],
    "freshdesk": ["domain", "api_key"],
    "pagerduty": ["routing_key"],
    "msteams": ["webhook_url"],
}


def validate_channel_config(channel_type: str, config: dict) -> None:
    required = _REQUIRED_CONFIG_KEYS.get(channel_type, [])
    missing = [k for k in required if k not in config or not config[k]]
    if missing:
        raise ValueError(
            f"Channel type '{channel_type}' requires config keys: "
            f"{', '.join(required)} (missing: {', '.join(missing)})"
        )
    if channel_type == "freshdesk" and config.get("domain", "").startswith("http"):
        raise ValueError(
            "Freshdesk domain should not include protocol "
            "(use 'company.freshdesk.com', not 'https://company.freshdesk.com')"
        )
    url_types = {"webhook": "url", "slack": "webhook_url", "msteams": "webhook_url"}
    if channel_type in url_types:
        url_key = url_types[channel_type]
        url_val = config.get(url_key, "")
        if url_val and not url_val.startswith(("http://", "https://")):
            raise ValueError(f"'{url_key}' must start with http:// or https://")


class NotificationChannelCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    channel_type: ChannelType
    config: dict = Field(default_factory=dict)
    enabled: bool = True

    @model_validator(mode="after")
    def _validate_config_for_type(self) -> "NotificationChannelCreate":
        validate_channel_config(self.channel_type.value, self.config)
        return self


class NotificationChannelUpdate(BaseModel):
    name: str | None = None
    config: dict | None = None
    enabled: bool | None = None


class NotificationChannel(BaseModel):
    id: str
    tenant_id: str
    name: str
    channel_type: ChannelType
    config: dict
    enabled: bool
    created_at: datetime


class AlertPayload(BaseModel):
    """Standardised payload passed to every notification sender."""
    event_id: str
    rule_id: str
    rule_name: str
    metric_name: str
    condition: str
    threshold: float
    current_value: float
    severity: str
    status: str  # "firing" or "resolved"
    message: str
    tenant_id: str
    fired_at: datetime
    resolved_at: datetime | None = None
    tags_filter: dict[str, str] = Field(default_factory=dict)

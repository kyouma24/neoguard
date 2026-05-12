"""Phase C3: Notification validation tests.

RED-then-GREEN: these tests MUST FAIL before the fix is applied.
Findings: NOTIF-007, NOTIF-008, NOTIF-009, NOTIF-010.

NOTIF-007 and NOTIF-010 assessed as premature abstraction — see analysis.
NOTIF-008 and NOTIF-009 are the actionable fixes.
"""

import pytest

from pydantic import ValidationError


# ===========================================================================
# NOTIF-008: Freshdesk email must be required (no fake default)
# ===========================================================================


class TestNotif008FreshdeskEmail:
    """NOTIF-008: Freshdesk channel config must require a valid email address."""

    def test_freshdesk_without_email_rejected(self):
        """Creating a Freshdesk channel without 'email' must fail validation."""
        from neoguard.models.notifications import NotificationChannelCreate

        with pytest.raises(ValidationError):
            NotificationChannelCreate(
                name="Test Freshdesk",
                channel_type="freshdesk",
                config={"domain": "company.freshdesk.com", "api_key": "abc123"},
            )

    def test_freshdesk_with_invalid_email_rejected(self):
        """Creating a Freshdesk channel with non-email string must fail."""
        from neoguard.models.notifications import NotificationChannelCreate

        with pytest.raises(ValidationError):
            NotificationChannelCreate(
                name="Test Freshdesk",
                channel_type="freshdesk",
                config={
                    "domain": "company.freshdesk.com",
                    "api_key": "abc123",
                    "email": "not-an-email",
                },
            )

    def test_freshdesk_with_valid_email_accepted(self):
        """Creating a Freshdesk channel with valid email must pass."""
        from neoguard.models.notifications import NotificationChannelCreate

        ch = NotificationChannelCreate(
            name="Test Freshdesk",
            channel_type="freshdesk",
            config={
                "domain": "company.freshdesk.com",
                "api_key": "abc123",
                "email": "alerts@company.com",
            },
        )
        assert ch.config["email"] == "alerts@company.com"


# ===========================================================================
# NOTIF-009: Freshdesk group_id int conversion guarded
# ===========================================================================


class TestNotif009FreshdeskGroupId:
    """NOTIF-009: Freshdesk group_id must be validated as numeric at creation."""

    def test_freshdesk_non_numeric_group_id_rejected(self):
        """Non-numeric group_id must fail validation at channel creation."""
        from neoguard.models.notifications import NotificationChannelCreate

        with pytest.raises(ValidationError):
            NotificationChannelCreate(
                name="Test Freshdesk",
                channel_type="freshdesk",
                config={
                    "domain": "company.freshdesk.com",
                    "api_key": "abc123",
                    "email": "alerts@company.com",
                    "group_id": "not-a-number",
                },
            )

    def test_freshdesk_numeric_string_group_id_accepted(self):
        """Numeric string group_id should pass validation."""
        from neoguard.models.notifications import NotificationChannelCreate

        ch = NotificationChannelCreate(
            name="Test Freshdesk",
            channel_type="freshdesk",
            config={
                "domain": "company.freshdesk.com",
                "api_key": "abc123",
                "email": "alerts@company.com",
                "group_id": "12345",
            },
        )
        assert ch.config["group_id"] == "12345"

    def test_freshdesk_empty_group_id_accepted(self):
        """No group_id (omitted) should pass — it's optional."""
        from neoguard.models.notifications import NotificationChannelCreate

        ch = NotificationChannelCreate(
            name="Test Freshdesk",
            channel_type="freshdesk",
            config={
                "domain": "company.freshdesk.com",
                "api_key": "abc123",
                "email": "alerts@company.com",
            },
        )
        assert "group_id" not in ch.config


# ===========================================================================
# NOTIF-007: Premature abstraction — document only
# ===========================================================================


class TestNotif007DRYAssessment:
    """NOTIF-007: Verify existing shared infrastructure covers common patterns."""

    def test_retry_helper_exists(self):
        """_retry helper must exist as shared infrastructure."""
        from neoguard.services.notifications.senders import _retry
        assert callable(_retry)

    def test_check_response_exists(self):
        """_check_response must exist as shared infrastructure."""
        from neoguard.services.notifications.senders import _check_response
        assert callable(_check_response)

    def test_all_senders_registered(self):
        """All 6 sender types must be in SENDERS registry."""
        from neoguard.services.notifications.senders import SENDERS
        from neoguard.models.notifications import ChannelType

        for ct in ChannelType:
            assert ct in SENDERS, f"Missing sender for {ct}"


# ===========================================================================
# NOTIF-010: Premature abstraction — document only
# ===========================================================================


class TestNotif010DispatchAssessment:
    """NOTIF-010: Verify both dispatchers exist and are functional."""

    def test_dispatch_firing_exists(self):
        """dispatch_firing must be importable."""
        from neoguard.services.notifications.dispatcher import dispatch_firing
        assert callable(dispatch_firing)

    def test_dispatch_resolved_exists(self):
        """dispatch_resolved must be importable."""
        from neoguard.services.notifications.dispatcher import dispatch_resolved
        assert callable(dispatch_resolved)

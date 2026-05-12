"""Unit tests for alert silence logic — matcher, recurring, model validation, CRUD, is_rule_silenced."""

from datetime import UTC, datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from neoguard.models.alerts import (
    Silence,
    SilenceCreate,
    SilenceScheduleDay,
    SilenceUpdate,
)
from neoguard.services.alerts.silences import (
    _is_recurring_active,
    _matches_rule,
    _parse_json,
    _row_to_silence,
    is_rule_silenced,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_pool_with_conn(mock_conn: AsyncMock | None = None) -> MagicMock:
    if mock_conn is None:
        mock_conn = AsyncMock()
    mock_pool = MagicMock()
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)
    mock_pool.acquire.return_value = mock_ctx
    return mock_pool


def _make_silence_row(
    rule_ids: list | str = "[]",
    matchers: dict | str = "{}",
    recurring: bool = False,
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
    timezone_: str = "Asia/Kolkata",
    recurrence_days: list | str = "[]",
    recurrence_start_time: str | None = None,
    recurrence_end_time: str | None = None,
    enabled: bool = True,
) -> dict:
    now = datetime.now(UTC)
    return {
        "id": "silence-1",
        "tenant_id": "default",
        "name": "Test Silence",
        "comment": "",
        "rule_ids": rule_ids if isinstance(rule_ids, str) else rule_ids,
        "matchers": matchers if isinstance(matchers, str) else matchers,
        "starts_at": starts_at or (now - timedelta(hours=1)),
        "ends_at": ends_at or (now + timedelta(hours=1)),
        "timezone": timezone_,
        "recurring": recurring,
        "recurrence_days": recurrence_days if isinstance(recurrence_days, str) else recurrence_days,
        "recurrence_start_time": recurrence_start_time,
        "recurrence_end_time": recurrence_end_time,
        "enabled": enabled,
        "created_by": "",
        "created_at": now,
        "updated_at": now,
    }


# ---------------------------------------------------------------------------
# _parse_json
# ---------------------------------------------------------------------------


class TestParseJson:
    def test_parses_json_string(self):
        assert _parse_json('["a","b"]') == ["a", "b"]

    def test_parses_json_dict_string(self):
        assert _parse_json('{"k": "v"}') == {"k": "v"}

    def test_passthrough_list(self):
        val = ["a", "b"]
        assert _parse_json(val) is val

    def test_passthrough_dict(self):
        val = {"k": "v"}
        assert _parse_json(val) is val

    def test_empty_json_string(self):
        assert _parse_json("{}") == {}

    def test_empty_json_array_string(self):
        assert _parse_json("[]") == []


# ---------------------------------------------------------------------------
# _row_to_silence
# ---------------------------------------------------------------------------


class TestRowToSilence:
    def test_converts_basic_row(self):
        row = _make_silence_row(rule_ids='["rule-1"]', matchers='{"env":"prod"}')
        silence = _row_to_silence(row)
        assert isinstance(silence, Silence)
        assert silence.id == "silence-1"
        assert silence.rule_ids == ["rule-1"]
        assert silence.matchers == {"env": "prod"}
        assert silence.enabled is True

    def test_converts_native_json_fields(self):
        row = _make_silence_row(
            rule_ids=["rule-1", "rule-2"],
            matchers={"env": "prod"},
            recurrence_days=["mon", "tue"],
        )
        silence = _row_to_silence(row)
        assert silence.rule_ids == ["rule-1", "rule-2"]
        assert silence.recurrence_days == ["mon", "tue"]

    def test_recurring_fields(self):
        row = _make_silence_row(
            recurring=True,
            recurrence_days='["mon","wed","fri"]',
            recurrence_start_time="21:00",
            recurrence_end_time="09:00",
        )
        silence = _row_to_silence(row)
        assert silence.recurring is True
        assert silence.recurrence_start_time == "21:00"
        assert silence.recurrence_end_time == "09:00"
        assert silence.recurrence_days == ["mon", "wed", "fri"]


# ---------------------------------------------------------------------------
# _matches_rule
# ---------------------------------------------------------------------------


class TestMatchesRule:
    def test_matches_by_rule_id(self):
        assert _matches_rule("rule-1", {}, ["rule-1", "rule-2"], {}) is True

    def test_no_match_by_rule_id(self):
        assert _matches_rule("rule-3", {}, ["rule-1", "rule-2"], {}) is False

    def test_matches_by_matchers(self):
        assert _matches_rule(
            "rule-x", {"env": "prod", "region": "us-east"},
            [], {"env": "prod"},
        ) is True

    def test_matchers_partial_mismatch(self):
        assert _matches_rule(
            "rule-x", {"env": "staging"},
            [], {"env": "prod"},
        ) is False

    def test_matchers_all_must_match(self):
        assert _matches_rule(
            "rule-x", {"env": "prod", "region": "us-east"},
            [], {"env": "prod", "region": "eu-west"},
        ) is False

    def test_no_rule_ids_no_matchers_returns_false(self):
        assert _matches_rule("rule-1", {"env": "prod"}, [], {}) is False

    def test_rule_id_takes_priority(self):
        assert _matches_rule(
            "rule-1", {},
            ["rule-1"], {"env": "prod"},
        ) is True

    def test_empty_tags_with_matchers(self):
        assert _matches_rule("rule-x", {}, [], {"env": "prod"}) is False

    def test_matcher_key_missing_from_rule_tags(self):
        assert _matches_rule(
            "rule-x", {"region": "us-east"},
            [], {"env": "prod"},
        ) is False

    def test_both_rule_id_and_matchers_rule_id_wins(self):
        assert _matches_rule(
            "rule-1", {"env": "staging"},
            ["rule-1"], {"env": "prod"},
        ) is True

    def test_matchers_with_multiple_keys_all_must_match(self):
        assert _matches_rule(
            "rule-x", {"env": "prod", "region": "us-east", "team": "platform"},
            [], {"env": "prod", "region": "us-east", "team": "platform"},
        ) is True

    def test_matchers_with_extra_rule_tags_still_matches(self):
        assert _matches_rule(
            "rule-x", {"env": "prod", "region": "us-east", "extra": "yes"},
            [], {"env": "prod"},
        ) is True


# ---------------------------------------------------------------------------
# _is_recurring_active
# ---------------------------------------------------------------------------


class TestIsRecurringActive:
    def _make_row(
        self,
        tz: str = "Asia/Kolkata",
        days: list[str] | None = None,
        start: str = "09:00",
        end: str = "17:00",
    ) -> dict:
        return {
            "timezone": tz,
            "recurrence_days": days or ["mon", "tue", "wed", "thu", "fri"],
            "recurrence_start_time": start,
            "recurrence_end_time": end,
        }

    def test_active_during_window(self):
        ist = timezone(timedelta(hours=5, minutes=30))
        now = datetime(2026, 4, 29, 12, 0, tzinfo=ist).astimezone(UTC)
        row = self._make_row(start="09:00", end="17:00")
        assert _is_recurring_active(now, row) is True

    def test_inactive_outside_window(self):
        ist = timezone(timedelta(hours=5, minutes=30))
        now = datetime(2026, 4, 29, 20, 0, tzinfo=ist).astimezone(UTC)
        row = self._make_row(start="09:00", end="17:00")
        assert _is_recurring_active(now, row) is False

    def test_inactive_on_wrong_day(self):
        ist = timezone(timedelta(hours=5, minutes=30))
        now = datetime(2026, 5, 2, 12, 0, tzinfo=ist).astimezone(UTC)
        row = self._make_row(start="09:00", end="17:00")
        assert _is_recurring_active(now, row) is False

    def test_crosses_midnight_before_midnight(self):
        ist = timezone(timedelta(hours=5, minutes=30))
        now = datetime(2026, 4, 29, 22, 0, tzinfo=ist).astimezone(UTC)
        row = self._make_row(start="21:00", end="09:00")
        assert _is_recurring_active(now, row) is True

    def test_crosses_midnight_after_midnight(self):
        ist = timezone(timedelta(hours=5, minutes=30))
        now = datetime(2026, 4, 30, 3, 0, tzinfo=ist).astimezone(UTC)
        row = self._make_row(days=["thu"], start="21:00", end="09:00")
        assert _is_recurring_active(now, row) is True

    def test_crosses_midnight_outside_window(self):
        ist = timezone(timedelta(hours=5, minutes=30))
        now = datetime(2026, 4, 29, 15, 0, tzinfo=ist).astimezone(UTC)
        row = self._make_row(start="21:00", end="09:00")
        assert _is_recurring_active(now, row) is False

    def test_missing_start_time(self):
        row = self._make_row()
        row["recurrence_start_time"] = None
        now = datetime(2026, 4, 29, 12, 0, tzinfo=UTC)
        assert _is_recurring_active(now, row) is False

    def test_missing_end_time(self):
        row = self._make_row()
        row["recurrence_end_time"] = None
        now = datetime(2026, 4, 29, 12, 0, tzinfo=UTC)
        assert _is_recurring_active(now, row) is False

    def test_invalid_timezone_falls_back(self):
        row = self._make_row(tz="Invalid/Zone")
        # Falls back to UTC now (not Asia/Kolkata), so use UTC-active time
        now = datetime(2026, 4, 29, 12, 0, tzinfo=UTC)
        assert _is_recurring_active(now, row) is True

    def test_weekend_days(self):
        ist = timezone(timedelta(hours=5, minutes=30))
        now = datetime(2026, 5, 3, 12, 0, tzinfo=ist).astimezone(UTC)
        row = self._make_row(days=["sun"], start="09:00", end="17:00")
        assert _is_recurring_active(now, row) is True

    def test_exact_start_boundary_is_active(self):
        ist = timezone(timedelta(hours=5, minutes=30))
        now = datetime(2026, 4, 29, 9, 0, tzinfo=ist).astimezone(UTC)
        row = self._make_row(start="09:00", end="17:00")
        assert _is_recurring_active(now, row) is True

    def test_exact_end_boundary_is_inactive(self):
        ist = timezone(timedelta(hours=5, minutes=30))
        now = datetime(2026, 4, 29, 17, 0, tzinfo=ist).astimezone(UTC)
        row = self._make_row(start="09:00", end="17:00")
        assert _is_recurring_active(now, row) is False

    def test_one_minute_before_end_is_active(self):
        ist = timezone(timedelta(hours=5, minutes=30))
        now = datetime(2026, 4, 29, 16, 59, tzinfo=ist).astimezone(UTC)
        row = self._make_row(start="09:00", end="17:00")
        assert _is_recurring_active(now, row) is True

    def test_empty_timezone_falls_back_to_utc(self):
        row = self._make_row(tz="")
        # Falls back to UTC now, use a UTC-active time on a weekday
        now = datetime(2026, 4, 29, 12, 0, tzinfo=UTC)
        assert _is_recurring_active(now, row) is True

    def test_utc_timezone_different_day(self):
        # 2026-04-29 01:00 UTC is a Wednesday
        now = datetime(2026, 4, 29, 1, 0, tzinfo=UTC)
        row = self._make_row(tz="UTC", days=["wed"], start="00:00", end="02:00")
        assert _is_recurring_active(now, row) is True

    def test_recurrence_days_as_json_string(self):
        row = self._make_row()
        row["recurrence_days"] = '["mon","tue","wed","thu","fri"]'
        ist = timezone(timedelta(hours=5, minutes=30))
        now = datetime(2026, 4, 29, 12, 0, tzinfo=ist).astimezone(UTC)
        assert _is_recurring_active(now, row) is True


# ---------------------------------------------------------------------------
# is_rule_silenced (full integration with DB mock)
# ---------------------------------------------------------------------------


class TestIsRuleSilenced:
    @patch("neoguard.services.alerts.silences.get_pool", new_callable=AsyncMock)
    async def test_not_silenced_when_no_silences(self, mock_get_pool):
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = []
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        result = await is_rule_silenced("rule-1", "default", {})
        assert result is False

    @patch("neoguard.services.alerts.silences.get_pool", new_callable=AsyncMock)
    async def test_silenced_by_one_time_window_rule_id(self, mock_get_pool):
        now = datetime.now(UTC)
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = [
            {
                "rule_ids": '["rule-1"]',
                "matchers": "{}",
                "recurring": False,
                "starts_at": now - timedelta(hours=1),
                "ends_at": now + timedelta(hours=1),
                "timezone": "Asia/Kolkata",
                "recurrence_days": "[]",
                "recurrence_start_time": None,
                "recurrence_end_time": None,
            }
        ]
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        result = await is_rule_silenced("rule-1", "default", {})
        assert result is True

    @patch("neoguard.services.alerts.silences.get_pool", new_callable=AsyncMock)
    async def test_not_silenced_when_one_time_expired(self, mock_get_pool):
        now = datetime.now(UTC)
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = [
            {
                "rule_ids": '["rule-1"]',
                "matchers": "{}",
                "recurring": False,
                "starts_at": now - timedelta(hours=3),
                "ends_at": now - timedelta(hours=1),
                "timezone": "Asia/Kolkata",
                "recurrence_days": "[]",
                "recurrence_start_time": None,
                "recurrence_end_time": None,
            }
        ]
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        result = await is_rule_silenced("rule-1", "default", {})
        assert result is False

    @patch("neoguard.services.alerts.silences.get_pool", new_callable=AsyncMock)
    async def test_not_silenced_when_one_time_not_started(self, mock_get_pool):
        now = datetime.now(UTC)
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = [
            {
                "rule_ids": '["rule-1"]',
                "matchers": "{}",
                "recurring": False,
                "starts_at": now + timedelta(hours=1),
                "ends_at": now + timedelta(hours=3),
                "timezone": "Asia/Kolkata",
                "recurrence_days": "[]",
                "recurrence_start_time": None,
                "recurrence_end_time": None,
            }
        ]
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        result = await is_rule_silenced("rule-1", "default", {})
        assert result is False

    @patch("neoguard.services.alerts.silences.get_pool", new_callable=AsyncMock)
    async def test_silenced_by_matcher(self, mock_get_pool):
        now = datetime.now(UTC)
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = [
            {
                "rule_ids": "[]",
                "matchers": '{"env":"prod"}',
                "recurring": False,
                "starts_at": now - timedelta(hours=1),
                "ends_at": now + timedelta(hours=1),
                "timezone": "Asia/Kolkata",
                "recurrence_days": "[]",
                "recurrence_start_time": None,
                "recurrence_end_time": None,
            }
        ]
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        result = await is_rule_silenced("rule-99", "default", {"env": "prod", "region": "us-east"})
        assert result is True

    @patch("neoguard.services.alerts.silences.get_pool", new_callable=AsyncMock)
    async def test_not_silenced_when_matcher_doesnt_match(self, mock_get_pool):
        now = datetime.now(UTC)
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = [
            {
                "rule_ids": "[]",
                "matchers": '{"env":"prod"}',
                "recurring": False,
                "starts_at": now - timedelta(hours=1),
                "ends_at": now + timedelta(hours=1),
                "timezone": "Asia/Kolkata",
                "recurrence_days": "[]",
                "recurrence_start_time": None,
                "recurrence_end_time": None,
            }
        ]
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        result = await is_rule_silenced("rule-99", "default", {"env": "staging"})
        assert result is False

    @patch("neoguard.services.alerts.silences.get_pool", new_callable=AsyncMock)
    async def test_not_silenced_when_rule_id_doesnt_match(self, mock_get_pool):
        now = datetime.now(UTC)
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = [
            {
                "rule_ids": '["rule-1","rule-2"]',
                "matchers": "{}",
                "recurring": False,
                "starts_at": now - timedelta(hours=1),
                "ends_at": now + timedelta(hours=1),
                "timezone": "Asia/Kolkata",
                "recurrence_days": "[]",
                "recurrence_start_time": None,
                "recurrence_end_time": None,
            }
        ]
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        result = await is_rule_silenced("rule-99", "default", {})
        assert result is False

    @patch("neoguard.services.alerts.silences.get_pool", new_callable=AsyncMock)
    async def test_silenced_by_recurring_active_now(self, mock_get_pool):
        now = datetime.now(UTC)
        day_abbr = now.strftime("%a").lower()[:3]

        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = [
            {
                "rule_ids": '["rule-1"]',
                "matchers": "{}",
                "recurring": True,
                "starts_at": now - timedelta(days=30),
                "ends_at": now + timedelta(days=30),
                "timezone": "UTC",
                "recurrence_days": f'["{day_abbr}"]',
                "recurrence_start_time": "00:00",
                "recurrence_end_time": "23:59",
            }
        ]
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        result = await is_rule_silenced("rule-1", "default", {})
        assert result is True

    @patch("neoguard.services.alerts.silences.get_pool", new_callable=AsyncMock)
    async def test_not_silenced_by_recurring_wrong_day(self, mock_get_pool):
        now = datetime.now(UTC)
        # pick a day that is NOT today
        all_days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
        today = now.strftime("%a").lower()[:3]
        wrong_day = [d for d in all_days if d != today][0]

        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = [
            {
                "rule_ids": '["rule-1"]',
                "matchers": "{}",
                "recurring": True,
                "starts_at": now - timedelta(days=30),
                "ends_at": now + timedelta(days=30),
                "timezone": "UTC",
                "recurrence_days": f'["{wrong_day}"]',
                "recurrence_start_time": "00:00",
                "recurrence_end_time": "23:59",
            }
        ]
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        result = await is_rule_silenced("rule-1", "default", {})
        assert result is False

    @patch("neoguard.services.alerts.silences.get_pool", new_callable=AsyncMock)
    async def test_multiple_silences_first_match_wins(self, mock_get_pool):
        now = datetime.now(UTC)
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = [
            {
                "rule_ids": '["rule-other"]',
                "matchers": "{}",
                "recurring": False,
                "starts_at": now - timedelta(hours=1),
                "ends_at": now + timedelta(hours=1),
                "timezone": "UTC",
                "recurrence_days": "[]",
                "recurrence_start_time": None,
                "recurrence_end_time": None,
            },
            {
                "rule_ids": '["rule-1"]',
                "matchers": "{}",
                "recurring": False,
                "starts_at": now - timedelta(hours=1),
                "ends_at": now + timedelta(hours=1),
                "timezone": "UTC",
                "recurrence_days": "[]",
                "recurrence_start_time": None,
                "recurrence_end_time": None,
            },
        ]
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        result = await is_rule_silenced("rule-1", "default", {})
        assert result is True

    @patch("neoguard.services.alerts.silences.get_pool", new_callable=AsyncMock)
    async def test_queries_correct_tenant(self, mock_get_pool):
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = []
        mock_get_pool.return_value = _mock_pool_with_conn(mock_conn)

        await is_rule_silenced("rule-1", "tenant-abc", {})

        call_args = mock_conn.fetch.call_args[0]
        assert "tenant_id = $1" in call_args[0]
        assert call_args[1] == "tenant-abc"


# ---------------------------------------------------------------------------
# SilenceCreate model validation
# ---------------------------------------------------------------------------


class TestSilenceCreateValidation:
    def test_valid_one_time_silence(self):
        s = SilenceCreate(
            name="Maintenance",
            rule_ids=["rule-1"],
            starts_at=datetime.now(UTC),
            ends_at=datetime.now(UTC) + timedelta(hours=2),
        )
        assert s.recurring is False

    def test_one_time_ends_before_starts_raises(self):
        with pytest.raises(ValidationError, match="ends_at must be after starts_at"):
            SilenceCreate(
                name="Bad",
                rule_ids=["rule-1"],
                starts_at=datetime.now(UTC) + timedelta(hours=2),
                ends_at=datetime.now(UTC),
            )

    def test_one_time_ends_equals_starts_raises(self):
        now = datetime.now(UTC)
        with pytest.raises(ValidationError, match="ends_at must be after starts_at"):
            SilenceCreate(
                name="Bad",
                rule_ids=["rule-1"],
                starts_at=now,
                ends_at=now,
            )

    def test_valid_recurring_silence(self):
        s = SilenceCreate(
            name="Nightly shutdown",
            rule_ids=["rule-1"],
            starts_at=datetime.now(UTC),
            ends_at=datetime.now(UTC) + timedelta(days=365),
            recurring=True,
            recurrence_days=[SilenceScheduleDay.MON, SilenceScheduleDay.TUE],
            recurrence_start_time="21:00",
            recurrence_end_time="09:00",
        )
        assert s.recurring is True
        assert len(s.recurrence_days) == 2

    def test_recurring_without_days_raises(self):
        with pytest.raises(ValidationError, match="recurrence_days required"):
            SilenceCreate(
                name="Bad",
                rule_ids=["rule-1"],
                starts_at=datetime.now(UTC),
                ends_at=datetime.now(UTC) + timedelta(days=365),
                recurring=True,
                recurrence_start_time="21:00",
                recurrence_end_time="09:00",
            )

    def test_recurring_without_times_raises(self):
        with pytest.raises(ValidationError, match="recurrence_start_time and recurrence_end_time"):
            SilenceCreate(
                name="Bad",
                rule_ids=["rule-1"],
                starts_at=datetime.now(UTC),
                ends_at=datetime.now(UTC) + timedelta(days=365),
                recurring=True,
                recurrence_days=[SilenceScheduleDay.MON],
            )

    def test_recurring_with_only_start_time_raises(self):
        with pytest.raises(ValidationError, match="recurrence_start_time and recurrence_end_time"):
            SilenceCreate(
                name="Bad",
                rule_ids=["rule-1"],
                starts_at=datetime.now(UTC),
                ends_at=datetime.now(UTC) + timedelta(days=365),
                recurring=True,
                recurrence_days=[SilenceScheduleDay.MON],
                recurrence_start_time="21:00",
            )

    def test_no_rule_ids_no_matchers_raises(self):
        with pytest.raises(ValidationError, match="At least one of rule_ids or matchers"):
            SilenceCreate(
                name="Bad",
                starts_at=datetime.now(UTC),
                ends_at=datetime.now(UTC) + timedelta(hours=2),
            )

    def test_matchers_only_is_valid(self):
        s = SilenceCreate(
            name="Env silence",
            matchers={"env": "staging"},
            starts_at=datetime.now(UTC),
            ends_at=datetime.now(UTC) + timedelta(hours=2),
        )
        assert s.matchers == {"env": "staging"}
        assert s.rule_ids == []

    def test_both_rule_ids_and_matchers_valid(self):
        s = SilenceCreate(
            name="Both",
            rule_ids=["rule-1"],
            matchers={"env": "prod"},
            starts_at=datetime.now(UTC),
            ends_at=datetime.now(UTC) + timedelta(hours=2),
        )
        assert s.rule_ids == ["rule-1"]
        assert s.matchers == {"env": "prod"}

    def test_default_timezone_is_utc(self):
        s = SilenceCreate(
            name="Test",
            rule_ids=["rule-1"],
            starts_at=datetime.now(UTC),
            ends_at=datetime.now(UTC) + timedelta(hours=2),
        )
        assert s.timezone == "UTC"

    def test_custom_timezone(self):
        s = SilenceCreate(
            name="Test",
            rule_ids=["rule-1"],
            starts_at=datetime.now(UTC),
            ends_at=datetime.now(UTC) + timedelta(hours=2),
            timezone="America/New_York",
        )
        assert s.timezone == "America/New_York"

    def test_name_min_length(self):
        with pytest.raises(ValidationError):
            SilenceCreate(
                name="",
                rule_ids=["rule-1"],
                starts_at=datetime.now(UTC),
                ends_at=datetime.now(UTC) + timedelta(hours=2),
            )

    def test_name_max_length(self):
        with pytest.raises(ValidationError):
            SilenceCreate(
                name="x" * 257,
                rule_ids=["rule-1"],
                starts_at=datetime.now(UTC),
                ends_at=datetime.now(UTC) + timedelta(hours=2),
            )

    def test_all_seven_days_valid(self):
        all_days = [
            SilenceScheduleDay.MON, SilenceScheduleDay.TUE, SilenceScheduleDay.WED,
            SilenceScheduleDay.THU, SilenceScheduleDay.FRI, SilenceScheduleDay.SAT,
            SilenceScheduleDay.SUN,
        ]
        s = SilenceCreate(
            name="Every day",
            rule_ids=["rule-1"],
            starts_at=datetime.now(UTC),
            ends_at=datetime.now(UTC) + timedelta(days=365),
            recurring=True,
            recurrence_days=all_days,
            recurrence_start_time="22:00",
            recurrence_end_time="06:00",
        )
        assert len(s.recurrence_days) == 7

    def test_recurring_ends_before_starts_is_allowed(self):
        """For recurring silences, ends_at > starts_at check is skipped."""
        s = SilenceCreate(
            name="Recurring",
            rule_ids=["rule-1"],
            starts_at=datetime.now(UTC) + timedelta(hours=10),
            ends_at=datetime.now(UTC),
            recurring=True,
            recurrence_days=[SilenceScheduleDay.MON],
            recurrence_start_time="21:00",
            recurrence_end_time="09:00",
        )
        assert s.recurring is True


# ---------------------------------------------------------------------------
# SilenceUpdate model
# ---------------------------------------------------------------------------


class TestSilenceUpdate:
    def test_all_none_is_valid(self):
        u = SilenceUpdate()
        assert u.name is None
        assert u.comment is None
        assert u.ends_at is None
        assert u.enabled is None

    def test_partial_update(self):
        u = SilenceUpdate(name="New name", enabled=False)
        assert u.name == "New name"
        assert u.enabled is False
        assert u.comment is None

    def test_model_dump_excludes_none(self):
        u = SilenceUpdate(enabled=True)
        dumped = u.model_dump(exclude_none=True)
        assert dumped == {"enabled": True}


# ---------------------------------------------------------------------------
# SilenceScheduleDay enum
# ---------------------------------------------------------------------------


class TestSilenceScheduleDay:
    def test_all_values(self):
        assert SilenceScheduleDay.MON == "mon"
        assert SilenceScheduleDay.TUE == "tue"
        assert SilenceScheduleDay.WED == "wed"
        assert SilenceScheduleDay.THU == "thu"
        assert SilenceScheduleDay.FRI == "fri"
        assert SilenceScheduleDay.SAT == "sat"
        assert SilenceScheduleDay.SUN == "sun"

    def test_count(self):
        assert len(SilenceScheduleDay) == 7

    def test_from_string(self):
        assert SilenceScheduleDay("mon") == SilenceScheduleDay.MON

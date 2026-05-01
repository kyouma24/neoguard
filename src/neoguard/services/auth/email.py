"""Email service — console output for laptop demo, swappable for SES later."""

from __future__ import annotations

from neoguard.core.logging import log


async def send_password_reset(email: str, reset_url: str) -> None:
    await log.ainfo(
        "email.password_reset",
        to=email,
        reset_url=reset_url,
        action="send_password_reset",
    )
    print(f"\n{'='*60}")
    print(f"  PASSWORD RESET EMAIL (console delivery)")
    print(f"  To:   {email}")
    print(f"  Link: {reset_url}")
    print(f"{'='*60}\n")

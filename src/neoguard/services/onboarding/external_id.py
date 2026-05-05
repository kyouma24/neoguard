"""Cryptographic external ID generation for cloud account onboarding.

Generates unpredictable external IDs used in AWS trust policies and Azure
role assignments. Uses HMAC-SHA256 with a 32-byte OS-level random nonce
so the output cannot be predicted even if tenant_id is known.
"""

import hashlib
import hmac
import os
import time


def generate_external_id(tenant_id: str) -> str:
    """Generate a cryptographically secure external ID.

    Format: ``ng-<40 hex chars>``  (160-bit effective entropy).

    Derivation: HMAC-SHA256(key=32_random_bytes, msg=tenant_id|timestamp|32_random_bytes)
    truncated to 20 bytes (40 hex).  The double-random construction ensures the
    output is unpredictable even to an attacker who knows the tenant_id and
    approximate timestamp.
    """
    nonce = os.urandom(32)
    timestamp = str(time.time_ns()).encode()
    key = os.urandom(32)

    payload = tenant_id.encode() + b"|" + timestamp + b"|" + nonce
    digest = hmac.new(key, payload, hashlib.sha256).hexdigest()[:40]
    return f"ng-{digest}"

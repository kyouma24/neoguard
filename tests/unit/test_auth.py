"""Unit tests for auth utilities (no DB required)."""

from neoguard.services.auth.api_keys import (
    _generate_key_v1,
    _generate_key_v2,
    _hash_key_sha256,
)
from neoguard.services.auth.passwords import hash_password, verify_password


class TestKeyGeneration:
    def test_v1_key_starts_with_prefix(self):
        key = _generate_key_v1()
        assert key.startswith("ng_")

    def test_v2_key_starts_with_prefix(self):
        key = _generate_key_v2()
        assert key.startswith("obl_live_")

    def test_key_length(self):
        key = _generate_key_v2()
        assert len(key) > 20

    def test_keys_are_unique(self):
        keys = {_generate_key_v2() for _ in range(100)}
        assert len(keys) == 100

    def test_sha256_hash_deterministic(self):
        key = "ng_test_key_12345"
        h1 = _hash_key_sha256(key)
        h2 = _hash_key_sha256(key)
        assert h1 == h2

    def test_sha256_hash_is_hex(self):
        h = _hash_key_sha256("ng_test")
        assert len(h) == 64
        int(h, 16)

    def test_different_keys_different_hashes(self):
        h1 = _hash_key_sha256("ng_key_1")
        h2 = _hash_key_sha256("ng_key_2")
        assert h1 != h2


class TestArgon2Passwords:
    def test_hash_and_verify(self):
        pw = "test_password_123"
        hashed = hash_password(pw)
        assert verify_password(pw, hashed) is True

    def test_wrong_password_fails(self):
        hashed = hash_password("correct_password")
        assert verify_password("wrong_password", hashed) is False

    def test_hash_is_argon2_format(self):
        hashed = hash_password("test")
        assert hashed.startswith("$argon2id$")

    def test_different_passwords_different_hashes(self):
        h1 = hash_password("password_1")
        h2 = hash_password("password_2")
        assert h1 != h2

    def test_same_password_different_salts(self):
        h1 = hash_password("same_password")
        h2 = hash_password("same_password")
        assert h1 != h2  # different salts
        assert verify_password("same_password", h1) is True
        assert verify_password("same_password", h2) is True

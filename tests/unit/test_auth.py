"""Unit tests for auth utilities (no DB required)."""

from neoguard.services.auth.api_keys import _generate_key, _hash_key


class TestKeyGeneration:
    def test_key_starts_with_prefix(self):
        key = _generate_key()
        assert key.startswith("ng_")

    def test_key_length(self):
        key = _generate_key()
        assert len(key) > 20

    def test_keys_are_unique(self):
        keys = {_generate_key() for _ in range(100)}
        assert len(keys) == 100

    def test_hash_deterministic(self):
        key = "ng_test_key_12345"
        h1 = _hash_key(key)
        h2 = _hash_key(key)
        assert h1 == h2

    def test_hash_is_hex(self):
        h = _hash_key("ng_test")
        assert len(h) == 64
        int(h, 16)

    def test_different_keys_different_hashes(self):
        h1 = _hash_key("ng_key_1")
        h2 = _hash_key("ng_key_2")
        assert h1 != h2

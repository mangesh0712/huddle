import time

import pytest

from app.auth import SessionError, check_keys, make_session, read_session


def test_check_keys_constant_time_equal():
    assert check_keys("abc", "abc")
    assert not check_keys("abc", "abd")
    assert not check_keys("", "abc")
    assert not check_keys("abc", "")


def test_session_roundtrip():
    tok = make_session("secret", identity="i1", name="Ann", is_admin=True)
    s = read_session("secret", tok)
    assert s["identity"] == "i1" and s["name"] == "Ann" and s["is_admin"] is True


def test_session_bad_signature():
    tok = make_session("secret", identity="i1", name="Ann", is_admin=False)
    with pytest.raises(SessionError):
        read_session("other", tok)


def test_session_expired():
    tok = make_session("secret", identity="i1", name="Ann", is_admin=False)
    with pytest.raises(SessionError):
        read_session("secret", tok, max_age=-1)

import pytest

from app.music import Command, can_remove, can_skip, parse_command


def test_parse_basic():
    assert parse_command("!play never gonna give you up") == Command("play", "never gonna give you up")
    assert parse_command("!skip") == Command("skip", "")
    assert parse_command("!QUEUE") == Command("queue", "")
    assert parse_command("  !np ") == Command("np", "")


def test_parse_not_command():
    assert parse_command("hello !skip") is None
    assert parse_command("!") is None
    assert parse_command("!unknowncmd") == Command("unknown", "unknowncmd")


@pytest.mark.parametrize("policy,is_admin,votes,members,ok", [
    ("anyone", False, 0, 3, True),
    ("admin", False, 0, 3, False),
    ("admin", True, 0, 3, True),
    ("majority", False, 1, 3, False),
    ("majority", False, 2, 3, True),
    ("majority", True, 0, 3, True),
])
def test_can_skip(policy, is_admin, votes, members, ok):
    assert can_skip(policy, is_admin, votes, members) is ok


def test_can_remove():
    assert can_remove(is_admin=True, identity="x", added_by="y")
    assert can_remove(is_admin=False, identity="y", added_by="y")
    assert not can_remove(is_admin=False, identity="x", added_by="y")

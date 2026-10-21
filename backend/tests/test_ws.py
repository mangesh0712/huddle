import pytest
from fastapi.testclient import TestClient

from app import livekit_admin
from app.config import Settings
from app.main import create_app

VID = {"video_id": "dQw4w9WgXcQ", "title": "Never Gonna", "channel_title": "Rick", "duration_s": 200}
VID2 = {**VID, "video_id": "9bZkp7q19f0", "title": "Gangnam"}


@pytest.fixture
def env(monkeypatch):
    calls = []

    async def fake_publish(s, room, identity, can):
        calls.append(("publish", room, identity, can))

    async def fake_remove(s, room, identity):
        calls.append(("remove", room, identity))

    monkeypatch.setattr(livekit_admin, "set_can_publish", fake_publish)
    monkeypatch.setattr(livekit_admin, "remove_participant", fake_remove)
    s = Settings(invite_key="inv", admin_key="adm", session_secret="s" * 32, livekit_url="wss://x",
                 livekit_api_key="k", livekit_api_secret="s" * 32, youtube_api_key="", channels="Lounge,Chill")
    return TestClient(create_app(s)), calls


def sess(client, ident, name, admin=False):
    body = {"invite_key": "inv", "identity": ident, "name": name, "channel": "lounge"}
    if admin:
        body["admin_key"] = "adm"
    return client.post("/api/join", json=body).json()["session"]


def drain_until(ws, typ, limit=20, pred=lambda m: True):
    for _ in range(limit):
        m = ws.receive_json()
        if m["type"] == typ and pred(m):
            return m
    raise AssertionError(f"no {typ}")


def test_bad_session_rejected(env):
    client, _ = env
    with pytest.raises(Exception):
        with client.websocket_connect("/ws/lounge?session=bad"):
            pass


def test_chat_broadcast_and_snapshot(env):
    client, _ = env
    a, b = sess(client, "ident-aaaa1", "Ann"), sess(client, "ident-bbbb2", "Bob")
    with client.websocket_connect(f"/ws/lounge?session={a}") as wa:
        snap = wa.receive_json()
        assert snap["type"] == "snapshot" and snap["player"]["status"] == "idle"
        with client.websocket_connect(f"/ws/lounge?session={b}") as wb:
            assert wb.receive_json()["type"] == "snapshot"
            wa.send_json({"type": "chat.send", "text": "<b>hi</b>"})
            m = drain_until(wb, "chat.message", pred=lambda m: m["message"]["kind"] == "user")
            assert m["message"]["text"] == "<b>hi</b>" and m["message"]["name"] == "Ann"


def test_queue_add_plays_then_vote_order_and_skip(env):
    client, _ = env
    a = sess(client, "ident-aaaa1", "Ann")
    with client.websocket_connect(f"/ws/lounge?session={a}") as w:
        w.receive_json()
        w.send_json({"type": "queue.add", "video": VID})
        st = drain_until(w, "player.state")
        assert st["status"] == "playing" and st["item"]["video_id"] == VID["video_id"]
        w.send_json({"type": "queue.add", "video": VID2})
        q = drain_until(w, "queue.updated", pred=lambda m: m["queue"])
        assert [x["title"] for x in q["queue"]] == ["Gangnam"]
        w.send_json({"type": "player.skip"})
        st = drain_until(w, "player.state", pred=lambda m: m["item"] and m["item"]["title"] == "Gangnam")
        w.send_json({"type": "player.ended", "item_id": st["item"]["id"]})
        st = drain_until(w, "player.state", pred=lambda m: m["status"] == "idle")
        assert st["item"] is None


def test_pause_seek_broadcast(env):
    client, _ = env
    a = sess(client, "ident-aaaa1", "Ann")
    with client.websocket_connect(f"/ws/lounge?session={a}") as w:
        w.receive_json()
        w.send_json({"type": "queue.add", "video": VID})
        drain_until(w, "player.state")
        w.send_json({"type": "player.pause"})
        assert drain_until(w, "player.state")["status"] == "paused"
        w.send_json({"type": "player.seek", "position_ms": 42000})
        assert drain_until(w, "player.state")["position_ms"] == 42000


def test_late_joiner_gets_snapshot_with_player(env):
    client, _ = env
    a, b = sess(client, "ident-aaaa1", "Ann"), sess(client, "ident-bbbb2", "Bob")
    with client.websocket_connect(f"/ws/lounge?session={a}") as w:
        w.receive_json()
        w.send_json({"type": "queue.add", "video": VID})
        drain_until(w, "player.state")
        with client.websocket_connect(f"/ws/lounge?session={b}") as w2:
            snap = w2.receive_json()
            assert snap["player"]["item"]["title"] == "Never Gonna" and snap["server_now"] > 0


def test_commands_np_and_queue(env):
    client, _ = env
    a = sess(client, "ident-aaaa1", "Ann")
    with client.websocket_connect(f"/ws/lounge?session={a}") as w:
        w.receive_json()
        w.send_json({"type": "chat.send", "text": "!np"})
        bot = next(m for m in (w.receive_json() for _ in range(6)) if m.get("message", {}).get("kind") == "bot")
        assert "Nothing is playing" in bot["message"]["text"]
        w.send_json({"type": "chat.send", "text": "!volume 40"})
        assert drain_until(w, "local") == {"type": "local", "action": "volume", "value": 40}


def test_chat_rate_limit(env):
    client, _ = env
    a = sess(client, "ident-aaaa1", "Ann")
    with client.websocket_connect(f"/ws/lounge?session={a}") as w:
        w.receive_json()
        for i in range(6):
            w.send_json({"type": "chat.send", "text": f"m{i}"})
        assert drain_until(w, "error", limit=30)["code"] == "rate_limited"


def test_admin_mute_and_kick(env):
    client, calls = env
    adm = sess(client, "ident-admin1", "Boss", admin=True)
    user = sess(client, "ident-user01", "Ann")
    h = {"Authorization": f"Bearer {adm}"}
    r = client.post("/api/channels/lounge/mute", json={"identity": "ident-user01", "muted": True}, headers=h)
    assert r.status_code == 200 and ("publish", "lounge", "ident-user01", False) in calls
    # a muted user's re-issued voice token must not allow publishing
    from livekit import api
    tok = client.post("/api/voice-token", json={"channel": "lounge"},
                      headers={"Authorization": f"Bearer {user}"}).json()["livekit_token"]
    claims = api.TokenVerifier("k", "s" * 32).verify(tok)
    assert claims.video.can_publish is False
    with client.websocket_connect(f"/ws/lounge?session={user}") as w:
        w.receive_json()
        client.post("/api/channels/lounge/kick", json={"identity": "ident-user01"}, headers=h)
        assert drain_until(w, "error")["code"] == "kicked"
    assert ("remove", "lounge", "ident-user01") in calls
    r = client.post("/api/join", json={"invite_key": "inv", "identity": "ident-user01", "name": "Ann", "channel": "chill"})
    assert r.status_code == 403


def test_admin_cannot_target_self(env):
    client, _ = env
    adm = sess(client, "ident-admin1", "Boss", admin=True)
    r = client.post("/api/channels/lounge/kick", json={"identity": "ident-admin1"},
                    headers={"Authorization": f"Bearer {adm}"})
    assert r.status_code == 400

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import create_app


@pytest.fixture
def client():
    s = Settings(invite_key="inv", admin_key="adm", session_secret="s" * 32,
                 livekit_url="wss://x.livekit.cloud", livekit_api_key="k", livekit_api_secret="s" * 32,
                 youtube_api_key="", channels="Lounge,Chill")
    app = create_app(s)
    return TestClient(app)


def join(client, **kw):
    body = {"invite_key": "inv", "identity": "identity-0001", "name": "Ann", "emoji": "🙂", "channel": "lounge"}
    body.update(kw)
    return client.post("/api/join", json=body)


def test_healthz(client):
    assert client.get("/healthz").json() == {"ok": True}


def test_join_bad_key(client):
    assert join(client, invite_key="nope").status_code == 403


def test_join_ok_and_non_admin(client):
    r = join(client)
    j = r.json()
    assert r.status_code == 200 and j["is_admin"] is False
    assert j["livekit_url"] == "wss://x.livekit.cloud" and j["livekit_token"]
    assert [c["id"] for c in j["channels"]] == ["lounge", "chill"]


def test_join_admin(client):
    assert join(client, admin_key="adm").json()["is_admin"] is True
    assert join(client, admin_key="wrong").json()["is_admin"] is False


def test_channels_requires_auth(client):
    assert client.get("/api/channels").status_code == 401
    tok = join(client).json()["session"]
    r = client.get("/api/channels", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200


def test_admin_endpoints_reject_non_admin(client):
    tok = join(client).json()["session"]
    h = {"Authorization": f"Bearer {tok}"}
    assert client.post("/api/channels/lounge/mute", json={"identity": "x", "muted": True}, headers=h).status_code == 403
    assert client.post("/api/channels/lounge/kick", json={"identity": "x"}, headers=h).status_code == 403


def test_kicked_identity_blocked_from_join(client):
    app_state = client.app.state.hub
    app_state.channels["lounge"].block("identity-0001", until=1e18)
    assert join(client).status_code == 403


def test_spa_fallback_not_swallowing_api(client):
    assert client.get("/api/nope").status_code in (401, 404)


def test_admin_key_alone_can_join(client):
    r = join(client, invite_key="", admin_key="adm")
    assert r.status_code == 200 and r.json()["is_admin"] is True


def test_wrong_admin_key_without_invite_is_rejected(client):
    assert join(client, invite_key="", admin_key="wrong").status_code == 403
    assert join(client, invite_key="", admin_key=None).status_code == 403


def test_only_admins_receive_the_invite_key(client):
    assert join(client, invite_key="", admin_key="adm").json()["invite_key"] == "inv"
    assert join(client).json().get("invite_key") is None


def test_channels_flag_karaoke():
    s = Settings(invite_key="inv", admin_key="adm", session_secret="s" * 32, livekit_url="wss://x",
                 livekit_api_key="k", livekit_api_secret="s" * 32, channels="Lounge,Karaoke", karaoke_channels="Karaoke")
    c = TestClient(create_app(s))
    j = c.post("/api/join", json={"invite_key": "inv", "identity": "identity-0001", "name": "Ann"}).json()
    assert {x["id"]: x["karaoke"] for x in j["channels"]} == {"lounge": False, "karaoke": True}
    tok = j["session"]
    r = c.get("/api/channels", headers={"Authorization": f"Bearer {tok}"}).json()
    assert {x["id"]: x["karaoke"] for x in r} == {"lounge": False, "karaoke": True}


def test_default_config_includes_karaoke():
    s = Settings(_env_file=None)
    assert "Karaoke" in s.channel_names and s.karaoke_names == ["Karaoke"]

import os
import time
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import livekit_admin
from .auth import check_keys, make_session
from .config import Settings, get_settings
from .lyrics import clean_title, fetch_lyrics
from .music import search_youtube
from .palette import palette_for
from .rooms import Member
from .ws import Hub


class JoinBody(BaseModel):
    invite_key: str
    admin_key: str | None = None
    identity: str = Field(min_length=8, max_length=64)
    name: str = Field(min_length=1, max_length=24)
    emoji: str = Field(default="🙂", max_length=8)
    channel: str | None = None


class MuteBody(BaseModel):
    identity: str
    muted: bool


class KickBody(BaseModel):
    identity: str


class VoiceBody(BaseModel):
    channel: str


def create_app(settings: Settings | None = None) -> FastAPI:
    s = settings or get_settings()
    app = FastAPI(title=s.app_name)
    hub = Hub(s)
    app.state.hub = hub
    if s.allowed_origins:
        app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in s.allowed_origins.split(",")],
                           allow_methods=["*"], allow_headers=["*"])

    def channel_or_404(cid: str | None):
        ch = hub.channels.get(cid or "") if cid else next(iter(hub.channels.values()))
        if not ch:
            raise HTTPException(404, "channel_not_found")
        return ch

    def current(authorization: str = Header(default="")) -> dict:
        sess = hub.authenticate(authorization.removeprefix("Bearer ").strip())
        if not sess:
            raise HTTPException(401, "invalid_session")
        return sess

    def admin(sess: dict = Depends(current)) -> dict:
        if not sess["is_admin"]:
            raise HTTPException(403, "admin_only")
        return sess

    def channel_list():
        return [{"id": c.id, "name": c.name, "count": len(c.members)} for c in hub.channels.values()]

    def voice_token(sess: dict, ch) -> str:
        return livekit_admin.make_token(s, identity=sess["identity"], name=sess["name"], room=ch.id,
                                        can_publish=sess["identity"] not in ch.muted)

    @app.get("/healthz")
    async def healthz():
        return {"ok": True}

    @app.post("/api/join")
    async def join(body: JoinBody):
        is_admin = bool(body.admin_key) and check_keys(body.admin_key, s.admin_key)
        if not (is_admin or check_keys(body.invite_key, s.invite_key)):
            raise HTTPException(403, "invalid_invite")
        ch = channel_or_404(body.channel)
        if ch.is_blocked(body.identity):
            raise HTTPException(403, "kicked")
        sess = {"identity": body.identity, "name": body.name.strip(), "is_admin": is_admin}
        token = make_session(s.session_secret, emoji=body.emoji, **sess)
        return {"session": token, "livekit_token": voice_token(sess, ch), "livekit_url": s.livekit_url,
                "is_admin": is_admin, "channels": channel_list(), "app_name": s.app_name,
                "invite_key": s.invite_key if is_admin else None}

    @app.post("/api/voice-token")
    async def voice(body: VoiceBody, sess: dict = Depends(current)):
        ch = channel_or_404(body.channel)
        if ch.is_blocked(sess["identity"]):
            raise HTTPException(403, "kicked")
        return {"livekit_token": voice_token(sess, ch), "livekit_url": s.livekit_url}

    @app.get("/api/channels")
    async def channels(_: dict = Depends(current)):
        return channel_list()

    @app.get("/api/search")
    async def search(q: str = Query(min_length=1, max_length=100), _: dict = Depends(current)):
        if not s.youtube_api_key:
            raise HTTPException(503, "search_unavailable")
        try:
            return await search_youtube(hub.http, s.youtube_api_key, q)
        except httpx.HTTPError:
            raise HTTPException(502, "youtube_error")

    @app.get("/api/lyrics")
    async def lyrics(title: str, artist: str = "", duration: int | None = None, raw: bool = False,
                     _: dict = Depends(current)):
        t, a = (title, artist) if raw else clean_title(title, artist)
        return await fetch_lyrics(hub.http, t, a, duration)

    @app.get("/api/palette")
    async def palette(video_id: str = Query(pattern=r"^[\w-]{11}$"), _: dict = Depends(current)):
        try:
            return await palette_for(hub.http, video_id)
        except Exception:
            raise HTTPException(502, "palette_error")

    @app.post("/api/channels/{cid}/mute")
    async def mute(cid: str, body: MuteBody, sess: dict = Depends(admin)):
        ch = channel_or_404(cid)
        if body.identity == sess["identity"]:
            raise HTTPException(400, "cannot_target_self")
        await hub.set_muted(ch, body.identity, body.muted)
        return {"ok": True}

    @app.post("/api/channels/{cid}/kick")
    async def kick(cid: str, body: KickBody, sess: dict = Depends(admin)):
        ch = channel_or_404(cid)
        if body.identity == sess["identity"]:
            raise HTTPException(400, "cannot_target_self")
        await hub.kick(ch, body.identity)
        return {"ok": True}

    @app.websocket("/ws/{cid}")
    async def ws_endpoint(ws: WebSocket, cid: str, session: str = ""):
        sess = hub.authenticate(session)
        ch = hub.channels.get(cid)
        if not sess or not ch:
            await ws.close(code=4001)
            return
        if ch.is_blocked(sess["identity"]):
            await ws.accept()
            await ws.send_json({"type": "error", "code": "kicked", "message": "You were removed by an admin."})
            await ws.close(code=4003)
            return
        await ws.accept()
        member = Member(identity=sess["identity"], name=sess["name"], emoji=sess.get("emoji", "🙂"),
                        is_admin=sess["is_admin"])
        await hub.connect(ws, ch, member)
        try:
            while True:
                data = await ws.receive_json()
                if isinstance(data, dict):
                    await hub.handle(ws, ch, member, data)
        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            await hub.disconnect(ws, ch)

    dist = Path(os.environ.get("FRONTEND_DIST", Path(__file__).resolve().parents[2] / "frontend" / "dist"))
    if dist.is_dir():
        @app.get("/{path:path}")
        async def spa(path: str):
            if path.split("/")[0] in ("api", "ws", "healthz"):
                raise HTTPException(404)
            f = (dist / path).resolve()
            if path and f.is_file() and dist.resolve() in f.parents:
                return FileResponse(f)
            return FileResponse(dist / "index.html")

    return app


app = create_app() if os.environ.get("HUDDLE_NO_AUTOAPP") != "1" else None

import asyncio
import re
import time

import httpx
from fastapi import WebSocket

from . import livekit_admin
from .auth import SessionError, read_session
from .config import Settings
from .music import can_remove, can_skip, parse_command, search_youtube
from .rooms import Channel, Member, QueueItem, RateLimiter, new_id

KICK_SECONDS = 600
TIMER_GRACE_MS = 4000
_VID = re.compile(r"^[\w-]{11}$")


def now_ms() -> int:
    return int(time.time() * 1000)


def fmt_dur(ms: int) -> str:
    s = ms // 1000
    return f"{s // 60}:{s % 60:02d}"


class Hub:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.channels: dict[str, Channel] = {}
        for name in settings.channel_names:
            slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
            self.channels[slug] = Channel(id=slug, name=name)
        self.conns: dict[str, dict[WebSocket, Member]] = {c: {} for c in self.channels}
        self.http = httpx.AsyncClient(timeout=10)
        self.chat_limit = RateLimiter(5, 3)
        self.add_limit = RateLimiter(5, 60)
        self._timers: dict[str, asyncio.Task] = {}

    # ---------- plumbing ----------
    async def send(self, ws: WebSocket, msg: dict) -> None:
        try:
            await ws.send_json(msg)
        except Exception:
            pass

    async def broadcast(self, ch: Channel, msg: dict) -> None:
        await asyncio.gather(*(self.send(ws, msg) for ws in list(self.conns[ch.id])))

    def presence(self, ch: Channel) -> list[dict]:
        return [m.to_dict(muted=m.identity in ch.muted) for m in ch.members.values()]

    def counts(self) -> dict[str, int]:
        return {cid: len(ch.members) for cid, ch in self.channels.items()}

    def snapshot(self, ch: Channel) -> dict:
        return {
            "type": "snapshot", "chat": list(ch.chat),
            "queue": [q.to_dict() for q in ch.ordered_queue()],
            "player": ch.player.to_dict(), "presence": self.presence(ch),
            "skip_policy": self.settings.skip_policy, "server_now": now_ms(),
        }

    async def push_player(self, ch: Channel) -> None:
        await self.broadcast(ch, {"type": "player.state", **ch.player.to_dict(), "server_now": now_ms()})
        await self.broadcast(ch, {"type": "queue.updated", "queue": [q.to_dict() for q in ch.ordered_queue()]})
        self._reschedule(ch)

    async def say(self, ch: Channel, text: str, kind: str = "system", member: Member | None = None) -> None:
        msg = {"id": new_id("m"), "kind": kind, "text": text, "ts": now_ms(),
               "identity": member.identity if member else "", "name": member.name if member else "",
               "emoji": member.emoji if member else ""}
        ch.add_chat(msg)
        await self.broadcast(ch, {"type": "chat.message", "message": msg})

    # ---------- lifecycle ----------
    async def connect(self, ws: WebSocket, ch: Channel, member: Member) -> None:
        first = member.identity not in ch.members
        self.conns[ch.id][ws] = member
        ch.members.setdefault(member.identity, member)
        await self.send(ws, self.snapshot(ch))
        if first:
            await self.say(ch, f"{member.name} joined")
        await self.broadcast(ch, {"type": "presence.updated", "presence": self.presence(ch)})

    async def disconnect(self, ws: WebSocket, ch: Channel) -> None:
        member = self.conns[ch.id].pop(ws, None)
        if not member:
            return
        if not any(m.identity == member.identity for m in self.conns[ch.id].values()):
            ch.members.pop(member.identity, None)
            await self.say(ch, f"{member.name} left")
            await self.broadcast(ch, {"type": "presence.updated", "presence": self.presence(ch)})

    def authenticate(self, token: str) -> dict | None:
        try:
            return read_session(self.settings.session_secret, token)
        except SessionError:
            return None

    # ---------- admin ----------
    async def set_muted(self, ch: Channel, identity: str, muted: bool) -> None:
        (ch.muted.add if muted else ch.muted.discard)(identity)
        await livekit_admin.set_can_publish(self.settings, ch.id, identity, not muted)
        await self.broadcast(ch, {"type": "presence.updated", "presence": self.presence(ch)})

    async def kick(self, ch: Channel, identity: str) -> None:
        until = time.time() + KICK_SECONDS
        for c in self.channels.values():
            c.block(identity, until)
        try:
            await livekit_admin.remove_participant(self.settings, ch.id, identity)
        except Exception:
            pass  # not in the voice room; the block still applies
        for cid, conns in self.conns.items():
            for ws, m in list(conns.items()):
                if m.identity == identity:
                    await self.send(ws, {"type": "error", "code": "kicked", "message": "You were removed by an admin."})
                    try:
                        await ws.close(code=4003)
                    except Exception:
                        pass

    # ---------- player timers ----------
    def _reschedule(self, ch: Channel) -> None:
        t = self._timers.pop(ch.id, None)
        if t:
            t.cancel()
        p = ch.player
        if p.status != "playing" or p.item is None or p.item.duration_s <= 0:
            return
        remaining = p.item.duration_s * 1000 - p.position_at(now_ms()) + TIMER_GRACE_MS
        self._timers[ch.id] = asyncio.create_task(self._timer(ch, p.item.id, max(0, remaining) / 1000))

    async def _timer(self, ch: Channel, item_id: str, delay: float) -> None:
        await asyncio.sleep(delay)
        await self.track_ended(ch, item_id)

    async def track_ended(self, ch: Channel, item_id: str, notice: str | None = None) -> None:
        if ch.handle_ended(item_id, now_ms()):
            if notice:
                await self.say(ch, notice, "bot")
            await self.announce(ch)
            await self.push_player(ch)

    async def announce(self, ch: Channel) -> None:
        if ch.player.item:
            await self.say(ch, f"Now playing: {ch.player.item.title}")

    # ---------- message handling ----------
    async def handle(self, ws: WebSocket, ch: Channel, m: Member, data: dict) -> None:
        t = data.get("type")
        if t == "clock.ping":
            await self.send(ws, {"type": "clock.pong", "t": data.get("t"), "server_now": now_ms()})
        elif t == "chat.send":
            await self.on_chat(ws, ch, m, str(data.get("text", "")))
        elif t == "queue.add":
            await self.on_queue_add(ws, ch, m, data.get("video") or {})
        elif t == "queue.vote":
            if ch.toggle_vote(str(data.get("item_id")), m.identity):
                await self.broadcast(ch, {"type": "queue.updated", "queue": [q.to_dict() for q in ch.ordered_queue()]})
        elif t == "queue.remove":
            await self.remove_item(ws, ch, m, str(data.get("item_id")))
        elif t in ("player.pause", "player.resume", "player.seek"):
            if ch.player.item is None:
                return
            if t == "player.pause":
                ch.pause(now_ms())
            elif t == "player.resume":
                ch.resume(now_ms())
            else:
                ch.seek(int(data.get("position_ms", 0)), now_ms())
            await self.push_player(ch)
        elif t == "player.skip":
            await self.skip(ws, ch, m)
        elif t == "player.ended":
            await self.track_ended(ch, str(data.get("item_id")))
        elif t == "player.error":
            it = ch.player.item
            if it and it.id == str(data.get("item_id")):
                await self.track_ended(ch, it.id, f"“{it.title}” can’t be played in an embed. Skipping.")

    async def on_chat(self, ws, ch, m, text: str) -> None:
        text = text.strip()[:500]
        if not text:
            return
        if not self.chat_limit.allow(m.identity):
            await self.send(ws, {"type": "error", "code": "rate_limited", "message": "Slow down a little."})
            return
        await self.say(ch, text, "user", m)
        cmd = parse_command(text)
        if cmd:
            await self.run_command(ws, ch, m, cmd)

    async def run_command(self, ws, ch: Channel, m: Member, cmd) -> None:
        bot = lambda s: self.say(ch, s, "bot")  # noqa: E731
        n = cmd.name
        if n == "play":
            if not cmd.arg:
                await bot("Usage: !play <song name or YouTube link>")
                return
            await self.play_query(ws, ch, m, cmd.arg)
        elif n == "skip":
            await self.skip(ws, ch, m)
        elif n == "pause":
            ch.pause(now_ms())
            await self.push_player(ch)
        elif n == "resume":
            ch.resume(now_ms())
            await self.push_player(ch)
        elif n == "queue":
            q = ch.ordered_queue()
            if not q:
                await bot("The queue is empty. Add something with !play.")
            else:
                await bot("Up next: " + " | ".join(f"{i}. {x.title} ({len(x.votes)})" for i, x in enumerate(q[:5], 1)))
        elif n == "np":
            p = ch.player
            if p.item:
                await bot(f"Now playing: {p.item.title} — {fmt_dur(p.position_at(now_ms()))} / {fmt_dur(p.item.duration_s * 1000)}")
            else:
                await bot("Nothing is playing.")
        elif n == "remove":
            q = ch.ordered_queue()
            try:
                item = q[int(cmd.arg) - 1]
            except (ValueError, IndexError):
                await bot("Usage: !remove <number from !queue>")
                return
            await self.remove_item(ws, ch, m, item.id)
        elif n == "lyrics" and cmd.arg.lower() in ("on", "off"):
            await self.send(ws, {"type": "local", "action": "lyrics", "value": cmd.arg.lower() == "on"})
        elif n == "volume" and cmd.arg.isdigit() and 0 <= int(cmd.arg) <= 100:
            await self.send(ws, {"type": "local", "action": "volume", "value": int(cmd.arg)})
        else:
            await bot("Commands: !play !skip !pause !resume !queue !np !remove <n> !lyrics on|off !volume <0-100>")

    async def play_query(self, ws, ch, m, query: str) -> None:
        if not self.add_limit.allow(m.identity):
            await self.send(ws, {"type": "error", "code": "rate_limited", "message": "Too many songs added. Try again in a minute."})
            return
        if not self.settings.youtube_api_key:
            await self.say(ch, "Search isn’t set up on this server.", "bot")
            return
        try:
            results = await search_youtube(self.http, self.settings.youtube_api_key, query, limit=3)
        except httpx.HTTPError:
            await self.say(ch, "YouTube search failed. Try again in a moment.", "bot")
            return
        if not results:
            await self.say(ch, f"No playable results for “{query}”.", "bot")
            return
        await self.add_video(ch, m, results[0])

    async def add_video(self, ch: Channel, m: Member, v: dict) -> None:
        was_idle = ch.player.item is None
        item = QueueItem(id=new_id("q"), video_id=v["video_id"], title=v["title"],
                         channel_title=v["channel_title"], duration_s=int(v["duration_s"]),
                         thumbnail=v["thumbnail"], added_by=m.identity, added_at=time.time(),
                         added_by_name=m.name)
        ch.add_item(item, by=m.identity, now_ms=now_ms())
        await self.say(ch, f"{m.name} added {item.title}", "bot")
        if was_idle:
            await self.announce(ch)
        await self.push_player(ch)

    async def on_queue_add(self, ws, ch, m, v: dict) -> None:
        vid = str(v.get("video_id", ""))
        if not _VID.match(vid):
            return
        if not self.add_limit.allow(m.identity):
            await self.send(ws, {"type": "error", "code": "rate_limited", "message": "Too many songs added. Try again in a minute."})
            return
        try:
            dur = int(v.get("duration_s", 0))
        except (TypeError, ValueError):
            dur = 0
        await self.add_video(ch, m, {
            "video_id": vid, "title": str(v.get("title", ""))[:200] or "Untitled",
            "channel_title": str(v.get("channel_title", ""))[:100], "duration_s": max(0, dur),
            "thumbnail": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"})

    async def remove_item(self, ws, ch, m, item_id: str) -> None:
        it = ch.find(item_id)
        if not it:
            return
        if not can_remove(m.is_admin, m.identity, it.added_by):
            await self.send(ws, {"type": "error", "code": "forbidden", "message": "Only admins or the person who added it can remove this."})
            return
        ch.remove_item(item_id)
        await self.broadcast(ch, {"type": "queue.updated", "queue": [q.to_dict() for q in ch.ordered_queue()]})

    async def skip(self, ws, ch: Channel, m: Member) -> None:
        if ch.player.item is None:
            await self.say(ch, "Nothing is playing.", "bot")
            return
        ch.skip_votes.add(m.identity)
        if not can_skip(self.settings.skip_policy, m.is_admin, len(ch.skip_votes), len(ch.members)):
            msg = ("Only admins can skip." if self.settings.skip_policy == "admin"
                   else f"Skip needs a majority ({len(ch.skip_votes)}/{len(ch.members)}).")
            await self.say(ch, msg, "bot")
            return
        await self.say(ch, f"{m.name} skipped {ch.player.item.title}", "bot")
        ch.advance(now_ms())
        await self.announce(ch)
        await self.push_player(ch)

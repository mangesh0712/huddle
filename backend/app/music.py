import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse

import httpx

KNOWN = {"play", "skip", "pause", "resume", "queue", "np", "remove", "lyrics", "volume"}


@dataclass(frozen=True)
class Command:
    name: str
    arg: str


def parse_command(text: str) -> Command | None:
    t = text.strip()
    if not t.startswith("!") or len(t) < 2:
        return None
    head, _, arg = t[1:].partition(" ")
    name = head.lower()
    if name not in KNOWN:
        return Command("unknown", head)
    return Command(name, arg.strip())


def can_skip(policy: str, is_admin: bool, skip_votes: int, members: int) -> bool:
    if is_admin or policy == "anyone":
        return True
    if policy == "majority":
        return skip_votes * 2 > members
    return False


def can_remove(is_admin: bool, identity: str, added_by: str) -> bool:
    return is_admin or identity == added_by


_ID = re.compile(r"^[\w-]{11}$")


def extract_video_id(text: str) -> str | None:
    t = text.strip()
    if not t.startswith(("http://", "https://")):
        return None
    u = urlparse(t)
    host = (u.hostname or "").removeprefix("www.").removeprefix("m.")
    cand = None
    if host == "youtu.be":
        cand = u.path.lstrip("/").split("/")[0]
    elif host in ("youtube.com", "music.youtube.com"):
        if u.path == "/watch":
            cand = parse_qs(u.query).get("v", [None])[0]
        else:
            parts = [p for p in u.path.split("/") if p]
            if len(parts) >= 2 and parts[0] in ("shorts", "embed", "live"):
                cand = parts[1]
    return cand if cand and _ID.match(cand) else None


_ISO = re.compile(r"^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$")


def parse_iso_duration(s: str) -> int:
    m = _ISO.match(s or "")
    if not m:
        return 0
    d, h, mi, sec = (int(x or 0) for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + sec


YT = "https://www.googleapis.com/youtube/v3"


def _video(v: dict) -> dict:
    sn = v["snippet"]
    return {
        "video_id": v["id"],
        "title": sn["title"],
        "channel_title": sn["channelTitle"],
        "duration_s": parse_iso_duration(v.get("contentDetails", {}).get("duration", "")),
        "thumbnail": f"https://i.ytimg.com/vi/{v['id']}/hqdefault.jpg",
    }


async def fetch_videos(client: httpx.AsyncClient, key: str, ids: list[str]) -> list[dict]:
    if not ids:
        return []
    r = await client.get(f"{YT}/videos", params={
        "part": "snippet,contentDetails,status", "id": ",".join(ids), "key": key})
    r.raise_for_status()
    return [_video(v) for v in r.json().get("items", [])
            if v.get("status", {}).get("embeddable", True)]


async def search_youtube(client: httpx.AsyncClient, key: str, q: str, limit: int = 8) -> list[dict]:
    vid = extract_video_id(q)
    if vid:
        return await fetch_videos(client, key, [vid])
    r = await client.get(f"{YT}/search", params={
        "part": "snippet", "type": "video", "videoEmbeddable": "true",
        "maxResults": limit, "q": q, "key": key})
    r.raise_for_status()
    ids = [i["id"]["videoId"] for i in r.json().get("items", [])]
    return await fetch_videos(client, key, ids)

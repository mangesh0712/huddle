import re

import httpx

_NOISE = re.compile(
    r"[\(\[][^\)\]]*(official|lyric|audio|video|visuali[sz]er|hd|4k|remaster|feat|ft\.?|live|explicit)[^\)\]]*[\)\]]",
    re.I)
_FEAT = re.compile(r"\s+(ft\.?|feat\.?|featuring)\s.*$", re.I)
_TIME = re.compile(r"\[(\d+):(\d+(?:\.\d+)?)\]")


def _clean_artist(name: str) -> str:
    name = re.sub(r"\s*-\s*Topic$", "", name, flags=re.I)
    name = re.sub(r"\s*VEVO$", "", name, flags=re.I)
    return name.strip()


def clean_title(title: str, channel: str) -> tuple[str, str]:
    t = _NOISE.sub("", title)
    t = _FEAT.sub("", t).strip()
    artist = _clean_artist(channel)
    if " - " in t:
        a, _, t = t.partition(" - ")
        artist = a.strip() or artist
    return re.sub(r"\s{2,}", " ", t).strip(), artist


def parse_lrc(lrc: str) -> list[dict]:
    out: list[dict] = []
    for line in lrc.splitlines():
        stamps = list(_TIME.finditer(line))
        if not stamps or stamps[0].start() != 0:
            continue
        text = line[stamps[-1].end():].strip()
        for m in stamps:
            out.append({"t_ms": round((int(m.group(1)) * 60 + float(m.group(2))) * 1000), "text": text})
    return sorted(out, key=lambda x: x["t_ms"])


MIN_LINES = 4


def pick_synced(cands: list[dict], duration: int | None) -> str | None:
    """Best synced LRC among candidates: skips junk entries, prefers the closest duration."""
    good = [c for c in cands if len(parse_lrc(c.get("syncedLyrics") or "")) >= MIN_LINES]
    if not good:
        return None
    if duration:
        good.sort(key=lambda c: abs((c.get("duration") or 0) - duration))
    return good[0]["syncedLyrics"]


LRCLIB = "https://lrclib.net/api"
_cache: dict[tuple, dict] = {}


async def fetch_lyrics(client: httpx.AsyncClient, title: str, artist: str, duration: int | None) -> dict:
    key = (title.lower(), artist.lower())
    if key in _cache:
        return _cache[key]
    headers = {"User-Agent": "Huddle/1.0"}
    cands: list[dict] = []
    try:
        params = {"track_name": title, "artist_name": artist}
        if duration:
            params["duration"] = duration
        r = await client.get(f"{LRCLIB}/get", params=params, headers=headers)
        if r.status_code == 200:
            cands.append(r.json())
        r = await client.get(f"{LRCLIB}/search", params={"q": f"{artist} {title}".strip()}, headers=headers)
        if r.status_code == 200:
            cands.extend(r.json())
    except httpx.HTTPError:
        return {"found": False, "lines": []}  # transient: do not cache
    synced = pick_synced(cands, duration)
    lines = parse_lrc(synced) if synced else []
    res = {"found": bool(lines), "lines": lines, "title": title, "artist": artist}
    _cache[key] = res
    return res

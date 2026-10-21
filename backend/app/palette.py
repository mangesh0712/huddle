import colorsys
from io import BytesIO

import httpx
from colorthief import ColorThief

BASE = "#0e0f13"
_cache: dict[str, dict] = {}


def _lin(c: float) -> float:
    c /= 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def _lum(rgb: tuple[int, int, int]) -> float:
    r, g, b = rgb
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def _rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def contrast(a: str, b: str) -> float:
    la, lb = _lum(_rgb(a)), _lum(_rgb(b))
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def _hex(rgb) -> str:
    return "#%02x%02x%02x" % tuple(int(round(x)) for x in rgb)


def derive_palette(rgb: tuple[int, int, int]) -> dict:
    h, l, s = colorsys.rgb_to_hls(*(c / 255 for c in rgb))
    s = max(s, 0.45)
    l = max(l, 0.55)
    while True:
        accent = _hex(tuple(c * 255 for c in colorsys.hls_to_rgb(h, l, s)))
        if contrast(accent, BASE) >= 4.5 or l >= 0.98:
            break
        l += 0.02
    r, g, b = _rgb(accent)
    on_accent = BASE if contrast(accent, BASE) >= contrast(accent, "#ffffff") else "#ffffff"
    return {"accent": accent, "accent_soft": f"rgba({r},{g},{b},0.16)", "on_accent": on_accent}


async def palette_for(client: httpx.AsyncClient, video_id: str) -> dict:
    if video_id in _cache:
        return _cache[video_id]
    r = await client.get(f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg")
    r.raise_for_status()
    rgb = ColorThief(BytesIO(r.content)).get_color(quality=5)
    p = derive_palette(rgb)
    _cache[video_id] = p
    return p

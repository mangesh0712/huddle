from app.music import extract_video_id, parse_iso_duration
from app.palette import contrast, derive_palette
from app.rooms import RateLimiter


def test_extract_video_id():
    assert extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5") == "dQw4w9WgXcQ"
    assert extract_video_id("https://youtu.be/dQw4w9WgXcQ?si=x") == "dQw4w9WgXcQ"
    assert extract_video_id("https://music.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_video_id("https://www.youtube.com/shorts/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_video_id("never gonna give you up") is None


def test_iso_duration():
    assert parse_iso_duration("PT3M33S") == 213
    assert parse_iso_duration("PT1H2M3S") == 3723
    assert parse_iso_duration("PT45S") == 45
    assert parse_iso_duration("P0D") == 0


def test_rate_limiter():
    rl = RateLimiter(limit=3, window_s=10)
    assert all(rl.allow("a", now=t) for t in (0, 1, 2))
    assert not rl.allow("a", now=3)
    assert rl.allow("b", now=3)
    assert rl.allow("a", now=11)


def test_palette_clamps_for_contrast():
    base = "#0e0f13"
    for rgb in [(0, 0, 0), (10, 10, 40), (255, 255, 255), (120, 90, 255), (200, 30, 30)]:
        p = derive_palette(rgb)
        assert contrast(p["accent"], base) >= 4.5, rgb
        assert p["on_accent"] in ("#0e0f13", "#ffffff")
        assert p["accent_soft"].startswith("rgba(")

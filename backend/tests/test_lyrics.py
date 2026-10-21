from app.lyrics import clean_title, parse_lrc


def test_parse_lrc():
    lrc = "[ar:Someone]\n[00:12.50]Hello\n[01:02.5]World\n[00:05.123] \n[bad]x\n"
    assert parse_lrc(lrc) == [
        {"t_ms": 5123, "text": ""},
        {"t_ms": 12500, "text": "Hello"},
        {"t_ms": 62500, "text": "World"},
    ]


def test_parse_lrc_multi_timestamp_line():
    assert parse_lrc("[00:01.00][00:03.00]La") == [
        {"t_ms": 1000, "text": "La"}, {"t_ms": 3000, "text": "La"}]


def test_clean_title():
    assert clean_title("Rick Astley - Never Gonna Give You Up (Official Video)", "Rick Astley") == (
        "Never Gonna Give You Up", "Rick Astley")
    assert clean_title("Song [Lyrics] ft. Someone", "Artist - Topic") == ("Song", "Artist")
    assert clean_title("Song (feat. X) (Official Audio)", "ArtistVEVO") == ("Song", "Artist")
    assert clean_title("Plain", "Chan") == ("Plain", "Chan")


def test_pick_synced_skips_junk_and_prefers_duration():
    from app.lyrics import pick_synced
    junk = {"syncedLyrics": "[00:00.00]probe", "duration": 214}
    real_far = {"syncedLyrics": "\n".join(f"[00:{i:02d}.00]l{i}" for i in range(10)), "duration": 300}
    real_near = {"syncedLyrics": "\n".join(f"[00:{i:02d}.00]n{i}" for i in range(10)), "duration": 215}
    assert pick_synced([junk, real_far, real_near], 214) == real_near["syncedLyrics"]
    assert pick_synced([junk], 214) is None
    assert pick_synced([real_far], None) == real_far["syncedLyrics"]

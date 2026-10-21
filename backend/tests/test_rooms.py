from app.rooms import Channel, QueueItem


def item(i, vid="v", added_at=0.0):
    return QueueItem(id=f"q{i}", video_id=vid + str(i), title=f"T{i}", channel_title="C",
                     duration_s=100, thumbnail="", added_by="a", added_at=added_at)


def test_queue_orders_by_votes_then_time():
    ch = Channel(id="lounge", name="Lounge")
    a, b, c = item(1, added_at=1), item(2, added_at=2), item(3, added_at=3)
    for x in (a, b, c):
        ch.queue.append(x)
    ch.toggle_vote("q3", "u1")
    ch.toggle_vote("q3", "u2")
    ch.toggle_vote("q2", "u1")
    assert [q.id for q in ch.ordered_queue()] == ["q3", "q2", "q1"]


def test_vote_toggle():
    ch = Channel(id="l", name="L")
    ch.queue.append(item(1))
    ch.toggle_vote("q1", "u")
    assert "u" in ch.queue[0].votes
    ch.toggle_vote("q1", "u")
    assert "u" not in ch.queue[0].votes


def test_add_auto_votes_and_starts_playing():
    ch = Channel(id="l", name="L")
    it = ch.add_item(item(1), by="u1", now_ms=1000)
    assert ch.player.item is it and ch.player.status == "playing"
    assert ch.queue == []  # playing item leaves the queue
    it2 = ch.add_item(item(2), by="u1", now_ms=1000)
    assert "u1" in it2.votes and ch.queue == [it2]


def test_advance_picks_top_voted_and_idles_when_empty():
    ch = Channel(id="l", name="L")
    ch.add_item(item(1), by="u", now_ms=0)
    ch.add_item(item(2, added_at=2), by="u", now_ms=0)
    ch.add_item(item(3, added_at=3), by="u", now_ms=0)
    ch.toggle_vote("q3", "x")
    ch.advance(now_ms=5000)
    assert ch.player.item.id == "q3"
    ch.advance(now_ms=6000)
    ch.advance(now_ms=7000)
    assert ch.player.item is None and ch.player.status == "idle"


def test_ended_for_stale_item_is_ignored():
    ch = Channel(id="l", name="L")
    ch.add_item(item(1), by="u", now_ms=0)
    ch.add_item(item(2), by="u", now_ms=0)
    assert ch.handle_ended("q-other", now_ms=1) is False
    assert ch.player.item.id == "q1"
    assert ch.handle_ended("q1", now_ms=1) is True
    assert ch.player.item.id == "q2"


def test_position_math():
    ch = Channel(id="l", name="L")
    ch.add_item(item(1), by="u", now_ms=1000)
    assert ch.player.position_at(1000) == 0
    assert ch.player.position_at(4500) == 3500
    ch.pause(now_ms=4500)
    assert ch.player.position_at(9000) == 3500
    ch.resume(now_ms=9000)
    assert ch.player.position_at(10000) == 4500
    ch.seek(20000, now_ms=10000)
    assert ch.player.position_at(10500) == 20500


def test_kick_block_expires():
    ch = Channel(id="l", name="L")
    ch.block("u", until=100.0)
    assert ch.is_blocked("u", now=50.0)
    assert not ch.is_blocked("u", now=150.0)


def test_chat_keeps_last_200():
    ch = Channel(id="l", name="L")
    for i in range(250):
        ch.add_chat({"text": str(i)})
    assert len(ch.chat) == 200 and ch.chat[0]["text"] == "50"


def test_remove_item():
    ch = Channel(id="l", name="L")
    ch.queue.append(item(1))
    assert ch.remove_item("q1") is True
    assert ch.remove_item("q1") is False

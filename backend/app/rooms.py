import itertools
import time
from collections import deque
from dataclasses import dataclass, field

_ids = itertools.count(1)


def new_id(prefix: str) -> str:
    return f"{prefix}{next(_ids)}"


@dataclass
class QueueItem:
    id: str
    video_id: str
    title: str
    channel_title: str
    duration_s: int
    thumbnail: str
    added_by: str
    added_at: float
    votes: set = field(default_factory=set)
    added_by_name: str = ""

    def to_dict(self) -> dict:
        return {
            "id": self.id, "video_id": self.video_id, "title": self.title,
            "channel_title": self.channel_title, "duration_s": self.duration_s,
            "thumbnail": self.thumbnail, "added_by": self.added_by,
            "added_by_name": self.added_by_name, "votes": sorted(self.votes),
        }


@dataclass
class PlayerState:
    item: QueueItem | None = None
    status: str = "idle"  # playing | paused | idle
    position_ms: int = 0
    updated_at_ms: int = 0

    def position_at(self, now_ms: int) -> int:
        if self.status == "playing":
            return self.position_ms + max(0, now_ms - self.updated_at_ms)
        return self.position_ms

    def to_dict(self) -> dict:
        return {
            "item": self.item.to_dict() if self.item else None,
            "status": self.status, "position_ms": self.position_ms,
            "updated_at_ms": self.updated_at_ms,
        }


@dataclass
class Member:
    identity: str
    name: str
    emoji: str
    is_admin: bool
    connected_at: float = field(default_factory=time.time)

    def to_dict(self, muted: bool = False) -> dict:
        return {"identity": self.identity, "name": self.name, "emoji": self.emoji,
                "is_admin": self.is_admin, "muted": muted}


class RateLimiter:
    def __init__(self, limit: int, window_s: float):
        self.limit, self.window_s = limit, window_s
        self._hits: dict[str, deque] = {}

    def allow(self, key: str, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        q = self._hits.setdefault(key, deque())
        while q and q[0] <= now - self.window_s:
            q.popleft()
        if len(q) >= self.limit:
            return False
        q.append(now)
        return True


class Channel:
    def __init__(self, id: str, name: str):
        self.id, self.name = id, name
        self.chat: deque = deque(maxlen=200)
        self.queue: list[QueueItem] = []
        self.player = PlayerState()
        self.members: dict[str, Member] = {}
        self.muted: set[str] = set()
        self.skip_votes: set[str] = set()
        self._blocked: dict[str, float] = {}

    # --- queue ---
    def ordered_queue(self) -> list[QueueItem]:
        return sorted(self.queue, key=lambda q: (-len(q.votes), q.added_at))

    def find(self, item_id: str) -> QueueItem | None:
        return next((q for q in self.queue if q.id == item_id), None)

    def toggle_vote(self, item_id: str, identity: str) -> bool:
        it = self.find(item_id)
        if not it:
            return False
        it.votes.symmetric_difference_update({identity})
        return True

    def add_item(self, item: QueueItem, by: str, now_ms: int) -> QueueItem:
        item.votes.add(by)
        if self.player.item is None:
            self._play(item, now_ms)
        else:
            self.queue.append(item)
        return item

    def remove_item(self, item_id: str) -> bool:
        it = self.find(item_id)
        if not it:
            return False
        self.queue.remove(it)
        return True

    # --- player ---
    def _play(self, item: QueueItem, now_ms: int) -> None:
        self.player = PlayerState(item=item, status="playing", position_ms=0, updated_at_ms=now_ms)
        self.skip_votes = set()

    def advance(self, now_ms: int) -> None:
        nxt = self.ordered_queue()
        if nxt:
            self.queue.remove(nxt[0])
            self._play(nxt[0], now_ms)
        else:
            self.player = PlayerState(status="idle", updated_at_ms=now_ms)
            self.skip_votes = set()

    def handle_ended(self, item_id: str, now_ms: int) -> bool:
        if self.player.item is None or self.player.item.id != item_id:
            return False
        self.advance(now_ms)
        return True

    def pause(self, now_ms: int) -> None:
        p = self.player
        if p.status == "playing":
            p.position_ms = p.position_at(now_ms)
            p.status, p.updated_at_ms = "paused", now_ms

    def resume(self, now_ms: int) -> None:
        p = self.player
        if p.status == "paused":
            p.status, p.updated_at_ms = "playing", now_ms

    def seek(self, position_ms: int, now_ms: int) -> None:
        if self.player.item is not None:
            self.player.position_ms = max(0, position_ms)
            self.player.updated_at_ms = now_ms

    # --- chat / moderation ---
    def add_chat(self, msg: dict) -> dict:
        self.chat.append(msg)
        return msg

    def block(self, identity: str, until: float) -> None:
        self._blocked[identity] = until

    def is_blocked(self, identity: str, now: float | None = None) -> bool:
        now = time.time() if now is None else now
        return self._blocked.get(identity, 0) > now

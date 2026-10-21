# Huddle: Product Requirements Document

Working name: **Huddle** (rename freely). A private, zero-signup hangout web app for 2-5 close friends: voice chat, synced music, text chat, synced lyrics. Everything must run on free tiers.

---

## 1. Goals

- Friends join with one invite link, no signup, no login.
- Voice chat with good quality and admin-enforced mute/kick.
- Music plays in sync for everyone, with a voted queue and chat commands.
- Beautiful dark UI that tints itself from the current song's poster.
- Total running cost: $0.

## 2. Non-goals (v1)

- User accounts, profiles, passwords, OAuth.
- Database, persistent chat history, file uploads.
- Public rooms, discovery, more than ~5 people per channel.
- Ripping or re-streaming YouTube audio through our server (ToS risk).
- AI voice cloning ("sounds like Drake"). Voice FX presets only.
- Native mobile apps. Responsive web + PWA only.

## 3. Key decisions (already made)

| Area | Decision |
|---|---|
| Auth | None. One shared **invite key** gets you in. One separate **admin key** makes you admin. |
| Rooms | Fixed channels defined in config (default: Lounge, Chill, Gaming). Each has voice + chat + music. |
| Voice | LiveKit (Cloud free tier "Build" first, self-host later if needed). |
| Music | YouTube IFrame embed, synced across clients. |
| Lyrics | LRCLIB (free, no key, synced LRC format). |
| Backend | Python 3.12 + FastAPI. |
| Frontend | React + Vite + TypeScript + Tailwind. |
| State | In-memory on the server. No database. |

## 4. Tech stack

**Backend (Python)**
- `fastapi`, `uvicorn[standard]` (HTTP + WebSocket)
- `livekit-api` (token minting + RoomService mute/kick)
- `httpx` (YouTube Data API, LRCLIB)
- `pillow` + `colorthief` (poster dominant color, server-side)
- `itsdangerous` (signed session tokens)
- `pydantic-settings` (env config)
- `pytest`, `pytest-asyncio`

**Frontend**
- React 18, Vite, TypeScript, Tailwind CSS, Framer Motion
- `livekit-client` (voice), `zustand` (state)
- YouTube IFrame Player API (loaded via script tag)
- `tone` (Tone.js, for voice FX)

**Repo layout (monorepo)**
```
huddle/
  backend/   app/ (main.py, config.py, rooms.py, ws.py, music.py, lyrics.py, livekit_admin.py), tests/
  frontend/  src/ (components, hooks, store, lib)
  Dockerfile        # builds frontend, serves it from FastAPI
  render.yaml       # Render blueprint
  .env.example
  README.md
```

## 5. Architecture

- Browser connects to FastAPI over HTTPS for REST and one WebSocket per channel (chat, queue, player state, presence).
- Browser connects to LiveKit directly for voice (WebRTC). Backend only mints tokens and enforces admin actions.
- Music audio never touches our server. Every browser plays the same YouTube video; the server only broadcasts player state.
- Production: FastAPI also serves the built React app, so there is a **single deployable service**.

## 6. Join flow and access

1. Invite link: `https://<host>/join/<INVITE_KEY>`. Opening it stores the key in localStorage and shows the name screen.
2. Name screen: display name + emoji/avatar color. Saved in localStorage. A random `identity` (UUID) is generated once and saved.
3. Admin: opening `https://<host>/admin/<ADMIN_KEY>` (or pasting it in Settings) stores the admin key in localStorage.
4. `POST /api/join` with `{invite_key, admin_key?, identity, name, emoji, channel}`. Server checks keys with constant-time compare, returns `{session, livekit_token, livekit_url, is_admin, channels}`.
5. No valid invite key means a plain "Ask your friend for an invite link" page. The channel list is never public.
6. Session token is signed (itsdangerous), contains identity, name, is_admin, and expires in 24h.

## 7. Features (v1) and acceptance criteria

### 7.1 Voice
- Join/leave voice in a channel; switching channels moves you.
- Mic mute/unmute, deafen, push-to-talk option (hold a key).
- Speaking indicator (accent-colored glow ring) driven by LiveKit active speaker events.
- Per-friend volume slider (0-200%, via GainNode), saved locally.
- Echo cancellation, noise suppression, auto gain on.
- Auto-disconnect after 10 min of total silence from everyone (protects free-tier minutes), with a "still here?" prompt at 9 min.
- **Done when:** two browsers can talk in both directions and mute/volume work.

### 7.2 Admin controls
- Admin sees mute / unmute / kick buttons on every other participant.
- **Hard mute:** server calls LiveKit `update_participant` to set `can_publish=false` (unmute sets it back to true). Non-admins cannot bypass it.
- **Kick:** server calls `remove_participant` and the kicked identity is blocked from rejoining for 10 minutes.
- Non-admins never see these buttons and the endpoints reject them (403).
- **Done when:** a non-admin tab cannot unmute itself after an admin mute, even via dev tools.

### 7.3 Chat
- Per-channel text chat over WebSocket; last 200 messages kept in memory (lost on restart, acceptable).
- Messages show avatar emoji, name, time. System messages for join/leave/song changes.
- Messages beginning with `!` are commands (see 7.5), shown inline with the bot reply.
- Basic URL auto-linking. Text only. Escape everything (no HTML injection).

### 7.4 Music player and sync
- Search YouTube from the app (Queue panel search box) and via `!play <query>`.
- Server holds per-channel `PlayerState { item, status, position_ms, updated_at_ms }`.
- Clients compute expected position = `position_ms + (server_now - updated_at_ms)` while playing, using a server clock offset measured on connect (ping/pong).
- Client seeks only if drift exceeds **1.5s**. Pause/seek/skip broadcast to all.
- Late joiners receive a snapshot and jump to the correct position.
- Server advances the queue on track end (client `ended` event, with a duration-based server timer as fallback).
- Embedded videos that fail (error 101/150) are skipped with a chat notice.
- **Done when:** three browsers play within ~1.5s of each other and a late joiner syncs.

### 7.5 Voted queue and commands
- Any member can add songs. Adding auto-votes for it. Each identity gets one vote per item (toggle).
- Order: votes descending, then added time ascending. Currently playing item is excluded from voting.
- Skip: any member can skip (configurable `SKIP_POLICY=anyone|admin|majority`, default `anyone`).
- Commands: `!play <query or YouTube URL>`, `!skip`, `!pause`, `!resume`, `!queue`, `!np`, `!remove <n>` (admin or adder), `!lyrics on|off`, `!volume <0-100>` (local to the sender).
- Parsing and permission checks live server-side in `music.py`; `!volume` and `!lyrics` are echoed to the client as local actions.

### 7.6 Now-playing strip and poster
- Slim strip at the top of the chat column: small poster (48px, rounded), title, artist/channel, progress bar, play/pause, skip, lyrics toggle, music volume slider.
- Poster = YouTube thumbnail (`i.ytimg.com/vi/<id>/hqdefault.jpg`).
- **Poster-tinted UI:** backend endpoint `/api/palette?video_id=` downloads the thumbnail, extracts the dominant color (colorthief) and returns `{accent, accent_soft, on_accent}`. Done server-side because `i.ytimg.com` has no CORS headers, so a browser canvas would be tainted. Results cached in memory.
- Frontend sets CSS variables `--accent`, `--accent-soft` with a 600ms transition. Clamp lightness so text contrast stays above WCAG AA on the dark base.

### 7.7 Auto-duck
- When any participant (including you) is speaking, music volume drops to **35%** of the user's music slider. Attack 150ms, release 600ms.
- Implemented with `player.setVolume()` (the YouTube iframe cannot be routed through Web Audio).
- Toggle and duck level in Settings. Default on.

### 7.8 Volume controls
- Music slider (strip + Settings) and per-friend sliders (voice list). Local only, saved in localStorage.

### 7.9 Synced lyrics
- Right-hand slide-in panel next to chat, toggled by the lyrics icon in the strip or `!lyrics`.
- Backend `GET /api/lyrics?title=&artist=&duration=` proxies LRCLIB (`/api/get`, fallback `/api/search`), parses LRC into `[{t_ms, text}]`, caches results.
- Title cleaning before lookup: strip `(Official Video)`, `[Lyrics]`, `ft.`/`feat.` blocks, "- Topic", etc.
- Current line is large and glowing in accent; previous/next lines faded; smooth auto-scroll tied to the synced player position.
- Controls: timing nudge (-/+ 0.5s, saved per song locally), "wrong lyrics?" button that lets the user type a manual `title - artist` search.
- Empty state: "No synced lyrics found for this track."
- Per-user toggle saved in localStorage (one friend can have lyrics on while another doesn't).

### 7.10 Voice FX
- Presets: Off, Deep, Chipmunk, Robot, Echo, Radio. Free, in-browser, no server.
- Web Audio graph: mic stream to Tone.js effect chain to `MediaStreamDestination`, published to LiveKit as the local audio track.
- Switching preset swaps the chain live without reconnecting. Show a "use headphones" hint.

## 8. UI specification

**Style:** dark only. Base `#0e0f13`, surface `#16181d`, border `#23262d`. Accent comes from the poster (default accent `#7c5cff` when nothing is playing). Font: Inter. Rounded 12-16px, soft shadows, subtle blur on panels, Framer Motion for panel slides and speaking glow.

**Desktop layout (3 zones)**
```
+------------+--------------------------------------+------------------+
| Sidebar    | [ Now playing strip                ] | Right panel      |
| 260px      |--------------------------------------| 340px, slide-in  |
| Channels   |                                      | Tabs:            |
|  # Lounge  |   Chat messages                      |  Player card     |
|  # Chill   |   (commands + bot replies inline)    |  Lyrics | Queue  |
|  # Gaming  |                                      |                  |
| ---------- |                                      |                  |
| Voice list |                                      |                  |
|  avatar +  |--------------------------------------|                  |
|  name,     |  [ message input ........ ] [send]   |                  |
|  glow,     +--------------------------------------+                  |
|  volume    |                                      |                  |
| ---------- |                                      |                  |
| You: mic,  |                                      |                  |
| deafen, FX,|                                      |                  |
| settings   |                                      |                  |
+------------+--------------------------------------+------------------+
```

- **Sidebar:** channel list with occupant counts; the active channel's voice participants beneath (emoji avatar, name, speaking glow, muted icon, per-person volume on hover/click, admin crown, admin mute/kick menu). Bottom user bar: mic, deafen, voice FX menu, settings.
- **Center:** now-playing strip on top, chat below, input pinned at the bottom with command hint chips (`!play`, `!skip`, `!queue`).
- **Right panel:** collapsed by default. Contains the **YouTube player card** at the top (kept at least 200x200 per YouTube's embed policy; collapsible, but never unmounted so audio keeps playing), then tabs **Lyrics | Queue**. Queue tab: search box, results, queue list with upvote buttons, vote counts, remove (admin/adder).
- **Mobile (<768px):** bottom tab bar (Voice, Chat, Queue). Lyrics open as a full-screen overlay. Strip stays pinned above the tab bar. The player card is mounted once and repositioned with CSS, never remounted.
- **States to design:** no invite key, name screen, connecting, mic permission denied, kicked, muted-by-admin banner, song unavailable, no lyrics, empty queue, reconnecting.
- **Accessibility:** keyboard navigable, visible focus rings, `aria-live` for chat, respect `prefers-reduced-motion`.

## 9. Backend API

REST (all except `/healthz` and `/api/join` need `Authorization: Bearer <session>`):

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | Uptime pings |
| POST | `/api/join` | Validate keys, return session + LiveKit token |
| GET | `/api/channels` | Channels + occupant counts |
| GET | `/api/search?q=` | YouTube search (id, title, channel, duration, thumbnail) |
| GET | `/api/lyrics?title=&artist=&duration=` | Parsed synced lyrics |
| GET | `/api/palette?video_id=` | Poster accent colors |
| POST | `/api/channels/{id}/mute` | Admin: `{identity, muted}` |
| POST | `/api/channels/{id}/kick` | Admin: `{identity}` |

WebSocket: `/ws/{channel_id}?session=<token>`

- Client to server: `chat.send {text}`, `queue.add {video}`, `queue.vote {item_id}`, `queue.remove {item_id}`, `player.pause`, `player.resume`, `player.seek {position_ms}`, `player.skip`, `player.ended {item_id}`, `clock.ping {t}`.
- Server to client: `snapshot {chat, queue, player, presence}`, `chat.message`, `queue.updated`, `player.state`, `presence.updated`, `clock.pong {t, server_now}`, `error {code, message}`.
- Rate limits: chat 5 msgs/3s, queue.add 5/min per identity.

## 10. Data model (in-memory, per channel)

```
Channel { id, name, slug, chat: deque[200], queue: [QueueItem], player: PlayerState, members: {identity: Member} }
QueueItem { id, video_id, title, channel_title, duration_s, thumbnail, added_by, added_at, votes: set[identity] }
PlayerState { item | None, status: playing|paused|idle, position_ms, updated_at_ms }
Member { identity, name, emoji, is_admin, connected_at }
```

## 11. Configuration and secrets

`.env.example` (never commit real values):

```
APP_NAME=Huddle
INVITE_KEY=            # random; generate with secrets.token_urlsafe(16)
ADMIN_KEY=             # random, different from INVITE_KEY
SESSION_SECRET=        # random, 32+ bytes
CHANNELS=Lounge,Chill,Gaming
LIVEKIT_URL=wss://<project>.livekit.cloud
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
YOUTUBE_API_KEY=
SKIP_POLICY=anyone
ALLOWED_ORIGINS=https://<your-host>
```

## 12. Hosting (all free)

- **LiveKit Cloud "Build" plan:** voice. Free quota is about 5,000 participant-minutes/month and 50 GB bandwidth (verify in the dashboard under Settings -> Project). Two friends is roughly 41 hours/month, three is roughly 27 hours.
- **Render free web service:** runs the single FastAPI + static frontend container. Gives HTTPS (required for the mic) and a free `*.onrender.com` URL. Note: free services sleep after ~15 min idle (about 1 min cold start). Mitigate with a free UptimeRobot ping to `/healthz` every 5 min.
- **Later option:** Oracle Cloud always-free VM running docker-compose (Caddy + FastAPI + self-hosted `livekit-server`) to remove the minute cap and the sleep. Out of scope for v1, but keep config environment-driven so the move is easy.
- No database, no paid add-ons.

## 13. What the owner must provide (Claude cannot do these)

1. An empty GitHub repo and permission to push.
2. **LiveKit Cloud account:** create a project, copy `LIVEKIT_URL`, API key, API secret.
3. **YouTube Data API v3 key:** Google Cloud Console, enable "YouTube Data API v3", create an API key, restrict it to that API. Free quota is 10,000 units/day; a search costs 100, so about 100 searches/day, plenty for friends.
4. **Render account**, connected to the GitHub repo (deploy from `render.yaml`).
5. Paste secrets into local `.env` and the Render dashboard's environment variables.
6. Optionally: UptimeRobot monitor on `/healthz`.

**Claude should generate itself:** `INVITE_KEY`, `ADMIN_KEY`, `SESSION_SECRET` (print once for the owner to save), Dockerfile, `render.yaml`, `.env.example`, README with a deploy checklist, and the invite/admin link formats.

## 14. Build order (milestones)

1. **M0 Scaffold:** monorepo, FastAPI health route, Vite app, Dockerfile serving the build, lint/test setup.
2. **M1 Join + voice:** invite/admin keys, session token, LiveKit token, join/leave voice, speaking glow, mic controls.
3. **M2 Chat + presence:** WebSocket channel, chat, join/leave system messages.
4. **M3 Music core:** YouTube search, queue, voting, synced player, commands, track-end handling.
5. **M4 Now-playing + tint:** strip, `/api/palette`, CSS variable theming.
6. **M5 Lyrics:** LRCLIB proxy, parser, panel, nudge, toggle.
7. **M6 Admin:** hard mute (`can_publish`), kick, kick cooldown, banners.
8. **M7 Audio polish:** auto-duck, per-friend/music sliders, silence auto-disconnect, voice FX.
9. **M8 Polish:** mobile layout, PWA manifest, empty/error states, reduced motion.
10. **M9 Deploy:** push, connect Render, set env vars, smoke test with two real devices, write the final README.

## 15. Testing

- `pytest`: queue ordering/voting, command parsing and permissions, sync position math, LRC parser, title cleaner, session/admin checks.
- Manual two-browser (plus one phone) test script in the README: voice both ways, admin mute can't be bypassed, late joiner sync, lyrics toggle, auto-duck.

## 16. Known limits and risks

- **Phones:** YouTube embeds pause when the screen locks, and iOS Safari suspends mic/audio in the background. Documented limitation. Android Chrome behaves better. A Capacitor wrapper is a future option.
- **YouTube policy:** keep the official embed visible (200x200 minimum) and do not proxy or download audio. Some videos disallow embedding; skip gracefully. Embeds may show ads.
- **Free tier sleep:** Render cold starts drop chat/queue state (in-memory). Acceptable for v1; SQLite or Upstash Redis free tier is the upgrade path.
- **Echo:** speakers plus mic cause echo; recommend headphones.
- **LRCLIB matching:** YouTube titles are messy, so some tracks will have no match; the manual search covers it.
- **Security basics:** constant-time key checks, signed sessions, strict CORS, input escaping, rate limits, secrets only in env vars.

## 17. Open questions

- Final app name and default channel names.
- Is losing chat/queue when the server sleeps or redeploys acceptable? (Default: yes.)
- Should skip be open to everyone or admin-only? (Default: everyone.)
- Should the accent tint also color the chat background subtly, or only accents and glows? (Default: accents and glows plus a faint background gradient.)

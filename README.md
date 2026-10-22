# Huddle

A private hangout for 2-5 friends: voice, synced music, chat and synced lyrics. No accounts, no database, free tiers only.

- **Backend:** FastAPI (REST + one WebSocket per channel), in-memory state.
- **Frontend:** React, Vite, TypeScript, Tailwind. Built and served by FastAPI, so there is one deployable service.
- **Voice:** LiveKit Cloud. **Music:** YouTube embed. **Lyrics:** LRCLIB.

## Run locally

```bash
cp .env.example .env        # fill in the values
cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements-dev.txt
cd ../frontend && npm ci && npm run build
cd ../backend && uvicorn app.main:app --port 8000
```

Open `http://localhost:8000/join/<INVITE_KEY>`. For hot reload run `npm run dev` in `frontend/` (proxies to port 8000).

## Tests

```bash
cd backend && HUDDLE_NO_AUTOAPP=1 pytest      # queue, commands, sync math, lyrics, auth, WebSocket, admin
cd frontend && npm test                       # sync, lyrics line, duck, silence, linkify, reducer, storage
```

## Deploy (Render, free)

1. Push this repo to GitHub and connect it on Render ("New > Blueprint", it reads `render.yaml`).
2. Set the secret env vars from `.env.example` in the Render dashboard.
3. Optional: an UptimeRobot monitor on `/healthz` every 5 minutes keeps the free service awake.

Links to share: invite `https://<host>/join/<INVITE_KEY>`, admin `https://<host>/admin/<ADMIN_KEY>` (open once in the admin's browser).

## Manual test script (two browsers plus a phone)

1. Open the invite link in two browsers with different names, click **Join voice** in both: you can hear each other, mic and volume sliders work.
2. Admin (open the admin link first) mutes the other person: they cannot unmute, even via dev tools. Kick: they are removed and blocked for 10 minutes.
3. `!play <song>` in one browser: it plays in both within about 1.5 seconds. A third browser joining late jumps to the right position.
4. Vote in the queue: higher votes play first. `!skip` skips.
5. Lyrics toggle on one browser only; the nudge buttons shift timing. Speaking lowers the music (auto-duck).

## Karaoke

Channels listed in `KARAOKE_CHANNELS` (default `Karaoke`) never lower the music while people sing, and open the lyrics panel automatically. Auto-tune is on by default for anyone speaking in voice there (it snaps your pitch to the nearest note); pick another effect or "Normal voice" in the effects menu, or untick it in Settings, to turn it off. Add the name to `CHANNELS` too.

## Known limits

Music is audio-only in the UI: the YouTube embed runs off-screen at the lowest quality (YouTube cannot serve audio alone). Phones pause YouTube embeds when the screen locks. Free Render services sleep after 15 idle minutes and chat/queue state resets on restart. Use headphones to avoid echo.

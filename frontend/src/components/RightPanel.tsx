import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { currentLineIndex } from '../lib/lyrics'
import { playerRef } from '../lib/playerRef'
import { SyncedPlayer } from '../lib/yt'
import { useStore } from '../store/useStore'
import type { Video } from '../types'
import { usePosition } from '../hooks/useRoomEffects'
import { Icon } from './Icon'

/** Audio-only experience: the YouTube embed stays mounted (so the music never restarts) but off-screen, at the lowest quality. */
export function HiddenPlayer() {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = document.createElement('div')
    host.current!.appendChild(el)
    const p = new SyncedPlayer({
      onEnded: (id) => useStore.getState().send({ type: 'player.ended', item_id: id }),
      onError: (id, code) => useStore.getState().send({ type: 'player.error', item_id: id, code }),
      onBlocked: (b) => useStore.setState({ needsTap: b }),
    })
    playerRef.current = p
    void p.mount(el)
    const unsub = useStore.subscribe((s, prev) => {
      if (s.player !== prev.player || s.clockOffset !== prev.clockOffset) p.apply(s.player, s.clockOffset)
    })
    p.apply(useStore.getState().player, useStore.getState().clockOffset)
    return () => {
      unsub()
      p.destroy()
      playerRef.current = null
    }
  }, [])
  return <div ref={host} aria-hidden="true" className="pointer-events-none fixed top-0 -left-[1000px] h-[200px] w-[200px] [&>iframe]:size-full" />
}

export function Lyrics({ fullscreen = false }: { fullscreen?: boolean }) {
  const { player, lyrics, session, settings, setSetting, patch } = useStore()
  const it = player.item
  const pos = usePosition(150)
  const [manual, setManual] = useState(false)
  const [q, setQ] = useState('')
  const entry = it ? lyrics[it.video_id] : undefined
  const nudge = it ? (settings.nudges[it.video_id] ?? 0) : 0
  const lines = entry && entry !== 'loading' ? entry.lines : []
  const idx = currentLineIndex(lines, pos, nudge)
  const active = useRef<HTMLParagraphElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scroller.current
    const line = active.current
    if (el && line) el.scrollTo({ top: line.offsetTop - el.clientHeight / 2 + line.clientHeight / 2, behavior: 'smooth' })
  }, [idx, it?.video_id])
  const bump = (d: number) => it && setSetting('nudges', { ...settings.nudges, [it.video_id]: nudge + d })
  const search = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!it) return
    const [title, ...rest] = q.split(' - ')
    const r = await api.lyrics(session, title.trim(), rest.join(' - ').trim(), it.duration_s, true).catch(() => ({ found: false, lines: [] }))
    patch({ lyrics: { ...useStore.getState().lyrics, [it.video_id]: r } })
    setManual(false)
  }
  return (
    <div className={`flex min-h-0 flex-1 flex-col ${fullscreen ? 'h-full' : ''}`}>
      <div ref={scroller} className="relative scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 py-[30%] text-center">
        {!it && <p className="text-muted">Lyrics show up here once a song is playing.</p>}
        {it && entry === 'loading' && <p role="status" className="text-muted">Finding lyrics…</p>}
        {it && entry && entry !== 'loading' && !entry.found && <p className="text-muted">No synced lyrics found for this track.</p>}
        {lines.map((l, i) => (
          <p key={i} ref={i === idx ? active : undefined} aria-current={i === idx ? 'true' : undefined}
            className={`lyric-line my-3 leading-tight font-extrabold tracking-tight ${i === idx ? 'text-accent' : 'text-ink'}`}
            style={{
              fontSize: i === idx ? '1.75rem' : '1.25rem',
              opacity: i === idx ? 1 : Math.abs(i - idx) === 1 ? 0.45 : 0.22,
              textShadow: i === idx ? '0 0 28px var(--accent)' : 'none',
            }}>
            {l.text || '♪'}
          </p>
        ))}
      </div>
      {it && (
        <div className="border-t border-line px-4 py-3">
          {manual ? (
            <form onSubmit={search} className="flex gap-2">
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Song title - artist" aria-label="Lyrics search"
                className="min-w-0 flex-1 rounded-xl border border-line bg-base px-3 py-2 text-sm outline-none focus:border-accent" />
              <button className="rounded-xl bg-accent px-3 text-sm font-semibold text-on-accent">Search</button>
            </form>
          ) : (
            <div className="flex items-center justify-between text-sm">
              <button onClick={() => setManual(true)} className="text-muted hover:text-ink">Wrong lyrics?</button>
              <div className="flex items-center gap-1" role="group" aria-label="Lyrics timing">
                <button onClick={() => bump(-500)} aria-label="Show lyrics 0.5 seconds later" className="grid size-8 place-items-center rounded-lg hover:bg-raised">−</button>
                <span className="w-14 text-center text-muted tabular-nums">{nudge >= 0 ? '+' : '−'}{Math.abs(nudge / 1000).toFixed(1)}s</span>
                <button onClick={() => bump(500)} aria-label="Show lyrics 0.5 seconds earlier" className="grid size-8 place-items-center rounded-lg hover:bg-raised">+</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Queue() {
  const { queue, identity, isAdmin, session, send } = useStore()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Video[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const search = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!q.trim()) return
    setBusy(true)
    setErr('')
    try {
      setResults(await api.search(session, q.trim()))
    } catch {
      setErr('Search isn’t working right now. You can paste a YouTube link instead.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-4 pb-6">
      <form onSubmit={search} className="sticky top-0 z-10 bg-surface pt-1 pb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search YouTube or paste a link" aria-label="Search songs"
          className="w-full rounded-xl border border-line bg-base px-3.5 py-2.5 text-sm outline-none focus:border-accent" />
      </form>
      {busy && <p role="status" className="py-2 text-sm text-muted">Searching…</p>}
      {err && <p role="alert" className="py-2 text-sm text-danger">{err}</p>}
      {results && (
        <div className="mb-5">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted">Results</h3>
            <button onClick={() => setResults(null)} className="text-xs text-muted hover:text-ink">Clear</button>
          </div>
          {results.length === 0 && <p className="py-2 text-sm text-muted">Nothing playable found. Try different words.</p>}
          <ul>
            {results.map((v) => (
              <li key={v.video_id} className="flex items-center gap-3 py-1.5">
                <img src={v.thumbnail} alt="" className="h-10 w-[72px] rounded-lg object-cover" />
                <div className="min-w-0 flex-1"><p className="truncate text-sm">{v.title}</p><p className="truncate text-xs text-muted">{v.channel_title}</p></div>
                <button onClick={() => { send({ type: 'queue.add', video: v }); setResults(null); setQ('') }} aria-label={`Add ${v.title} to queue`}
                  className="grid size-8 place-items-center rounded-lg bg-accent text-on-accent"><Icon name="plus" size={16} /></button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <h3 className="mb-1 text-sm font-medium text-muted">Up next</h3>
      {queue.length === 0 && <p className="py-3 text-sm text-muted">The queue is empty. Search above or type !play in chat.</p>}
      <ul>
        {queue.map((it) => {
          const voted = it.votes.includes(identity)
          return (
            <li key={it.id} className="flex items-center gap-3 py-1.5">
              <img src={it.thumbnail} alt="" className="h-10 w-[72px] rounded-lg object-cover" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm">{it.title}</p><p className="truncate text-xs text-muted">Added by {it.added_by_name}</p></div>
              <button onClick={() => send({ type: 'queue.vote', item_id: it.id })} aria-pressed={voted} aria-label={`Vote for ${it.title}`}
                className={`flex h-8 items-center gap-1 rounded-lg px-2 text-sm tabular-nums ${voted ? 'bg-accent-soft text-accent' : 'bg-raised text-muted'}`}>
                <Icon name="up" size={12} filled={voted} />{it.votes.length}
              </button>
              {(isAdmin || it.added_by === identity) && (
                <button onClick={() => send({ type: 'queue.remove', item_id: it.id })} aria-label={`Remove ${it.title}`} className="grid size-8 place-items-center rounded-lg text-muted hover:text-danger">
                  <Icon name="x" size={16} />
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function RightPanel() {
  const { rightTab, patch } = useStore()
  const tabs = [['queue', 'Queue'], ['lyrics', 'Lyrics']] as const
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-surface md:w-[340px]">
      <div role="tablist" className="mx-4 mt-4 mb-2 flex gap-1 rounded-xl bg-base p-1">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={rightTab === id} onClick={() => patch({ rightTab: id })}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${rightTab === id ? 'bg-raised text-ink' : 'text-muted hover:text-ink'}`}>{label}</button>
        ))}
      </div>
      {rightTab === 'queue' ? <Queue /> : <Lyrics />}
    </div>
  )
}

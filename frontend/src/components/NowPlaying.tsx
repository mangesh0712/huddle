import { mmss } from '../lib/format'
import { useStore } from '../store/useStore'
import { usePosition } from '../hooks/useRoomEffects'
import { Icon } from './Icon'

export function NowPlaying({ compact = false }: { compact?: boolean }) {
  const { player, send, settings, setSetting, rightOpen, patch } = useStore()
  const pos = usePosition()
  const it = player.item
  if (!it) {
    return (
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="grid size-12 place-items-center rounded-xl bg-raised text-muted"><Icon name="queue" /></div>
        <p className="flex-1 text-sm text-muted">Nothing playing yet.</p>
        <button onClick={() => patch({ rightOpen: true, rightTab: 'queue', mobileTab: 'queue' })}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-on-accent">Add a song</button>
      </div>
    )
  }
  const dur = it.duration_s * 1000
  const playing = player.status === 'playing'
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button onClick={() => patch({ rightOpen: !rightOpen })} aria-label="Toggle player panel" className="shrink-0">
        <img src={it.thumbnail} alt="" className="size-12 rounded-[10px] object-cover" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" title={it.title}>{it.title}</p>
        <p className="truncate text-xs text-muted">{it.channel_title}</p>
        <div className="mt-1.5 flex min-w-0 items-center gap-2">
          <span className="w-9 shrink-0 text-right text-[11px] text-muted tabular-nums">{mmss(pos)}</span>
          <input type="range" min={0} max={Math.max(dur, 1)} value={Math.min(pos, dur)} aria-label="Seek"
            onChange={(e) => send({ type: 'player.seek', position_ms: Number(e.target.value) })}
            className="range h-1 min-w-0 flex-1" style={{ background: `linear-gradient(to right, var(--accent) ${dur ? (Math.min(pos, dur) / dur) * 100 : 0}%, var(--color-line) 0)` }} />
          <span className="w-9 shrink-0 text-[11px] text-muted tabular-nums">{mmss(dur)}</span>
        </div>
      </div>
      <button onClick={() => send({ type: playing ? 'player.pause' : 'player.resume' })} aria-label={playing ? 'Pause' : 'Play'}
        className="grid size-10 place-items-center rounded-full bg-accent text-on-accent"><Icon name={playing ? 'pause' : 'play'} filled size={18} /></button>
      <button onClick={() => send({ type: 'player.skip' })} aria-label="Skip" className="grid size-9 place-items-center rounded-xl hover:bg-raised"><Icon name="skip" size={18} /></button>
      <button onClick={() => patch(window.matchMedia('(max-width: 767px)').matches ? { lyricsOverlay: true } : { rightOpen: true, rightTab: 'lyrics' })}
        aria-label="Show lyrics" className="grid size-9 place-items-center rounded-xl hover:bg-raised"><Icon name="lyrics" size={18} /></button>
      {!compact && (
        <label className="hidden items-center gap-1.5 lg:flex">
          <Icon name="volume" size={16} className="text-muted" />
          <input type="range" min={0} max={100} value={settings.musicVolume} aria-label="Music volume" className="range w-20"
            onChange={(e) => setSetting('musicVolume', Number(e.target.value))} />
        </label>
      )}
    </div>
  )
}

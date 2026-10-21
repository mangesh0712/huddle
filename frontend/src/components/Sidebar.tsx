import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { joinVoice, leaveVoice, setDeafened, setFriendVolume, setMic } from '../lib/voice'
import { applyFx } from '../lib/voice'
import { useStore, type FxPreset } from '../store/useStore'
import type { Member } from '../types'
import { Avatar } from './Avatar'
import { Icon } from './Icon'

function PersonMenu({ m, channel }: { m: Member; channel: string }) {
  const session = useStore((s) => s.session)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const run = (p: Promise<unknown>) => p.catch(() => useStore.setState({ toast: 'That didn’t go through. Try again.' })).finally(() => setOpen(false))
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-label={`Admin actions for ${m.name}`} aria-expanded={open}
        className="grid size-7 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ink">
        <Icon name="more" size={18} />
      </button>
      {open && (
        <div role="menu" className="absolute top-8 right-0 z-30 w-44 rounded-xl bg-raised p-1 shadow-xl shadow-black/50">
          <button role="menuitem" onClick={() => run(api.mute(session, channel, m.identity, !m.muted))}
            className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-line">
            {m.muted ? 'Let them speak' : 'Mute for everyone'}
          </button>
          <button role="menuitem" onClick={() => run(api.kick(session, channel, m.identity))}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-line">
            Remove from room
          </button>
        </div>
      )}
    </div>
  )
}

function Person({ m }: { m: Member }) {
  const { identity: me, isAdmin, voicePeople, voice, channel, settings } = useStore()
  const v = voicePeople.find((p) => p.identity === m.identity)
  const [open, setOpen] = useState(false)
  const self = m.identity === me
  const vol = settings.friendVolumes[m.identity] ?? 100
  return (
    <li className="group rounded-xl px-2 py-1.5 hover:bg-raised/60">
      <div className="flex items-center gap-2.5">
        <Avatar identity={m.identity} emoji={m.emoji} size={32} speaking={Boolean(v?.speaking)} />
        <button
          className="min-w-0 flex-1 truncate text-left text-sm font-medium disabled:cursor-default"
          disabled={self || voice !== 'on'} onClick={() => setOpen(!open)}
          aria-label={self || voice !== 'on' ? undefined : `Volume for ${m.name}`}
        >
          {m.name}{self && <span className="text-muted"> (you)</span>}
        </button>
        {m.is_admin && <Icon name="crown" size={14} className="text-accent" />}
        {(m.muted || v?.micMuted) && <Icon name="micOff" size={15} className={m.muted ? 'text-danger' : 'text-muted'} />}
        {isAdmin && !self && <PersonMenu m={m} channel={channel} />}
      </div>
      {open && !self && (
        <div className="mt-2 flex items-center gap-2 pl-[42px]">
          <input type="range" min={0} max={200} value={vol} aria-label={`${m.name} volume`} className="range w-full"
            onChange={(e) => setFriendVolume(m.identity, Number(e.target.value))} />
          <span className="w-10 text-right text-xs text-muted tabular-nums">{vol}%</span>
        </div>
      )}
    </li>
  )
}

const FX: { id: FxPreset; label: string }[] = [
  { id: 'off', label: 'Normal voice' }, { id: 'deep', label: 'Deep' }, { id: 'chipmunk', label: 'Chipmunk' },
  { id: 'robot', label: 'Robot' }, { id: 'echo', label: 'Echo' }, { id: 'radio', label: 'Radio' },
]

function FxMenu() {
  const fx = useStore((s) => s.settings.fx)
  const setSetting = useStore((s) => s.setSetting)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <IconBtn label="Voice effects" onClick={() => setOpen(!open)} active={fx !== 'off'} expanded={open}><Icon name="wand" /></IconBtn>
      {open && (
        <div role="menu" className="absolute bottom-12 left-0 z-30 w-52 rounded-2xl bg-raised p-1.5 shadow-xl shadow-black/50">
          {FX.map((f) => (
            <button key={f.id} role="menuitemradio" aria-checked={fx === f.id}
              onClick={() => { setSetting('fx', f.id); void applyFx(f.id) }}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-line ${fx === f.id ? 'text-accent' : ''}`}>
              {f.label}{fx === f.id && <span aria-hidden="true">●</span>}
            </button>
          ))}
          <p className="px-3 pt-2 pb-1 text-xs text-muted">Use headphones with effects to avoid echo.</p>
        </div>
      )}
    </div>
  )
}

export function IconBtn({ label, onClick, active, danger, expanded, children }: {
  label: string; onClick: () => void; active?: boolean; danger?: boolean; expanded?: boolean; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} aria-label={label} title={label} aria-pressed={active} aria-expanded={expanded}
      className={`grid size-10 place-items-center rounded-xl transition-colors ${danger ? 'bg-danger/15 text-danger' : active ? 'bg-accent-soft text-accent' : 'text-ink/80 hover:bg-raised'}`}>
      {children}
    </button>
  )
}

export function Sidebar() {
  const s = useStore()
  const { channels, channel, presence, voice, micOn, deafened, name, emoji, identity, mutedByAdmin } = s
  const voicePeople = s.voicePeople
  const sorted = [...presence].sort((a, b) => Number(voicePeople.some((p) => p.identity === b.identity)) - Number(voicePeople.some((p) => p.identity === a.identity)))
  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-surface">
      <div className="px-5 pt-5 pb-3">
        <h1 className="text-lg font-bold tracking-tight">{s.appName}</h1>
      </div>
      <nav aria-label="Channels" className="px-3">
        <ul className="space-y-0.5">
          {channels.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => c.id !== channel && (s.switchChannel(c.id), voice === 'on' && void joinVoice(c.id))}
                aria-current={c.id === channel ? 'page' : undefined}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[15px] transition-colors ${c.id === channel ? 'bg-accent-soft font-semibold text-accent' : 'text-ink/80 hover:bg-raised/70'}`}
              >
                <Icon name="hash" size={16} />
                <span className="flex-1 truncate">{c.name}</span>
                {c.karaoke && <Icon name="mic" size={14} className="opacity-70" />}
                {c.count > 0 && <span className="text-xs text-muted tabular-nums">{c.count}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-label="People in this channel" className="scroll-quiet mt-4 min-h-0 flex-1 overflow-y-auto px-3">
        <div className="flex items-center justify-between px-2 pb-1.5">
          <h2 className="text-sm font-medium text-muted">In this channel</h2>
        </div>
        <ul>{sorted.map((m) => <Person key={m.identity} m={m} />)}</ul>
        {presence.length === 0 && <p className="px-2 text-sm text-muted">Just you for now. Send the invite link to a friend.</p>}
      </section>

      <div className="space-y-3 border-t border-line p-3">
        {voice === 'off' || voice === 'error' ? (
          <button onClick={() => void joinVoice(channel)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 font-semibold text-on-accent">
            <Icon name="voice" size={18} /> Join voice
          </button>
        ) : voice === 'connecting' ? (
          <p role="status" className="px-1 py-2 text-center text-sm text-muted">Connecting voice…</p>
        ) : (
          <button onClick={() => void leaveVoice()} className="w-full rounded-xl bg-raised px-4 py-2.5 text-sm font-medium hover:bg-line">
            Leave voice
          </button>
        )}
        {voice === 'error' && <p role="alert" className="px-1 text-sm text-danger">Voice couldn’t connect. Try again.</p>}
        <div className="flex items-center gap-2">
          <Avatar identity={identity} emoji={emoji} size={36} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
          <IconBtn label={micOn ? 'Mute microphone' : 'Unmute microphone'} danger={voice === 'on' && !micOn} onClick={() => voice === 'on' && !mutedByAdmin && void setMic(!micOn)}>
            <Icon name={micOn ? 'mic' : 'micOff'} />
          </IconBtn>
          <IconBtn label={deafened ? 'Undeafen' : 'Deafen'} active={deafened} onClick={() => void setDeafened(!deafened)}>
            <Icon name={deafened ? 'headphonesOff' : 'headphones'} />
          </IconBtn>
          <FxMenu />
          <IconBtn label="Settings" onClick={() => s.patch({ settingsOpen: true })}><Icon name="settings" /></IconBtn>
        </div>
      </div>
    </aside>
  )
}

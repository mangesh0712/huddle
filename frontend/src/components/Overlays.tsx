import { useEffect, useState } from 'react'
import { ApiError } from '../lib/api'
import { setMic } from '../lib/voice'
import { useStore } from '../store/useStore'
import { Icon } from './Icon'
import { Lyrics } from './RightPanel'

export function Banners({ resetSilence }: { resetSilence: () => void }) {
  const { conn, mutedByAdmin, voice, stillHere, toast, clearToast } = useStore()
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(clearToast, 4500)
    return () => clearTimeout(t)
  }, [toast, clearToast])
  const Bar = ({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warn' }) => (
    <div role="status" className={`flex items-center justify-center gap-3 px-4 py-2 text-sm ${tone === 'warn' ? 'bg-danger/15 text-danger' : 'bg-raised text-ink'}`}>{children}</div>
  )
  return (
    <>
      {conn === 'reconnecting' && <Bar>Reconnecting to the room…</Bar>}
      {mutedByAdmin && <Bar tone="warn"><Icon name="micOff" size={16} />An admin muted you. You can listen but not speak.</Bar>}
      {voice === 'denied' && (
        <Bar tone="warn">
          Microphone blocked. Allow it in your browser’s site settings, then
          <button onClick={() => void setMic(true)} className="font-semibold underline">try again</button>.
        </Bar>
      )}
      {stillHere && (
        <Bar>Still there? You’ll leave voice soon to save time.
          <button onClick={resetSilence} className="rounded-lg bg-accent px-3 py-1 font-semibold text-on-accent">I’m here</button>
        </Bar>
      )}
      {toast && (
        <div role="alert" className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-raised px-4 py-2.5 text-sm shadow-xl shadow-black/50 md:bottom-8">{toast}</div>
      )}
    </>
  )
}

export function LyricsOverlay() {
  const open = useStore((s) => s.lyricsOverlay)
  const patch = useStore((s) => s.patch)
  if (!open) return null
  return (
    <div role="dialog" aria-label="Lyrics" className="room-glow fixed inset-0 z-40 flex flex-col bg-base md:hidden">
      <button onClick={() => patch({ lyricsOverlay: false })} aria-label="Close lyrics" className="absolute top-3 right-3 z-10 grid size-10 place-items-center rounded-full bg-raised">
        <Icon name="x" />
      </button>
      <Lyrics fullscreen />
    </div>
  )
}

export function SettingsModal() {
  const { settingsOpen, patch, settings, setSetting, inviteKey, adminKey, setAdminKey, isAdmin, join } = useStore()
  const [key, setKey] = useState('')
  const [copied, setCopied] = useState(false)
  if (!settingsOpen) return null
  const link = `${location.origin}/join/${inviteKey}`
  const close = () => patch({ settingsOpen: false })
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-label="Settings" aria-modal="true" className="scroll-quiet max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl shadow-black/60">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight">Settings</h2>
          <button onClick={close} aria-label="Close settings" className="grid size-9 place-items-center rounded-xl hover:bg-raised"><Icon name="x" /></button>
        </div>

        <div className="space-y-6">
          <section>
            <h3 className="mb-2 text-sm font-medium text-muted">Music</h3>
            <label className="flex items-center gap-3 text-sm">Volume
              <input type="range" min={0} max={100} value={settings.musicVolume} className="range flex-1" onChange={(e) => setSetting('musicVolume', Number(e.target.value))} />
              <span className="w-9 text-right tabular-nums">{settings.musicVolume}</span>
            </label>
            <label className="mt-4 flex items-center justify-between text-sm">Lower the music when someone talks
              <input type="checkbox" checked={settings.duckOn} onChange={(e) => setSetting('duckOn', e.target.checked)} className="size-5 accent-[var(--accent)]" />
            </label>
            <label className="mt-3 flex items-center gap-3 text-sm">Talking level
              <input type="range" min={10} max={80} value={Math.round(settings.duckLevel * 100)} disabled={!settings.duckOn} className="range flex-1" onChange={(e) => setSetting('duckLevel', Number(e.target.value) / 100)} />
              <span className="w-9 text-right tabular-nums">{Math.round(settings.duckLevel * 100)}%</span>
            </label>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-medium text-muted">Voice</h3>
            <label className="flex items-center justify-between text-sm">Push to talk
              <input type="checkbox" checked={settings.pttOn} onChange={(e) => setSetting('pttOn', e.target.checked)} className="size-5 accent-[var(--accent)]" />
            </label>
            {settings.pttOn && (
              <p className="mt-2 text-sm text-muted">Hold <kbd className="rounded-md bg-raised px-1.5 py-0.5 text-ink">{settings.pttCode.replace('Key', '')}</kbd> to talk.
                <button className="ml-2 underline" onClick={() => {
                  const h = (e: KeyboardEvent) => { e.preventDefault(); setSetting('pttCode', e.code); window.removeEventListener('keydown', h, true) }
                  window.addEventListener('keydown', h, true)
                }}>Change key</button>
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-medium text-muted">Invite friends</h3>
            <div className="flex gap-2">
              <input readOnly value={link} aria-label="Invite link" className="min-w-0 flex-1 rounded-xl border border-line bg-base px-3 py-2 text-sm" onFocus={(e) => e.currentTarget.select()} />
              <button onClick={() => navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) })}
                className="rounded-xl bg-accent px-3 text-sm font-semibold text-on-accent">{copied ? 'Copied' : 'Copy'}</button>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-medium text-muted">Admin</h3>
            {isAdmin ? <p className="text-sm">You’re an admin. You can mute or remove people from the sidebar.</p> : (
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (key.trim()) { setAdminKey(key.trim()); void join(); close() } }}>
                <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste admin key" type="password" aria-label="Admin key"
                  className="min-w-0 flex-1 rounded-xl border border-line bg-base px-3 py-2 text-sm outline-none focus:border-accent" />
                <button className="rounded-xl bg-raised px-3 text-sm font-semibold">Unlock</button>
              </form>
            )}
            {adminKey && !isAdmin && <p className="mt-2 text-sm text-danger">That admin key didn’t work.</p>}
          </section>
        </div>
      </div>
    </div>
  )
}

export const apiErrorMessage = (e: unknown) => (e instanceof ApiError ? e.code : 'error')

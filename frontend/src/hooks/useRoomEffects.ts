import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { duckActive, stepDuck } from '../lib/duck'
import { playerRef } from '../lib/playerRef'
import { expectedPosition, serverNow } from '../lib/sync'
import { silenceState } from '../lib/silence'
import { inVoice, leaveVoice, refreshFx, setMic } from '../lib/voice'
import { DEFAULT_ACCENT, useStore } from '../store/useStore'

const root = document.documentElement

/** Playback position in ms, derived from server state and the clock offset. */
export function usePosition(intervalMs = 250) {
  const player = useStore((s) => s.player)
  const offset = useStore((s) => s.clockOffset)
  const calc = () => expectedPosition(player, serverNow(Date.now(), offset))
  const [pos, setPos] = useState(calc)
  useEffect(() => {
    setPos(calc())
    if (player.status !== 'playing') return
    const t = setInterval(() => setPos(calc()), intervalMs)
    return () => clearInterval(t)
  }, [player, offset, intervalMs]) // eslint-disable-line react-hooks/exhaustive-deps
  return pos
}

/** Tints the UI from the current poster; falls back to the default accent. */
export function useAccent() {
  const videoId = useStore((s) => s.player.item?.video_id)
  const session = useStore((s) => s.session)
  useEffect(() => {
    let live = true
    const set = (p = DEFAULT_ACCENT) => {
      root.style.setProperty('--accent', p.accent)
      root.style.setProperty('--accent-soft', p.accent_soft)
      root.style.setProperty('--on-accent', p.on_accent)
      useStore.setState({ accent: p })
    }
    if (!videoId) set()
    else api.palette(session, videoId).then((p) => live && set(p)).catch(() => live && set())
    return () => {
      live = false
    }
  }, [videoId, session])
}

/** Loads synced lyrics for the current track (cached per video). */
export function useLyricsLoader() {
  const item = useStore((s) => s.player.item)
  const session = useStore((s) => s.session)
  useEffect(() => {
    if (!item || useStore.getState().lyrics[item.video_id]) return
    const id = item.video_id
    useStore.setState((s) => ({ lyrics: { ...s.lyrics, [id]: 'loading' } }))
    api
      .lyrics(session, item.title, item.channel_title, item.duration_s)
      .then((r) => useStore.setState((s) => ({ lyrics: { ...s.lyrics, [id]: r } })))
      .catch(() => useStore.setState((s) => ({ lyrics: { ...s.lyrics, [id]: { found: false, lines: [] } } })))
  }, [item?.video_id, session]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** Drives the YouTube volume: the user's slider, ducked while anyone speaks. */
export function useDuck() {
  const gain = useRef(1)
  useEffect(() => {
    let last = performance.now()
    const t = setInterval(() => {
      const now = performance.now()
      const { settings, voicePeople, channels, channel } = useStore.getState()
      const karaoke = channels.find((c) => c.id === channel)?.karaoke ?? false
      const speaking = voicePeople.some((p) => p.speaking)
      const target = duckActive(settings.duckOn, karaoke) && speaking ? settings.duckLevel : 1
      gain.current = stepDuck(gain.current, target, now - last, 150, 600)
      last = now
      playerRef.current?.setVolume(settings.musicVolume * gain.current)
    }, 50)
    return () => clearInterval(t)
  }, [])
}

/** Hold-to-talk: the mic is live only while the key is held. */
export function usePushToTalk() {
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)
    const down = (e: KeyboardEvent) => {
      const { settings, voice, mutedByAdmin } = useStore.getState()
      if (!settings.pttOn || voice !== 'on' || mutedByAdmin || e.repeat || isTyping(e) || e.code !== settings.pttCode) return
      void setMic(true)
    }
    const up = (e: KeyboardEvent) => {
      const { settings, voice } = useStore.getState()
      if (settings.pttOn && voice === 'on' && e.code === settings.pttCode) void setMic(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])
}

/** Protects free-tier minutes: asks at 9 minutes of silence, leaves voice at 10. */
export function useSilenceWatchdog() {
  const last = useRef(Date.now())
  const speaking = useStore((s) => s.voicePeople.some((p) => p.speaking))
  const voice = useStore((s) => s.voice)
  useEffect(() => {
    if (speaking || voice === 'on') {
      if (speaking) {
        last.current = Date.now()
        useStore.setState({ stillHere: false })
      }
    }
  }, [speaking, voice])
  useEffect(() => {
    if (voice !== 'on') return
    last.current = Date.now()
    const t = setInterval(() => {
      if (!inVoice()) return
      const s = silenceState(last.current, Date.now())
      if (s === 'warn') useStore.setState({ stillHere: true })
      if (s === 'drop') {
        useStore.setState({ stillHere: false, toast: 'You were disconnected from voice after 10 quiet minutes.' })
        void leaveVoice()
      }
    }, 5000)
    return () => clearInterval(t)
  }, [voice])
  return () => {
    last.current = Date.now()
    useStore.setState({ stillHere: false })
  }
}

/** Keeps the mic effect in step with the channel, the effect menu and the auto-tune setting. */
export function useVoiceFx() {
  const fx = useStore((s) => s.settings.fx)
  const autotune = useStore((s) => s.settings.autotune)
  const karaoke = useStore((s) => s.channels.find((c) => c.id === s.channel)?.karaoke ?? false)
  const micOn = useStore((s) => s.micOn)
  useEffect(() => {
    if (micOn) void refreshFx()
  }, [fx, autotune, karaoke, micOn])
}

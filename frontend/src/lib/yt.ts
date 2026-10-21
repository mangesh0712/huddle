import { expectedPosition, needsSeek, serverNow } from './sync'
import type { PlayerState } from '../types'

declare global {
  interface Window {
    YT?: any
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiReady: Promise<void> | null = null
function loadApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve()
  apiReady ??= new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = () => resolve()
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(s)
  })
  return apiReady
}

const YT_PLAYING = 1
const YT_BUFFERING = 3

export interface SyncHandlers {
  onEnded: (itemId: string) => void
  onError: (itemId: string, code: number) => void
  onBlocked: (blocked: boolean) => void
}

/** Wraps one YouTube iframe and keeps it aligned with the server's player state. */
export class SyncedPlayer {
  private yt: any = null
  private loadedId: string | null = null
  private itemId: string | null = null
  private last: { p: PlayerState; offset: number } | null = null
  private tick?: ReturnType<typeof setInterval>

  constructor(private h: SyncHandlers) {}

  async mount(el: HTMLElement) {
    await loadApi()
    this.yt = new window.YT.Player(el, {
      width: '100%',
      height: '100%',
      playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, modestbranding: 1, fs: 0, iv_load_policy: 3 },
      events: {
        onReady: () => this.last && this.apply(this.last.p, this.last.offset),
        onStateChange: (e: any) => {
          if (e.data === 0 && this.itemId) this.h.onEnded(this.itemId)
          if (e.data === YT_PLAYING) this.h.onBlocked(false)
        },
        onError: (e: any) => this.itemId && this.h.onError(this.itemId, e.data),
        onAutoplayBlocked: () => this.h.onBlocked(true),
      },
    })
    this.tick = setInterval(() => this.last && this.apply(this.last.p, this.last.offset), 2000)
  }

  destroy() {
    clearInterval(this.tick)
    this.yt?.destroy?.()
  }

  setVolume(v: number) {
    this.yt?.setVolume?.(Math.round(Math.max(0, Math.min(100, v))))
  }

  /** Called on every state change and every 2s to correct drift. */
  apply(p: PlayerState, offset: number) {
    this.last = { p, offset }
    const yt = this.yt
    if (!yt?.loadVideoById) return
    this.itemId = p.item?.id ?? null
    if (!p.item || p.status === 'idle') {
      if (this.loadedId) yt.stopVideo()
      this.loadedId = null
      return
    }
    const expected = expectedPosition(p, serverNow(Date.now(), offset))
    if (this.loadedId !== p.item.id) {
      this.loadedId = p.item.id
      const args = { videoId: p.item.video_id, startSeconds: expected / 1000 }
      if (p.status === 'playing') {
        yt.loadVideoById(args)
        // Browsers can silently refuse to start sound; offer a tap if nothing is playing shortly after.
        setTimeout(() => {
          const st = this.yt?.getPlayerState?.()
          if (this.loadedId === p.item?.id && st !== YT_PLAYING && st !== YT_BUFFERING && this.last?.p.status === 'playing') this.h.onBlocked(true)
        }, 3500)
      } else yt.cueVideoById(args)
      return
    }
    const state = yt.getPlayerState?.()
    const actual = (yt.getCurrentTime?.() ?? 0) * 1000
    if (p.status === 'playing') {
      if (state !== YT_PLAYING && state !== YT_BUFFERING) yt.playVideo()
      if (needsSeek(expected, actual)) yt.seekTo(expected / 1000, true)
    } else {
      if (state === YT_PLAYING) yt.pauseVideo()
      if (Math.abs(expected - actual) > 400) yt.seekTo(expected / 1000, true)
    }
  }

  resumeFromGesture() {
    this.yt?.playVideo?.()
    this.h.onBlocked(false)
  }
}

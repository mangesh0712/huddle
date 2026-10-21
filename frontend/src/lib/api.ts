import type { ChannelInfo, Palette, Video } from '../types'
import type { LyricLine } from './lyrics'

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code)
  }
}

async function req<T>(path: string, token?: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body ? 'POST' : 'GET'),
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  })
  if (!res.ok) {
    let code = res.statusText
    try {
      code = (await res.json()).detail ?? code
    } catch {
      /* non-json error */
    }
    throw new ApiError(res.status, String(code))
  }
  return res.json() as Promise<T>
}

export interface JoinResult {
  session: string
  livekit_token: string
  livekit_url: string
  is_admin: boolean
  channels: ChannelInfo[]
  app_name: string
}

export const api = {
  join: (b: { invite_key: string; admin_key?: string; identity: string; name: string; emoji: string; channel?: string }) =>
    req<JoinResult>('/api/join', undefined, { body: b }),
  voiceToken: (t: string, channel: string) =>
    req<{ livekit_token: string; livekit_url: string }>('/api/voice-token', t, { body: { channel } }),
  channels: (t: string) => req<ChannelInfo[]>('/api/channels', t),
  search: (t: string, q: string) => req<Video[]>(`/api/search?q=${encodeURIComponent(q)}`, t),
  lyrics: (t: string, title: string, artist: string, duration: number, raw = false) =>
    req<{ found: boolean; lines: LyricLine[] }>(
      `/api/lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&duration=${duration}${raw ? '&raw=true' : ''}`,
      t,
    ),
  palette: (t: string, id: string) => req<Palette>(`/api/palette?video_id=${id}`, t),
  mute: (t: string, channel: string, identity: string, muted: boolean) =>
    req<{ ok: boolean }>(`/api/channels/${channel}/mute`, t, { body: { identity, muted } }),
  kick: (t: string, channel: string, identity: string) =>
    req<{ ok: boolean }>(`/api/channels/${channel}/kick`, t, { body: { identity } }),
}

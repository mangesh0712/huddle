import { create } from 'zustand'
import { api, ApiError } from '../lib/api'
import { load, save, getIdentity } from '../lib/storage'
import { RoomSocket, type ConnStatus } from '../lib/socket'
import { emptyRoom, reduceServer, type RoomState } from './room'
import type { ChannelInfo, ClientMsg, Palette } from '../types'
import type { LyricLine } from '../lib/lyrics'

export type FxPreset = 'off' | 'deep' | 'chipmunk' | 'robot' | 'echo' | 'radio'
export type AuthStatus = 'boot' | 'noinvite' | 'needname' | 'joining' | 'ready' | 'error' | 'kicked'
export type VoiceStatus = 'off' | 'connecting' | 'on' | 'denied' | 'error'

export interface VoicePerson {
  identity: string
  name: string
  speaking: boolean
  micMuted: boolean
  canPublish: boolean
}

export interface Settings {
  musicVolume: number
  duckOn: boolean
  duckLevel: number
  friendVolumes: Record<string, number>
  pttOn: boolean
  pttCode: string
  fx: FxPreset
  nudges: Record<string, number>
  lyricsOn: boolean
}

export const DEFAULT_ACCENT: Palette = { accent: '#7c5cff', accent_soft: 'rgba(124,92,255,0.16)', on_accent: '#ffffff' }

const defaultSettings: Settings = {
  musicVolume: 70, duckOn: true, duckLevel: 0.35, friendVolumes: {}, pttOn: false, pttCode: 'KeyV',
  fx: 'off', nudges: {}, lyricsOn: true,
}

interface AppState extends RoomState {
  authStatus: AuthStatus
  authError: string
  inviteKey: string
  adminKey: string
  name: string
  emoji: string
  identity: string
  session: string
  isAdmin: boolean
  appName: string
  channels: ChannelInfo[]
  channel: string
  conn: ConnStatus
  clockOffset: number

  settings: Settings
  rightOpen: boolean
  rightTab: 'lyrics' | 'queue'
  mobileTab: 'voice' | 'chat' | 'queue'
  lyricsOverlay: boolean
  settingsOpen: boolean
  needsTap: boolean
  accent: Palette
  lyrics: Record<string, { found: boolean; lines: LyricLine[] } | 'loading'>

  voice: VoiceStatus
  micOn: boolean
  deafened: boolean
  voicePeople: VoicePerson[]
  stillHere: boolean

  boot: () => void
  setInvite: (key: string) => void
  setAdminKey: (key: string) => void
  saveProfile: (name: string, emoji: string) => void
  join: () => Promise<void>
  switchChannel: (id: string) => void
  send: (m: ClientMsg) => void
  patch: (p: Partial<AppState>) => void
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void
  clearToast: () => void
}

let socket: RoomSocket | null = null

export const useStore = create<AppState>()((set, get) => ({
  ...emptyRoom(),
  authStatus: 'boot',
  authError: '',
  inviteKey: '',
  adminKey: '',
  name: '',
  emoji: '🙂',
  identity: '',
  session: '',
  isAdmin: false,
  appName: 'Huddle',
  channels: [],
  channel: '',
  conn: 'connecting',
  clockOffset: 0,
  settings: { ...defaultSettings, ...load<Partial<Settings>>('settings', {}) },
  rightOpen: false,
  rightTab: 'queue',
  mobileTab: 'chat',
  lyricsOverlay: false,
  settingsOpen: false,
  needsTap: false,
  accent: DEFAULT_ACCENT,
  lyrics: {},
  voice: 'off',
  micOn: false,
  deafened: false,
  voicePeople: [],
  stillHere: false,

  boot: () => {
    const inviteKey = load('inviteKey', '')
    const profile = load<{ name: string; emoji: string } | null>('profile', null)
    set({
      inviteKey,
      adminKey: load('adminKey', ''),
      identity: getIdentity(),
      name: profile?.name ?? '',
      emoji: profile?.emoji ?? '🙂',
      selfIdentity: getIdentity(),
      channel: load('channel', ''),
      authStatus: !inviteKey && !load('adminKey', '') ? 'noinvite' : !profile?.name ? 'needname' : 'joining',
    })
    if (get().authStatus === 'joining') void get().join()
  },

  setInvite: (key) => {
    save('inviteKey', key)
    set({ inviteKey: key })
  },
  setAdminKey: (key) => {
    save('adminKey', key)
    set({ adminKey: key })
  },
  saveProfile: (name, emoji) => {
    save('profile', { name, emoji })
    set({ name, emoji })
    void get().join()
  },

  join: async () => {
    const s = get()
    set({ authStatus: 'joining', authError: '' })
    try {
      const r = await api.join({
        invite_key: s.inviteKey, admin_key: s.adminKey || undefined, identity: s.identity,
        name: s.name, emoji: s.emoji, channel: s.channel || undefined,
      })
      const channel = r.channels.find((c) => c.id === s.channel)?.id ?? r.channels[0].id
      set({ session: r.session, isAdmin: r.is_admin, channels: r.channels, appName: r.app_name, channel, authStatus: 'ready' })
      document.title = r.app_name
      if (r.invite_key && !s.inviteKey) get().setInvite(r.invite_key)
      get().switchChannel(channel)
    } catch (e) {
      const err = e as ApiError
      if (err.code === 'kicked') set({ authStatus: 'kicked' })
      else if (err.code === 'invalid_invite') {
        save('inviteKey', '')
        save('adminKey', '')
        set({ inviteKey: '', adminKey: '', authStatus: 'noinvite', authError: 'That invite link is not valid anymore.' })
      } else set({ authStatus: 'error', authError: 'Could not reach the server. Check your connection and try again.' })
    }
  },

  switchChannel: (id) => {
    socket?.close()
    save('channel', id)
    set({ ...emptyRoom(), selfIdentity: get().identity, channel: id, conn: 'connecting' })
    socket = new RoomSocket(id, () => get().session, {
      message: (m) => {
        if (m.type === 'local') {
          if (m.action === 'lyrics') get().setSetting('lyricsOn', Boolean(m.value))
          if (m.action === 'volume') get().setSetting('musicVolume', Number(m.value))
          return
        }
        const s = get()
        set(reduceServer(s, m))
        if (m.type === 'snapshot' || m.type === 'presence.updated') void refreshCounts()
      },
      status: (conn) => set({ conn }),
      offset: (clockOffset) => set({ clockOffset }),
      authFail: () => void get().join(),
    })
    socket.open()
  },

  send: (m) => socket?.send(m),
  patch: (p) => set(p),
  setSetting: (k, v) => {
    const settings = { ...get().settings, [k]: v }
    save('settings', settings)
    set({ settings })
  },
  clearToast: () => set({ toast: null }),
}))

async function refreshCounts() {
  const { session } = useStore.getState()
  try {
    useStore.setState({ channels: await api.channels(session) })
  } catch {
    /* counts are decorative */
  }
}

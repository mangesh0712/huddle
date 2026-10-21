export interface QueueItem {
  id: string
  video_id: string
  title: string
  channel_title: string
  duration_s: number
  thumbnail: string
  added_by: string
  added_by_name: string
  votes: string[]
}

export interface Video {
  video_id: string
  title: string
  channel_title: string
  duration_s: number
  thumbnail: string
}

export interface PlayerState {
  item: QueueItem | null
  status: 'playing' | 'paused' | 'idle'
  position_ms: number
  updated_at_ms: number
}

export interface Member {
  identity: string
  name: string
  emoji: string
  is_admin: boolean
  muted: boolean
}

export interface ChatMessage {
  id: string
  kind: 'user' | 'bot' | 'system'
  text: string
  ts: number
  identity: string
  name: string
  emoji: string
}

export interface ChannelInfo {
  id: string
  name: string
  count: number
}

export interface Palette {
  accent: string
  accent_soft: string
  on_accent: string
}

export type ServerMsg =
  | { type: 'snapshot'; chat: ChatMessage[]; queue: QueueItem[]; player: PlayerState; presence: Member[]; skip_policy: string; server_now: number }
  | { type: 'chat.message'; message: ChatMessage }
  | { type: 'queue.updated'; queue: QueueItem[] }
  | ({ type: 'player.state'; server_now: number } & PlayerState)
  | { type: 'presence.updated'; presence: Member[] }
  | { type: 'clock.pong'; t: number; server_now: number }
  | { type: 'local'; action: 'lyrics' | 'volume'; value: boolean | number }
  | { type: 'error'; code: string; message: string }

export type ClientMsg =
  | { type: 'chat.send'; text: string }
  | { type: 'queue.add'; video: Video }
  | { type: 'queue.vote'; item_id: string }
  | { type: 'queue.remove'; item_id: string }
  | { type: 'player.pause' }
  | { type: 'player.resume' }
  | { type: 'player.seek'; position_ms: number }
  | { type: 'player.skip' }
  | { type: 'player.ended'; item_id: string }
  | { type: 'player.error'; item_id: string; code: number }
  | { type: 'clock.ping'; t: number }

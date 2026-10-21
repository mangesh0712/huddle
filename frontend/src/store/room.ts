import type { ChatMessage, Member, PlayerState, QueueItem, ServerMsg } from '../types'

export interface RoomState {
  chat: ChatMessage[]
  queue: QueueItem[]
  player: PlayerState
  presence: Member[]
  skipPolicy: string
  selfIdentity: string
  mutedByAdmin: boolean
  toast: string | null
  kicked: boolean
}

export const emptyRoom = (): RoomState => ({
  chat: [],
  queue: [],
  player: { item: null, status: 'idle', position_ms: 0, updated_at_ms: 0 },
  presence: [],
  skipPolicy: 'anyone',
  selfIdentity: '',
  mutedByAdmin: false,
  toast: null,
  kicked: false,
})

const isMuted = (presence: Member[], me: string) => presence.some((m) => m.identity === me && m.muted)

/** Pure mapping from a server message to the room state it changes. */
export function reduceServer(s: RoomState, msg: ServerMsg): Partial<RoomState> {
  switch (msg.type) {
    case 'snapshot':
      return {
        chat: msg.chat.slice(-200),
        queue: msg.queue,
        player: msg.player,
        presence: msg.presence,
        skipPolicy: msg.skip_policy,
        mutedByAdmin: isMuted(msg.presence, s.selfIdentity),
      }
    case 'chat.message':
      return { chat: [...s.chat, msg.message].slice(-200) }
    case 'queue.updated':
      return { queue: msg.queue }
    case 'player.state': {
      const { type: _t, server_now: _n, ...player } = msg
      return { player }
    }
    case 'presence.updated':
      return { presence: msg.presence, mutedByAdmin: isMuted(msg.presence, s.selfIdentity) }
    case 'error':
      return msg.code === 'kicked' ? { kicked: true } : { toast: msg.message }
    default:
      return {}
  }
}

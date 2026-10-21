import { describe, expect, it } from 'vitest'
import { emptyRoom, reduceServer } from './room'
import type { ChatMessage, PlayerState, QueueItem } from '../types'

const item = (id: string): QueueItem => ({
  id, video_id: 'v' + id, title: 'T' + id, channel_title: 'C', duration_s: 100,
  thumbnail: '', added_by: 'u', added_by_name: 'U', votes: [],
})
const msg = (id: string): ChatMessage => ({ id, kind: 'user', text: id, ts: 0, identity: 'u', name: 'U', emoji: '🙂' })
const idle: PlayerState = { item: null, status: 'idle', position_ms: 0, updated_at_ms: 0 }

describe('reduceServer', () => {
  it('snapshot replaces room state', () => {
    const r = reduceServer(emptyRoom(), {
      type: 'snapshot', chat: [msg('a')], queue: [item('1')], player: idle, presence: [], skip_policy: 'anyone', server_now: 5,
    })
    expect(r.chat).toHaveLength(1)
    expect(r.queue).toHaveLength(1)
    expect(r.skipPolicy).toBe('anyone')
  })
  it('appends chat and caps at 200', () => {
    let s = emptyRoom()
    for (let i = 0; i < 205; i++) s = { ...s, ...reduceServer(s, { type: 'chat.message', message: msg(String(i)) }) }
    expect(s.chat).toHaveLength(200)
    expect(s.chat[0].id).toBe('5')
  })
  it('player.state updates player only', () => {
    const r = reduceServer(emptyRoom(), { type: 'player.state', ...idle, status: 'paused', position_ms: 9, server_now: 1 })
    expect(r.player?.status).toBe('paused')
    expect(r.player?.position_ms).toBe(9)
    expect('chat' in r).toBe(false)
  })
  it('tracks whether the local user is muted by an admin', () => {
    const base = { ...emptyRoom(), selfIdentity: 'me' }
    const r = reduceServer(base, {
      type: 'presence.updated',
      presence: [{ identity: 'me', name: 'M', emoji: '🙂', is_admin: false, muted: true }],
    })
    expect(r.mutedByAdmin).toBe(true)
  })
  it('surfaces errors as a toast and kicks', () => {
    expect(reduceServer(emptyRoom(), { type: 'error', code: 'rate_limited', message: 'Slow down' }).toast).toBe('Slow down')
    expect(reduceServer(emptyRoom(), { type: 'error', code: 'kicked', message: 'x' }).kicked).toBe(true)
  })
})

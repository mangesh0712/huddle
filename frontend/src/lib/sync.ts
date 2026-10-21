export const DRIFT_MS = 1500

export interface PlayerPos {
  status: 'playing' | 'paused' | 'idle'
  position_ms: number
  updated_at_ms: number
}

/** Offset to add to local time to get server time (assumes a symmetric round trip). */
export const offsetFromPong = (sentLocal: number, serverStamp: number, recvLocal: number) =>
  serverStamp - (sentLocal + recvLocal) / 2

export const serverNow = (local: number, offset: number) => local + offset

export const expectedPosition = (p: PlayerPos, nowServerMs: number) =>
  p.status === 'playing' ? p.position_ms + Math.max(0, nowServerMs - p.updated_at_ms) : p.position_ms

export const needsSeek = (expectedMs: number, actualMs: number) => Math.abs(expectedMs - actualMs) > DRIFT_MS

import { describe, expect, it } from 'vitest'
import { DRIFT_MS, expectedPosition, needsSeek, offsetFromPong, serverNow } from './sync'

describe('sync math', () => {
  it('computes clock offset from a ping/pong round trip', () => {
    // sent at 1000, server stamped 5100, received at 1200 -> midpoint 1100 => offset 4000
    expect(offsetFromPong(1000, 5100, 1200)).toBe(4000)
  })
  it('maps local time to server time', () => {
    expect(serverNow(2000, 4000)).toBe(6000)
  })
  it('expected position advances only while playing', () => {
    const p = { status: 'playing' as const, position_ms: 3000, updated_at_ms: 10_000 }
    expect(expectedPosition(p, 12_500)).toBe(5500)
    expect(expectedPosition({ ...p, status: 'paused' }, 12_500)).toBe(3000)
    expect(expectedPosition(p, 9_000)).toBe(3000)
  })
  it('seeks only when drift exceeds 1.5s', () => {
    expect(DRIFT_MS).toBe(1500)
    expect(needsSeek(10_000, 11_400)).toBe(false)
    expect(needsSeek(10_000, 11_600)).toBe(true)
    expect(needsSeek(12_000, 10_000)).toBe(true)
  })
})

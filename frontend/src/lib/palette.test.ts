import { describe, expect, it } from 'vitest'
import { avatarHue, mmss } from './format'

describe('format helpers', () => {
  it('formats mm:ss', () => {
    expect(mmss(0)).toBe('0:00')
    expect(mmss(65_000)).toBe('1:05')
    expect(mmss(3_725_000)).toBe('62:05')
  })
  it('derives a stable avatar hue from identity', () => {
    expect(avatarHue('abc')).toBe(avatarHue('abc'))
    expect(avatarHue('abc')).not.toBe(avatarHue('abd'))
    expect(avatarHue('abc')).toBeGreaterThanOrEqual(0)
    expect(avatarHue('abc')).toBeLessThan(360)
  })
})

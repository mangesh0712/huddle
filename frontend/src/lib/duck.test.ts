import { describe, expect, it } from 'vitest'
import { stepDuck, effectiveVolume } from './duck'

describe('auto-duck', () => {
  it('target is full volume when nobody speaks', () => {
    expect(effectiveVolume(80, false, 0.35, true)).toBe(80)
  })
  it('drops to 35% while someone speaks', () => {
    expect(effectiveVolume(80, true, 0.35, true)).toBeCloseTo(28)
  })
  it('does not duck when disabled', () => {
    expect(effectiveVolume(80, true, 0.35, false)).toBe(80)
  })
  it('attacks in ~150ms', () => {
    let g = 1
    for (let t = 0; t < 150; t += 25) g = stepDuck(g, 0.35, 25, 150, 600)
    expect(g).toBeCloseTo(0.35, 2)
  })
  it('releases slower than it attacks', () => {
    const down = stepDuck(1, 0.35, 50, 150, 600)
    const up = stepDuck(0.35, 1, 50, 150, 600)
    expect(1 - down).toBeGreaterThan(up - 0.35)
  })
  it('never overshoots', () => {
    expect(stepDuck(0.4, 0.35, 1000, 150, 600)).toBe(0.35)
    expect(stepDuck(0.9, 1, 1000, 150, 600)).toBe(1)
  })
})

describe('karaoke channels', () => {
  it('never duck in karaoke, whatever the setting', async () => {
    const { duckActive } = await import('./duck')
    expect(duckActive(true, true)).toBe(false)
    expect(duckActive(false, true)).toBe(false)
    expect(duckActive(true, false)).toBe(true)
    expect(duckActive(false, false)).toBe(false)
  })
})

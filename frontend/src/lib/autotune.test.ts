import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AutoTuner, detectPitch, effectivePreset, nextShift, snapShift } from './autotune'

const SR = 48000
const sine = (hz: number, n = 2048, amp = 0.3) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR))

describe('detectPitch', () => {
  it.each([110, 220, 261.63, 440, 880])('finds %d Hz', (hz) => {
    const f = detectPitch(sine(hz), SR)
    expect(f).not.toBeNull()
    expect(Math.abs(f! - hz) / hz).toBeLessThan(0.01)
  })
  it('returns null for silence and for noise', () => {
    expect(detectPitch(new Float32Array(2048), SR)).toBeNull()
    const noise = Float32Array.from({ length: 2048 }, () => (Math.random() - 0.5) * 0.4)
    expect(detectPitch(noise, SR)).toBeNull()
  })
  it('ignores very quiet signals', () => {
    expect(detectPitch(sine(220, 2048, 0.002), SR)).toBeNull()
  })
  it('finds the fundamental of a harmonic-rich voice-like wave', () => {
    const f0 = 196
    const buf = Float32Array.from({ length: 2048 }, (_, i) => [1, 0.6, 0.4, 0.25].reduce((a, h, k) => a + h * 0.1 * Math.sin((2 * Math.PI * f0 * (k + 1) * i) / SR), 0))
    expect(Math.abs(detectPitch(buf, SR)! - f0) / f0).toBeLessThan(0.015)
  })
})

describe('snapShift', () => {
  it('is zero on an exact note', () => {
    expect(snapShift(440)).toBeCloseTo(0, 5)
    expect(snapShift(261.6256)).toBeCloseTo(0, 3)
  })
  it('pulls a flat note up and a sharp note down, never more than half a semitone', () => {
    expect(snapShift(430)).toBeCloseTo(0.39, 1)
    expect(snapShift(450)).toBeCloseTo(-0.38, 1)
    for (let hz = 90; hz < 900; hz += 7.3) expect(Math.abs(snapShift(hz))).toBeLessThanOrEqual(0.5001)
  })
})

describe('nextShift', () => {
  it('moves toward the target by the retune amount and never overshoots', () => {
    expect(nextShift(0, 1, 0.5)).toBe(0.5)
    expect(nextShift(0.9, 1, 1)).toBe(1)
    expect(nextShift(0.2, 0.2, 0.7)).toBe(0.2)
  })
})

describe('effectivePreset', () => {
  it('uses auto-tune only in karaoke when the user has not picked another effect', () => {
    expect(effectivePreset('off', true, true)).toBe('autotune')
    expect(effectivePreset('off', true, false)).toBe('off')
    expect(effectivePreset('off', false, true)).toBe('off')
    expect(effectivePreset('robot', true, true)).toBe('robot')
    expect(effectivePreset('autotune', false, false)).toBe('autotune')
  })
})

describe('AutoTuner', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  const analyserFor = (buf: Float32Array) => ({ fftSize: buf.length, getFloatTimeDomainData: (out: Float32Array) => out.set(buf) }) as unknown as AnalyserNode

  it('converges on the correction for a flat note', () => {
    const set = vi.fn()
    const t = new AutoTuner(analyserFor(sine(430)), set, SR)
    t.start()
    vi.advanceTimersByTime(400)
    t.stop()
    expect(set.mock.calls.at(-1)![0]).toBeCloseTo(0.39, 1)
  })
  it('relaxes back to no correction when there is silence', () => {
    const set = vi.fn()
    const buf = sine(430)
    const an = analyserFor(buf)
    const t = new AutoTuner(an, set, SR)
    t.start()
    vi.advanceTimersByTime(400)
    buf.fill(0)
    vi.advanceTimersByTime(800)
    t.stop()
    expect(Math.abs(set.mock.calls.at(-1)![0])).toBeLessThan(0.02)
  })
  it('stops calling after stop()', () => {
    const set = vi.fn()
    const t = new AutoTuner(analyserFor(sine(430)), set, SR)
    t.start()
    vi.advanceTimersByTime(100)
    t.stop()
    const n = set.mock.calls.length
    vi.advanceTimersByTime(500)
    expect(set.mock.calls.length).toBe(n)
  })
})

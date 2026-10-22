import type { FxPreset } from '../store/useStore'

/** YIN pitch detector: fundamental in Hz for a mono buffer, or null if unvoiced, too quiet or noisy. */
export function detectPitch(buf: Float32Array, sampleRate: number, minHz = 70, maxHz = 1000, gate = 0.01): number | null {
  const n = buf.length
  let sum = 0
  for (let i = 0; i < n; i++) sum += buf[i] * buf[i]
  if (Math.sqrt(sum / n) < gate) return null

  const tauMax = Math.min(Math.floor(sampleRate / minHz), n >> 1)
  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz))
  const w = n - tauMax
  const d = new Float32Array(tauMax + 1)
  for (let tau = 1; tau <= tauMax; tau++) {
    let s = 0
    for (let j = 0; j < w; j++) {
      const diff = buf[j] - buf[j + tau]
      s += diff * diff
    }
    d[tau] = s
  }
  // cumulative mean normalised difference
  const cmnd = new Float32Array(tauMax + 1)
  cmnd[0] = 1
  let running = 0
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau]
    cmnd[tau] = running === 0 ? 1 : (d[tau] * tau) / running
  }
  let tau = -1
  for (let t = tauMin; t < tauMax; t++) {
    if (cmnd[t] < 0.15) {
      while (t + 1 < tauMax && cmnd[t + 1] < cmnd[t]) t++
      tau = t
      break
    }
  }
  if (tau < 0) return null
  // parabolic interpolation for sub-sample accuracy
  const a = cmnd[tau - 1]
  const b = cmnd[tau]
  const c = cmnd[tau + 1] ?? b
  const denom = a - 2 * b + c
  const refined = denom === 0 ? tau : tau + (a - c) / (2 * denom)
  return sampleRate / refined
}

/** Semitones to move `hz` onto the nearest note of the chromatic scale (always within ±0.5). */
export function snapShift(hz: number): number {
  const midi = 69 + 12 * Math.log2(hz / 440)
  return Math.round(midi) - midi
}

/** One smoothing step toward the target; amount 1 retunes instantly, lower is gentler. */
export const nextShift = (current: number, target: number, amount: number) => current + (target - current) * amount

/** Karaoke turns auto-tune on by default, but a voice effect the user chose always wins. */
export function effectivePreset(fx: FxPreset, karaoke: boolean, autotuneOn: boolean): FxPreset {
  return fx === 'off' && karaoke && autotuneOn ? 'autotune' : fx
}

const TICK_MS = 20
const RETUNE = 0.6 // fast and obviously "tuned"
const RELAX = 0.15 // drift back to no correction between notes

/** Reads the mic every 20 ms and drives a pitch shifter toward the nearest note. */
export class AutoTuner {
  private timer?: ReturnType<typeof setInterval>
  private shift = 0
  private buf: Float32Array<ArrayBuffer>

  constructor(private analyser: AnalyserNode, private setShift: (semitones: number) => void, private sampleRate: number) {
    this.buf = new Float32Array(analyser.fftSize)
  }

  start() {
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  stop() {
    clearInterval(this.timer)
    this.timer = undefined
  }

  private tick() {
    this.analyser.getFloatTimeDomainData(this.buf)
    const hz = detectPitch(this.buf, this.sampleRate)
    this.shift = hz ? nextShift(this.shift, snapShift(hz), RETUNE) : nextShift(this.shift, 0, RELAX)
    this.setShift(this.shift)
  }
}

const MIN = 60_000
export type SilenceState = 'ok' | 'warn' | 'drop'

export function silenceState(lastActiveMs: number, nowMs: number): SilenceState {
  const quiet = nowMs - lastActiveMs
  if (quiet >= 10 * MIN) return 'drop'
  if (quiet >= 9 * MIN) return 'warn'
  return 'ok'
}

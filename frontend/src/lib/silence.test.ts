import { describe, expect, it } from 'vitest'
import { silenceState } from './silence'

const MIN = 60_000
describe('silence watchdog', () => {
  it('is ok under 9 minutes', () => {
    expect(silenceState(0, 8 * MIN)).toBe('ok')
  })
  it('warns at 9 minutes', () => {
    expect(silenceState(0, 9 * MIN)).toBe('warn')
  })
  it('drops at 10 minutes', () => {
    expect(silenceState(0, 10 * MIN)).toBe('drop')
  })
})

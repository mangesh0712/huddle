import { describe, expect, it } from 'vitest'
import { currentLineIndex } from './lyrics'

const lines = [
  { t_ms: 1000, text: 'a' },
  { t_ms: 5000, text: 'b' },
  { t_ms: 9000, text: 'c' },
]

describe('currentLineIndex', () => {
  it('is -1 before the first line', () => {
    expect(currentLineIndex(lines, 500, 0)).toBe(-1)
  })
  it('finds the active line', () => {
    expect(currentLineIndex(lines, 1000, 0)).toBe(0)
    expect(currentLineIndex(lines, 6000, 0)).toBe(1)
    expect(currentLineIndex(lines, 99_000, 0)).toBe(2)
  })
  it('applies the timing nudge (positive nudge shows lines earlier)', () => {
    expect(currentLineIndex(lines, 4600, 0)).toBe(0)
    expect(currentLineIndex(lines, 4600, 500)).toBe(1)
    expect(currentLineIndex(lines, 5200, -500)).toBe(0)
  })
  it('handles empty lyrics', () => {
    expect(currentLineIndex([], 1000, 0)).toBe(-1)
  })
})

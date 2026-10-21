export interface LyricLine {
  t_ms: number
  text: string
}

/** Index of the active line, or -1 before the first. A positive nudge shows lines earlier. */
export function currentLineIndex(lines: LyricLine[], positionMs: number, nudgeMs: number): number {
  const t = positionMs + nudgeMs
  let lo = 0
  let hi = lines.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].t_ms <= t) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

export type Chunk = { type: 'text' | 'link'; value: string }

const URL_RE = /https?:\/\/[^\s<>"']+/g
const TRAIL = /[.,!?;:)\]]+$/

/** Splits text into plain and link chunks. Never emits HTML; render chunks as React nodes. */
export function linkify(text: string): Chunk[] {
  const out: Chunk[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0
    const url = m[0].replace(TRAIL, '')
    if (start > last) out.push({ type: 'text', value: text.slice(last, start) })
    out.push({ type: 'link', value: url })
    last = start + url.length
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) })
  return out
}

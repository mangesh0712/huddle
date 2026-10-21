import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoomSocket } from './socket'

class FakeWS {
  static OPEN = 1
  static last: FakeWS
  readyState = 0
  sent: string[] = []
  onopen?: () => void
  onmessage?: (e: { data: string }) => void
  onclose?: (e: { code: number }) => void
  constructor(public url: string) {
    FakeWS.last = this
  }
  send(s: string) {
    this.sent.push(s)
  }
  close() {}
  open() {
    this.readyState = 1
    this.onopen?.()
  }
}

afterEach(() => vi.unstubAllGlobals())

const make = () => {
  vi.stubGlobal('WebSocket', FakeWS)
  return new RoomSocket('lounge', () => 'tok', { message: vi.fn(), status: vi.fn(), offset: vi.fn(), authFail: vi.fn() })
}

describe('RoomSocket', () => {
  it('holds messages sent before open and flushes them in order', () => {
    const s = make()
    s.open()
    s.send({ type: 'chat.send', text: 'first' })
    s.send({ type: 'chat.send', text: 'second' })
    expect(FakeWS.last.sent).toHaveLength(0)
    FakeWS.last.open()
    const texts = FakeWS.last.sent.map((x) => JSON.parse(x)).filter((m) => m.type === 'chat.send').map((m) => m.text)
    expect(texts).toEqual(['first', 'second'])
    s.close()
  })
  it('does not queue clock pings', () => {
    const s = make()
    s.open()
    s.send({ type: 'clock.ping', t: 1 })
    FakeWS.last.open()
    expect(FakeWS.last.sent.filter((x) => JSON.parse(x).t === 1)).toHaveLength(0)
    s.close()
  })
  it('puts the session in the url', () => {
    const s = make()
    s.open()
    expect(FakeWS.last.url).toContain('/ws/lounge?session=tok')
    s.close()
  })
})

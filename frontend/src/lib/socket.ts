import type { ClientMsg, ServerMsg } from '../types'
import { offsetFromPong } from './sync'

export type ConnStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'

interface Handlers {
  message: (m: ServerMsg) => void
  status: (s: ConnStatus) => void
  offset: (ms: number) => void
  authFail: () => void
}

/** One channel WebSocket with backoff reconnect and a min-RTT clock offset estimate. */
export class RoomSocket {
  private ws?: WebSocket
  private stopped = false
  private attempts = 0
  private pingTimer?: ReturnType<typeof setInterval>
  private retryTimer?: ReturnType<typeof setTimeout>
  private samples: { rtt: number; offset: number }[] = []

  constructor(private channel: string, private getSession: () => string, private h: Handlers) {}

  open() {
    this.h.status(this.attempts ? 'reconnecting' : 'connecting')
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws/${this.channel}?session=${encodeURIComponent(this.getSession())}`)
    this.ws = ws
    ws.onopen = () => {
      this.attempts = 0
      this.h.status('open')
      this.ping()
      this.pingTimer = setInterval(() => this.ping(), 5000)
    }
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data) as ServerMsg
      if (m.type === 'clock.pong') {
        const now = Date.now()
        this.samples = [...this.samples.slice(-4), { rtt: now - m.t, offset: offsetFromPong(m.t, m.server_now, now) }]
        this.h.offset(this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a)).offset)
      } else this.h.message(m)
    }
    ws.onclose = (e) => {
      clearInterval(this.pingTimer)
      if (this.stopped || this.ws !== ws) return
      if (e.code === 4001) return this.h.authFail()
      if (e.code === 4003) return this.h.status('closed')
      this.attempts++
      this.h.status('reconnecting')
      this.retryTimer = setTimeout(() => this.open(), Math.min(1000 * 2 ** this.attempts, 8000))
    }
  }

  private ping() {
    this.send({ type: 'clock.ping', t: Date.now() })
  }

  send(m: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m))
  }

  close() {
    this.stopped = true
    clearInterval(this.pingTimer)
    clearTimeout(this.retryTimer)
    this.ws?.close()
  }
}

import { useEffect, useRef, useState } from 'react'
import { linkify } from '../lib/linkify'
import { useStore } from '../store/useStore'
import type { ChatMessage } from '../types'
import { Avatar } from './Avatar'
import { Icon } from './Icon'

const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

function Text({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((c, i) =>
        c.type === 'link' ? (
          <a key={i} href={c.value} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">{c.value}</a>
        ) : (
          <span key={i}>{c.value}</span>
        ),
      )}
    </>
  )
}

function Row({ m, prev }: { m: ChatMessage; prev?: ChatMessage }) {
  if (m.kind === 'system')
    return <li className="py-1.5 text-center text-xs text-muted">{m.text}</li>
  if (m.kind === 'bot')
    return (
      <li className="my-1 ml-12 rounded-xl border-l-2 border-accent bg-accent-soft/60 px-3 py-2 text-sm">
        <span className="font-semibold text-accent">Huddle bot </span><Text text={m.text} />
      </li>
    )
  const grouped = prev?.kind === 'user' && prev.identity === m.identity && m.ts - prev.ts < 120_000
  return (
    <li className={`flex gap-3 ${grouped ? 'mt-0.5' : 'mt-4'}`}>
      <div className="w-9 shrink-0">{!grouped && <Avatar identity={m.identity} emoji={m.emoji} size={36} />}</div>
      <div className="min-w-0">
        {!grouped && (
          <p className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">{m.name}</span>
            <span className="text-xs text-muted">{time(m.ts)}</span>
          </p>
        )}
        <p className="text-[15px] leading-relaxed break-words whitespace-pre-wrap"><Text text={m.text} /></p>
      </div>
    </li>
  )
}

const CHIPS = ['!play ', '!skip', '!queue', '!np']

export function Chat() {
  const chat = useStore((s) => s.chat)
  const send = useStore((s) => s.send)
  const channelName = useStore((s) => s.channels.find((c) => c.id === s.channel)?.name ?? '')
  const [text, setText] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat.length])
  const submit = () => {
    if (!text.trim()) return
    send({ type: 'chat.send', text })
    setText('')
  }
  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label={`${channelName} chat`}>
      <div ref={scroller} className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 pb-2">
        <ul aria-live="polite" aria-relevant="additions" className="mx-auto max-w-3xl py-3">
          {chat.length === 0 && <li className="py-10 text-center text-muted">It’s quiet in {channelName}. Say hi, or type !play to start some music.</li>}
          {chat.map((m, i) => <Row key={m.id} m={m} prev={chat[i - 1]} />)}
        </ul>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); submit() }} className="mx-auto w-full max-w-3xl px-5 pb-4">
        <div className="mb-2 flex gap-1.5">
          {CHIPS.map((c) => (
            <button type="button" key={c} onClick={() => (c.endsWith(' ') ? (setText(c), input.current?.focus()) : send({ type: 'chat.send', text: c }))}
              className="rounded-full bg-raised px-3 py-1 text-xs text-muted hover:text-ink">{c.trim()}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-2xl bg-raised py-1.5 pr-1.5 pl-4 focus-within:ring-2 focus-within:ring-accent">
          <input ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={500}
            placeholder={`Message ${channelName}`} aria-label="Message" className="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-muted" />
          <button type="submit" aria-label="Send message" disabled={!text.trim()}
            className="grid size-9 place-items-center rounded-xl bg-accent text-on-accent disabled:opacity-30"><Icon name="send" size={17} /></button>
        </div>
      </form>
    </section>
  )
}

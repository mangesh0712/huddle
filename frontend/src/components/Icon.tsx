const P: Record<string, string> = {
  mic: 'M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0M12 16v4m-3 0h6',
  micOff: 'M4 4l16 16M9 9v2a3 3 0 0 0 4.5 2.6M15 10.5V6a3 3 0 0 0-5.7-1.3M17 11a5 5 0 0 1-.6 2.4M12 16v4m-3 0h6',
  headphones: 'M4 15v-3a8 8 0 0 1 16 0v3M4 15a2 2 0 0 1 2-2h1v6H6a2 2 0 0 1-2-2v-2Zm16 0a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2v-2Z',
  headphonesOff: 'M4 4l16 16M4 15v-3a8 8 0 0 1 2.3-5.6M20 15v-3a8 8 0 0 0-8-8M7 13H6a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1v-6Zm10 0h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-2-1.2L14.6 3h-4l-.4 2.7a7.6 7.6 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7.4 7.4 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7.6 7.6 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z',
  play: 'M8 5v14l11-7L8 5Z',
  pause: 'M6.5 5h4v14h-4zM13.5 5h4v14h-4z',
  skip: 'M6 5v14l9-7-9-7Zm11 0v14',
  lyrics: 'M4 6h16M4 11h10M4 16h16M4 21h7',
  volume: 'M11 5 6 9H3v6h3l5 4V5Zm4 4a4 4 0 0 1 0 6m2.5-9a8 8 0 0 1 0 12',
  crown: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  x: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  hash: 'M5 9h14M5 15h14M10 4 8 20M16 4l-2 16',
  queue: 'M4 6h12M4 11h12M4 16h7M17 14v6l4-3-4-3Z',
  send: 'M5 12 20 5l-4 15-3.5-6L5 12Z',
  wand: 'M5 19 15 9m0 0 2-2 2 2-2 2-2-2ZM6 5v3M4.5 6.5h3M18 15v3M16.5 16.5h3',
  up: 'M12 5l7 9H5l7-9Z',
  chat: 'M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  voice: 'M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3Zm-6 7a6 6 0 0 0 12 0M12 17v3',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1',
}

export function Icon({ name, size = 20, filled = false, className = '' }: { name: keyof typeof P; size?: number; filled?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={P[name]} />
    </svg>
  )
}

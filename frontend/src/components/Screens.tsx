import { useState } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '../store/useStore'
import { Avatar } from './Avatar'

const EMOJIS = ['🙂', '😎', '🦊', '🐼', '🐸', '🦄', '🐙', '🌵', '🍕', '🎧', '🔥', '🌙', '🐧', '🦋', '👾', '🍉']

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="room-glow grid min-h-full place-items-center px-6 py-10">
      <div className="w-full max-w-xl">{children}</div>
    </main>
  )
}

export function NoInvite() {
  const err = useStore((s) => s.authError)
  return (
    <Shell>
      <div className="mb-5 flex -space-x-3" aria-hidden="true">
        {['🦊', '🎧', '🌙'].map((e, i) => (
          <Avatar key={e} identity={'x' + i} emoji={e} size={52} />
        ))}
      </div>
      <h1 className="text-4xl font-bold tracking-tight">Ask your friend for an invite link</h1>
      <p className="mt-3 max-w-md text-muted">
        This hangout is private. Open the link a friend sent you and you’ll land right in the room.
      </p>
      {err && <p role="alert" className="mt-5 text-danger">{err}</p>}
    </Shell>
  )
}

export function NameScreen() {
  const { name: saved, emoji: savedEmoji, identity, saveProfile, appName } = useStore()
  const [name, setName] = useState(saved)
  const [emoji, setEmoji] = useState(savedEmoji)
  const valid = name.trim().length > 0
  return (
    <main className="room-glow grid min-h-full place-items-center px-6 py-10">
      <div className="grid w-full max-w-4xl items-center gap-10 md:grid-cols-[1fr_1fr]">
        <div className="flex flex-col items-start">
          <motion.div key={emoji} initial={{ scale: 0.85, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 22 }}>
            <Avatar identity={identity} emoji={emoji} size={168} speaking />
          </motion.div>
          <p className="mt-8 text-5xl leading-[1.05] font-extrabold tracking-tight break-words">
            {name.trim() || 'Your name'}
          </p>
          <p className="mt-2 text-muted">This is how friends see you in {appName}.</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) saveProfile(name.trim(), emoji)
          }}
          className="rounded-2xl bg-surface p-6"
        >
          <label htmlFor="name" className="text-sm font-medium text-muted">Display name</label>
          <input
            id="name" autoFocus maxLength={24} value={name} onChange={(e) => setName(e.target.value)}
            placeholder="What should we call you?"
            className="mt-2 w-full rounded-xl border border-line bg-base px-4 py-3 text-lg outline-none focus:border-accent"
          />
          <fieldset className="mt-6">
            <legend className="text-sm font-medium text-muted">Pick an avatar</legend>
            <div className="mt-3 grid grid-cols-8 gap-1.5">
              {EMOJIS.map((e) => (
                <button type="button" key={e} onClick={() => setEmoji(e)} aria-label={`Avatar ${e}`} aria-pressed={emoji === e}
                  className={`grid aspect-square place-items-center rounded-xl text-xl transition-colors ${emoji === e ? 'bg-accent-soft ring-2 ring-accent' : 'hover:bg-raised'}`}>
                  {e}
                </button>
              ))}
            </div>
          </fieldset>
          <button type="submit" disabled={!valid}
            className="mt-7 w-full rounded-xl bg-accent px-5 py-3 font-semibold text-on-accent transition-opacity disabled:opacity-40">
            Join the room
          </button>
        </form>
      </div>
    </main>
  )
}

export function Connecting({ error, retry }: { error?: string; retry?: () => void }) {
  return (
    <Shell>
      {error ? (
        <>
          <h1 className="text-3xl font-bold tracking-tight">Can’t reach the room</h1>
          <p role="alert" className="mt-3 text-muted">{error}</p>
          <button onClick={retry} className="mt-6 rounded-xl bg-accent px-5 py-3 font-semibold text-on-accent">Try again</button>
        </>
      ) : (
        <p role="status" className="text-lg text-muted">Connecting to the room…</p>
      )}
    </Shell>
  )
}

export function Kicked() {
  return (
    <Shell>
      <h1 className="text-4xl font-bold tracking-tight">You were removed from the room</h1>
      <p className="mt-3 max-w-md text-muted">An admin removed you. You can come back in about 10 minutes by opening the invite link again.</p>
    </Shell>
  )
}

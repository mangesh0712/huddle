import { useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { NowPlaying } from './components/NowPlaying'
import { Chat } from './components/Chat'
import { HiddenPlayer, RightPanel } from './components/RightPanel'
import { Banners, LyricsOverlay, SettingsModal } from './components/Overlays'
import { Connecting, Kicked, NameScreen, NoInvite } from './components/Screens'
import { Icon } from './components/Icon'
import { useAccent, useDuck, useLyricsLoader, usePushToTalk, useSilenceWatchdog, useVoiceFx } from './hooks/useRoomEffects'
import { useStore } from './store/useStore'

function Room() {
  useAccent()
  useDuck()
  useLyricsLoader()
  usePushToTalk()
  useVoiceFx()
  const resetSilence = useSilenceWatchdog()
  const { rightOpen, mobileTab, patch, kicked, player, channels, channel } = useStore()
  const channelName = channels.find((c) => c.id === channel)?.name ?? ''

  // The player card lives in the right panel, so open it the first time music starts.
  useEffect(() => {
    if (player.item && !sessionStorage.getItem('huddle:panelSeen')) {
      sessionStorage.setItem('huddle:panelSeen', '1')
      patch({ rightOpen: true })
    }
  }, [player.item, patch])

  if (kicked) return <Kicked />
  const tabs = [['voice', 'Voice', 'voice'], ['chat', 'Chat', 'chat'], ['queue', 'Queue', 'queue']] as const
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Banners resetSilence={resetSilence} />
      <div className="relative min-h-0 flex-1 md:grid md:grid-cols-[260px_minmax(0,1fr)_auto] md:grid-rows-[minmax(0,1fr)]">
        <div className={`h-full min-h-0 ${mobileTab === 'voice' ? 'block' : 'hidden'} md:block`}><Sidebar /></div>

        <main className={`room-glow min-w-0 flex-col ${mobileTab === 'chat' ? 'flex' : 'hidden'} h-full md:flex`}>
          <header className="hidden border-b border-line/70 md:block"><NowPlaying /></header>
          <div className="flex items-center px-5 py-3 md:hidden"><h1 className="text-lg font-bold"># {channelName}</h1></div>
          <Chat />
        </main>

        {/* Always mounted: collapsing only clips the panel, so the iframe never reloads. */}
        <aside
          aria-label="Player, queue and lyrics"
          className={`absolute inset-0 z-10 md:static md:z-auto md:overflow-hidden md:transition-[width] md:duration-300 ${mobileTab === 'queue' ? 'block' : 'hidden'} md:block ${rightOpen ? 'md:w-[340px]' : 'md:w-0'}`}
        >
          <RightPanel />
        </aside>
      </div>

      <div className="border-t border-line bg-surface md:hidden"><NowPlaying compact /></div>
      <nav aria-label="Sections" className="grid grid-cols-3 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {tabs.map(([id, label, icon]) => (
          <button key={id} onClick={() => patch({ mobileTab: id })} aria-current={mobileTab === id ? 'page' : undefined}
            className={`flex flex-col items-center gap-0.5 py-2.5 text-xs ${mobileTab === id ? 'text-accent' : 'text-muted'}`}>
            <Icon name={icon} size={22} />{label}
          </button>
        ))}
      </nav>
      <HiddenPlayer />
      <LyricsOverlay />
      <SettingsModal />
    </div>
  )
}

export default function App() {
  const { authStatus, boot, authError, join, setInvite, setAdminKey } = useStore()
  useEffect(() => {
    const m = location.pathname.match(/^\/(join|admin)\/([^/]+)/)
    if (m) {
      const key = decodeURIComponent(m[2])
      m[1] === 'join' ? setInvite(key) : setAdminKey(key)
      history.replaceState(null, '', '/')
    }
    boot()
  }, [boot, setInvite, setAdminKey])

  switch (authStatus) {
    case 'noinvite': return <NoInvite />
    case 'needname': return <NameScreen />
    case 'kicked': return <Kicked />
    case 'error': return <Connecting error={authError} retry={() => void join()} />
    case 'ready': return <Room />
    default: return <Connecting />
  }
}

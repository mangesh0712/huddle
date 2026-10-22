import { ConnectionState, LocalAudioTrack, Room, RoomEvent, Track, type Participant, type RemoteTrack } from 'livekit-client'
import { api } from './api'
import { effectivePreset } from './autotune'
import { createFxProcessor } from './fx'
import { useStore, type VoicePerson } from '../store/useStore'

let room: Room | null = null
let fxProc: ReturnType<typeof createFxProcessor> | null = null

const st = () => useStore.getState()

function person(p: Participant): VoicePerson {
  return {
    identity: p.identity,
    name: p.name || p.identity,
    speaking: p.isSpeaking,
    micMuted: !p.isMicrophoneEnabled,
    canPublish: p.permissions?.canPublish ?? true,
  }
}

function sync() {
  if (!room) return
  const all = [room.localParticipant, ...room.remoteParticipants.values()]
  useStore.setState({ voicePeople: all.map(person) })
  const lp = room.localParticipant
  if (lp.permissions && lp.permissions.canPublish === false && st().micOn) useStore.setState({ micOn: false })
}

/** LiveKit never plays remote audio by itself: each subscribed track has to be attached to an element. */
function playRemote(track: RemoteTrack) {
  if (track.kind !== Track.Kind.Audio) return
  const el = track.attach()
  el.setAttribute('data-huddle-voice', '')
  el.style.display = 'none'
  document.body.appendChild(el)
}

function stopRemote(track: RemoteTrack) {
  if (track.kind === Track.Kind.Audio) track.detach().forEach((el) => el.remove())
}

function applyVolumes() {
  if (!room) return
  const { deafened, settings } = st()
  room.remoteParticipants.forEach((p) => p.setVolume(deafened ? 0 : (settings.friendVolumes[p.identity] ?? 100) / 100))
}

export async function joinVoice(channel: string) {
  await leaveVoice()
  useStore.setState({ voice: 'connecting' })
  try {
    const { livekit_token, livekit_url } = await api.voiceToken(st().session, channel)
    room = new Room({
      webAudioMix: true,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    const refresh = () => {
      sync()
      applyVolumes()
    }
    room
      .on(RoomEvent.ParticipantConnected, refresh)
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.TrackSubscribed, (track) => {
        playRemote(track)
        refresh()
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        stopRemote(track)
        refresh()
      })
      .on(RoomEvent.ActiveSpeakersChanged, sync)
      .on(RoomEvent.TrackMuted, sync)
      .on(RoomEvent.TrackUnmuted, sync)
      .on(RoomEvent.ParticipantPermissionsChanged, sync)
      .on(RoomEvent.LocalTrackPublished, sync)
      .on(RoomEvent.LocalTrackUnpublished, sync)
      .on(RoomEvent.Disconnected, () => {
        room = null
        useStore.setState({ voice: 'off', micOn: false, voicePeople: [] })
      })
    await room.connect(livekit_url, livekit_token)
    await room.startAudio()
    useStore.setState({ voice: 'on' })
    sync()
    if (!st().settings.pttOn && !st().mutedByAdmin) await setMic(true)
  } catch {
    room?.disconnect()
    room = null
    useStore.setState({ voice: 'error', voicePeople: [] })
  }
}

export async function leaveVoice() {
  if (!room) return
  const r = room
  room = null
  fxProc = null
  await r.disconnect()
  useStore.setState({ voice: 'off', micOn: false, voicePeople: [] })
}

export async function setMic(on: boolean) {
  if (!room || room.state !== ConnectionState.Connected) return
  try {
    await room.localParticipant.setMicrophoneEnabled(on)
    useStore.setState({ micOn: on, voice: st().voice === 'denied' ? 'on' : st().voice })
    if (on) await refreshFx()
  } catch (e) {
    const denied = e instanceof Error && /permission|denied|notallowed/i.test(e.name + e.message)
    useStore.setState({ micOn: false, ...(denied ? { voice: 'denied' as const } : {}) })
  }
  sync()
}

export async function setDeafened(d: boolean) {
  useStore.setState({ deafened: d })
  applyVolumes()
}

export function setFriendVolume(identity: string, v: number) {
  st().setSetting('friendVolumes', { ...st().settings.friendVolumes, [identity]: v })
  applyVolumes()
}

/** Applies the voice effect that should be active right now (auto-tune in karaoke unless another effect is chosen). */
export async function refreshFx() {
  const { settings, channels, channel } = st()
  const karaoke = channels.find((c) => c.id === channel)?.karaoke ?? false
  await applyFx(effectivePreset(settings.fx, karaoke, settings.autotune))
}

export async function applyFx(p: import('../store/useStore').FxPreset) {
  if (!room) return
  const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone)
  const track = pub?.audioTrack as LocalAudioTrack | undefined
  if (!track) return
  try {
    if (p === 'off') {
      if (fxProc) {
        await track.stopProcessor()
        fxProc = null
      }
      return
    }
    if (fxProc) return fxProc.setPreset(p)
    fxProc = createFxProcessor(p)
    await track.setProcessor(fxProc as never)
  } catch (e) {
    fxProc = null
    console.warn('Voice effect could not start; sending the plain voice.', e)
  }
}

export const inVoice = () => room !== null

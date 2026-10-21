import type { FxPreset } from '../store/useStore'

type ToneNS = typeof import('tone')

interface Chain {
  head: unknown
  tail: unknown
  nodes: { dispose: () => unknown }[]
}

function buildChain(T: ToneNS, p: FxPreset): Chain {
  const mk = (nodes: any[]): Chain => {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1])
    return { head: nodes[0], tail: nodes[nodes.length - 1], nodes }
  }
  switch (p) {
    case 'deep':
      return mk([new T.PitchShift({ pitch: -5, windowSize: 0.1 })])
    case 'chipmunk':
      return mk([new T.PitchShift({ pitch: 7, windowSize: 0.06 })])
    case 'robot':
      return mk([new T.Tremolo({ frequency: 55, depth: 1, spread: 0 }).start(), new T.Distortion(0.15)])
    case 'echo':
      return mk([new T.FeedbackDelay({ delayTime: 0.24, feedback: 0.38, wet: 0.45 })])
    case 'radio':
      return mk([
        new T.Filter({ type: 'highpass', frequency: 600 }),
        new T.Filter({ type: 'lowpass', frequency: 3200 }),
        new T.Distortion(0.25),
      ])
    default:
      return { head: null, tail: null, nodes: [] }
  }
}

/** LiveKit audio TrackProcessor that runs the mic through a swappable Tone.js chain. */
export function createFxProcessor(initial: FxPreset) {
  let T: ToneNS | null = null
  let ctx: AudioContext | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let dest: MediaStreamAudioDestinationNode | null = null
  let chain: Chain = { head: null, tail: null, nodes: [] }
  let preset = initial

  const wire = () => {
    if (!T || !source || !dest) return
    source.disconnect()
    chain.nodes.forEach((n) => n.dispose())
    chain = buildChain(T, preset)
    if (chain.head) {
      T.connect(source, chain.head as any)
      ;(chain.tail as any).connect(dest)
    } else source.connect(dest)
  }

  const processor = {
    name: 'huddle-fx',
    processedTrack: undefined as MediaStreamTrack | undefined,
    async init(opts: { track: MediaStreamTrack; audioContext: AudioContext }) {
      T = await import('tone')
      ctx = opts.audioContext
      T.setContext(ctx)
      await T.start()
      source = ctx.createMediaStreamSource(new MediaStream([opts.track]))
      dest = ctx.createMediaStreamDestination()
      processor.processedTrack = dest.stream.getAudioTracks()[0]
      wire()
    },
    async restart(opts: { track: MediaStreamTrack; audioContext: AudioContext }) {
      await processor.destroy()
      await processor.init(opts)
    },
    async destroy() {
      chain.nodes.forEach((n) => n.dispose())
      chain = { head: null, tail: null, nodes: [] }
      source?.disconnect()
      source = dest = null
    },
    setPreset(p: FxPreset) {
      preset = p
      wire()
    },
  }
  return processor
}

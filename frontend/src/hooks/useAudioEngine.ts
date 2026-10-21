import { useRef, useCallback } from 'react'
import { SoundTouchNode } from '@soundtouchjs/audio-worklet'
import { apiUrl, authHeaders } from '../api/client'
import {
  DEFAULT_INTERVAL_MAX_S,
  DEFAULT_INTERVAL_MIN_S,
  EVENT_BACKLOG_RESET_S,
  EVENT_MAX_VOICES,
  EXPORT_SEED,
  LOOKAHEAD_HIDDEN_S,
  LOOKAHEAD_S,
  SCHEDULER_TICK_MS,
  clampPan,
  dbToGain,
  firstTriggerDelay,
  mulberry32,
  nextInterval,
  nextShape,
  planTriggers,
  type TriggerShape,
} from './eventScheduler'
import {
  TAKE_LOOKAHEAD_S,
  equalPowerCurve,
  nextTake,
  planTakes,
  takeCrossfade,
} from './takeScheduler'
import type { Element, EQBand } from '../types'

function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const numSamples = buffer.length
  const dataSize = numSamples * numChannels * 2
  const arrayBuffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(arrayBuffer)

  const write = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  write(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * 2, true)
  view.setUint16(32, numChannels * 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, dataSize, true)

  const channels = Array.from({ length: numChannels }, (_, i) => buffer.getChannelData(i))
  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }
  return arrayBuffer
}

const TRACK_GAIN_SCALE = 0.7
const REVERB_DRY_ATTENUATION = 0.7
const REVERB_WET_SEND = 0.6
const REVERB_IR_DURATION_S = 2.5
const REVERB_IR_DECAY = 3.0
const SOURCE_RELEASE_S = 0.03
const TRACK_DISCONNECT_GRACE_S = 0.1
const ANIMATE_PUSH_INTERVAL_S = 1 / 30
const LOOP_PAD_MIN_S = 0.005

const LIMITER_THRESHOLD_DB = -4
const LIMITER_KNEE_DB = 0
const LIMITER_RATIO = 20
const LIMITER_ATTACK_S = 0.001
const LIMITER_RELEASE_S = 0.1

const RUMBLE_FREQ_HZ = 30
const RUMBLE_Q = 0.707

const EQ_LOW_FREQ_HZ = 200
const EQ_MID_FREQ_HZ = 1000
const EQ_MID_Q = 1.4
const EQ_HIGH_FREQ_HZ = 8000
const EQ_SHELF_Q = 0.7
const EQ_MIN_AUDIBLE_DB = 0.1

function trackGain(volume: number): number {
  return volume * TRACK_GAIN_SCALE
}

function dryGainFor(depth: number): number {
  return 1 - depth * REVERB_DRY_ATTENUATION
}

function wetGainFor(depth: number): number {
  return depth * REVERB_WET_SEND
}

export interface EQState {
  low: number
  mid: number
  high: number
}

interface EventLane {
  buffer: AudioBuffer
  rng: () => number
  voices: Set<AudioBufferSourceNode>
  nextAt: number
  minS: number
  maxS: number
}

interface TakeClip {
  buffer: AudioBuffer
  offset: number
  duration: number
}

interface TakeLane {
  clips: TakeClip[]
  rng: () => number
  voices: Set<AudioBufferSourceNode>
  current: number
  nextAt: number
  crossfade: number
  input: AudioNode
}

interface TrackNode {
  input: AudioNode
  masterGain: GainNode
  panner: StereoPannerNode
  dryGain: GainNode
  wetGain: GainNode
  source: AudioBufferSourceNode | null
  pitchNode: SoundTouchNode | null
  filters: [BiquadFilterNode, BiquadFilterNode, BiquadFilterNode]
  lane: EventLane | null
  takes: TakeLane | null
  basePan: number
}

interface ChainParams {
  eq: EQState
  bands: EQBand[]
  gain: number
  pan: number
  depth: number
}

interface TrackChain {
  input: AudioNode
  filters: [BiquadFilterNode, BiquadFilterNode, BiquadFilterNode]
  masterGain: GainNode
  panner: StereoPannerNode
  dryGain: GainNode
  wetGain: GainNode
}

interface DecodedElement {
  el: Element
  buffer: AudioBuffer
  takes: AudioBuffer[]
}

interface BinauralNodes {
  leftOsc: OscillatorNode
  rightOsc: OscillatorNode
  merger: ChannelMergerNode
  gain: GainNode
}

function loopRegion(buffer: AudioBuffer, declared: number | null | undefined): number | null {
  if (!declared || declared <= 0) return null
  const pad = (buffer.duration - declared) / 2
  if (pad < LOOP_PAD_MIN_S) return null
  return pad
}

function startLoop(src: AudioBufferSourceNode, buffer: AudioBuffer, declared: number | null | undefined) {
  src.loop = true
  const pad = loopRegion(buffer, declared)
  if (pad === null) {
    src.start()
    return
  }
  src.loopStart = pad
  src.loopEnd = pad + declared!
  src.start(0, pad)
}

function takeClip(buffer: AudioBuffer, declared: number | null | undefined): TakeClip {
  const pad = loopRegion(buffer, declared)
  if (pad === null) return { buffer, offset: 0, duration: buffer.duration }
  return { buffer, offset: pad, duration: declared! }
}

function clipsFor({ el, buffer, takes }: DecodedElement): TakeClip[] {
  return [
    takeClip(buffer, el.duration_s),
    ...takes.map((take, i) => takeClip(take, el.takes[i]?.duration_s)),
  ]
}

function playTake(
  ctx: BaseAudioContext,
  input: AudioNode,
  clip: TakeClip,
  when: number,
  crossfade: number,
  fadeIn: boolean,
  voices: Set<AudioBufferSourceNode> | null,
): void {
  const src = ctx.createBufferSource()
  src.buffer = clip.buffer

  const gain = ctx.createGain()
  if (crossfade > 0) {
    if (fadeIn) gain.gain.setValueCurveAtTime(equalPowerCurve(true), when, crossfade)
    gain.gain.setValueCurveAtTime(equalPowerCurve(false), when + clip.duration - crossfade, crossfade)
  }
  src.connect(gain)
  gain.connect(input)

  if (voices) {
    voices.add(src)
    src.onended = () => {
      voices.delete(src)
      try { gain.disconnect() } catch {}
    }
  }

  src.start(when, clip.offset, clip.duration)
}

function scheduleTakes(ctx: BaseAudioContext, takes: TakeLane, now: number, horizon: number): void {
  if (takes.nextAt < now) takes.nextAt = now + EVENT_BACKLOG_RESET_S
  while (takes.nextAt < horizon) {
    const take = nextTake(takes.rng, takes.clips.length, takes.current)
    const clip = takes.clips[take]
    playTake(ctx, takes.input, clip, takes.nextAt, takes.crossfade, true, takes.voices)
    takes.current = take
    takes.nextAt += Math.max(clip.duration - takes.crossfade, takes.crossfade)
  }
}

export function isCanonicalBand(band: EQBand): boolean {
  if (band.source) return false
  return (
    (band.type === 'lowshelf' && band.freq === EQ_LOW_FREQ_HZ) ||
    (band.type === 'peaking' && band.freq === EQ_MID_FREQ_HZ) ||
    (band.type === 'highshelf' && band.freq === EQ_HIGH_FREQ_HZ)
  )
}

export function sliderBands(eq: EQState): EQBand[] {
  return [
    { type: 'lowshelf', freq: EQ_LOW_FREQ_HZ, q: EQ_SHELF_Q, gain: eq.low },
    { type: 'peaking', freq: EQ_MID_FREQ_HZ, q: EQ_MID_Q, gain: eq.mid },
    { type: 'highshelf', freq: EQ_HIGH_FREQ_HZ, q: EQ_SHELF_Q, gain: eq.high },
  ]
}

export function buildEQState(bands: EQBand[] | undefined): EQState {
  const state: EQState = { low: 0, mid: 0, high: 0 }
  if (!bands) return state
  for (const band of bands) {
    if (!isCanonicalBand(band)) continue
    if (band.type === 'lowshelf') state.low = band.gain
    else if (band.type === 'highshelf') state.high = band.gain
    else state.mid = band.gain
  }
  return state
}

export function correctiveBands(bands: EQBand[] | undefined): EQBand[] {
  if (!bands) return []
  return bands.filter(
    (band) => !isCanonicalBand(band) && Math.abs(band.gain) >= EQ_MIN_AUDIBLE_DB,
  )
}

function createCorrectiveFilters(
  ctx: BaseAudioContext,
  bands: EQBand[],
): BiquadFilterNode[] {
  return bands.map((band) => {
    const filter = ctx.createBiquadFilter()
    filter.type = band.type
    filter.frequency.value = band.freq
    filter.Q.value = band.q ?? (band.type === 'peaking' ? EQ_MID_Q : EQ_SHELF_Q)
    filter.gain.value = band.gain
    return filter
  })
}

function buildImpulseResponse(ctx: BaseAudioContext, random: () => number = Math.random, duration = REVERB_IR_DURATION_S, decay = REVERB_IR_DECAY): AudioBuffer {
  const sr = ctx.sampleRate
  const length = Math.floor(sr * duration)
  const ir = ctx.createBuffer(2, length, sr)
  for (let c = 0; c < 2; c++) {
    const ch = ir.getChannelData(c)
    let sumSq = 0
    for (let i = 0; i < length; i++) {
      const sample = (random() * 2 - 1) * Math.pow(1 - i / length, decay)
      ch[i] = sample
      sumSq += sample * sample
    }
    if (sumSq > 0) {
      const scale = 1 / Math.sqrt(sumSq)
      for (let i = 0; i < length; i++) ch[i] *= scale
    }
  }
  return ir
}

function createReverbBus(ctx: BaseAudioContext, bus: AudioNode, random: () => number = Math.random): ConvolverNode {
  const convolver = ctx.createConvolver()
  convolver.buffer = buildImpulseResponse(ctx, random)
  convolver.connect(bus)
  return convolver
}

function createSends(ctx: BaseAudioContext, depth: number): { dryGain: GainNode; wetGain: GainNode } {
  const dryGain = ctx.createGain()
  const wetGain = ctx.createGain()
  dryGain.gain.value = dryGainFor(depth)
  wetGain.gain.value = wetGainFor(depth)
  return { dryGain, wetGain }
}

function createPanner(ctx: BaseAudioContext, pan: number): StereoPannerNode {
  const panner = ctx.createStereoPanner()
  panner.channelCount = 1
  panner.channelCountMode = 'explicit'
  panner.pan.value = pan
  return panner
}

function createMasterLimiter(ctx: BaseAudioContext): DynamicsCompressorNode {
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = LIMITER_THRESHOLD_DB
  limiter.knee.value = LIMITER_KNEE_DB
  limiter.ratio.value = LIMITER_RATIO
  limiter.attack.value = LIMITER_ATTACK_S
  limiter.release.value = LIMITER_RELEASE_S
  return limiter
}

function stopVoices(track: TrackNode, at: number) {
  for (const voices of [track.lane?.voices, track.takes?.voices]) {
    if (!voices) continue
    voices.forEach((voice) => {
      try { voice.stop(at) } catch {}
    })
    voices.clear()
  }
}

function disconnectTrack(track: TrackNode) {
  try { track.pitchNode?.disconnect() } catch {}
  try { track.dryGain.disconnect() } catch {}
  try { track.wetGain.disconnect() } catch {}
}

function releaseTrack(ctx: BaseAudioContext, track: TrackNode) {
  const t = ctx.currentTime
  track.masterGain.gain.cancelScheduledValues(t)
  track.masterGain.gain.setValueAtTime(track.masterGain.gain.value, t)
  track.masterGain.gain.linearRampToValueAtTime(0, t + SOURCE_RELEASE_S)
  if (track.source) { try { track.source.stop(t + SOURCE_RELEASE_S) } catch {} }
  stopVoices(track, t + SOURCE_RELEASE_S)
  window.setTimeout(() => disconnectTrack(track), (SOURCE_RELEASE_S + TRACK_DISCONNECT_GRACE_S) * 1000)
}

function createFilters(ctx: BaseAudioContext, eq: EQState): [BiquadFilterNode, BiquadFilterNode, BiquadFilterNode] {
  const low = ctx.createBiquadFilter()
  low.type = 'lowshelf'
  low.frequency.value = EQ_LOW_FREQ_HZ
  low.gain.value = eq.low

  const mid = ctx.createBiquadFilter()
  mid.type = 'peaking'
  mid.frequency.value = EQ_MID_FREQ_HZ
  mid.Q.value = EQ_MID_Q
  mid.gain.value = eq.mid

  const high = ctx.createBiquadFilter()
  high.type = 'highshelf'
  high.frequency.value = EQ_HIGH_FREQ_HZ
  high.gain.value = eq.high

  low.connect(mid)
  mid.connect(high)

  return [low, mid, high]
}

function buildTrackChain(
  ctx: BaseAudioContext,
  bus: AudioNode,
  reverb: AudioNode,
  params: ChainParams,
): TrackChain {
  const filters = createFilters(ctx, params.eq)
  const [lowFilter, , highFilter] = filters

  const rumble = ctx.createBiquadFilter()
  rumble.type = 'highpass'
  rumble.frequency.value = RUMBLE_FREQ_HZ
  rumble.Q.value = RUMBLE_Q

  const corrective = createCorrectiveFilters(ctx, params.bands)
  const head: AudioNode = corrective.reduce<AudioNode>((prev, filter) => {
    prev.connect(filter)
    return filter
  }, rumble)
  head.connect(lowFilter)

  const masterGain = ctx.createGain()
  masterGain.gain.value = params.gain

  const panner = createPanner(ctx, params.pan)
  const { dryGain, wetGain } = createSends(ctx, params.depth)

  highFilter.connect(masterGain)
  masterGain.connect(panner)
  panner.connect(dryGain)
  panner.connect(wetGain)
  dryGain.connect(bus)
  wetGain.connect(reverb)

  return { input: rumble, filters, masterGain, panner, dryGain, wetGain }
}

function triggerOneShot(
  ctx: BaseAudioContext,
  chain: TrackChain,
  buffer: AudioBuffer,
  basePan: number,
  shape: TriggerShape,
  when: number,
  voices: Set<AudioBufferSourceNode> | null,
): void {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.playbackRate.value = shape.rate

  const gain = ctx.createGain()
  gain.gain.value = dbToGain(shape.gainDb)
  src.connect(gain)
  gain.connect(chain.input)

  chain.panner.pan.setValueAtTime(clampPan(basePan + shape.panOffset), when)

  if (voices) {
    voices.add(src)
    src.onended = () => {
      voices.delete(src)
      try { gain.disconnect() } catch {}
    }
  }

  src.start(when)
}

function intervalsFor(el: Element): [number, number] {
  return [
    el.interval_min_s ?? DEFAULT_INTERVAL_MIN_S,
    el.interval_max_s ?? DEFAULT_INTERVAL_MAX_S,
  ]
}

export function useAudioEngine() {
  const ctxRef = useRef<AudioContext | null>(null)
  const tracksRef = useRef<Map<string, TrackNode>>(new Map())
  const decodedRef = useRef<DecodedElement[]>([])
  const bufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map())
  const analyserRef = useRef<AnalyserNode | null>(null)
  const reverbRef = useRef<ConvolverNode | null>(null)
  const limiterRef = useRef<DynamicsCompressorNode | null>(null)
  const volumeStateRef = useRef<Map<string, number>>(new Map())
  const eqStateRef = useRef<Map<string, EQState>>(new Map())
  const panStateRef = useRef<Map<string, number>>(new Map())
  const depthStateRef = useRef<Map<string, number>>(new Map())
  const pitchRef = useRef(1.0)
  const workletReadyRef = useRef(false)
  const binauralRef = useRef<BinauralNodes | null>(null)
  const binauralLeftHzRef = useRef(200)
  const binauralRightHzRef = useRef(208)

  const schedulerRef = useRef<number | null>(null)
  const lookaheadRef = useRef(LOOKAHEAD_S)
  const intervalStateRef = useRef<Map<string, [number, number]>>(new Map())

  const animateRafRef = useRef(0)
  const animateSnapshotRef = useRef<Map<string, { vol: number; pan: number; depth: number }>>(new Map())
  const animateStateRef = useRef<Map<string, { vol: number; pan: number; depth: number; velVol: number; velPan: number; velDepth: number; phasePan: number; phaseDepth: number }>>(new Map())
  const animateCallbackRef = useRef<((values: Map<string, { vol: number; pan: number; depth: number }>) => void) | null>(null)
  const animateMutedRef = useRef<Set<string>>(new Set())

  const getContext = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext()
      analyserRef.current = ctxRef.current.createAnalyser()
      analyserRef.current.fftSize = 256
      analyserRef.current.smoothingTimeConstant = 0.8

      const limiter = createMasterLimiter(ctxRef.current)
      analyserRef.current.connect(limiter)
      limiter.connect(ctxRef.current.destination)
      limiterRef.current = limiter
      reverbRef.current = createReverbBus(ctxRef.current, analyserRef.current)
    }
    return ctxRef.current
  }, [])

  async function ensureWorklet(ctx: AudioContext) {
    if (!workletReadyRef.current) {
      await SoundTouchNode.register(ctx, '/soundtouch-processor.js')
      workletReadyRef.current = true
    }
  }

  const onVisibility = useCallback(() => {
    lookaheadRef.current = document.hidden ? LOOKAHEAD_HIDDEN_S : LOOKAHEAD_S
  }, [])

  const scheduleLanes = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx || ctx.state !== 'running') return

    const now = ctx.currentTime
    const horizon = now + lookaheadRef.current

    tracksRef.current.forEach((track) => {
      if (track.takes) {
        scheduleTakes(ctx, track.takes, now, horizon + TAKE_LOOKAHEAD_S)
        return
      }

      const lane = track.lane
      if (!lane) return
      if (lane.nextAt < now) lane.nextAt = now + EVENT_BACKLOG_RESET_S

      while (lane.nextAt < horizon) {
        if (lane.voices.size < EVENT_MAX_VOICES) {
          triggerOneShot(
            ctx,
            track,
            lane.buffer,
            track.basePan,
            nextShape(lane.rng),
            lane.nextAt,
            lane.voices,
          )
        }
        lane.nextAt += nextInterval(lane.rng, lane.minS, lane.maxS, lane.buffer.duration)
      }
    })
  }, [])

  const stopScheduler = useCallback(() => {
    if (schedulerRef.current === null) return
    window.clearInterval(schedulerRef.current)
    schedulerRef.current = null
    document.removeEventListener('visibilitychange', onVisibility)
  }, [onVisibility])

  const syncScheduler = useCallback(() => {
    let hasLane = false
    tracksRef.current.forEach((track) => {
      if (track.lane || track.takes) hasLane = true
    })

    if (!hasLane) {
      stopScheduler()
      return
    }
    if (schedulerRef.current !== null) return

    lookaheadRef.current = document.hidden ? LOOKAHEAD_HIDDEN_S : LOOKAHEAD_S
    document.addEventListener('visibilitychange', onVisibility)
    schedulerRef.current = window.setInterval(scheduleLanes, SCHEDULER_TICK_MS)
  }, [onVisibility, scheduleLanes, stopScheduler])

  function startFromDecoded(ctx: AudioContext, decoded: DecodedElement[]) {
    tracksRef.current.forEach((track) => releaseTrack(ctx, track))
    tracksRef.current.clear()

    for (const item of decoded) {
      const { el, buffer } = item
      const eq = eqStateRef.current.get(el.label) ?? buildEQState(el.eq_json ?? undefined)
      const vol = volumeStateRef.current.has(el.label)
        ? volumeStateRef.current.get(el.label)!
        : el.volume
      const pan = panStateRef.current.has(el.label)
        ? panStateRef.current.get(el.label)!
        : (el.pan ?? 0)
      const depth = depthStateRef.current.get(el.label) ?? 0
      const bus = analyserRef.current ?? ctx.destination
      const reverb = reverbRef.current ?? createReverbBus(ctx, bus)
      reverbRef.current = reverb

      const chain = buildTrackChain(ctx, bus, reverb, {
        eq,
        bands: correctiveBands(el.eq_json ?? undefined),
        gain: trackGain(vol),
        pan,
        depth,
      })

      if (el.playback === 'oneshot') {
        const [minS, maxS] = intervalStateRef.current.get(el.label) ?? intervalsFor(el)
        tracksRef.current.set(el.label, {
          ...chain,
          source: null,
          pitchNode: null,
          basePan: pan,
          takes: null,
          lane: {
            buffer,
            rng: Math.random,
            voices: new Set(),
            nextAt: ctx.currentTime + firstTriggerDelay(Math.random, minS, buffer.duration),
            minS,
            maxS,
          },
        })
        continue
      }

      const pitchNode = new SoundTouchNode(ctx)
      pitchNode.pitch!.value = pitchRef.current
      pitchNode.connect(chain.input)

      const clips = clipsFor(item)
      if (clips.length > 1) {
        const crossfade = takeCrossfade(clips.map((clip) => clip.duration))
        const voices = new Set<AudioBufferSourceNode>()
        const now = ctx.currentTime
        playTake(ctx, pitchNode, clips[0], now, crossfade, false, voices)
        tracksRef.current.set(el.label, {
          ...chain,
          source: null,
          pitchNode,
          basePan: pan,
          lane: null,
          takes: {
            clips,
            rng: Math.random,
            voices,
            current: 0,
            nextAt: now + Math.max(clips[0].duration - crossfade, crossfade),
            crossfade,
            input: pitchNode,
          },
        })
        continue
      }

      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.connect(pitchNode)
      startLoop(src, buffer, el.duration_s)

      tracksRef.current.set(el.label, {
        ...chain,
        source: src,
        pitchNode,
        basePan: pan,
        lane: null,
        takes: null,
      })
    }

    syncScheduler()
  }

  async function decodeElements(elements: Element[]): Promise<DecodedElement[]> {
    const ctx = getContext()
    const cache = bufferCacheRef.current
    const fetchBuffer = async (url: string, label: string): Promise<AudioBuffer> => {
      const cached = cache.get(url)
      if (cached) return cached
      const res = await fetch(apiUrl(url), { headers: authHeaders() })
      if (!res.ok) {
        throw new Error(`Failed to load audio for ${label}: ${res.status}`)
      }
      return ctx.decodeAudioData(await res.arrayBuffer())
    }
    const decoded = await Promise.all(
      elements.map(async (el) => {
        if (!el.audio_url) {
          throw new Error(`Element ${el.label} has no audio_url`)
        }
        const [buffer, ...takes] = await Promise.all([
          fetchBuffer(el.audio_url, el.label),
          ...(el.takes ?? []).map((take) => fetchBuffer(take.audio_url, el.label)),
        ])
        return { el, buffer, takes }
      })
    )
    cache.clear()
    for (const { el, buffer, takes } of decoded) {
      cache.set(el.audio_url!, buffer)
      for (const [i, take] of (el.takes ?? []).entries()) cache.set(take.audio_url, takes[i])
    }
    return decoded
  }

  const load = useCallback(async (elements: Element[]) => {
    const ctx = getContext()
    if (ctx.state === 'suspended') await ctx.resume()
    await ensureWorklet(ctx)
    decodedRef.current = await decodeElements(elements)
    startFromDecoded(ctx, decodedRef.current)
  }, [getContext])

  const start = useCallback(async () => {
    const ctx = getContext()
    if (tracksRef.current.size === 0 && decodedRef.current.length > 0) {
      await ensureWorklet(ctx)
      startFromDecoded(ctx, decodedRef.current)
    }
    if (ctx.state === 'suspended') await ctx.resume()
  }, [getContext])

  const pause = useCallback(async () => {
    if (ctxRef.current?.state !== 'running') return
    await ctxRef.current.suspend()
  }, [])

  const setVolume = useCallback((label: string, volume: number) => {
    volumeStateRef.current.set(label, volume)
    const track = tracksRef.current.get(label)
    if (track) {
      track.masterGain.gain.setTargetAtTime(trackGain(volume), getContext().currentTime, 0.05)
    }
  }, [getContext])

  const setTuning = useCallback((freqHz: number) => {
    const pitch = freqHz / 440
    pitchRef.current = pitch
    tracksRef.current.forEach(({ pitchNode }) => {
      if (pitchNode) pitchNode.pitch!.value = pitch
    })
  }, [])

  const setEQ = useCallback((label: string, eq: EQState) => {
    eqStateRef.current.set(label, eq)
    const track = tracksRef.current.get(label)
    if (!track) return
    const [low, mid, high] = track.filters
    const t = getContext().currentTime
    low.gain.setTargetAtTime(eq.low, t, 0.02)
    mid.gain.setTargetAtTime(eq.mid, t, 0.02)
    high.gain.setTargetAtTime(eq.high, t, 0.02)
  }, [getContext])

  const setPan = useCallback((label: string, pan: number) => {
    panStateRef.current.set(label, pan)
    const track = tracksRef.current.get(label)
    if (!track) return
    track.basePan = pan
    if (track.lane) return
    track.panner.pan.setTargetAtTime(pan, getContext().currentTime, 0.05)
  }, [getContext])

  const setEventInterval = useCallback((label: string, minS: number, maxS: number) => {
    intervalStateRef.current.set(label, [minS, maxS])
    const lane = tracksRef.current.get(label)?.lane
    if (!lane) return
    lane.minS = minS
    lane.maxS = maxS
    const ctx = ctxRef.current
    if (ctx) {
      lane.nextAt = Math.min(
        lane.nextAt,
        ctx.currentTime + nextInterval(lane.rng, minS, maxS, lane.buffer.duration),
      )
    }
  }, [])

  const setDepth = useCallback((label: string, depth: number) => {
    depthStateRef.current.set(label, depth)
    const track = tracksRef.current.get(label)
    if (!track) return
    const t = getContext().currentTime
    track.dryGain.gain.setTargetAtTime(dryGainFor(depth), t, 0.05)
    track.wetGain.gain.setTargetAtTime(wetGainFor(depth), t, 0.05)
  }, [getContext])

  const startBinaural = useCallback(() => {
    const ctx = getContext()
    if (binauralRef.current) return
    const leftOsc = ctx.createOscillator()
    const rightOsc = ctx.createOscillator()
    leftOsc.type = 'sine'
    rightOsc.type = 'sine'
    leftOsc.frequency.value = binauralLeftHzRef.current
    rightOsc.frequency.value = binauralRightHzRef.current

    const merger = ctx.createChannelMerger(2)
    const gain = ctx.createGain()
    gain.gain.value = 0.15

    const leftSplitter = ctx.createGain()
    const rightSplitter = ctx.createGain()
    leftOsc.connect(leftSplitter)
    rightOsc.connect(rightSplitter)
    leftSplitter.connect(merger, 0, 0)
    rightSplitter.connect(merger, 0, 1)
    merger.connect(gain)
    gain.connect(limiterRef.current ?? ctx.destination)

    leftOsc.start()
    rightOsc.start()
    binauralRef.current = { leftOsc, rightOsc, merger, gain }
  }, [getContext])

  const stopBinaural = useCallback(() => {
    if (!binauralRef.current) return
    const { leftOsc, rightOsc } = binauralRef.current
    try { leftOsc.stop() } catch {}
    try { rightOsc.stop() } catch {}
    binauralRef.current = null
  }, [])

  const setBinauralFreqs = useCallback((leftHz: number, rightHz: number) => {
    binauralLeftHzRef.current = leftHz
    binauralRightHzRef.current = rightHz
    if (!binauralRef.current) return
    const ctx = getContext()
    binauralRef.current.leftOsc.frequency.setTargetAtTime(leftHz, ctx.currentTime, 0.05)
    binauralRef.current.rightOsc.frequency.setTargetAtTime(rightHz, ctx.currentTime, 0.05)
  }, [getContext])

  const startAnimate = useCallback((
    onFrame: (values: Map<string, { vol: number; pan: number; depth: number }>) => void
  ) => {
    cancelAnimationFrame(animateRafRef.current)
    animateCallbackRef.current = onFrame

    const snapshot = new Map<string, { vol: number; pan: number; depth: number }>()
    const state = new Map<string, {
      vol: number; pan: number; depth: number
      velVol: number; velPan: number; velDepth: number
      phasePan: number; phaseDepth: number
    }>()

    for (const label of tracksRef.current.keys()) {
      const vol   = volumeStateRef.current.get(label) ?? 1
      const pan   = panStateRef.current.get(label)   ?? 0
      const depth = depthStateRef.current.get(label) ?? 0
      snapshot.set(label, { vol, pan, depth })
      state.set(label, { vol, pan, depth, velVol: 0, velPan: 0, velDepth: 0, phasePan: 0, phaseDepth: 0 })
    }

    animateSnapshotRef.current = snapshot
    animateStateRef.current = state

    const DRAG      = 0.992
    const NUDGE_VOL = 0.0002

    const t0 = performance.now() * 0.001
    for (const [, s] of animateStateRef.current) {
      s.velPan   = 0.07 + Math.random() * 0.06
      s.velDepth = s.velPan * (1.0 + Math.random() * 0.8)
      const panTarget   = Math.max(-1, Math.min(1, s.pan))
      const depthTarget = Math.max(-1, Math.min(1, (s.depth - 0.5) * 2))
      s.phasePan   = Math.asin(panTarget)   - t0 * s.velPan
      s.phaseDepth = Math.asin(depthTarget) - t0 * s.velDepth
    }

    let lastPush = -Infinity

    function tick() {
      animateRafRef.current = requestAnimationFrame(tick)
      const now = performance.now() * 0.001
      const push = now - lastPush >= ANIMATE_PUSH_INTERVAL_S
      if (push) lastPush = now
      const ctx = ctxRef.current
      const out = new Map<string, { vol: number; pan: number; depth: number }>()

      for (const [label, s] of animateStateRef.current) {
        s.velVol = s.velVol * DRAG + (Math.random() - 0.5) * NUDGE_VOL
        s.vol = Math.max(0.05, Math.min(1, s.vol + s.velVol))
        if (s.vol < 0.15) s.velVol += 0.0004
        if (s.vol > 0.90) s.velVol -= 0.0004

        s.pan   = Math.sin(now * s.velPan   + s.phasePan)
        s.depth = 0.5 + 0.5 * Math.sin(now * s.velDepth + s.phaseDepth)
        if (!push) continue

        const track = tracksRef.current.get(label)
        if (track && ctx && !animateMutedRef.current.has(label)) {
          const t = ctx.currentTime
          track.masterGain.gain.setTargetAtTime(trackGain(s.vol), t, 1.5)
          track.panner.pan.setTargetAtTime(s.pan, t, 1.5)
          track.dryGain.gain.setTargetAtTime(dryGainFor(s.depth), t, 1.5)
          track.wetGain.gain.setTargetAtTime(wetGainFor(s.depth), t, 1.5)
        }

        out.set(label, { vol: s.vol, pan: s.pan, depth: s.depth })
      }

      if (push) animateCallbackRef.current?.(out)
    }

    tick()
  }, [])

  const stopAnimate = useCallback(() => {
    cancelAnimationFrame(animateRafRef.current)
    animateCallbackRef.current = null

    const ctx = ctxRef.current
    for (const [label, snap] of animateSnapshotRef.current) {
      const track = tracksRef.current.get(label)
      if (track && ctx) {
        const t = ctx.currentTime
        track.masterGain.gain.setTargetAtTime(trackGain(snap.vol), t, 0.08)
        track.panner.pan.setTargetAtTime(snap.pan, t, 0.08)
        track.dryGain.gain.setTargetAtTime(dryGainFor(snap.depth), t, 0.08)
        track.wetGain.gain.setTargetAtTime(wetGainFor(snap.depth), t, 0.08)
      }
    }

    animateSnapshotRef.current.clear()
    animateStateRef.current.clear()
  }, [])

  const stop = useCallback(() => {
    cancelAnimationFrame(animateRafRef.current)
    animateCallbackRef.current = null
    animateSnapshotRef.current.clear()
    animateStateRef.current.clear()
    stopScheduler()
    stopBinaural()
    tracksRef.current.forEach((track) => {
      if (track.source) { try { track.source.stop() } catch {} }
      stopVoices(track, 0)
    })
    tracksRef.current.clear()
    decodedRef.current = []
    bufferCacheRef.current.clear()
    volumeStateRef.current.clear()
    eqStateRef.current.clear()
    panStateRef.current.clear()
    depthStateRef.current.clear()
    intervalStateRef.current.clear()
    workletReadyRef.current = false
    ctxRef.current?.close()
    ctxRef.current = null
    analyserRef.current = null
    reverbRef.current = null
    limiterRef.current = null
  }, [stopBinaural, stopScheduler])

  const forget = useCallback((labels: string[]) => {
    for (const label of labels) {
      const track = tracksRef.current.get(label)
      if (track) {
        if (ctxRef.current) releaseTrack(ctxRef.current, track)
        else {
          if (track.source) { try { track.source.stop() } catch {} }
          stopVoices(track, 0)
        }
        tracksRef.current.delete(label)
      }
      decodedRef.current = decodedRef.current.filter((d) => d.el.label !== label)
      volumeStateRef.current.delete(label)
      eqStateRef.current.delete(label)
      panStateRef.current.delete(label)
      depthStateRef.current.delete(label)
      intervalStateRef.current.delete(label)
      animateSnapshotRef.current.delete(label)
      animateStateRef.current.delete(label)
    }
    syncScheduler()
  }, [syncScheduler])

  const getAnalyser = useCallback(() => analyserRef.current, [])

  const exportMix = useCallback(async (filename: string, seconds: number) => {
    if (decodedRef.current.length === 0) return
    const sampleRate = 44100
    const offline = new OfflineAudioContext(2, Math.ceil(sampleRate * seconds), sampleRate)

    await SoundTouchNode.register(offline, '/soundtouch-processor.js')

    const limiter = createMasterLimiter(offline)
    limiter.connect(offline.destination)
    const reverb = createReverbBus(offline, limiter, mulberry32(EXPORT_SEED >>> 0))

    for (const item of decodedRef.current) {
      const { el, buffer } = item
      const liveTrack = tracksRef.current.get(el.label)
      const eq: EQState = liveTrack ? {
        low: liveTrack.filters[0].gain.value,
        mid: liveTrack.filters[1].gain.value,
        high: liveTrack.filters[2].gain.value,
      } : buildEQState(el.eq_json ?? undefined)

      const isEvent = el.playback === 'oneshot'
      const pan = liveTrack
        ? (isEvent ? liveTrack.basePan : liveTrack.panner.pan.value)
        : (el.pan ?? 0)

      const rng = mulberry32((EXPORT_SEED ^ el.id) >>> 0)
      const chain = buildTrackChain(offline, limiter, reverb, {
        eq,
        bands: correctiveBands(el.eq_json ?? undefined),
        gain: liveTrack ? liveTrack.masterGain.gain.value : trackGain(el.volume),
        pan,
        depth: depthStateRef.current.get(el.label) ?? 0,
      })

      if (isEvent) {
        const [minS, maxS] = intervalStateRef.current.get(el.label) ?? intervalsFor(el)
        for (const trigger of planTriggers(rng, seconds, minS, maxS, buffer.duration)) {
          triggerOneShot(offline, chain, buffer, pan, trigger, trigger.at, null)
        }
        continue
      }

      const offlinePitchNode = new SoundTouchNode(offline)
      offlinePitchNode.pitch!.value = pitchRef.current
      offlinePitchNode.connect(chain.input)

      const clips = clipsFor(item)
      if (clips.length > 1) {
        const crossfade = takeCrossfade(clips.map((clip) => clip.duration))
        const plan = planTakes(rng, seconds, clips.map((clip) => clip.duration), crossfade)
        plan.forEach((segment, i) => {
          playTake(offline, offlinePitchNode, clips[segment.take], segment.at, crossfade, i > 0, null)
        })
        continue
      }

      const src = offline.createBufferSource()
      src.buffer = buffer
      src.connect(offlinePitchNode)
      startLoop(src, buffer, el.duration_s)
    }

    const rendered = await offline.startRendering()
    const wav = audioBufferToWav(rendered)
    const blob = new Blob([wav], { type: 'audio/wav' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.wav`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const setAnimateMuted = useCallback((muted: Set<string>) => {
    animateMutedRef.current = muted
  }, [])

  return { load, start, pause, setVolume, setEQ, setPan, setDepth, setTuning, setEventInterval, stop, forget, exportMix, getAnalyser, startAnimate, stopAnimate, setAnimateMuted, startBinaural, stopBinaural, setBinauralFreqs }
}

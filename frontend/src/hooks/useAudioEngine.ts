import { useRef, useCallback } from 'react'
import { SoundTouchNode } from '@soundtouchjs/audio-worklet'
import { apiUrl, authHeaders } from '../api/client'
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

const TRACK_GAIN_SCALE = 0.5
const REVERB_DRY_ATTENUATION = 0.7
const REVERB_WET_SEND = 0.6
const REVERB_IR_DURATION_S = 2.5
const REVERB_IR_DECAY = 3.0
const REVERB_IR_TARGET_RMS = 0.05

const EQ_LOW_FREQ_HZ = 200
const EQ_MID_FREQ_HZ = 1000
const EQ_MID_Q = 1.4
const EQ_HIGH_FREQ_HZ = 8000

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
  low: number   // dB, low shelf at 200Hz
  mid: number   // dB, peak at 1000Hz
  high: number  // dB, high shelf at 8000Hz
}

interface TrackNode {
  masterGain: GainNode
  panner: StereoPannerNode
  convolver: ConvolverNode
  dryGain: GainNode
  wetGain: GainNode
  source: AudioBufferSourceNode
  pitchNode: SoundTouchNode
  filters: [BiquadFilterNode, BiquadFilterNode, BiquadFilterNode]
}

interface DecodedElement {
  el: Element
  buffer: AudioBuffer
}

interface BinauralNodes {
  leftOsc: OscillatorNode
  rightOsc: OscillatorNode
  merger: ChannelMergerNode
  gain: GainNode
}

function buildEQState(bands: EQBand[] | undefined): EQState {
  const state: EQState = { low: 0, mid: 0, high: 0 }
  if (!bands) return state
  for (const band of bands) {
    if (band.type === 'lowshelf') state.low = band.gain
    else if (band.type === 'highshelf') state.high = band.gain
    else if (band.type === 'peaking') state.mid = band.gain
  }
  return state
}

function buildImpulseResponse(ctx: BaseAudioContext, duration = REVERB_IR_DURATION_S, decay = REVERB_IR_DECAY): AudioBuffer {
  const sr = ctx.sampleRate
  const length = Math.floor(sr * duration)
  const ir = ctx.createBuffer(2, length, sr)
  for (let c = 0; c < 2; c++) {
    const ch = ir.getChannelData(c)
    let sumSq = 0
    for (let i = 0; i < length; i++) {
      const sample = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
      ch[i] = sample
      sumSq += sample * sample
    }
    const rms = Math.sqrt(sumSq / length)
    if (rms > 0) {
      const scale = REVERB_IR_TARGET_RMS / rms
      for (let i = 0; i < length; i++) ch[i] *= scale
    }
  }
  return ir
}

function createReverb(ctx: BaseAudioContext, depth: number): { convolver: ConvolverNode; dryGain: GainNode; wetGain: GainNode } {
  const convolver = ctx.createConvolver()
  convolver.buffer = buildImpulseResponse(ctx)
  const dryGain = ctx.createGain()
  const wetGain = ctx.createGain()
  dryGain.gain.value = dryGainFor(depth)
  wetGain.gain.value = wetGainFor(depth)
  return { convolver, dryGain, wetGain }
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

export function useAudioEngine() {
  const ctxRef = useRef<AudioContext | null>(null)
  const tracksRef = useRef<Map<string, TrackNode>>(new Map())
  const decodedRef = useRef<DecodedElement[]>([])
  const analyserRef = useRef<AnalyserNode | null>(null)
  const volumeStateRef = useRef<Map<string, number>>(new Map())
  const eqStateRef = useRef<Map<string, EQState>>(new Map())
  const panStateRef = useRef<Map<string, number>>(new Map())
  const depthStateRef = useRef<Map<string, number>>(new Map())
  const pitchRef = useRef(1.0)
  const workletReadyRef = useRef(false)
  const binauralRef = useRef<BinauralNodes | null>(null)
  const binauralLeftHzRef = useRef(200)
  const binauralRightHzRef = useRef(208)

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

      const limiter = ctxRef.current.createDynamicsCompressor()
      limiter.threshold.value = -4
      limiter.knee.value = 0
      limiter.ratio.value = 20
      limiter.attack.value = 0.001
      limiter.release.value = 0.1

      analyserRef.current.connect(limiter)
      limiter.connect(ctxRef.current.destination)
    }
    return ctxRef.current
  }, [])

  async function ensureWorklet(ctx: AudioContext) {
    if (!workletReadyRef.current) {
      await SoundTouchNode.register(ctx, '/soundtouch-processor.js')
      workletReadyRef.current = true
    }
  }

  function startFromDecoded(ctx: AudioContext, decoded: DecodedElement[]) {
    tracksRef.current.forEach(({ source }) => {
      try { source.stop() } catch {}
    })
    tracksRef.current.clear()

    for (const { el, buffer } of decoded) {
      const eq = eqStateRef.current.get(el.label) ?? buildEQState(el.eq_json ?? undefined)
      const filters = createFilters(ctx, eq)
      const [lowFilter,, highFilter] = filters

      const masterGain = ctx.createGain()
      const vol = volumeStateRef.current.has(el.label)
        ? volumeStateRef.current.get(el.label)!
        : el.volume
      masterGain.gain.value = trackGain(vol)

      const panner = ctx.createStereoPanner()
      panner.pan.value = panStateRef.current.has(el.label)
        ? panStateRef.current.get(el.label)!
        : (el.pan ?? 0)

      const depth = depthStateRef.current.get(el.label) ?? 0
      const { convolver, dryGain, wetGain } = createReverb(ctx, depth)

      highFilter.connect(masterGain)
      masterGain.connect(dryGain)
      masterGain.connect(convolver)
      convolver.connect(wetGain)
      dryGain.connect(panner)
      wetGain.connect(panner)
      panner.connect(analyserRef.current ?? ctx.destination)

      const pitchNode = new SoundTouchNode(ctx)
      pitchNode.pitch!.value = pitchRef.current
      pitchNode.connect(lowFilter)

      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.loop = true
      src.connect(pitchNode)
      src.start()

      tracksRef.current.set(el.label, { masterGain, panner, convolver, dryGain, wetGain, source: src, pitchNode, filters })
    }
  }

  async function decodeElements(elements: Element[]): Promise<DecodedElement[]> {
    const ctx = getContext()
    return Promise.all(
      elements.map(async (el) => {
        if (!el.audio_url) {
          throw new Error(`Element ${el.label} has no audio_url`)
        }
        const res = await fetch(apiUrl(el.audio_url), { headers: authHeaders() })
        if (!res.ok) {
          throw new Error(`Failed to load audio for ${el.label}: ${res.status}`)
        }
        const arrayBuffer = await res.arrayBuffer()
        const buffer = await ctx.decodeAudioData(arrayBuffer)
        return { el, buffer }
      })
    )
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
      pitchNode.pitch!.value = pitch
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
    if (track) {
      track.panner.pan.setTargetAtTime(pan, getContext().currentTime, 0.05)
    }
  }, [getContext])

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
    gain.connect(ctx.destination)

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

    function tick() {
      animateRafRef.current = requestAnimationFrame(tick)
      const now = performance.now() * 0.001
      const ctx = ctxRef.current
      const out = new Map<string, { vol: number; pan: number; depth: number }>()

      for (const [label, s] of animateStateRef.current) {
        s.velVol = s.velVol * DRAG + (Math.random() - 0.5) * NUDGE_VOL
        s.vol = Math.max(0.05, Math.min(1, s.vol + s.velVol))
        if (s.vol < 0.15) s.velVol += 0.0004
        if (s.vol > 0.90) s.velVol -= 0.0004

        s.pan   = Math.sin(now * s.velPan   + s.phasePan)
        s.depth = 0.5 + 0.5 * Math.sin(now * s.velDepth + s.phaseDepth)

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

      animateCallbackRef.current?.(out)
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
    stopBinaural()
    tracksRef.current.forEach(({ source }) => {
      try { source.stop() } catch {}
    })
    tracksRef.current.clear()
    decodedRef.current = []
    volumeStateRef.current.clear()
    eqStateRef.current.clear()
    panStateRef.current.clear()
    depthStateRef.current.clear()
    workletReadyRef.current = false
    ctxRef.current?.close()
    ctxRef.current = null
    analyserRef.current = null
  }, [stopBinaural])

  const getAnalyser = useCallback(() => analyserRef.current, [])

  const exportMix = useCallback(async (filename: string) => {
    if (decodedRef.current.length === 0) return
    const sampleRate = 44100
    const duration = Math.max(...decodedRef.current.map(({ buffer }) => buffer.duration))
    const offline = new OfflineAudioContext(2, Math.ceil(sampleRate * duration), sampleRate)

    await SoundTouchNode.register(offline, '/soundtouch-processor.js')

    for (const { el, buffer } of decodedRef.current) {
      const liveTrack = tracksRef.current.get(el.label)
      const eqState: EQState = liveTrack ? {
        low: liveTrack.filters[0].gain.value,
        mid: liveTrack.filters[1].gain.value,
        high: liveTrack.filters[2].gain.value,
      } : buildEQState(el.eq_json ?? undefined)

      const offlineFilters = createFilters(offline, eqState)
      const [lowFilter,, highFilter] = offlineFilters

      const gain = offline.createGain()
      gain.gain.value = liveTrack ? liveTrack.masterGain.gain.value : trackGain(el.volume)

      const depth = depthStateRef.current.get(el.label) ?? 0
      const { convolver, dryGain, wetGain } = createReverb(offline, depth)

      const panner = offline.createStereoPanner()
      panner.pan.value = liveTrack ? liveTrack.panner.pan.value : (el.pan ?? 0)

      highFilter.connect(gain)
      gain.connect(dryGain)
      gain.connect(convolver)
      convolver.connect(wetGain)
      dryGain.connect(panner)
      wetGain.connect(panner)
      panner.connect(offline.destination)

      const offlinePitchNode = new SoundTouchNode(offline)
      offlinePitchNode.pitch!.value = pitchRef.current
      offlinePitchNode.connect(lowFilter)

      const src = offline.createBufferSource()
      src.buffer = buffer
      src.loop = true
      src.connect(offlinePitchNode)
      src.start()
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

  return { load, start, pause, setVolume, setEQ, setPan, setDepth, setTuning, stop, exportMix, getAnalyser, startAnimate, stopAnimate, setAnimateMuted, startBinaural, stopBinaural, setBinauralFreqs }
}

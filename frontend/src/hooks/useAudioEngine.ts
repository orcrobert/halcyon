import { useRef, useCallback } from 'react'
import { SoundTouchNode } from '@soundtouchjs/audio-worklet'
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

function buildEQState(bands: EQBand[] | undefined): EQState {
  const state: EQState = { low: 0, mid: 0, high: 0 }
  if (!bands) return state
  for (const band of bands) {
    if (band.type === 'low_shelf') state.low = band.gain_db
    else if (band.type === 'high_shelf') state.high = band.gain_db
    else if (band.type === 'peak') state.mid = band.gain_db
  }
  return state
}

function buildImpulseResponse(ctx: BaseAudioContext, duration = 2.5, decay = 3.0): AudioBuffer {
  const sr = ctx.sampleRate
  const length = Math.floor(sr * duration)
  const ir = ctx.createBuffer(2, length, sr)
  for (let c = 0; c < 2; c++) {
    const ch = ir.getChannelData(c)
    for (let i = 0; i < length; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
    }
  }
  return ir
}

function createReverb(ctx: BaseAudioContext, depth: number): { convolver: ConvolverNode; dryGain: GainNode; wetGain: GainNode } {
  const convolver = ctx.createConvolver()
  convolver.buffer = buildImpulseResponse(ctx)
  const dryGain = ctx.createGain()
  const wetGain = ctx.createGain()
  dryGain.gain.value = 1 - depth * 0.7
  wetGain.gain.value = depth * 0.6
  return { convolver, dryGain, wetGain }
}

function createFilters(ctx: BaseAudioContext, eq: EQState): [BiquadFilterNode, BiquadFilterNode, BiquadFilterNode] {
  const low = ctx.createBiquadFilter()
  low.type = 'lowshelf'
  low.frequency.value = 200
  low.gain.value = eq.low

  const mid = ctx.createBiquadFilter()
  mid.type = 'peaking'
  mid.frequency.value = 1000
  mid.Q.value = 1.4
  mid.gain.value = eq.mid

  const high = ctx.createBiquadFilter()
  high.type = 'highshelf'
  high.frequency.value = 8000
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

  const getContext = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext()
      analyserRef.current = ctxRef.current.createAnalyser()
      analyserRef.current.fftSize = 256
      analyserRef.current.smoothingTimeConstant = 0.8
      analyserRef.current.connect(ctxRef.current.destination)
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
      const eq = eqStateRef.current.get(el.label) ?? buildEQState(el.eq)
      const filters = createFilters(ctx, eq)
      const [lowFilter,, highFilter] = filters

      const masterGain = ctx.createGain()
      masterGain.gain.value = volumeStateRef.current.has(el.label)
        ? volumeStateRef.current.get(el.label)!
        : el.volume

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
        const bytes = Uint8Array.from(atob(el.audio_b64), c => c.charCodeAt(0))
        const buffer = await ctx.decodeAudioData(bytes.buffer)
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

  const preload = useCallback(async (elements: Element[]) => {
    decodedRef.current = await decodeElements(elements)
  }, [getContext])

  const start = useCallback(async () => {
    const ctx = getContext()
    if (ctx.state === 'suspended') await ctx.resume()
    if (tracksRef.current.size === 0 && decodedRef.current.length > 0) {
      await ensureWorklet(ctx)
      startFromDecoded(ctx, decodedRef.current)
    }
  }, [getContext])

  const pause = useCallback(async () => {
    if (ctxRef.current?.state !== 'running') return
    await ctxRef.current.suspend()
  }, [])

  const unpause = useCallback(async () => {
    const ctx = getContext()
    if (ctx.state === 'suspended') await ctx.resume()
    startFromDecoded(ctx, decodedRef.current)
  }, [getContext])

  const setVolume = useCallback((label: string, volume: number) => {
    volumeStateRef.current.set(label, volume)
    const track = tracksRef.current.get(label)
    if (track) {
      track.masterGain.gain.setTargetAtTime(volume, getContext().currentTime, 0.05)
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
    track.dryGain.gain.setTargetAtTime(1 - depth * 0.7, t, 0.05)
    track.wetGain.gain.setTargetAtTime(depth * 0.6, t, 0.05)
  }, [getContext])

  const stop = useCallback(() => {
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
  }, [])

  const getAnalyser = useCallback(() => analyserRef.current, [])

  const exportMix = useCallback(async (filename: string) => {
    if (decodedRef.current.length === 0) return
    const duration = 20
    const sampleRate = 44100
    const offline = new OfflineAudioContext(2, sampleRate * duration, sampleRate)

    await SoundTouchNode.register(offline, '/soundtouch-processor.js')

    for (const { el, buffer } of decodedRef.current) {
      const liveTrack = tracksRef.current.get(el.label)
      const eqState: EQState = liveTrack ? {
        low: liveTrack.filters[0].gain.value,
        mid: liveTrack.filters[1].gain.value,
        high: liveTrack.filters[2].gain.value,
      } : buildEQState(el.eq)

      const offlineFilters = createFilters(offline, eqState)
      const [lowFilter,, highFilter] = offlineFilters

      const gain = offline.createGain()
      gain.gain.value = liveTrack ? liveTrack.masterGain.gain.value : el.volume

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

  return { load, preload, start, pause, unpause, setVolume, setEQ, setPan, setDepth, setTuning, stop, exportMix, getAnalyser }
}

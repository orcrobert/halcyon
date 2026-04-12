import { useRef, useCallback } from 'react'
import type { Element } from '../types'

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

interface TrackNode {
  masterGain: GainNode
  source: AudioBufferSourceNode
}

interface DecodedElement {
  el: Element
  buffer: AudioBuffer
}

export function useAudioEngine() {
  const ctxRef = useRef<AudioContext | null>(null)
  const tracksRef = useRef<Map<string, TrackNode>>(new Map())
  const decodedRef = useRef<DecodedElement[]>([])
  const analyserRef = useRef<AnalyserNode | null>(null)

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

  function startFromDecoded(ctx: AudioContext, decoded: DecodedElement[]) {
    tracksRef.current.forEach(({ source }) => {
      try { source.stop() } catch {}
    })
    tracksRef.current.clear()

    for (const { el, buffer } of decoded) {
      const masterGain = ctx.createGain()
      masterGain.gain.value = el.volume
      masterGain.connect(analyserRef.current ?? ctx.destination)

      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.loop = true
      src.connect(masterGain)
      src.start()

      tracksRef.current.set(el.label, { masterGain, source: src })
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
    const track = tracksRef.current.get(label)
    if (track) {
      track.masterGain.gain.setTargetAtTime(volume, getContext().currentTime, 0.05)
    }
  }, [getContext])

  const stop = useCallback(() => {
    tracksRef.current.forEach(({ source }) => {
      try { source.stop() } catch {}
    })
    tracksRef.current.clear()
    decodedRef.current = []
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

    for (const { el, buffer } of decodedRef.current) {
      const gain = offline.createGain()
      const liveTrack = tracksRef.current.get(el.label)
      gain.gain.value = liveTrack ? liveTrack.masterGain.gain.value : el.volume
      gain.connect(offline.destination)

      const src = offline.createBufferSource()
      src.buffer = buffer
      src.loop = true
      src.connect(gain)
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

  return { load, preload, start, pause, unpause, setVolume, stop, exportMix, getAnalyser }
}

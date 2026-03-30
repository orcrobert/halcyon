import { useRef, useCallback } from 'react'
import type { Element } from '../types'

const CROSSFADE = 1.5

interface TrackNode {
  masterGain: GainNode
  sources: AudioBufferSourceNode[]
  loopTimer: ReturnType<typeof setTimeout> | null
}

interface DecodedElement {
  el: Element
  buffer: AudioBuffer
}

export function useAudioEngine() {
  const ctxRef = useRef<AudioContext | null>(null)
  const tracksRef = useRef<Map<string, TrackNode>>(new Map())
  const decodedRef = useRef<DecodedElement[]>([])

  const getContext = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = new AudioContext()
    return ctxRef.current
  }, [])

  function scheduleLoop(
    ctx: AudioContext,
    buffer: AudioBuffer,
    masterGain: GainNode,
    trackNode: TrackNode,
    startAt: number
  ) {
    const envelope = ctx.createGain()
    envelope.gain.setValueAtTime(0, startAt)
    envelope.gain.linearRampToValueAtTime(1, startAt + CROSSFADE)
    envelope.connect(masterGain)

    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(envelope)
    src.start(startAt)
    trackNode.sources.push(src)

    const fadeOutAt = startAt + buffer.duration - CROSSFADE
    const msUntilFade = (fadeOutAt - ctx.currentTime) * 1000

    trackNode.loopTimer = setTimeout(() => {
      envelope.gain.setTargetAtTime(0, ctx.currentTime, CROSSFADE / 3)
      scheduleLoop(ctx, buffer, masterGain, trackNode, ctx.currentTime)
    }, Math.max(0, msUntilFade))
  }

  function startFromDecoded(ctx: AudioContext, decoded: DecodedElement[]) {
    tracksRef.current.forEach(({ sources, loopTimer }) => {
      if (loopTimer) clearTimeout(loopTimer)
      sources.forEach(s => { try { s.stop() } catch {} })
    })
    tracksRef.current.clear()

    for (const { el, buffer } of decoded) {
      const masterGain = ctx.createGain()
      masterGain.gain.value = el.volume
      masterGain.connect(ctx.destination)

      const trackNode: TrackNode = { masterGain, sources: [], loopTimer: null }
      tracksRef.current.set(el.label, trackNode)

      if (buffer.duration <= CROSSFADE * 2) {
        const src = ctx.createBufferSource()
        src.buffer = buffer
        src.loop = true
        src.connect(masterGain)
        src.start()
        trackNode.sources.push(src)
      } else {
        scheduleLoop(ctx, buffer, masterGain, trackNode, ctx.currentTime)
      }
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
    if (ctxRef.current?.state === 'running') await ctxRef.current.suspend()
  }, [])

  const unpause = useCallback(async () => {
    if (ctxRef.current?.state === 'suspended') await ctxRef.current.resume()
  }, [])

  const setVolume = useCallback((label: string, volume: number) => {
    const track = tracksRef.current.get(label)
    if (track) {
      track.masterGain.gain.setTargetAtTime(volume, getContext().currentTime, 0.05)
    }
  }, [getContext])

  const stop = useCallback(() => {
    tracksRef.current.forEach(({ sources, loopTimer }) => {
      if (loopTimer) clearTimeout(loopTimer)
      sources.forEach(s => { try { s.stop() } catch {} })
    })
    tracksRef.current.clear()
    decodedRef.current = []
    ctxRef.current?.close()
    ctxRef.current = null
  }, [])

  return { load, preload, start, pause, unpause, setVolume, stop }
}

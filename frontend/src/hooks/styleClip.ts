export const MIN_STYLE_S = 1.5
export const MAX_STYLE_S = 4.5
export const DEFAULT_STYLE_S = 3
export const STYLE_SAMPLE_RATE = 32000
export const MAX_STYLE_FILE_BYTES = 100 * 1024 * 1024

export interface Selection {
  start: number
  end: number
}

export interface StyleClip {
  file: File
  name: string
  start: number
  end: number
  audioB64: string
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value))
}

export function initialSelection(duration: number): Selection {
  const length = Math.min(DEFAULT_STYLE_S, duration)
  const start = Math.max(0, Math.min(duration * 0.25, duration - length))
  return { start, end: start + length }
}

export function moveSelection(selection: Selection, start: number, duration: number): Selection {
  const length = selection.end - selection.start
  const next = clamp(start, 0, Math.max(0, duration - length))
  return { start: next, end: next + length }
}

export function resizeStart(selection: Selection, start: number, duration: number): Selection {
  const lo = Math.max(0, selection.end - Math.min(MAX_STYLE_S, duration))
  const hi = Math.max(lo, selection.end - Math.min(MIN_STYLE_S, duration))
  return { start: clamp(start, lo, hi), end: selection.end }
}

export function resizeEnd(selection: Selection, end: number, duration: number): Selection {
  const lo = Math.min(duration, selection.start + Math.min(MIN_STYLE_S, duration))
  const hi = Math.min(duration, selection.start + MAX_STYLE_S)
  return { start: selection.start, end: clamp(end, lo, Math.max(lo, hi)) }
}

export function viewWindow(selection: Selection, duration: number, span: number): Selection {
  if (duration <= span) return { start: 0, end: duration }
  const centre = (selection.start + selection.end) / 2
  const start = clamp(centre - span / 2, 0, duration - span)
  return { start, end: start + span }
}

export function peaks(buffer: AudioBuffer, from: number, to: number, bins: number): Float32Array {
  const out = new Float32Array(bins)
  const rate = buffer.sampleRate
  const first = Math.max(0, Math.floor(from * rate))
  const last = Math.min(buffer.length, Math.ceil(to * rate))
  const span = Math.max(1, last - first)
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
  const stride = Math.max(1, Math.floor(span / bins / 64))

  let max = 0
  for (let bin = 0; bin < bins; bin++) {
    const a = first + Math.floor((bin * span) / bins)
    const b = Math.max(a + 1, first + Math.floor(((bin + 1) * span) / bins))
    let peak = 0
    for (let i = a; i < b && i < last; i += stride) {
      for (const data of channels) {
        const v = Math.abs(data[i])
        if (v > peak) peak = v
      }
    }
    out[bin] = peak
    if (peak > max) max = peak
  }

  if (max > 0) {
    for (let bin = 0; bin < bins; bin++) out[bin] /= max
  }
  return out
}

export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytes = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(bytes)
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }

  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  for (let i = 0; i < samples.length; i++) {
    const s = clamp(samples[i], -1, 1)
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return bytes
}

export function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < view.length; i += chunk) {
    binary += String.fromCharCode(...view.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export async function renderExcerpt(buffer: AudioBuffer, selection: Selection): Promise<string> {
  const length = selection.end - selection.start
  const frames = Math.max(1, Math.round(length * STYLE_SAMPLE_RATE))
  const offline = new OfflineAudioContext(1, frames, STYLE_SAMPLE_RATE)
  const source = offline.createBufferSource()
  source.buffer = buffer
  source.connect(offline.destination)
  source.start(0, selection.start, length)
  const rendered = await offline.startRendering()
  return toBase64(encodeWav(rendered.getChannelData(0), STYLE_SAMPLE_RATE))
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  const rest = safe - minutes * 60
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`
}

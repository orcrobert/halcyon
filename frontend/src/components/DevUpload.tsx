import { useState, useRef } from 'react'
import type { Element, Session } from '../types'

interface Props {
  onReady: (session: Session) => void
}

interface FileEntry {
  file: File
  label: string
  type: 'sound' | 'music'
  volume: number
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function DevUpload({ onReady }: Props) {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [atmosphere, setAtmosphere] = useState('Dev Test Atmosphere')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFiles(files: FileList) {
    const newEntries: FileEntry[] = Array.from(files).map((f) => ({
      file: f,
      label: f.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '),
      type: 'sound' as const,
      volume: 0.5,
    }))
    setEntries((prev) => [...prev, ...newEntries])
  }

  function updateEntry(i: number, patch: Partial<FileEntry>) {
    setEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, ...patch } : e))
  }

  function removeEntry(i: number) {
    setEntries((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleGo() {
    const elements: Element[] = await Promise.all(
      entries.map(async (e) => ({
        label: e.label,
        type: e.type,
        prompt: `[dev upload] ${e.file.name}`,
        volume: e.volume,
        file: e.file.name,
        audio_b64: await fileToBase64(e.file),
      }))
    )
    onReady({ atmosphere, elements })
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '64px 24px' }}>
      <div style={{ maxWidth: '600px', width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>

        <h1 className="text-2xl font-bold text-white">Dev Upload</h1>

        <input
          value={atmosphere}
          onChange={(e) => setAtmosphere(e.target.value)}
          className="w-full bg-[#0d0e18] text-slate-200 border border-[#1e2035] rounded-xl outline-none text-sm"
          style={{ padding: '12px 16px', fontFamily: 'inherit' }}
          placeholder="Atmosphere name"
        />

        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          multiple
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          style={{ display: 'none' }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          className="text-sm text-slate-400 border border-dashed border-[#2a2b40] rounded-xl hover:border-indigo-500/40 hover:text-slate-200"
          style={{ padding: '20px', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          + Drop or click to add audio files
        </button>

        {entries.map((entry, i) => (
          <div key={i} className="flex items-center gap-3 bg-[#0d0e18] border border-[#1e2035] rounded-xl" style={{ padding: '12px 16px' }}>
            <input
              value={entry.label}
              onChange={(e) => updateEntry(i, { label: e.target.value })}
              className="flex-1 bg-transparent text-slate-200 text-sm outline-none"
              style={{ fontFamily: 'inherit' }}
            />
            <select
              value={entry.type}
              onChange={(e) => updateEntry(i, { type: e.target.value as 'sound' | 'music' })}
              className="bg-[#111218] text-slate-400 text-xs border border-[#1e2035] rounded-lg outline-none"
              style={{ padding: '6px 8px', fontFamily: 'inherit' }}
            >
              <option value="sound">sound</option>
              <option value="music">music</option>
            </select>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={entry.volume}
              onChange={(e) => updateEntry(i, { volume: parseFloat(e.target.value) })}
              style={{ width: '80px' }}
            />
            <span className="text-xs text-slate-600 w-8 text-right">{Math.round(entry.volume * 100)}</span>
            <button
              onClick={() => removeEntry(i)}
              className="text-slate-600 hover:text-red-400 text-sm"
              style={{ cursor: 'pointer' }}
            >
              ×
            </button>
          </div>
        ))}

        {entries.length > 0 && (
          <button
            onClick={handleGo}
            className="text-sm font-semibold text-white rounded-xl"
            style={{ padding: '14px 24px', background: '#6366f1', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Go to Dashboard →
          </button>
        )}
      </div>
    </div>
  )
}

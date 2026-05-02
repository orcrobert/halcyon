import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './auth/AuthContext'
import { AuthView } from './components/AuthView'
import { PromptView } from './components/PromptView'
import { GeneratingView } from './components/GeneratingView'
import { DashboardView } from './components/DashboardView'
import { HistoryPanel } from './components/HistoryPanel'
import { useAudioEngine, type EQState } from './hooks/useAudioEngine'
import { useDebouncedPatcher } from './hooks/useDebouncedPatcher'
import {
  createAtmosphere,
  getAtmosphere,
  pollAtmosphere,
} from './api/atmospheres'
import type { Atmosphere, EQBand } from './types'

const PENDING_KEY = 'soundscape_pending_atmosphere_id'

type View = 'prompt' | 'generating' | 'dashboard'

function eqStateToBands(eq: EQState): EQBand[] {
  return [
    { type: 'lowshelf', freq: 200, q: 0.7, gain: eq.low },
    { type: 'peaking', freq: 1000, q: 1.4, gain: eq.mid },
    { type: 'highshelf', freq: 8000, q: 0.7, gain: eq.high },
  ]
}

export default function App() {
  const { state, logout } = useAuth()

  if (state.status === 'loading') {
    return <FullScreenStatus>Loading…</FullScreenStatus>
  }

  if (state.status === 'guest') {
    return (
      <div className="min-h-screen" style={{ background: '#08090e' }}>
        <AuthView />
      </div>
    )
  }

  return <AuthedApp onLogout={logout} />
}

function AuthedApp({ onLogout }: { onLogout: () => Promise<void> }) {
  const [view, setView] = useState<View>('prompt')
  const [atmosphere, setAtmosphere] = useState<Atmosphere | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  const pollAbortRef = useRef<AbortController | null>(null)

  const {
    load, start, pause, unpause, setVolume, setEQ, setPan, setDepth,
    setTuning, stop, exportMix, getAnalyser,
  } = useAudioEngine()

  const { enqueue, flushAll } = useDebouncedPatcher()

  const labelToId = useMemo(() => {
    const map = new Map<string, number>()
    for (const el of atmosphere?.elements ?? []) {
      map.set(el.label, el.id)
    }
    return map
  }, [atmosphere])

  const elementIds = useMemo(
    () => (atmosphere?.elements ?? []).map((e) => e.id),
    [atmosphere],
  )

  const loadAtmosphereIntoEngine = useCallback(async (a: Atmosphere) => {
    if (!a.elements) return
    await load(a.elements)
    for (const el of a.elements) {
      setVolume(el.label, el.volume)
      setPan(el.label, el.pan)
      setDepth(el.label, el.depth)
    }
  }, [load, setVolume, setPan, setDepth])

  const activatePollFor = useCallback(async (id: number) => {
    pollAbortRef.current?.abort()
    const controller = new AbortController()
    pollAbortRef.current = controller

    try {
      const initial = await getAtmosphere(id)
      setAtmosphere(initial)

      if (initial.status === 'ready' && initial.elements) {
        localStorage.removeItem(PENDING_KEY)
        await loadAtmosphereIntoEngine(initial)
        setPlaying(true)
        setView('dashboard')
        return
      }

      if (initial.status === 'failed') {
        localStorage.removeItem(PENDING_KEY)
        setError(initial.error ?? 'Generation failed.')
        setView('prompt')
        return
      }

      const final = await pollAtmosphere(id, {
        signal: controller.signal,
        onTick: (a) => setAtmosphere(a),
      })

      localStorage.removeItem(PENDING_KEY)

      if (final.status === 'failed') {
        setError(final.error ?? 'Generation failed.')
        setView('prompt')
        return
      }

      if (final.elements) {
        await loadAtmosphereIntoEngine(final)
        setPlaying(true)
        setView('dashboard')
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Polling failed.')
      setView('prompt')
    }
  }, [loadAtmosphereIntoEngine])

  useEffect(() => {
    const stored = localStorage.getItem(PENDING_KEY)
    if (!stored) return
    const id = parseInt(stored, 10)
    if (!Number.isFinite(id)) {
      localStorage.removeItem(PENDING_KEY)
      return
    }
    setView('generating')
    activatePollFor(id)
    return () => {
      pollAbortRef.current?.abort()
    }
  }, [activatePollFor])

  const handleGenerate = useCallback(async (prompt: string) => {
    setSubmitting(true)
    setError(null)
    try {
      const created = await createAtmosphere({ prompt })
      localStorage.setItem(PENDING_KEY, String(created.id))
      setAtmosphere(created)
      setView('generating')
      activatePollFor(created.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start generation.')
    } finally {
      setSubmitting(false)
    }
  }, [activatePollFor])

  const handleCancelGenerating = useCallback(() => {
    pollAbortRef.current?.abort()
    setView('prompt')
  }, [])

  const handlePlayPause = useCallback(async () => {
    if (playing) {
      await pause()
      setPlaying(false)
    } else {
      await start()
      await unpause()
      setPlaying(true)
    }
  }, [playing, pause, start, unpause])

  const handleNewAtmosphere = useCallback(async () => {
    pollAbortRef.current?.abort()
    await flushAll()
    stop()
    setPlaying(false)
    setAtmosphere(null)
    setView('prompt')
  }, [stop, flushAll])

  const handleOpenFromHistory = useCallback(async (id: number) => {
    await flushAll()
    stop()
    setPlaying(false)
    setHistoryOpen(false)
    setView('generating')
    activatePollFor(id)
  }, [stop, flushAll, activatePollFor])

  const handleVolumeChange = useCallback((label: string, volume: number) => {
    setVolume(label, volume)
    const id = labelToId.get(label)
    if (id !== undefined) enqueue(id, { volume })
  }, [setVolume, enqueue, labelToId])

  const handleEQChange = useCallback((label: string, eq: EQState) => {
    setEQ(label, eq)
    const id = labelToId.get(label)
    if (id !== undefined) enqueue(id, { eq_json: eqStateToBands(eq) })
  }, [setEQ, enqueue, labelToId])

  const handlePanChange = useCallback((label: string, pan: number) => {
    setPan(label, pan)
    const id = labelToId.get(label)
    if (id !== undefined) enqueue(id, { pan })
  }, [setPan, enqueue, labelToId])

  const handleDepthChange = useCallback((label: string, depth: number) => {
    setDepth(label, depth)
    const id = labelToId.get(label)
    if (id !== undefined) enqueue(id, { depth })
  }, [setDepth, enqueue, labelToId])

  const handleTuningChange = useCallback((freqHz: number) => {
    setTuning(freqHz)
    const tuning_hz = Math.round(freqHz)
    for (const id of elementIds) {
      enqueue(id, { tuning_hz })
    }
  }, [setTuning, enqueue, elementIds])

  useEffect(() => {
    function onUnload() { void flushAll() }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [flushAll])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (view !== 'dashboard' || !atmosphere) return
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
      if (e.code === 'Space') {
        e.preventDefault()
        handlePlayPause()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [view, atmosphere, handlePlayPause])

  return (
    <div className="min-h-screen" style={{ background: '#08090e' }}>
      {view === 'prompt' && (
        <PromptView
          onSubmit={handleGenerate}
          loading={submitting}
          error={error}
          onLogout={onLogout}
          onOpenHistory={() => setHistoryOpen(true)}
        />
      )}
      {view === 'generating' && atmosphere && (
        <GeneratingView atmosphere={atmosphere} onCancel={handleCancelGenerating} />
      )}
      {view === 'dashboard' && atmosphere && (
        <DashboardView
          session={atmosphere}
          playing={playing}
          getAnalyser={getAnalyser}
          onPlayPause={handlePlayPause}
          onVolumeChange={handleVolumeChange}
          onEQChange={handleEQChange}
          onPanChange={handlePanChange}
          onDepthChange={handleDepthChange}
          onTuningChange={handleTuningChange}
          onExport={() => exportMix(atmosphere.title ?? `atmosphere-${atmosphere.id}`)}
          onReset={handleNewAtmosphere}
        />
      )}
      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onOpenAtmosphere={handleOpenFromHistory}
      />
    </div>
  )
}

function FullScreenStatus({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#08090e' }}>
      <div className="text-white/30 text-sm">{children}</div>
    </div>
  )
}

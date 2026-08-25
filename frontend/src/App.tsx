import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './auth/context'
import { AuthView } from './components/AuthView'
import { PromptView } from './components/PromptView'
import { GeneratingView } from './components/GeneratingView'
import { DashboardView } from './components/DashboardView'
import { HistoryPanel } from './components/HistoryPanel'
import { AccountView } from './components/AccountView'
import { useAudioEngine, type EQState } from './hooks/useAudioEngine'
import { useDebouncedPatcher } from './hooks/useDebouncedPatcher'
import {
  createAtmosphere,
  getAtmosphere,
  pollAtmosphere,
  regenerateAtmosphere,
} from './api/atmospheres'
import { deleteElement, regenerateElement } from './api/elements'
import type { Atmosphere, EQBand, Element } from './types'

const PENDING_KEY = 'halcyon_pending_atmosphere_id'

type View = 'prompt' | 'generating' | 'dashboard' | 'account'

function eqStateToBands(eq: EQState): EQBand[] {
  return [
    { type: 'lowshelf', freq: 200, q: 0.7, gain: eq.low },
    { type: 'peaking', freq: 1000, q: 1.4, gain: eq.mid },
    { type: 'highshelf', freq: 8000, q: 0.7, gain: eq.high },
  ]
}

export default function App() {
  const { state } = useAuth()

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

  return <AuthedApp />
}

function AuthedApp() {
  const [view, setView] = useState<View>('prompt')
  const [atmosphere, setAtmosphere] = useState<Atmosphere | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [accountReturnView, setAccountReturnView] = useState<View>('prompt')
  const [binauralActive, setBinauralActive] = useState(false)
  const [binauralBeatHz, setBinauralBeatHz] = useState(8)
  const [binauralLeftHz, setBinauralLeftHz] = useState(200)
  const [binauralRightHz, setBinauralRightHz] = useState(208)
  const [actionError, setActionError] = useState<string | null>(null)

  const pollAbortRef = useRef<AbortController | null>(null)
  const regenAbortRef = useRef<AbortController | null>(null)
  const playingRef = useRef(false)

  const {
    load, start, pause, setVolume, setEQ, setPan, setDepth,
    setTuning, stop, forget, exportMix, getAnalyser,
    startAnimate, stopAnimate, setAnimateMuted,
    startBinaural, stopBinaural, setBinauralFreqs,
  } = useAudioEngine()


  const { enqueue, flushAll, flushAllSync } = useDebouncedPatcher()

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

  useEffect(() => {
    playingRef.current = playing
  }, [playing])

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

  const handleGenerate = useCallback(async (prompt: string, durationS: number) => {
    setSubmitting(true)
    setError(null)
    try {
      const created = await createAtmosphere({ prompt, duration_s: durationS })
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

  const watchRegeneration = useCallback(async (atmosphereId: number) => {
    regenAbortRef.current?.abort()
    const controller = new AbortController()
    regenAbortRef.current = controller

    try {
      for (;;) {
        await new Promise((r) => setTimeout(r, 1500))
        if (controller.signal.aborted) return

        const latest = await getAtmosphere(atmosphereId)
        if (controller.signal.aborted) return
        setAtmosphere(latest)

        const busy = (latest.elements ?? []).some((e) => e.status === 'regenerating')
        if (busy) continue

        const failed = (latest.elements ?? []).find((e) => e.status === 'failed')
        if (failed) setActionError(failed.error ?? 'Regenerating that layer failed.')

        await loadAtmosphereIntoEngine(latest)
        if (!playingRef.current) await pause()
        return
      }
    } catch (err) {
      if (controller.signal.aborted) return
      setActionError(err instanceof Error ? err.message : 'Regeneration failed.')
    }
  }, [loadAtmosphereIntoEngine, pause])

  const handleRegenerateElement = useCallback(async (element: Element, feedback: string) => {
    if (!atmosphere) return
    setActionError(null)
    try {
      const updated = await regenerateElement(element.id, feedback)
      forget([element.label])
      setAtmosphere((prev) =>
        prev
          ? {
              ...prev,
              elements: (prev.elements ?? []).map((e) =>
                e.id === updated.id ? updated : e,
              ),
            }
          : prev,
      )
      watchRegeneration(atmosphere.id)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not start regeneration.')
    }
  }, [atmosphere, forget, watchRegeneration])

  const handleDeleteElement = useCallback(async (element: Element) => {
    setActionError(null)
    try {
      await deleteElement(element.id)
      forget([element.label])
      setAtmosphere((prev) =>
        prev
          ? { ...prev, elements: (prev.elements ?? []).filter((e) => e.id !== element.id) }
          : prev,
      )
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete that layer.')
    }
  }, [forget])

  const handleRegenerateScene = useCallback(async () => {
    if (!atmosphere) return
    setActionError(null)
    try {
      const created = await regenerateAtmosphere(atmosphere.id)
      regenAbortRef.current?.abort()
      await flushAll()
      stop()
      setPlaying(false)
      localStorage.setItem(PENDING_KEY, String(created.id))
      setAtmosphere(created)
      setView('generating')
      activatePollFor(created.id)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not start a new take.')
    }
  }, [atmosphere, flushAll, stop, activatePollFor])

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
      setPlaying(true)
    }
  }, [playing, pause, start])

  const handleNewAtmosphere = useCallback(async () => {
    pollAbortRef.current?.abort()
    regenAbortRef.current?.abort()
    await flushAll()
    stop()
    setPlaying(false)
    setAtmosphere(null)
    setView('prompt')
  }, [stop, flushAll])

  const handleOpenFromHistory = useCallback(async (id: number) => {
    regenAbortRef.current?.abort()
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

  const handleBinauralToggle = useCallback(() => {
    if (binauralActive) {
      stopBinaural()
      setBinauralActive(false)
    } else {
      startBinaural()
      setBinauralActive(true)
    }
  }, [binauralActive, startBinaural, stopBinaural])

  const handleBinauralPreset = useCallback((beatHz: number) => {
    setBinauralBeatHz(beatHz)
    const newRight = binauralLeftHz + beatHz
    setBinauralRightHz(newRight)
    setBinauralFreqs(binauralLeftHz, newRight)
  }, [binauralLeftHz, setBinauralFreqs])

  const handleBinauralLeftHz = useCallback((hz: number) => {
    setBinauralLeftHz(hz)
    const newRight = hz + binauralBeatHz
    setBinauralRightHz(newRight)
    setBinauralFreqs(hz, newRight)
  }, [binauralBeatHz, setBinauralFreqs])

  const handleBinauralRightHz = useCallback((hz: number) => {
    setBinauralRightHz(hz)
    setBinauralFreqs(binauralLeftHz, hz)
  }, [binauralLeftHz, setBinauralFreqs])

  useEffect(() => {
    function onUnload() { flushAllSync() }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [flushAllSync])

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
          onOpenAccount={() => {
            setAccountReturnView('prompt')
            setView('account')
          }}
          onOpenHistory={() => setHistoryOpen(true)}
        />
      )}
      {view === 'account' && (
        <AccountView onBack={() => setView(accountReturnView)} />
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
          onRegenerateElement={handleRegenerateElement}
          onDeleteElement={handleDeleteElement}
          onRegenerateScene={handleRegenerateScene}
          actionError={actionError}
          onDismissActionError={() => setActionError(null)}
          onStartAnimate={startAnimate}
          onStopAnimate={stopAnimate}
          onSetAnimateMuted={setAnimateMuted}
          binauralActive={binauralActive}
          binauralBeatHz={binauralBeatHz}
          binauralLeftHz={binauralLeftHz}
          binauralRightHz={binauralRightHz}
          onBinauralToggle={handleBinauralToggle}
          onBinauralPreset={handleBinauralPreset}
          onBinauralLeftHz={handleBinauralLeftHz}
          onBinauralRightHz={handleBinauralRightHz}
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
      <div className="text-wash/30 text-sm">{children}</div>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './auth/context'
import { AuthView } from './components/AuthView'
import { PromptView } from './components/PromptView'
import { GeneratingView } from './components/GeneratingView'
import { DashboardView } from './components/DashboardView'
import { HistoryPanel } from './components/HistoryPanel'
import { ReviewLayersModal } from './components/ReviewLayersModal'
import { AccountView, type SectionId } from './components/AccountView'
import { DeployToast } from './components/DeployToast'
import { useAudioEngine, isCanonicalBand, type EQState } from './hooks/useAudioEngine'
import { useDebouncedPatcher } from './hooks/useDebouncedPatcher'
import type { StyleClip } from './hooks/styleClip'
import {
  confirmDecomposition,
  createAtmosphere,
  deleteAtmosphere,
  dismissQuality,
  getAtmosphere,
  pollAtmosphere,
  regenerateAtmosphere,
  reviseDecomposition,
} from './api/atmospheres'
import { deleteElement, regenerateElement } from './api/elements'
import type { Atmosphere, DecompositionElement, EQBand, Element } from './types'
import { getSettings } from './api/settings'
import { DEFAULT_THEME, applyTheme, storeTheme } from './themes'
import { applyReduceBlur, storeReduceBlur } from './effects'

const PENDING_KEY = 'halcyon_pending_atmosphere_id'

type View = 'prompt' | 'generating' | 'dashboard' | 'account'

const EQ_SHELF_Q = 0.7
const EQ_MID_Q = 1.4

function eqStateToBands(eq: EQState, existing: EQBand[] | undefined): EQBand[] {
  const corrective = (existing ?? [])
    .filter((band) => !isCanonicalBand(band))
    .map((band) => ({
      ...band,
      q: band.q ?? (band.type === 'peaking' ? EQ_MID_Q : EQ_SHELF_Q),
    }))
  return [
    ...corrective,
    { type: 'lowshelf', freq: 200, q: EQ_SHELF_Q, gain: eq.low },
    { type: 'peaking', freq: 1000, q: EQ_MID_Q, gain: eq.mid },
    { type: 'highshelf', freq: 8000, q: EQ_SHELF_Q, gain: eq.high },
  ]
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function reconcileAtmosphere(prev: Atmosphere | null, next: Atmosphere): Atmosphere {
  if (!prev || prev.id !== next.id) return next
  if (sameJson(prev, next)) return prev
  if (!next.elements || !prev.elements) return next
  const previous = new Map(prev.elements.map((el) => [el.id, el]))
  return {
    ...next,
    elements: next.elements.map((el) => {
      const old = previous.get(el.id)
      return old && sameJson(old, el) ? old : el
    }),
  }
}

export default function App() {
  const { state } = useAuth()

  if (state.status === 'loading') {
    return <FullScreenStatus>Loading…</FullScreenStatus>
  }

  if (state.status === 'guest') {
    return (
      <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
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
  const [accountSection, setAccountSection] = useState<{ id: SectionId; key: number }>({ id: 'model', key: 0 })
  const [binauralActive, setBinauralActive] = useState(false)
  const [binauralBeatHz, setBinauralBeatHz] = useState(8)
  const [binauralLeftHz, setBinauralLeftHz] = useState(200)
  const [binauralRightHz, setBinauralRightHz] = useState(208)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getSettings()
      .then((res) => {
        if (cancelled) return
        const active = res.theme ?? DEFAULT_THEME
        applyTheme(active)
        storeTheme(active)
        applyReduceBlur(res.reduce_blur)
        storeReduceBlur(res.reduce_blur)
      })
      .catch(() => { /* keep whatever the browser already had */ })
    return () => { cancelled = true }
  }, [])

  const pollAbortRef = useRef<AbortController | null>(null)
  const regenAbortRef = useRef<AbortController | null>(null)
  const playingRef = useRef(false)

  const {
    load, start, pause, setVolume, setEQ, setPan, setDepth,
    setTuning, setEventInterval, stop, forget, exportMix, getAnalyser,
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

  const labelToBands = useMemo(() => {
    const map = new Map<string, EQBand[]>()
    for (const el of atmosphere?.elements ?? []) {
      map.set(el.label, el.eq_json ?? [])
    }
    return map
  }, [atmosphere])

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
      if (el.playback === 'oneshot' && el.interval_min_s !== null && el.interval_max_s !== null) {
        setEventInterval(el.label, el.interval_min_s, el.interval_max_s)
      }
    }
  }, [load, setVolume, setPan, setDepth, setEventInterval])

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

      localStorage.setItem(PENDING_KEY, String(id))
      setView('generating')

      if (initial.status === 'awaiting_review') return

      const final = await pollAtmosphere(id, {
        signal: controller.signal,
        onTick: (a) => setAtmosphere((prev) => reconcileAtmosphere(prev, a)),
      })

      if (final.status === 'awaiting_review') return

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
    activatePollFor(id)
    return () => {
      pollAbortRef.current?.abort()
    }
  }, [activatePollFor])

  const handleGenerate = useCallback(async (
    prompt: string,
    durationS: number,
    useEvents: boolean,
    style: StyleClip | null,
  ) => {
    setSubmitting(true)
    setError(null)
    try {
      const created = await createAtmosphere({
        prompt,
        duration_s: durationS,
        use_events: useEvents,
        style: style
          ? { audio_b64: style.audioB64, name: style.name, start_s: style.start, end_s: style.end }
          : undefined,
      })
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
        setAtmosphere((prev) => reconcileAtmosphere(prev, latest))

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

  const handleQualityChoice = useCallback(async (rerender: Element[]) => {
    if (!atmosphere) return
    setActionError(null)
    try {
      const updated = await dismissQuality(atmosphere.id)
      setAtmosphere((prev) => reconcileAtmosphere(prev, updated))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not save your choice.')
      return
    }
    for (const element of rerender) await handleRegenerateElement(element, '')
  }, [atmosphere, handleRegenerateElement])

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

  const handleConfirmReview = useCallback(async (elements: DecompositionElement[]) => {
    if (!atmosphere) return
    const updated = await confirmDecomposition(atmosphere.id, elements)
    setAtmosphere(updated)
    activatePollFor(updated.id)
  }, [atmosphere, activatePollFor])

  const handleReviseReview = useCallback(async (feedback: string, elements: DecompositionElement[]) => {
    if (!atmosphere) return elements
    const updated = await reviseDecomposition(atmosphere.id, feedback, elements)
    setAtmosphere(updated)
    return updated.decomposition ?? elements
  }, [atmosphere])

  const handleDiscardReview = useCallback(async () => {
    if (!atmosphere) return
    pollAbortRef.current?.abort()
    await deleteAtmosphere(atmosphere.id)
    localStorage.removeItem(PENDING_KEY)
    setAtmosphere(null)
    setView('prompt')
  }, [atmosphere])

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
    if (id !== undefined) {
      enqueue(id, { eq_json: eqStateToBands(eq, labelToBands.get(label)) })
    }
  }, [setEQ, enqueue, labelToId, labelToBands])

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

  const handleIntervalChange = useCallback((label: string, minS: number, maxS: number) => {
    setEventInterval(label, minS, maxS)
    const id = labelToId.get(label)
    if (id !== undefined) enqueue(id, { interval_min_s: minS, interval_max_s: maxS })
  }, [setEventInterval, enqueue, labelToId])

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
    <div
      className="min-h-screen"
      style={{ background: 'var(--color-bg)', paddingBottom: 'var(--deploy-toast-offset, 0px)' }}
    >
      {view === 'prompt' && (
        <PromptView
          onSubmit={handleGenerate}
          loading={submitting}
          error={error}
          onOpenAccount={() => {
            setAccountReturnView('prompt')
            setAccountSection((s) => ({ id: 'model', key: s.key + 1 }))
            setView('account')
          }}
          onOpenHistory={() => setHistoryOpen(true)}
        />
      )}
      {view === 'account' && (
        <AccountView
          key={accountSection.key}
          initialSection={accountSection.id}
          onBack={() => setView(accountReturnView)}
        />
      )}
      {view === 'generating' && atmosphere && (
        <GeneratingView atmosphere={atmosphere} onCancel={handleCancelGenerating} />
      )}
      {view === 'generating' && atmosphere?.status === 'awaiting_review' && (
        <ReviewLayersModal
          key={atmosphere.id}
          atmosphere={atmosphere}
          onConfirm={handleConfirmReview}
          onRevise={handleReviseReview}
          onDiscard={handleDiscardReview}
        />
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
          onIntervalChange={handleIntervalChange}
          onTuningChange={handleTuningChange}
          onExport={(seconds) => exportMix(atmosphere.title ?? `atmosphere-${atmosphere.id}`, seconds)}
          onReset={handleNewAtmosphere}
          onRegenerateElement={handleRegenerateElement}
          onDeleteElement={handleDeleteElement}
          onRegenerateScene={handleRegenerateScene}
          onQualityChoice={handleQualityChoice}
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
      <DeployToast
        onOpenSettings={() => {
          if (view !== 'account') setAccountReturnView(view)
          setAccountSection((s) => ({ id: 'generator', key: s.key + 1 }))
          setView('account')
        }}
      />
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
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
      <div className="text-wash/30 text-sm">{children}</div>
    </div>
  )
}

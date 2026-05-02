import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from './auth/AuthContext'
import { AuthView } from './components/AuthView'
import { PromptView } from './components/PromptView'
import { GeneratingView } from './components/GeneratingView'
import { DashboardView } from './components/DashboardView'
import { useAudioEngine } from './hooks/useAudioEngine'
import {
  createAtmosphere,
  getAtmosphere,
  pollAtmosphere,
} from './api/atmospheres'
import type { Atmosphere } from './types'

const PENDING_KEY = 'soundscape_pending_atmosphere_id'

type View = 'prompt' | 'generating' | 'dashboard'

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

  const pollAbortRef = useRef<AbortController | null>(null)

  const {
    load, start, pause, unpause, setVolume, setEQ, setPan, setDepth,
    setTuning, stop, exportMix, getAnalyser,
  } = useAudioEngine()

  const activatePollFor = useCallback(async (id: number) => {
    pollAbortRef.current?.abort()
    const controller = new AbortController()
    pollAbortRef.current = controller

    try {
      const initial = await getAtmosphere(id)
      setAtmosphere(initial)

      if (initial.status === 'ready' && initial.elements) {
        localStorage.removeItem(PENDING_KEY)
        await load(initial.elements)
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
        await load(final.elements)
        setPlaying(true)
        setView('dashboard')
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Polling failed.')
      setView('prompt')
    }
  }, [load])

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

  const handleNewAtmosphere = useCallback(() => {
    pollAbortRef.current?.abort()
    stop()
    setPlaying(false)
    setAtmosphere(null)
    setView('prompt')
  }, [stop])

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
          onVolumeChange={setVolume}
          onEQChange={setEQ}
          onPanChange={setPan}
          onDepthChange={setDepth}
          onTuningChange={setTuning}
          onExport={() => exportMix(atmosphere.title ?? `atmosphere-${atmosphere.id}`)}
          onReset={handleNewAtmosphere}
        />
      )}
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

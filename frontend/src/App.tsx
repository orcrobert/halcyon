import { useState, useEffect } from 'react'
import { PromptView } from './components/PromptView'
import { DashboardView } from './components/DashboardView'
import { DevUpload } from './components/DevUpload'
import { generateAtmosphere } from './api/client'
import { useAudioEngine } from './hooks/useAudioEngine'
import type { Session } from './types'

const SESSION_KEY = 'soundscape_session'

function loadStoredSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export default function App() {
  const stored = loadStoredSession()
  const [session, setSession] = useState<Session | null>(stored)
  const isDev = new URLSearchParams(window.location.search).has('dev')
  const [view, setView] = useState<'prompt' | 'dashboard' | 'dev'>(stored ? 'dashboard' : isDev ? 'dev' : 'prompt')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(!stored)

  const { load, preload, start, pause, unpause, setVolume, setEQ, stop, exportMix, getAnalyser } = useAudioEngine()
  useEffect(() => {
    if (stored) {
      preload(stored.elements)
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (view !== 'dashboard' || !session) return
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return

      if (e.code === 'Space') {
        e.preventDefault()
        handlePlayPause()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [view, playing, session])

  async function handleGenerate(prompt: string) {
    setLoading(true)
    setError(null)
    try {
      const data = await generateAtmosphere(prompt)
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data))
      setSession(data)
      await load(data.elements)
      setPlaying(true)
      setView('dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handlePlayPause() {
    if (playing) {
      await pause()
      setPlaying(false)
    } else {
      if (session) await start()
      await unpause()
      setPlaying(true)
    }
  }

  function handleVolumeChange(label: string, volume: number) {
    setVolume(label, volume)
  }

  function handleReset() {
    stop()
    setPlaying(false)
    sessionStorage.removeItem(SESSION_KEY)
    setSession(null)
    setView('prompt')
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(#08090e, #08090e)' }}>
      {view === 'dev' && (
        <DevUpload onReady={async (data) => {
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(data))
          setSession(data)
          await load(data.elements)
          setPlaying(true)
          setView('dashboard')
        }} />
      )}
      {view === 'prompt' && (
        <PromptView
          onSubmit={handleGenerate}
          loading={loading}
          error={error}
        />
      )}
      {view === 'dashboard' && session && (
        <DashboardView
          session={session}
          playing={playing}
          getAnalyser={getAnalyser}
          onPlayPause={handlePlayPause}
          onVolumeChange={handleVolumeChange}
          onEQChange={setEQ}
          onExport={() => exportMix(session.atmosphere)}
          onReset={handleReset}
        />
      )}
    </div>
  )
}

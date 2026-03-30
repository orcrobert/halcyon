import { useState, useEffect } from 'react'
import { PromptView } from './components/PromptView'
import { DashboardView } from './components/DashboardView'
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
  const [view, setView] = useState<'prompt' | 'dashboard'>(stored ? 'dashboard' : 'prompt')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(!stored)

  const { load, preload, start, pause, unpause, setVolume, stop, exportMix, getAnalyser } = useAudioEngine()

  useEffect(() => {
    if (stored) {
      preload(stored.elements)
    }
  }, [])

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

  function handleReset() {
    stop()
    setPlaying(false)
    sessionStorage.removeItem(SESSION_KEY)
    setSession(null)
    setView('prompt')
  }

  return (
    <div className="min-h-screen bg-[#08090e]">
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
          onVolumeChange={setVolume}
          onExport={() => exportMix(session.atmosphere)}
          onReset={handleReset}
        />
      )}
    </div>
  )
}

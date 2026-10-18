import { useCallback, useEffect, useState } from 'react'
import { DashboardView } from '../components/DashboardView'
import { useAudioEngine } from '../hooks/useAudioEngine'
import type { Atmosphere } from '../types'
import { Gallery, ThemeIcon } from './Gallery'
import { ThemePanel } from './ThemePanel'
import { loadCatalog } from './catalog'

export default function DemoApp() {
  const [soundscapes, setSoundscapes] = useState<Atmosphere[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState<Atmosphere | null>(null)
  const [openingId, setOpeningId] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const [binauralActive, setBinauralActive] = useState(false)
  const [binauralBeatHz, setBinauralBeatHz] = useState(8)
  const [binauralLeftHz, setBinauralLeftHz] = useState(200)
  const [binauralRightHz, setBinauralRightHz] = useState(208)

  const {
    load, start, pause, setVolume, setEQ, setPan, setDepth,
    setTuning, setEventInterval, stop, exportMix, getAnalyser,
    startAnimate, stopAnimate, setAnimateMuted,
    startBinaural, stopBinaural, setBinauralFreqs,
  } = useAudioEngine()

  useEffect(() => {
    let cancelled = false
    loadCatalog()
      .then((list) => { if (!cancelled) setSoundscapes(list) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the soundscapes.') })
    return () => { cancelled = true }
  }, [])

  const handleOpen = useCallback(async (a: Atmosphere) => {
    if (!a.elements) return
    setOpeningId(a.id)
    setError(null)
    try {
      setTuning(440)
      await load(a.elements)
      for (const el of a.elements) {
        setVolume(el.label, el.volume)
        setPan(el.label, el.pan)
        setDepth(el.label, el.depth)
        if (el.playback === 'oneshot' && el.interval_min_s !== null && el.interval_max_s !== null) {
          setEventInterval(el.label, el.interval_min_s, el.interval_max_s)
        }
      }
      setCurrent({ ...a, elements: a.elements.map((el) => ({ ...el, tuning_hz: 440 })) })
      setPlaying(true)
      window.scrollTo(0, 0)
    } catch (err) {
      stop()
      setError(err instanceof Error ? err.message : 'Could not load that soundscape.')
    } finally {
      setOpeningId(null)
    }
  }, [load, setVolume, setPan, setDepth, setEventInterval, setTuning, stop])

  const handleBack = useCallback(() => {
    stop()
    if (binauralActive) {
      stopBinaural()
      setBinauralActive(false)
    }
    setPlaying(false)
    setCurrent(null)
  }, [stop, binauralActive, stopBinaural])

  const handlePlayPause = useCallback(async () => {
    if (playing) {
      await pause()
      setPlaying(false)
    } else {
      await start()
      setPlaying(true)
    }
  }, [playing, pause, start])

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
    function handleKeyDown(e: KeyboardEvent) {
      if (!current || themeOpen) return
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
      if (e.code === 'Space') {
        e.preventDefault()
        handlePlayPause()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [current, themeOpen, handlePlayPause])

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      {current ? (
        <DashboardView
          key={current.id}
          session={current}
          playing={playing}
          getAnalyser={getAnalyser}
          onPlayPause={handlePlayPause}
          onVolumeChange={setVolume}
          onEQChange={setEQ}
          onPanChange={setPan}
          onDepthChange={setDepth}
          onIntervalChange={setEventInterval}
          onTuningChange={setTuning}
          onExport={(seconds) => exportMix(current.title ?? 'halcyon-demo', seconds)}
          onReset={handleBack}
          resetLabel="All soundscapes"
          headerActions={
            <button
              onClick={() => setThemeOpen(true)}
              title="Theme"
              className="flex items-center gap-2 text-[12px] font-medium text-ink-dim hover:text-ink border border-line hover:border-line-active rounded-xl px-4 py-2 transition-all duration-150"
              style={{ fontFamily: 'inherit' }}
            >
              <ThemeIcon />
              <span className="hidden sm:block">Theme</span>
            </button>
          }
          actionError={null}
          onDismissActionError={() => {}}
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
      ) : (
        <Gallery
          soundscapes={soundscapes}
          error={error}
          openingId={openingId}
          onOpen={handleOpen}
          onOpenTheme={() => setThemeOpen(true)}
        />
      )}
      <ThemePanel open={themeOpen} onClose={() => setThemeOpen(false)} />
    </div>
  )
}

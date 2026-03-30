import type { Session } from '../types'
import { TrackStrip } from './TrackStrip'
import { Visualizer } from './Visualizer'

interface Props {
  session: Session
  playing: boolean
  getAnalyser: () => AnalyserNode | null
  onPlayPause: () => Promise<void>
  onVolumeChange: (label: string, volume: number) => void
  onExport: () => Promise<void>
  onReset: () => void
}

export function DashboardView({ session, playing, getAnalyser, onPlayPause, onVolumeChange, onExport, onReset }: Props) {
  return (
    <div className="min-h-screen flex flex-col bg-[#08090e]">

      {/* Top bar */}
      <header className="flex items-center justify-between px-10 py-6 border-b border-[#13141f]">
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${playing ? 'bg-indigo-500 animate-pulse' : 'bg-slate-700'}`} />
          <span className="text-[11px] uppercase tracking-[0.12em] text-slate-600">
            {playing ? 'Live' : 'Paused'}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={onExport}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-300 transition-colors"
            style={{ fontFamily: 'inherit' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>
          <button
            onClick={onReset}
            className="text-sm text-slate-600 hover:text-slate-300 transition-colors"
            style={{ fontFamily: 'inherit' }}
          >
            ← New atmosphere
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-8 py-12 gap-14">

        {/* Title + visualizer + play/pause */}
        <div className="flex flex-col items-center gap-6 text-center w-full" style={{ maxWidth: '640px' }}>

          <Visualizer getAnalyser={getAnalyser} playing={playing} />

          {/* Title */}
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-700 mb-3">Now playing</p>
            <h1 className="text-3xl font-bold text-white" style={{ letterSpacing: '-0.02em' }}>
              {session.atmosphere}
            </h1>
          </div>

          {/* Play/Pause */}
          <button
            onClick={onPlayPause}
            className="flex items-center justify-center w-12 h-12 rounded-full border border-[#1d1e2e] bg-[#111218] hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all duration-200"
          >
            {playing ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-slate-300">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-indigo-400">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </button>
        </div>

        {/* Mixer */}
        <div className="flex items-end justify-center gap-4 flex-wrap">
          {session.elements.map((el) => (
            <TrackStrip
              key={el.label}
              element={el}
              onVolumeChange={onVolumeChange}
            />
          ))}
        </div>

      </main>

      {/* Footer */}
      <footer className="py-6 text-center">
        <p className="text-[11px] text-slate-800 uppercase tracking-widest">
          Drag faders · M to mute
        </p>
      </footer>

    </div>
  )
}

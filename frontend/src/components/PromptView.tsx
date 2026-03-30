import { useState, type KeyboardEvent } from 'react'

interface Props {
  onSubmit: (prompt: string) => void
  loading: boolean
  error: string | null
}

const EXAMPLES = [
  'Witcher tavern at night',
  'Tibetan monastery at dawn',
  'Rainy cyberpunk city',
  'Romanian mountain village',
]

export function PromptView({ onSubmit, loading, error }: Props) {
  const [prompt, setPrompt] = useState('')

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (prompt.trim() && !loading) onSubmit(prompt.trim())
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-screen px-6 py-16">

      <div className="flex flex-col gap-12 w-full" style={{ maxWidth: '640px' }}>

        {/* Header */}
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/[0.06]">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            <span className="text-[11px] uppercase tracking-[0.12em] text-indigo-400 font-semibold">
              AI-Powered Audio
            </span>
          </div>

          <div className="flex flex-col gap-3.5">
            <h1 className="text-[42px] font-extrabold text-white leading-[1.1]" style={{ letterSpacing: '-0.02em' }}>
              Soundscape Generator
            </h1>
            <p className="text-[15px] text-slate-500 leading-relaxed mx-auto" style={{ maxWidth: '420px' }}>
              Describe a scene or mood. Each sound layer will be generated and mixed individually.
            </p>
          </div>
        </div>

        {/* Input card */}
        <div className="flex flex-col gap-4">
          <div
            className="rounded-2xl border border-[#1e2035] bg-[#0d0e18] transition-opacity"
            style={{ boxShadow: '0 25px 50px rgba(0,0,0,0.4)', opacity: loading ? 0.6 : 1 }}
          >
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder="A calm afternoon at a Tibetan monastery, monks chanting AUM, singing bowls resonating..."
              rows={5}
              className="w-full bg-transparent text-slate-200 resize-none border-none outline-none placeholder:text-slate-600 text-[15px] leading-relaxed"
              style={{ padding: '24px 28px 12px 28px', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            <div className="flex items-center justify-between" style={{ padding: '0 28px 20px 28px' }}>
              <span className="text-[11px] text-slate-700">Shift + Enter for new line</span>
              <button
                onClick={() => prompt.trim() && !loading && onSubmit(prompt.trim())}
                disabled={loading || !prompt.trim()}
                className="flex items-center gap-2 text-white text-sm font-semibold rounded-xl transition-colors disabled:cursor-not-allowed"
                style={{
                  padding: '12px 24px',
                  background: loading || !prompt.trim() ? 'rgba(99,102,241,0.25)' : '#6366f1',
                  fontFamily: 'inherit',
                }}
              >
                {loading ? (
                  <span className="flex items-center gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"
                        style={{ animationDelay: `${i * 0.12}s` }}
                      />
                    ))}
                    <span className="ml-1.5">Generating...</span>
                  </span>
                ) : (
                  <>
                    Generate
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>

          {error && <p className="text-center text-red-500 text-sm">{error}</p>}
          {loading && (
            <p className="text-center text-slate-500 text-sm">
              Decomposing prompt and generating audio — this takes ~30 seconds...
            </p>
          )}
        </div>

        {/* Example pills */}
        {!loading && (
          <div className="flex flex-wrap justify-center gap-2.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setPrompt(ex)}
                className="text-xs text-slate-500 hover:text-slate-200 bg-transparent hover:bg-indigo-500/5 border border-[#1a1b2e] hover:border-[#2e3050] rounded-full transition-all"
                style={{ padding: '10px 20px', fontFamily: 'inherit', cursor: 'pointer' }}
              >
                {ex}
              </button>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}

import type { Atmosphere } from '../types'

interface Props {
  atmosphere: Atmosphere
  onCancel: () => void
}

const STAGE_LABEL: Record<string, string> = {
  decomposing: 'Decomposing scene into sonic layers',
  generating: 'Generating audio (Colab GPU)',
  persisting: 'Mixing and saving stems',
  done: 'Done',
}

export function GeneratingView({ atmosphere, onCancel }: Props) {
  const job = atmosphere.job
  const stage = job?.current_stage ?? 'decomposing'
  const progress = job?.progress ?? 0
  const stageLabel = STAGE_LABEL[stage] ?? stage

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-white/30 mb-3">
          Generating
        </p>
        <h1 className="text-xl font-medium text-white/90 mb-1">
          {atmosphere.title ?? atmosphere.prompt}
        </h1>
        <p className="text-sm text-white/40 mb-10 line-clamp-2">
          {atmosphere.prompt}
        </p>

        <div className="relative h-1 bg-white/5 rounded-full overflow-hidden mb-6">
          <div
            className="absolute inset-y-0 left-0 bg-indigo-500 rounded-full transition-[width] duration-500 ease-out"
            style={{ width: `${Math.max(progress, 4)}%` }}
          />
        </div>

        <p className="text-sm text-white/60 mb-1">{stageLabel}</p>
        <p className="text-xs text-white/30 mb-10">
          {progress}% · usually 30–90 seconds
        </p>

        <button
          onClick={onCancel}
          className="text-xs text-white/40 hover:text-white/70 transition"
        >
          Back to prompt (job keeps running)
        </button>
      </div>
    </div>
  )
}

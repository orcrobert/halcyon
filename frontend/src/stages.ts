import type { Atmosphere } from './types'

export interface Stage {
  key: string
  label: string
  fallback: string
}

export type StageView = {
  index: number
  label: string
  detail: string
  settled: boolean
}

export const STAGES: Stage[] = [
  { key: 'queued', label: 'Queued', fallback: 'Waiting for the generation worker to pick this up' },
  { key: 'decomposing', label: 'Decompose', fallback: 'Splitting the scene into layers' },
  { key: 'waking', label: 'Wake generator', fallback: 'Waiting for the generator to answer' },
  { key: 'generating', label: 'Generate', fallback: 'Rendering the layers' },
  { key: 'mixing', label: 'Mix', fallback: 'Analysing loudness, EQ, placement and loop points' },
  { key: 'persisting', label: 'Save', fallback: 'Writing layers to disk' },
]

type Source = Pick<Atmosphere, 'status' | 'current_stage'> &
  Partial<Pick<Atmosphere, 'stage_detail' | 'error'>>

export function resolveStage(a: Source): StageView {
  if (a.status === 'ready') {
    return {
      index: STAGES.length,
      label: 'Ready',
      detail: 'Loading the mix into the player',
      settled: true,
    }
  }

  if (a.status === 'failed') {
    return {
      index: STAGES.length,
      label: 'Failed',
      detail: a.error ?? 'Generation failed',
      settled: true,
    }
  }

  if (a.status === 'awaiting_review') {
    const index = STAGES.findIndex((s) => s.key === 'decomposing')
    return {
      index,
      label: 'Review',
      detail: a.stage_detail ?? 'Waiting for you to review the layers',
      settled: false,
    }
  }

  const key = a.status === 'pending' ? 'queued' : a.current_stage ?? 'queued'
  const found = STAGES.findIndex((s) => s.key === key)
  const index = found === -1 ? 0 : found
  return {
    index,
    label: STAGES[index].label,
    detail: a.stage_detail ?? STAGES[index].fallback,
    settled: false,
  }
}

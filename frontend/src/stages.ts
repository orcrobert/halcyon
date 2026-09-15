import type { Atmosphere } from './types'

export interface Stage {
  key: string
  label: string
  fallback: string
}

export const STAGES: Stage[] = [
  { key: 'queued', label: 'Queued', fallback: 'Waiting for the generation worker to pick this up' },
  { key: 'decomposing', label: 'Decompose', fallback: 'Splitting the scene into layers' },
  { key: 'waking', label: 'Wake generator', fallback: 'Waiting for the generator to answer' },
  { key: 'generating', label: 'Generate', fallback: 'Rendering the layers' },
  { key: 'mixing', label: 'Mix', fallback: 'Analysing loudness, EQ, placement and loop points' },
  { key: 'persisting', label: 'Save', fallback: 'Writing layers to disk' },
]

export function stageKey(a: Pick<Atmosphere, 'status' | 'current_stage'>): string {
  if (a.status === 'pending') return 'queued'
  return a.current_stage ?? 'queued'
}

export function stageIndex(a: Pick<Atmosphere, 'status' | 'current_stage'>): number {
  const index = STAGES.findIndex((s) => s.key === stageKey(a))
  return index === -1 ? 0 : index
}

export function stageLabel(a: Pick<Atmosphere, 'status' | 'current_stage'>): string {
  return STAGES[stageIndex(a)].label
}

export function stageDetail(a: Pick<Atmosphere, 'status' | 'current_stage' | 'stage_detail'>): string {
  return a.stage_detail ?? STAGES[stageIndex(a)].fallback
}

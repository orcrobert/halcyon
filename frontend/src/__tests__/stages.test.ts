import { describe, expect, it } from 'vitest'
import { STAGES, resolveStage } from '../stages'

const base = { status: 'generating' as const, current_stage: null, stage_detail: null, error: null }

describe('resolveStage', () => {
  it('reports a queued job as the first step', () => {
    const stage = resolveStage({ ...base, status: 'pending' })

    expect(stage.index).toBe(0)
    expect(stage.label).toBe('Queued')
    expect(stage.settled).toBe(false)
  })

  it('follows the stage the worker reports', () => {
    const stage = resolveStage({ ...base, current_stage: 'mixing', stage_detail: 'Analysing 3 clips' })

    expect(stage.index).toBe(STAGES.findIndex((s) => s.key === 'mixing'))
    expect(stage.detail).toBe('Analysing 3 clips')
  })

  it('falls back to the stage wording when the worker sent none', () => {
    const stage = resolveStage({ ...base, current_stage: 'waking' })

    expect(stage.detail).toBe('Waiting for the generator to answer')
  })

  it('holds on the decompose step while the layers wait for review', () => {
    const stage = resolveStage({ ...base, status: 'awaiting_review', current_stage: 'reviewing' })

    expect(stage.index).toBe(STAGES.findIndex((s) => s.key === 'decomposing'))
    expect(stage.label).toBe('Review')
    expect(stage.detail).toBe('Waiting for you to review the layers')
    expect(stage.settled).toBe(false)
  })

  it('does not fall back to the first step once the job is ready', () => {
    const stage = resolveStage({ ...base, status: 'ready' })

    expect(stage.index).toBe(STAGES.length)
    expect(stage.label).toBe('Ready')
    expect(stage.settled).toBe(true)
  })

  it('keeps a failed job off the first step and shows its error', () => {
    const stage = resolveStage({ ...base, status: 'failed', error: 'the model is offline' })

    expect(stage.index).toBe(STAGES.length)
    expect(stage.detail).toBe('the model is offline')
    expect(stage.settled).toBe(true)
  })

  it('treats an unknown stage as the first step rather than crashing', () => {
    const stage = resolveStage({ ...base, current_stage: 'teleporting' })

    expect(stage.index).toBe(0)
  })
})

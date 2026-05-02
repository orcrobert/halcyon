export interface User {
  id: number
  name: string
  email: string
  email_verified_at: string | null
  created_at: string
  updated_at: string
}

export interface EQBand {
  type: 'lowshelf' | 'peaking' | 'highshelf'
  freq: number
  gain: number
  q: number
}

export interface Element {
  id: number
  label: string
  type: 'sound' | 'music'
  prompt: string
  duration_s: number | null
  position: number
  volume: number
  pan: number
  depth: number
  tuning_hz: number
  eq_json: EQBand[] | null
  original: {
    volume: number
    pan: number
    depth: number
    eq_json: EQBand[] | null
  }
  audio_url: string | null
}

export type AtmosphereStatus = 'pending' | 'generating' | 'ready' | 'failed'
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface Atmosphere {
  id: number
  title: string | null
  prompt: string
  status: AtmosphereStatus
  style_clip_id: number | null
  error: string | null
  generated_at: string | null
  created_at: string
  updated_at: string
  elements?: Element[]
  job?: {
    status: JobStatus
    progress: number
    current_stage: string | null
    error: string | null
  }
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: {
    current_page: number
    last_page: number
    per_page: number
    total: number
  }
}

export type ElementMixUpdate = Partial<{
  volume: number
  pan: number
  depth: number
  tuning_hz: number
  eq_json: EQBand[]
}>

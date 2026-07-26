export interface User {
  id: number
  name: string
  email: string
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
  audio_url: string
}

export type AtmosphereStatus = 'pending' | 'generating' | 'ready' | 'failed'

export interface Atmosphere {
  id: number
  title: string | null
  prompt: string
  status: AtmosphereStatus
  progress: number
  current_stage: string | null
  error: string | null
  generated_at: string | null
  created_at: string
  updated_at: string
  elements?: Element[] | null
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

export interface DecomposerProvider {
  key: string
  label: string
  default_model: string
  default_base_url: string | null
  requires_api_key: boolean
}

export interface Settings {
  generator_url: string | null
  decomposer_provider: string | null
  decomposer_model: string | null
  decomposer_base_url: string | null
  decomposer_api_key_set: boolean
  defaults: {
    generator_url: string | null
    decomposer_provider: string | null
    decomposer_model: string | null
    decomposer_base_url: string | null
  }
  providers: DecomposerProvider[]
}

export type SettingsUpdate = Partial<{
  generator_url: string
  decomposer_provider: string
  decomposer_model: string
  decomposer_base_url: string
  decomposer_api_key: string
}>

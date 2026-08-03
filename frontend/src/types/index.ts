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

export type GeneratorKind = 'colab' | 'modal' | 'huggingface' | 'local' | 'custom'

export type GeneratorStatus = 'ok' | 'unreachable' | 'error'

export interface GeneratorReport {
  audiogen_model?: string
  musicgen_model?: string
  duration?: number
  loaded?: boolean
}

export interface Generator {
  id: number
  name: string
  kind: GeneratorKind
  url: string
  is_active: boolean
  last_status: GeneratorStatus | null
  last_checked_at: string | null
  reported: GeneratorReport | null
}

export interface GeneratorHost {
  key: GeneratorKind
  label: string
  hint: string
  url_example: string
  docs_url: string
}

export interface GeneratorList {
  generators: Generator[]
  active_url: string
  instance_default_url: string
  kinds: GeneratorHost[]
}

export interface GeneratorProbe {
  status: GeneratorStatus
  detail: string | null
  reported: GeneratorReport | null
}

export interface GeneratorCreate {
  name: string
  url: string
  kind: GeneratorKind
  activate?: boolean
}

export type GeneratorUpdate = Partial<{
  name: string
  url: string
  kind: GeneratorKind
}>

export type SettingsUpdate = Partial<{
  generator_url: string
  decomposer_provider: string
  decomposer_model: string
  decomposer_base_url: string
  decomposer_api_key: string
}>

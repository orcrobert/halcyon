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
  q?: number
}

export type ElementStatus = 'ready' | 'regenerating' | 'sourcing' | 'failed'

export type ElementPlayback = 'loop' | 'oneshot'

export interface Element {
  id: number
  label: string
  type: 'sound' | 'music'
  prompt: string
  duration_s: number | null
  status: ElementStatus
  error: string | null
  version: number
  position: number
  playback: ElementPlayback
  clip_s: number | null
  interval_min_s: number | null
  interval_max_s: number | null
  source: string
  source_json: Record<string, unknown> | null
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

export type AtmosphereStatus = 'pending' | 'generating' | 'awaiting_review' | 'ready' | 'failed'

export type LayerRole = 'bed' | 'texture' | 'event'

export type EventFrequency = 'rare' | 'occasional' | 'frequent'

export interface DecompositionElement {
  label: string
  type: 'sound' | 'music'
  role: LayerRole
  frequency?: EventFrequency | null
  prompt: string
}

export interface AtmosphereTimings {
  decompose_s?: number
  wake_s?: number
  generate_s?: number
  mix_s?: number
  persist_s?: number
  total_s?: number
  audio_s?: number
  regenerate?: Omit<AtmosphereTimings, 'regenerate'>
}

export interface StyleReference {
  name: string
  start_s: number
  end_s: number
  duration_s: number
}

export interface StyleReferenceUpload {
  audio_b64: string
  name: string
  start_s: number
  end_s: number
}

export interface Atmosphere {
  id: number
  title: string | null
  prompt: string
  duration_s: number
  use_events: boolean
  style?: StyleReference | null
  status: AtmosphereStatus
  progress: number
  current_stage: string | null
  stage_detail: string | null
  error: string | null
  generated_at: string | null
  created_at: string
  updated_at: string
  timings?: AtmosphereTimings | null
  elements?: Element[] | null
  decomposition?: DecompositionElement[] | null
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
  interval_min_s: number
  interval_max_s: number
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
  decomposer_prompt: string | null
  theme: string | null
  review_decomposition: boolean
  reduce_blur: boolean
  defaults: {
    generator_url: string | null
    decomposer_provider: string | null
    decomposer_model: string | null
    decomposer_base_url: string | null
    decomposer_prompt: string
  }
  providers: DecomposerProvider[]
}

export type GeneratorKind = 'colab' | 'modal' | 'huggingface' | 'local' | 'custom'

export type GeneratorStatus = 'ok' | 'starting' | 'unreachable' | 'error'

export interface GeneratorReport {
  audiogen_model?: string
  musicgen_model?: string
  style_model?: string | null
  style_loaded?: boolean
  duration?: number
  max_duration?: number
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
  decomposer_prompt: string
  theme: string
  review_decomposition: boolean
  reduce_blur: boolean
}>

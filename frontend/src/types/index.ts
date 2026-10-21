export interface User {
  id: number
  name: string
  email: string
  is_admin: boolean
  created_at: string
  updated_at: string
}

export interface AuthOptions {
  registration: boolean
}

export interface ManagedUser extends User {
  atmospheres: number
  generators: number
  last_active_at: string | null
}

export interface ManagedUserCreate {
  name: string
  email: string
  password: string
  is_admin: boolean
}

export interface ManagedUserUpdate {
  name?: string
  email?: string
  password?: string
  is_admin?: boolean
}

export interface EQBand {
  type: 'lowshelf' | 'peaking' | 'highshelf'
  freq: number
  gain: number
  q?: number
  source?: 'tone' | 'masking' | 'both'
}

export type ElementStatus = 'ready' | 'regenerating' | 'sourcing' | 'failed'

export type ElementPlayback = 'loop' | 'oneshot'

export type QualityCheck = 'clipping' | 'burst' | 'dropout' | 'harsh' | 'seam'

export interface QualityIssue {
  check: QualityCheck
  value: number
  limit: number
}

export interface ElementQuality {
  issues: QualityIssue[]
  dismissed: boolean
}

export interface ElementTake {
  audio_url: string
  duration_s: number | null
}

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
  quality: ElementQuality | null
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
  takes: ElementTake[]
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
  uses_base_url: boolean
  suggested_models: string[]
  key_label: string
  key_hint: string | null
  available: boolean
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
  texture_takes: number
  reduce_blur: boolean
  modal_token_id: string | null
  modal_token_set: boolean
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
  gpu?: string | null
}

export type GeneratorOptionValue = string | number | boolean

export type DeployStatus = 'deploying' | 'ready' | 'failed'

export interface Generator {
  id: number
  name: string
  kind: GeneratorKind
  url: string
  is_active: boolean
  last_status: GeneratorStatus | null
  last_checked_at: string | null
  reported: GeneratorReport | null
  options: Record<string, GeneratorOptionValue>
  pending_changes: string[]
  deploy_status: DeployStatus | null
  deploy_error: string | null
  deploy_log: string | null
  deploy_started_at: string | null
  deployed_at: string | null
}

export interface GeneratorOptionSpec {
  key: string
  label: string
  hint: string
  kind: 'choice' | 'toggle' | 'number'
  scope: 'deploy' | 'request'
  default: GeneratorOptionValue
  choices: { value: string; label: string }[]
  minimum: number | null
  maximum: number | null
  step: number | null
  unit: string | null
  hosts: GeneratorKind[]
}

export interface DeployCapability {
  available: boolean
  credentials: 'user' | 'instance' | null
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
  option_specs: GeneratorOptionSpec[]
  deploy: DeployCapability
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
  texture_takes: number
  reduce_blur: boolean
  modal_token_id: string
  modal_token_secret: string
}>

export interface UpdateStatus {
  current: string
  latest: string | null
  update_available: boolean
  major: boolean
  pinned: boolean
  notes: string | null
  release_url: string | null
  published_at: string | null
  checked_at: string | null
  check_error: string | null
  track: string
  updater: 'ready' | 'missing'
  updating: boolean
  update_error: string | null
  auto_update: boolean
}

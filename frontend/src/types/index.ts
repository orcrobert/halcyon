export interface EQBand {
  type: 'low_shelf' | 'high_shelf' | 'peak'
  freq: number
  gain_db: number
  q?: number
}

export interface Element {
  label: string
  type: 'sound' | 'music'
  prompt: string
  volume: number
  file: string
  audio_b64: string
  eq?: EQBand[]
  pan?: number
}

export interface Session {
  atmosphere: string
  elements: Element[]
}

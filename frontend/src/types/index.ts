export interface Element {
  label: string
  type: 'sound' | 'music'
  prompt: string
  volume: number
  file: string
  audio_b64: string
}

export interface Session {
  atmosphere: string
  elements: Element[]
}

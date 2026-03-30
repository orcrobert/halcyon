import type { Session } from '../types'

const BASE = '/api'

export async function generateAtmosphere(prompt: string): Promise<Session> {
  const res = await fetch(`${BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Generation failed: ${text}`)
  }

  return res.json()
}

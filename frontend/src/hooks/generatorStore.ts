import { useSyncExternalStore } from 'react'
import { listGenerators } from '../api/generators'
import type { Generator, GeneratorList } from '../types'

let current: GeneratorList | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function snapshot(): GeneratorList | null {
  return current
}

export function setGenerators(list: GeneratorList | null): void {
  current = list
  listeners.forEach((listener) => listener())
}

export async function refreshGenerators(): Promise<GeneratorList> {
  const list = await listGenerators()
  setGenerators(list)
  return list
}

export function useGenerators(): GeneratorList | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

export function needsAttention(generator: Generator): boolean {
  return (
    generator.deploy_status === 'deploying' ||
    generator.deploy_status === 'failed' ||
    generator.pending_changes.length > 0
  )
}

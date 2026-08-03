import type {
  GeneratorCreate,
  GeneratorList,
  GeneratorProbe,
  GeneratorUpdate,
} from '../types'
import { api } from './client'

export async function listGenerators(): Promise<GeneratorList> {
  const { data } = await api.get<{ data: GeneratorList }>('/api/generators')
  return data.data
}

export async function createGenerator(payload: GeneratorCreate): Promise<GeneratorList> {
  const { data } = await api.post<{ data: GeneratorList }>('/api/generators', payload)
  return data.data
}

export async function updateGenerator(
  id: number,
  patch: GeneratorUpdate,
): Promise<GeneratorList> {
  const { data } = await api.patch<{ data: GeneratorList }>(`/api/generators/${id}`, patch)
  return data.data
}

export async function activateGenerator(id: number): Promise<GeneratorList> {
  const { data } = await api.post<{ data: GeneratorList }>(`/api/generators/${id}/activate`)
  return data.data
}

export async function testGenerator(id: number): Promise<GeneratorProbe> {
  const { data } = await api.post<{ data: GeneratorProbe }>(`/api/generators/${id}/test`)
  return data.data
}

export async function deleteGenerator(id: number): Promise<GeneratorList> {
  const { data } = await api.delete<{ data: GeneratorList }>(`/api/generators/${id}`)
  return data.data
}

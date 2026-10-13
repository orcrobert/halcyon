import type {
  GeneratorCreate,
  GeneratorList,
  GeneratorOptionValue,
  GeneratorProbe,
  GeneratorUpdate,
} from '../types'
import { api } from './client'
import { accountPath } from './admin'

function path(suffix: string, userId?: number): string {
  return accountPath(`/generators${suffix}`, userId)
}

export async function listGenerators(userId?: number): Promise<GeneratorList> {
  const { data } = await api.get<{ data: GeneratorList }>(path('', userId))
  return data.data
}

export async function createGenerator(payload: GeneratorCreate, userId?: number): Promise<GeneratorList> {
  const { data } = await api.post<{ data: GeneratorList }>(path('', userId), payload)
  return data.data
}

export async function updateGenerator(
  id: number,
  patch: GeneratorUpdate,
  userId?: number,
): Promise<GeneratorList> {
  const { data } = await api.patch<{ data: GeneratorList }>(path(`/${id}`, userId), patch)
  return data.data
}

export async function activateGenerator(id: number, userId?: number): Promise<GeneratorList> {
  const { data } = await api.post<{ data: GeneratorList }>(path(`/${id}/activate`, userId))
  return data.data
}

export async function testGenerator(id: number, userId?: number): Promise<GeneratorProbe> {
  const { data } = await api.post<{ data: GeneratorProbe }>(path(`/${id}/test`, userId))
  return data.data
}

export async function deleteGenerator(id: number, userId?: number): Promise<GeneratorList> {
  const { data } = await api.delete<{ data: GeneratorList }>(path(`/${id}`, userId))
  return data.data
}

export async function updateGeneratorOptions(
  id: number,
  options: Record<string, GeneratorOptionValue | null>,
  userId?: number,
): Promise<GeneratorList> {
  const { data } = await api.put<{ data: GeneratorList }>(path(`/${id}/options`, userId), { options })
  return data.data
}

export async function deployGenerator(id: number, userId?: number): Promise<GeneratorList> {
  const { data } = await api.post<{ data: GeneratorList }>(path(`/${id}/deploy`, userId))
  return data.data
}

export async function createModalGenerator(
  options: Record<string, GeneratorOptionValue>,
  userId?: number,
): Promise<GeneratorList> {
  const { data } = await api.post<{ data: GeneratorList }>(path('/modal', userId), { options })
  return data.data
}

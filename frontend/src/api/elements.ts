import type { Element, ElementMixUpdate } from '../types'
import { api } from './client'

interface ElementResponse {
  data: Element
}

export async function updateElement(
  id: number,
  patch: ElementMixUpdate,
): Promise<Element> {
  const { data } = await api.patch<ElementResponse>(`/api/elements/${id}`, patch)
  return data.data
}

export async function regenerateElement(
  id: number,
  feedback: string,
): Promise<Element> {
  const { data } = await api.post<ElementResponse>(
    `/api/elements/${id}/regenerate`,
    { feedback: feedback.trim() || null },
  )
  return data.data
}

export async function deleteElement(id: number): Promise<void> {
  await api.delete(`/api/elements/${id}`)
}

export async function resetElement(id: number): Promise<Element> {
  const { data } = await api.post<ElementResponse>(`/api/elements/${id}/reset`)
  return data.data
}

const STORAGE_KEY = 'halcyon_reduce_blur'

let reduced = false

export function blurReduced(): boolean {
  return reduced
}

export function applyReduceBlur(on: boolean): void {
  reduced = on
  const root = document.documentElement
  if (on) root.dataset.reduceBlur = ''
  else delete root.dataset.reduceBlur
}

export function storedReduceBlur(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function storeReduceBlur(on: boolean): void {
  try { localStorage.setItem(STORAGE_KEY, on ? '1' : '0') } catch {}
}

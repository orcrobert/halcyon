import type { Element, QualityCheck, QualityIssue } from './types'

export const ISSUE_TEXT: Record<QualityCheck, string> = {
  clipping: 'came back clipped',
  burst: 'has a sudden loud burst',
  dropout: 'drops out partway through',
  harsh: 'sounds harsh',
  seam: 'jumps where it loops',
}

export function flaggedLayers(elements: Element[] | null | undefined): Element[] {
  return (elements ?? []).filter(
    (element) =>
      element.status === 'ready'
      && element.quality !== null
      && !element.quality.dismissed
      && element.quality.issues.length > 0,
  )
}

export function describeIssues(issues: QualityIssue[]): string {
  const phrases = [...new Set(issues.map((issue) => ISSUE_TEXT[issue.check]))]
  if (phrases.length <= 1) return phrases[0] ?? ''
  return `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`
}

export function anyBusy(elements: Element[] | null | undefined): boolean {
  return (elements ?? []).some((element) => element.status === 'regenerating')
}

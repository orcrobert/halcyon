export interface AnchorRect {
  top: number
  bottom: number
  left: number
  width: number
}

export interface Viewport {
  width: number
  height: number
}

export interface Placement {
  top: number
  left: number
  width: number
  maxHeight: number
  side: 'above' | 'below' | 'over'
  arrowX: number
}

export function placePopover(
  anchor: AnchorRect,
  size: { width: number; height: number },
  viewport: Viewport,
  gap = 14,
  margin = 8,
): Placement {
  const width = Math.min(size.width, viewport.width - margin * 2)
  const centerX = anchor.left + anchor.width / 2
  const left = Math.max(margin, Math.min(centerX - width / 2, viewport.width - width - margin))
  const arrowX = Math.max(20, Math.min(centerX - left, width - 20))

  const above = anchor.top - gap - margin
  const below = viewport.height - anchor.bottom - gap - margin
  const fullHeight = viewport.height - margin * 2

  if (size.height <= above) {
    return { top: anchor.top - gap - size.height, left, width, maxHeight: above, side: 'above', arrowX }
  }
  if (size.height <= below) {
    return { top: anchor.bottom + gap, left, width, maxHeight: below, side: 'below', arrowX }
  }
  const room = Math.max(above, below)
  if (room >= Math.min(size.height, 240)) {
    return above >= below
      ? { top: margin, left, width, maxHeight: above, side: 'above', arrowX }
      : { top: anchor.bottom + gap, left, width, maxHeight: below, side: 'below', arrowX }
  }
  const height = Math.min(size.height, fullHeight)
  return { top: margin + (fullHeight - height) / 2, left, width, maxHeight: fullHeight, side: 'over', arrowX }
}

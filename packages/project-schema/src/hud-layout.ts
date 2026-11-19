import type { UIElement } from './index'

export function containerStyle(el: UIElement, pixel = '1px') {
  const length = (v: number) => 'calc(' + v + ' * ' + pixel + ')'
  const cell = length(el.cellWidth ?? 96)
  return {
    display: 'grid',
    alignContent: 'start',
    alignItems: 'stretch',
    gridTemplateColumns:
      el.layout === 'list' ? '1fr' : 'repeat(auto-fit,minmax(min(100%, ' + cell + '),1fr))',
    gridAutoRows: 'minmax(' + length(el.rowHeight ?? 40) + ',auto)',
    gap: length(el.gap ?? 6),
    padding: length(el.gap ?? 6),
    overflowY: el.scroll === false ? ('hidden' as const) : ('auto' as const),
    overflowX: 'hidden' as const,
    touchAction: 'pan-y',
    boxSizing: 'border-box' as const,
    pointerEvents: 'auto' as const,
  }
}
export const gridItemStyle = {
  position: 'relative' as const,
  inset: 'auto',
  transform: 'none',
  width: '100%',
  height: 'auto',
  minWidth: '0',
  overflowWrap: 'anywhere' as const,
}

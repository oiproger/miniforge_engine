import { uid, type Project, type UIElement } from './index'

export const phases = ['menu', 'playing', 'paused', 'results'] as const
export type ScreenPhase = (typeof phases)[number] | 'window'
export interface UIScreen {
  id: string
  name: string
  phase: ScreenPhase
  safeArea?: boolean
  background?: string
  /** When false on a window screen, keeps gameplay input & pointer lock active (ideal for HUD widgets). */
  modal?: boolean
}
export const anchors = [
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center',
  'center-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const
export type Anchor = (typeof anchors)[number]
export const buttonActions = [
  'event',
  'open',
  'back',
  'close',
  'play',
  'pause',
  'retry',
  'reward',
  'language',
  'input',
] as const
export const inputActions = [
  'Jump',
  'Interact',
  'Attack',
  'Sprint',
  'Crouch',
  'Flashlight',
  'Phone',
  'Pause',
  'left',
  'right',
  'up',
  'down',
] as const
export type ButtonAction = (typeof buttonActions)[number]
export const phaseNames: Record<ScreenPhase, string> = {
  menu: 'Main menu',
  playing: 'HUD',
  paused: 'Pause',
  results: 'Results',
  window: 'Window',
}
export const DEFAULT_DIALOGUE_SCREEN_ID = 'dialogue'

export function makeDialogueScreen(id = DEFAULT_DIALOGUE_SCREEN_ID, name = 'Dialogue'): UIScreen {
  return { id, name, phase: 'window', safeArea: true, modal: true }
}

export function makeDialogueControls(screenId = DEFAULT_DIALOGUE_SCREEN_ID): UIElement[] {
  return [
    {
      id: 'dialogue_panel',
      screen: screenId,
      type: 'panel',
      text: '',
      anchor: 'bottom-center',
      x: 0,
      y: 3,
      width: 68,
      height: 36,
      background: 'rgba(16, 21, 28, 0.94)',
      borderColor: 'rgba(243, 160, 93, 0.45)',
      borderRadius: 12,
      backdropBlur: 8,
      zIndex: 1,
      visible: true,
    },
    {
      id: 'dialogue_speaker',
      screen: screenId,
      type: 'text',
      text: 'NPC Name',
      anchor: 'bottom-center',
      x: -20,
      y: 34,
      color: '#f3a05d',
      fontSize: 15,
      align: 'left',
      zIndex: 2,
      visible: true,
    },
    {
      id: 'dialogue_text',
      screen: screenId,
      type: 'text',
      text: 'Dialogue line text appears here...',
      anchor: 'bottom-center',
      x: 0,
      y: 26,
      width: 62,
      color: '#edf2f7',
      fontSize: 16,
      align: 'left',
      zIndex: 2,
      visible: true,
    },
    {
      id: 'dialogue_choices',
      screen: screenId,
      type: 'container',
      text: '',
      layout: 'list',
      scroll: true,
      gap: 6,
      rowHeight: 36,
      anchor: 'bottom-center',
      x: 0,
      y: 5,
      width: 62,
      height: 17,
      background: 'rgba(10, 14, 20, 0.35)',
      borderRadius: 8,
      zIndex: 3,
      visible: true,
    },
    {
      id: 'dialogue_choice_template',
      screen: screenId,
      parentId: 'dialogue_choices',
      type: 'button',
      text: 'Choice option (style template)',
      action: 'event',
      event: 'dialogue.choose.0',
      anchor: 'top-left',
      x: 0,
      y: 0,
      background: '#222c38',
      color: '#ffffff',
      fontSize: 14,
      align: 'left',
      borderRadius: 6,
      zIndex: 4,
      visible: true,
    },
    {
      id: 'dialogue_next',
      screen: screenId,
      type: 'button',
      text: 'Далее →',
      action: 'event',
      event: 'dialogue.next',
      anchor: 'bottom-right',
      x: 18,
      y: 6,
      background: '#f3a05d',
      color: '#141920',
      fontSize: 14,
      borderRadius: 6,
      zIndex: 4,
      visible: true,
    },
  ]
}

export function makeScreen(phase: ScreenPhase, name = phaseNames[phase]): UIScreen {
  return { id: uid('screen'), name, phase, safeArea: true, modal: phase === 'window' ? true : undefined }
}
export function makeScreenControls(screen: UIScreen): UIElement[] {
  const item = (
    type: string,
    text: string,
    action: ButtonAction | undefined,
    x: number,
    y: number,
    anchor: Anchor,
    extra: Record<string, unknown> = {},
  ): UIElement => ({ id: uid('ui'), type, text, screen: screen.id, action, x, y, anchor, ...extra })
  switch (screen.phase) {
    case 'playing':
      return [item('button', 'menu.pause', 'pause', 2, 2, 'top-right')]
    case 'menu':
      return [
        item('text', screen.name, undefined, 0, -10, 'center', { fontSize: 30 }),
        item('button', 'menu.play', 'play', 0, 4, 'center'),
      ]
    case 'paused':
      return [
        item('text', 'menu.pause', undefined, 0, -10, 'center', { fontSize: 30 }),
        item('button', 'menu.resume', 'play', 0, 4, 'center'),
      ]
    case 'results':
      return [
        item('counter', 'hud.score', undefined, 0, -10, 'center', { fontSize: 26, variable: 'score' }),
        item('button', 'menu.retry', 'retry', 0, 4, 'center'),
      ]
    case 'window':
      return [
        item('text', screen.name, undefined, 0, -10, 'center', { fontSize: 26 }),
        item('button', '‹', 'back', 2, 2, 'top-left'),
      ]
  }
}
export function removeScreen(project: Project, id: string): void {
  project.screens = project.screens?.filter((s) => s.id !== id)
  project.ui = project.ui.filter((item) => item.screen !== id)
  for (const item of project.ui)
    if (item.action === 'open' && item.target === id) {
      delete item.target
      item.action = 'event'
    }
}
export function duplicateScreen(project: Project, id: string): UIScreen {
  const src = project.screens?.find((s) => s.id === id)
  if (!src) throw new Error('Unknown screen')
  const screen = { ...src, id: uid('screen'), name: src.name + ' Copy', phase: 'window' as const }
  project.screens!.push(screen)
  const copiedIds = new Map<string, string>()
  const controls = project.ui
    .filter((item) => item.screen === id)
    .map((item) => {
      const copy = structuredClone(item)
      copy.id = uid('ui')
      copiedIds.set(item.id, copy.id)
      copy.screen = screen.id
      if (copy.action === 'open' && copy.target === id) copy.target = screen.id
      return copy
    })
  for (const copy of controls) if (copy.parentId) copy.parentId = copiedIds.get(copy.parentId)
  project.ui.push(...controls)
  return screen
}
/** Place the item's selected corner / midpoint at its anchor plus an inward percentage offset. */
export function anchorStyle(anchor: Anchor = 'top-left', x = 0, y = 0) {
  const [vertical, horizontal = 'center'] = anchor.split('-')
  const middleX = horizontal === 'center',
    middleY = vertical === 'center'
  return {
    left: horizontal === 'right' ? 'auto' : (middleX ? 50 : 0) + x + '%',
    right: horizontal === 'right' ? x + '%' : 'auto',
    top: vertical === 'bottom' ? 'auto' : (middleY ? 50 : 0) + y + '%',
    bottom: vertical === 'bottom' ? y + '%' : 'auto',
    transform: 'translate(' + (middleX ? '-50%' : '0') + ', ' + (middleY ? '-50%' : '0') + ')',
  }
}

export function validateScreens(project: Project): void {
  if (project.screens === undefined) return
  if (!Array.isArray(project.screens)) throw Error('Invalid project: screens must be an array')
  const ids = new Set<string>(),
    usedPhases = new Set<string>()
  for (const s of project.screens) {
    if (
      !s ||
      typeof s.id !== 'string' ||
      !s.id ||
      ids.has(s.id) ||
      typeof s.name !== 'string' ||
      ![...phases, 'window'].includes(s.phase)
    )
      throw Error('Invalid project: invalid screen')
    if (s.phase !== 'window' && usedPhases.has(s.phase))
      throw Error('Invalid project: duplicate phase screen')
    ids.add(s.id)
    usedPhases.add(s.phase)
  }
  for (const el of project.ui) {
    if (el.screen && !ids.has(el.screen)) throw Error('Invalid project: missing UI screen')
    if (el.anchor && !anchors.includes(el.anchor)) throw Error('Invalid project: invalid UI anchor')
  }
}

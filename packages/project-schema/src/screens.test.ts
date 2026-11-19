import { describe, expect, it } from 'vitest'
import {
  anchorStyle,
  duplicateScreen,
  makeProject,
  makeScreen,
  makeScreenControls,
  parseProject,
  removeScreen,
  serializeProject,
} from './index'

describe('UI screens', () => {
  it('round-trips old projects that store only HUD elements', () => {
    const p = makeProject()
    p.ui.push({ id: 'legacy', type: 'text', text: 'Score', x: 4, y: 4 })
    expect(parseProject(serializeProject(p))).toEqual(p)
  })
  it('validates unique phases, screen ids and element references', () => {
    const p = makeProject()
    const menu = makeScreen('menu')
    p.screens = [menu]
    p.ui = makeScreenControls(menu)
    expect(parseProject(serializeProject(p))).toEqual(p)
    p.screens.push(makeScreen('menu'))
    expect(() => serializeProject(p)).toThrow(/duplicate phase/)
    p.screens.pop()
    p.ui[0].screen = 'dangling'
    expect(() => serializeProject(p)).toThrow(/missing UI screen/)
  })
  it('copies controls, updates self-navigation and removes links to deleted windows', () => {
    const p = makeProject(),
      bag = makeScreen('window', 'Bag')
    p.screens = [bag]
    p.ui = [
      { id: 'inventory', type: 'button', text: 'Open', x: 0, y: 0, action: 'open', target: bag.id },
      {
        id: 'link',
        screen: bag.id,
        type: 'button',
        text: 'Open',
        x: 0,
        y: 0,
        action: 'open',
        target: bag.id,
      },
    ]
    const copy = duplicateScreen(p, bag.id)
    const item = p.ui.find((el) => el.screen === copy.id)!
    expect(item.target).toBe(copy.id)
    expect(item.id).not.toEqual('link')
    removeScreen(p, bag.id)
    expect(p.ui[0].target).toBeUndefined()
    expect(parseProject(serializeProject(p)).ui).toHaveLength(2)
  })
  it('uses inward offsets for edges and centers the item around midpoint anchors', () => {
    expect(anchorStyle('bottom-right', 5, 8)).toMatchObject({
      right: '5%',
      bottom: '8%',
      top: 'auto',
      left: 'auto',
    })
    expect(anchorStyle('center', -1, 10)).toMatchObject({
      left: '49%',
      top: '60%',
      transform: 'translate(-50%, -50%)',
    })
    expect(anchorStyle(undefined, 2, 3)).toMatchObject({ left: '2%', top: '3%' })
  })
})

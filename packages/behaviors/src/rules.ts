import type { Component } from '../../project-schema/src'
import type { Events } from '../../runtime/src/lifecycle'

export type Value = string | number | boolean
export const operators = ['==', '!=', '>', '>=', '<', '<='] as const
export type Operator = typeof operators[number]
export interface Condition { key: string; op: Operator; value: Value }
export const actionNames = {
  addVariable: 'Add to variable', setVariable: 'Set variable', setActive: 'Set entity active',
  openScreen: 'Open screen', closeScreen: 'Close screen', loadScene: 'Load scene',
  playAnimation: 'Play animation', spawnPrefab: 'Spawn prefab', playSound: 'Play sound', emit:'Emit event',
} as const
export type Action = {
  kind: keyof typeof actionNames
  event?: string
  key?: string
  value?: Value
  target?: string
  active?: boolean
  clip?: string
  at?: string
}
export function newAction(kind: Action['kind']): Action {
  switch (kind) {
    case 'addVariable': return {kind, key:'score', value:1}
    case 'emit': return {kind,event:'event.fired'}
    case 'setVariable': return {kind, key:'score', value:0}
    case 'setActive': return {kind, target:'', active:true}
    case 'playAnimation': return {kind, target:'', clip:''}
    case 'spawnPrefab': return {kind, target:'', at:''}
    default: return {kind, target:''}
  }
}
export interface RuleAPI {
  events: Pick<Events,'on'|'emit'>
  vars: Record<string, unknown>
  selfId: string
  sourceTags(id: string): readonly string[]
  setActive(id: string, active: boolean): void
  screen(id: string, open: boolean): void
  loadScene(id: string): void
  playAnimation(id: string, clip: string): void
  spawnPrefab(asset: string, at: string): void
  playSound(asset: string): void
}
function validKey(key?: string): key is string {
  return !!key && !['__proto__','prototype','constructor'].includes(key)
}
function matches(condition: Condition, variables: RuleAPI['vars']) {
  if (!validKey(condition.key) || !Object.hasOwn(variables, condition.key)) return false
  const left = variables[condition.key], right = condition.value
  switch (condition.op) {
    case '==': return left === right
    case '!=': return left !== right
    case '>': return typeof left === 'number' && typeof right === 'number' && left > right
    case '>=': return typeof left === 'number' && typeof right === 'number' && left >= right
    case '<': return typeof left === 'number' && typeof right === 'number' && left < right
    case '<=': return typeof left === 'number' && typeof right === 'number' && left <= right
    default: return false
  }
}
function execute(action: Action, api: RuleAPI) {
  const target = action.target
  switch(action.kind) {
    case 'emit': if (action.event) api.events.emit(action.event,api.selfId); break
    case 'addVariable': {
      if (!validKey(action.key) || typeof action.value !== 'number') return
      const current = Object.hasOwn(api.vars,action.key) ? api.vars[action.key] : 0
      if (typeof current === 'number') api.vars[action.key] = current + action.value
      break
    }
    case 'setVariable':
      if (validKey(action.key) && action.value !== undefined) api.vars[action.key] = action.value
      break
    case 'setActive': api.setActive(target || api.selfId,action.active !== false); break
    case 'openScreen': case 'closeScreen': if (target) api.screen(target, action.kind === 'openScreen'); break
    case 'loadScene': if (target) api.loadScene(target); break
    case 'playAnimation': api.playAnimation(target || api.selfId, action.clip || ''); break
    case 'spawnPrefab': if (target) api.spawnPrefab(target,action.at || api.selfId); break
    case 'playSound': if (target) api.playSound(target); break
  }
}
/** Returns the subscription disposer used on scene transitions and entity destruction. */
export function bindRule(rule: Component, api: RuleAPI) {
  if (!rule.event || rule.enabled === false || !Array.isArray(rule.actions)) return () => {}
  let executing=false
  return api.events.on(rule.event, payload => {
    if (executing) return
    const source = typeof payload === 'string' ? payload : (payload as {source?: string} | null)?.source
    if (rule.source && source !== rule.source) return
    if (rule.tag && (!source || !api.sourceTags(source).includes(rule.tag))) return
    if (rule.condition && !matches(rule.condition,api.vars)) return
    executing=true
    try { for (const action of rule.actions) execute(action,api) }
    finally { executing=false }
  })
}

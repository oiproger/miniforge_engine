import { UI_WIDGET_ACTIONS } from '../../project-schema/src/eventGraph'
import type {
  EventGraphData,
  GraphEdge,
  GraphFunction,
  GraphNode,
  Vec3,
} from '../../project-schema/src'
import type { ScriptLifecycle } from './lifecycle'
import type { GameAPI } from './types'

const MAX_STEPS = 2000
const MAX_CALL_DEPTH = 48

function toVec3(val: any, fallback: Vec3 = [0, 0, 0]): Vec3 {
  if (Array.isArray(val) && val.length >= 3) {
    return [Number(val[0]) || 0, Number(val[1]) || 0, Number(val[2]) || 0]
  }
  if (val && typeof val === 'object' && 'x' in val && 'y' in val && 'z' in val) {
    return [Number(val.x) || 0, Number(val.y) || 0, Number(val.z) || 0]
  }
  if (typeof val === 'string') {
    const parts = val.split(',').map((s) => Number(s.trim()))
    if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) {
      return [parts[0], parts[1], parts[2]]
    }
  }
  return [...fallback]
}

interface ExecScope {
  nodes: Map<string, GraphNode>
  edges: GraphEdge[]
  fn?: GraphFunction
  eventData: Record<string, any>
  nodeOutputs: Map<string, Record<string, any>>
  returnValues?: Record<string, any>
  returned?: boolean
}

export function createEventGraphLifecycle(
  graph: EventGraphData,
  api: GameAPI,
  overrides: Record<string, any> = {},
): ScriptLifecycle {
  // Initialize Blueprint variables
  const localVars = new Map<string, any>()
  for (const v of graph.variables) {
    const initVal = overrides[v.name] !== undefined ? overrides[v.name] : v.defaultValue
    localVars.set(v.id, structuredClone(initVal))
  }

  const doOnceFired = new Set<string>()
  const flipFlopState = new Map<string, boolean>()
  const gateOpen = new Map<string, boolean>()
  const activeTimers = new Set<number>()
  const unsubs: (() => void)[] = []
  const inputPrev = new Map<string, boolean>()
  let destroyed = false

  const mainNodes = new Map(graph.nodes.map((n) => [n.id, n]))
  const mainScopeBase = { nodes: mainNodes, edges: graph.edges }

  const readVar = (varId: string) => {
    const def = graph.variables.find((v) => v.id === varId)
    if (!def) return undefined
    if (def.scope === 'vars') return api.vars[def.name] ?? def.defaultValue
    if (def.scope === 'worldState') return api.worldState.get(def.name, def.defaultValue)
    return localVars.has(varId) ? localVars.get(varId) : def.defaultValue
  }

  const writeVar = (varId: string, value: any) => {
    const def = graph.variables.find((v) => v.id === varId)
    if (!def) return value
    if (def.scope === 'vars') api.vars[def.name] = value
    else if (def.scope === 'worldState') api.worldState.set(def.name, value)
    else localVars.set(varId, value)
    return value
  }

  const resolveEntityId = (raw: any): string => {
    const s = String(raw ?? '').trim()
    return s || api.entity.id
  }

  function evalInput(scope: ExecScope, node: GraphNode, pinId: string, fallback?: any, depth = 0): any {
    const edge = scope.edges.find((e) => e.toNode === node.id && e.toPin === pinId)
    if (edge) {
      return evalOutput(scope, edge.fromNode, edge.fromPin, depth + 1)
    }
    if (node.inputs && node.inputs[pinId] !== undefined) return node.inputs[pinId]
    return fallback
  }

  function evalOutput(scope: ExecScope, nodeId: string, pinId: string, depth = 0): any {
    if (depth > MAX_CALL_DEPTH) return undefined
    const cached = scope.nodeOutputs.get(nodeId)
    if (cached && pinId in cached) return cached[pinId]
    const node = scope.nodes.get(nodeId)
    if (!node) return undefined

    const out = evalPureNode(scope, node, depth)
    if (out) {
      scope.nodeOutputs.set(nodeId, { ...(cached || {}), ...out })
      return out[pinId]
    }
    return undefined
  }

  function evalPureNode(scope: ExecScope, node: GraphNode, depth: number): Record<string, any> | undefined {
    const get = (pin: string, fb?: any) => evalInput(scope, node, pin, fb, depth)
    switch (node.type) {
      case 'ui.getValue': return { value: api.ui.getValue(String(get('id', ''))) ?? 0 }
      case 'ui.current': return { screenId: api.ui.current() ?? '' }
      case 'ui.isWidgetVisible': return { visible: api.ui.isWidgetVisible(String(get('id', ''))) }
      case 'ui.hasWidget': return { value: api.ui.hasWidget(String(get('id', ''))) }
      case 'var.get':
        return { value: readVar(String(node.config?.varId || '')) }
      case 'vars.get': {
        const k = String(get('key', ''))
        return { value: api.vars[k] !== undefined ? api.vars[k] : get('fallback', 0) }
      }
      case 'worldState.get':
        return { value: api.worldState.get(String(get('key', '')), get('fallback', 0)) }
      case 'math.op': {
        const a = Number(get('a', 0)) || 0
        const b = Number(get('b', 1)) || 0
        const op = String(node.config?.op || '+')
        let result = a + b
        if (op === '-') result = a - b
        else if (op === '*') result = a * b
        else if (op === '/') result = b !== 0 ? a / b : 0
        else if (op === '%') result = b !== 0 ? a % b : 0
        else if (op === 'pow') result = Math.pow(a, b)
        else if (op === 'min') result = Math.min(a, b)
        else if (op === 'max') result = Math.max(a, b)
        return { result }
      }
      case 'math.clamp': {
        const v = Number(get('value', 0)) || 0
        const mn = Number(get('min', 0)) || 0
        const mx = Number(get('max', 1)) || 1
        return { result: Math.max(mn, Math.min(mx, v)) }
      }
      case 'math.lerp': {
        const a = Number(get('a', 0)) || 0
        const b = Number(get('b', 1)) || 0
        const t = Number(get('alpha', 0.5)) || 0
        return { result: a + (b - a) * t }
      }
      case 'math.random': {
        const mn = Number(get('min', 0)) || 0
        const mx = Number(get('max', 1)) || 1
        return { result: mn + Math.random() * (mx - mn) }
      }
      case 'logic.compare': {
        const a = get('a', 0)
        const b = get('b', 0)
        const op = String(node.config?.op || '==')
        let result = false
        if (op === '==') result = a == b
        else if (op === '!=') result = a != b
        else if (op === '>') result = Number(a) > Number(b)
        else if (op === '>=') result = Number(a) >= Number(b)
        else if (op === '<') result = Number(a) < Number(b)
        else if (op === '<=') result = Number(a) <= Number(b)
        return { result }
      }
      case 'logic.bool': {
        const a = Boolean(get('a', false))
        const b = Boolean(get('b', false))
        const op = String(node.config?.op || 'AND')
        let result = a && b
        if (op === 'OR') result = a || b
        else if (op === 'NOT') result = !a
        else if (op === 'XOR') result = a !== b
        return { result }
      }
      case 'logic.select':
        return { result: Boolean(get('cond', true)) ? get('a') : get('b') }
      case 'str.concat':
        return { result: String(get('a', '')) + String(get('b', '')) }
      case 'vec3.make':
        return { vec: [Number(get('x', 0)) || 0, Number(get('y', 0)) || 0, Number(get('z', 0)) || 0] }
      case 'vec3.break': {
        const v = toVec3(get('vec', [0, 0, 0]))
        return { x: v[0], y: v[1], z: v[2] }
      }
      case 'vec3.math': {
        const a = toVec3(get('a', [0, 0, 0]))
        const b = toVec3(get('b', [0, 0, 0]))
        const s = Number(get('scalar', 1)) || 1
        const op = String(node.config?.op || 'add')
        let vec: Vec3 = [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
        if (op === 'sub') vec = [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
        else if (op === 'scale') vec = [a[0] * s, a[1] * s, a[2] * s]
        else if (op === 'normalize') {
          const l = Math.hypot(a[0], a[1], a[2]) || 1
          vec = [a[0] / l, a[1] / l, a[2] / l]
        }
        const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
        return { vec, distance }
      }
      case 'entity.self':
        return {
          id: api.entity.id,
          position: [api.object.position.x, api.object.position.y, api.object.position.z],
          time: api.time,
        }
      case 'entity.findByName': {
        const id = api.findByName(String(get('name', ''))) || ''
        return { entity: id, found: Boolean(id) }
      }
      case 'entity.findByComponent': {
        const list = api.findByComponent(String(get('componentType', '')))
        return { entity: list[0] || '', entities: list, count: list.length }
      }
      case 'entity.getParent': {
        const pid = api.getParent(resolveEntityId(get('entity', ''))) || ''
        return { parent: pid, hasParent: Boolean(pid) }
      }
      case 'entity.getChildByName': {
        const cid = api.getChildByName(resolveEntityId(get('entity', '')), String(get('name', ''))) || ''
        return { child: cid, found: Boolean(cid) }
      }
      case 'entity.getChildren': {
        const list = api.getChildren(resolveEntityId(get('entity', '')))
        return { children: list, count: list.length }
      }
      case 'entity.hasComponent': {
        const c = api.getComponent(resolveEntityId(get('entity', '')), String(get('componentType', '')))
        return { result: Boolean(c) }
      }
      case 'entity.getComponentProp': {
        const c = api.getComponent(resolveEntityId(get('entity', '')), String(get('componentType', '')))
        const prop = String(get('property', ''))
        if (c && prop && prop in c) return { value: c[prop], found: true }
        return { value: get('fallback', ''), found: false }
      }
      case 'array.make': {
        const raw = String(get('itemsJson', '[]')).trim()
        try {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) return { array: parsed }
        } catch {}
        return { array: raw ? raw.split(',').map((s) => s.trim()) : [] }
      }
      case 'array.get': {
        const arr = get('array', [])
        const idx = Math.floor(Number(get('index', 0)) || 0)
        return { value: Array.isArray(arr) ? arr[idx] : undefined }
      }
      case 'array.length': {
        const arr = get('array', [])
        return { length: Array.isArray(arr) ? arr.length : 0 }
      }
      case 'array.contains': {
        const arr = get('array', [])
        const val = get('value', '')
        const idx = Array.isArray(arr) ? arr.indexOf(val) : -1
        return { result: idx >= 0, index: idx }
      }
      case 'map.make': {
        const raw = String(get('json', '{}')).trim()
        try {
          const parsed = JSON.parse(raw)
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { map: parsed }
        } catch {}
        return { map: {} }
      }
      case 'map.get': {
        const m = get('map', {})
        const k = String(get('key', ''))
        if (m && typeof m === 'object' && k in m) return { value: m[k], hasKey: true }
        return { value: get('fallback', ''), hasKey: false }
      }
      case 'map.keys': {
        const m = get('map', {})
        const keys = m && typeof m === 'object' ? Object.keys(m) : []
        return { keys, size: keys.length }
      }
      case 'object.make': {
        const raw = String(get('json', '{}')).trim()
        try {
          const parsed = JSON.parse(raw)
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { object: parsed }
        } catch {}
        return { object: {} }
      }
      case 'object.getField': {
        const o = get('object', {})
        const f = String(get('field', ''))
        return { value: o && typeof o === 'object' && f in o ? o[f] : get('fallback', '') }
      }
      case 'object.toJson': {
        try { return { json: JSON.stringify(get('value', null)) } } catch { return { json: 'null' } }
      }
      case 'object.fromJson': {
        try { return { value: JSON.parse(String(get('json', '{}'))), ok: true } } catch { return { value: null, ok: false } }
      }
      case 'quest.getStatus': {
        const qid = String(get('questId', ''))
        return { status: qid ? api.dialogue.getQuestStatus(qid) : 'inactive' }
      }
      case 'camera.worldToScreen': {
        const pos = toVec3(get('position', [0, 0, 0]))
        const { x, y, xPercent, yPercent, depth, visible } = api.camera.worldToScreen(pos)
        return { x, y, xPercent, yPercent, depth, visible }
      }
      case 'enum.equals': {
        return { result: String(get('a', '')) === String(get('b', '')) }
      }
      case 'entity.findByTag': {
        const list = api.findByTag(String(get('tag', '')))
        return { id: list[0] ?? '', entities: list, count: list.length }
      }
      case 'entity.getPos': {
        const n = api.find(resolveEntityId(get('id', '')))
        return { position: n ? [n.position.x, n.position.y, n.position.z] : [0, 0, 0] }
      }
      case 'input.pressed':
        return { pressed: api.input.pressed(String(get('action', 'Jump'))) }
      case 'input.move': {
        const [x, z] = api.input.move
        return { x, z }
      }
      case 'player.info':
        return {
          id: api.player.id ?? '',
          position: toVec3(api.player.position),
          grounded: api.player.isGrounded,
          sprinting: api.player.isSprinting,
        }
      case 'camera.info':
        return {
          position: [api.camera.position.x, api.camera.position.y, api.camera.position.z],
          forward: [api.camera.forward.x, api.camera.forward.y, api.camera.forward.z],
          fov: api.camera.fov,
        }
      case 'physics.raycast': {
        const hit = api.physics.raycastHit(
          toVec3(get('origin', [0, 1, 0])),
          toVec3(get('direction', [0, -1, 0])),
          Number(get('length', 10)) || 10,
          [api.entity.id],
        )
        return {
          hit: Boolean(hit),
          id: hit?.id ?? '',
          distance: hit?.distance ?? 0,
          point: hit?.point ?? [0, 0, 0],
          normal: hit?.normal ?? [0, 1, 0],
        }
      }
      case 'anim.getBonePos':
        return {
          position:
            api.animation.getBonePosition(resolveEntityId(get('id', '')), String(get('bone', ''))) ?? [0, 0, 0],
        }
      case 'nav.isMoving':
        return { moving: api.nav.isAgentMoving(resolveEntityId(get('id', ''))) }
      case 'mat.getSurfaceAt': {
        const s = api.materials.getSurfaceAt(toVec3(get('position', [0, 1, 0])), [0, -1, 0], Number(get('maxDist', 3)) || 3)
        return {
          materialName: s?.materialName ?? '',
          entityId: s?.entityId ?? '',
          isTerrain: Boolean(s?.isTerrain),
          layerIndex: s?.layerIndex ?? -1,
        }
      }
      default:
        return undefined
    }
  }

  function runFromPin(scope: ExecScope, fromNodeId: string, fromPin: string, budget: { steps: number }, depth = 0) {
    if (destroyed || depth > MAX_CALL_DEPTH) return
    const outgoing = scope.edges.filter((e) => e.fromNode === fromNodeId && e.fromPin === fromPin)
    for (const edge of outgoing) {
      if (destroyed || scope.returned) return
      const target = scope.nodes.get(edge.toNode)
      if (!target) continue
      executeNode(scope, target, edge.toPin, budget, depth)
    }
  }

  function executeNode(
    scope: ExecScope,
    node: GraphNode,
    inPin: string,
    budget: { steps: number },
    depth: number,
  ) {
    if (destroyed || scope.returned) return
    if (++budget.steps > MAX_STEPS) return
    const get = (pin: string, fb?: any) => evalInput(scope, node, pin, fb, depth)
    const setOut = (vals: Record<string, any>) => {
      scope.nodeOutputs.set(node.id, { ...(scope.nodeOutputs.get(node.id) || {}), ...vals })
    }
    const next = (pin = 'exec') => runFromPin(scope, node.id, pin, budget, depth)
    const widgetAction = UI_WIDGET_ACTIONS.find((action) => action.type === node.type)
    if (widgetAction) {
      const id = String(get('id', ''))
      if (id) api.ui.updateWidget(id, Object.fromEntries(widgetAction.fields.map(
        ({ id, defaultValue }) => [id, Number(get(id, defaultValue))],
      )))
      next()
      return
    }

    switch (node.type) {
      case 'flow.branch': {
        const cond = Boolean(get('condition', true))
        next(cond ? 'true' : 'false')
        break
      }
      case 'flow.sequence': {
        next('then0')
        next('then1')
        next('then2')
        break
      }
      case 'flow.forLoop': {
        const first = Math.floor(Number(get('first', 0)) || 0)
        const last = Math.floor(Number(get('last', 5)) || 0)
        const cap = Math.min(last, first + 500)
        for (let idx = first; idx <= cap; idx++) {
          if (destroyed || scope.returned) return
          setOut({ index: idx })
          next('body')
        }
        next('completed')
        break
      }
      case 'flow.delay': {
        const sec = Math.max(0, Number(get('duration', 1)) || 0)
        const tid = window.setTimeout(() => {
          activeTimers.delete(tid)
          if (destroyed) return
          runFromPin(scope, node.id, 'completed', { steps: 0 }, depth)
        }, sec * 1000)
        activeTimers.add(tid)
        break
      }
      case 'flow.doOnce': {
        if (inPin === 'reset') {
          doOnceFired.delete(node.id)
          return
        }
        if (doOnceFired.has(node.id)) return
        doOnceFired.add(node.id)
        next('completed')
        break
      }
      case 'flow.flipFlop': {
        const isA = !(flipFlopState.get(node.id) ?? false)
        flipFlopState.set(node.id, isA)
        setOut({ isA })
        next(isA ? 'a' : 'b')
        break
      }
      case 'flow.gate': {
        if (!gateOpen.has(node.id)) gateOpen.set(node.id, !Boolean(get('startClosed', false)))
        if (inPin === 'open') gateOpen.set(node.id, true)
        else if (inPin === 'close') gateOpen.set(node.id, false)
        else if (inPin === 'toggle') gateOpen.set(node.id, !gateOpen.get(node.id))
        else if (inPin === 'enter' && gateOpen.get(node.id)) next('exit')
        break
      }
      case 'flow.emitEvent': {
        api.events.emit(String(get('eventName', '')), get('payload'))
        next()
        break
      }
      case 'flow.print': {
        const val = get('value', '')
        const line = `[EventGraph:${api.entity.name}] ${typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val)}`
        console.log(line)
        try {
          if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'miniforge:log', log: line }, '*')
          }
        } catch {
          /* ignore cross-origin */
        }
        next()
        break
      }
      case 'var.set': {
        const val = writeVar(String(node.config?.varId || ''), get('value'))
        setOut({ value: val })
        next()
        break
      }
      case 'vars.set': {
        api.vars[String(get('key', ''))] = get('value')
        next()
        break
      }
      case 'worldState.set': {
        api.worldState.set(String(get('key', '')), get('value'))
        next()
        break
      }
      case 'func.return': {
        const ret: Record<string, any> = {}
        for (const outPin of scope.fn?.outputs ?? []) {
          ret[outPin.id] = get(outPin.id)
        }
        scope.returnValues = ret
        scope.returned = true
        break
      }
      case 'func.call': {
        const fn = graph.functions.find((f) => f.id === node.config?.fnId)
        if (fn && depth < MAX_CALL_DEPTH) {
          const entry = fn.nodes.find((n) => n.type === 'func.entry')
          if (entry) {
            const entryVals: Record<string, any> = {}
            for (const p of fn.inputs) entryVals[p.id] = get(p.id)
            const fnScope: ExecScope = {
              nodes: new Map(fn.nodes.map((n) => [n.id, n])),
              edges: fn.edges,
              fn,
              eventData: {},
              nodeOutputs: new Map([[entry.id, entryVals]]),
            }
            runFromPin(fnScope, entry.id, 'exec', budget, depth + 1)
            if (fnScope.returnValues) setOut(fnScope.returnValues)
          }
        }
        next()
        break
      }
      case 'entity.setComponentProp': {
        const eid = resolveEntityId(get('entity', ''))
        const ctype = String(get('componentType', ''))
        const prop = String(get('property', ''))
        const val = get('value', '')
        const c = api.getComponent(eid, ctype)
        if (c && prop) {
          c[prop] = val
          if (ctype === 'light' && prop === 'intensity') api.lights.setIntensity(eid, Number(val) || 0)
        }
        next('exec')
        break
      }
      case 'array.set': {
        const arr = Array.isArray(get('array', [])) ? get('array', []) : []
        const idx = Math.floor(Number(get('index', 0)) || 0)
        if (idx >= 0) arr[idx] = get('value', '')
        setOut({ array: arr })
        next('exec')
        break
      }
      case 'array.push': {
        const arr = Array.isArray(get('array', [])) ? get('array', []) : []
        arr.push(get('value', ''))
        setOut({ array: arr, length: arr.length })
        next('exec')
        break
      }
      case 'array.removeAt': {
        const arr = Array.isArray(get('array', [])) ? get('array', []) : []
        const idx = Math.floor(Number(get('index', 0)) || 0)
        const removed = idx >= 0 && idx < arr.length ? arr.splice(idx, 1)[0] : undefined
        setOut({ array: arr, removed })
        next('exec')
        break
      }
      case 'array.forEach': {
        const arr = Array.isArray(get('array', [])) ? get('array', []) : []
        for (let i = 0; i < arr.length; i++) {
          if (budget.steps >= MAX_STEPS || scope.returned || destroyed) break
          setOut({ element: arr[i], index: i })
          next('loopBody')
        }
        next('completed')
        break
      }
      case 'map.set': {
        const m = get('map', {})
        const obj = m && typeof m === 'object' ? m : {}
        obj[String(get('key', ''))] = get('value', '')
        setOut({ map: obj })
        next('exec')
        break
      }
      case 'map.delete': {
        const m = get('map', {})
        const obj = m && typeof m === 'object' ? m : {}
        delete obj[String(get('key', ''))]
        setOut({ map: obj })
        next('exec')
        break
      }
      case 'object.setField': {
        const o = get('object', {})
        const obj = o && typeof o === 'object' ? o : {}
        obj[String(get('field', ''))] = get('value', '')
        setOut({ object: obj })
        next('exec')
        break
      }
      case 'enum.switch': {
        const val = String(get('value', ''))
        let matched = false
        const count = Math.max(1, Math.min(16, Number(node.config?.caseCount ?? 4)))
        for (let i = 0; i < count; i++) {
          if (val === String(get('case' + i, ''))) {
            next('out' + i)
            matched = true
            break
          }
        }
        if (!matched) next('default')
        break
      }
      case 'entity.addTag': {
        api.addTag(resolveEntityId(get('entity', '')), String(get('tag', '')))
        next('exec')
        break
      }
      case 'entity.removeTag': {
        api.removeTag(resolveEntityId(get('entity', '')), String(get('tag', '')))
        next('exec')
        break
      }
      case 'entity.setPos': {
        const n = api.find(resolveEntityId(get('id', '')))
        if (n) {
          const [x, y, z] = toVec3(get('position', [0, 0, 0]))
          n.position.set(x, y, z)
        }
        next()
        break
      }
      case 'entity.setRot': {
        const n = api.find(resolveEntityId(get('id', '')))
        if (n) {
          const [x, y, z] = toVec3(get('rotation', [0, 0, 0]))
          n.rotation.set(x, y, z)
        }
        next()
        break
      }
      case 'entity.setActive': {
        api.setActive(resolveEntityId(get('id', '')), Boolean(get('active', true)))
        next()
        break
      }
      case 'entity.spawnPrefab': {
        const aid = String(get('assetId', ''))
        const spawnedId = aid ? api.spawnPrefab(aid, toVec3(get('position', [0, 0, 0]))) : ''
        setOut({ spawnedId })
        next()
        break
      }
      case 'entity.destroy': {
        api.destroy(resolveEntityId(get('id', '')))
        next()
        break
      }
      case 'scene.load': {
        const sid = String(get('sceneId', ''))
        if (sid) api.scene.load(sid)
        next()
        break
      }
      case 'player.teleport': {
        api.player.teleport(toVec3(get('position', [0, 2, 0])), Number(get('yawDelta', 0)) || 0)
        next()
        break
      }
      case 'player.setSpeed': {
        api.player.setSpeed(Number(get('speed', 5)) || 5)
        next()
        break
      }
      case 'camera.shake': {
        api.camera.shake(Number(get('intensity', 0.35)) || 0.35, Number(get('duration', 0.4)) || 0.4)
        next()
        break
      }
      case 'camera.lookAt': {
        api.camera.lookAt(toVec3(get('target', [0, 0, 0])))
        next()
        break
      }
      case 'physics.impulse': {
        api.physics.applyImpulse(resolveEntityId(get('id', '')), toVec3(get('impulse', [0, 5, 0])))
        next()
        break
      }
      case 'physics.setVelocity': {
        api.physics.setVelocity(resolveEntityId(get('id', '')), toVec3(get('velocity', [0, 0, 0])))
        next()
        break
      }
      case 'anim.play': {
        api.animation.play(
          resolveEntityId(get('id', '')),
          String(get('clip', '')),
          Boolean(get('loop', true)),
          Number(get('speed', 1)) || 1,
        )
        next()
        break
      }
      case 'anim.crossfade': {
        api.animation.crossfade(
          resolveEntityId(get('id', '')),
          String(get('clip', '')),
          Number(get('duration', 0.25)) || 0.25,
          Boolean(get('loop', true)),
        )
        next()
        break
      }
      case 'nav.moveAgent': {
        api.nav.moveAgent(resolveEntityId(get('id', '')), toVec3(get('goal', [0, 0, 0])), {
          speed: Number(get('speed', 2.8)) || 2.8,
          walkClip: String(get('walkClip', '')) || undefined,
          idleClip: String(get('idleClip', '')) || undefined,
        })
        next()
        break
      }
      case 'nav.stopAgent': {
        api.nav.stopAgent(resolveEntityId(get('id', '')))
        next()
        break
      }
      case 'mat.setColor': {
        api.materials.setColor(
          resolveEntityId(get('id', '')),
          String(get('color', '#ffffff')),
          Number(get('opacity', 1)),
        )
        next()
        break
      }
      case 'mat.setEmissive': {
        api.materials.setEmissive(
          resolveEntityId(get('id', '')),
          String(get('color', '#ffffff')),
          Number(get('intensity', 1)),
        )
        next()
        break
      }
      case 'light.setIntensity': {
        api.lights.setIntensity(resolveEntityId(get('id', '')), Number(get('intensity', 2)) || 0)
        next()
        break
      }
      case 'light.setFlashlight': {
        api.lights.setFlashlight({
          enabled: Boolean(get('enabled', true)),
          intensity: Number(get('intensity', 3)) || 3,
          range: Number(get('range', 20)) || 20,
        })
        next()
        break
      }
      case 'env.setFog': {
        api.environment.setFog(Number(get('density', 0.02)) || 0, String(get('color', '#9ab2c4')))
        next()
        break
      }
      case 'fx.particleBurst': {
        api.particles.burst(resolveEntityId(get('id', '')), Number(get('count', 24)) || 24)
        next()
        break
      }
      case 'fx.decalSpawn': {
        api.decals.spawn({
          position: toVec3(get('position', [0, 0.02, 0])),
          color: String(get('color', '#222222')),
          lifetime: Number(get('lifetime', 15)) || 15,
        })
        next()
        break
      }
      case 'tween.moveTo': {
        const n = api.find(resolveEntityId(get('id', '')))
        if (n) {
          const [tx, ty, tz] = toVec3(get('target', [0, 2, 0]))
          const dur = Math.max(0.01, Number(get('duration', 0.6)) || 0.6)
          const tw = api.createTween()
          tw.tweenProperty(n.position, 'x', tx, dur).setTrans('sine').setEase('inOut')
          tw.parallel().tweenProperty(n.position, 'y', ty, dur).setTrans('sine').setEase('inOut')
          tw.parallel().tweenProperty(n.position, 'z', tz, dur).setTrans('sine').setEase('inOut')
          tw.tweenCallback(() => {
            if (!destroyed) runFromPin(scope, node.id, 'finished', { steps: 0 }, depth)
          })
        }
        next()
        break
      }
      case 'audio.play': {
        const handle = api.audio.play(String(get('assetId', '')), {
          volume: Number(get('volume', 1)) || 1,
          pitch: Number(get('pitch', 1)) || 1,
        })
        setOut({ handle })
        next()
        break
      }
      case 'ui.bindValue':
        api.ui.bindValue(String(get('id', '')), String(get('variable', 'health')))
        next()
        break
      case 'ui.setColors':
        api.ui.setColors(String(get('id', '')), String(get('color', '#ffffff')), String(get('background', 'transparent')))
        next()
        break
      case 'ui.open': {
        const sid = String(get('screenId', ''))
        if (sid) api.ui.open(sid)
        next()
        break
      }
      case 'ui.close': {
        api.ui.close()
        next()
        break
      }
      case 'ui.back': {
        api.ui.back()
        next()
        break
      }
      case 'ui.mount': {
        const id = String(get('id', 'hud_custom')) || 'hud_custom'
        const html = String(get('html', ''))
        const css = String(get('css', '')) || undefined
        api.ui.mount(id, html, css)
        next()
        break
      }
      case 'ui.unmount': {
        const id = String(get('id', ''))
        if (id) api.ui.unmount(id)
        next()
        break
      }
      case 'ui.setHtml': {
        const id = String(get('id', ''))
        if (id) api.ui.setHtml(id, String(get('html', '')))
        next()
        break
      }
      case 'ui.setBlur': {
        const id = String(get('id', ''))
        if (id) api.ui.setBlur(id, Number(get('blurPx', 0)) || 0)
        next()
        break
      }
      case 'ui.createScreen': {
        const id = String(get('id', ''))
        const screenId = api.ui.createScreen(id, {
          name: String(get('name', id || 'Custom Screen')),
          background: String(get('background', '')) || undefined,
          modal: Boolean(get('modal', false)),
          open: Boolean(get('openNow', true)),
        })
        setOut({ screenId })
        next()
        break
      }
      case 'ui.removeScreen': {
        const sid = String(get('screenId', ''))
        if (sid) api.ui.removeScreen(sid)
        next()
        break
      }
      case 'ui.createWidget': {
        const widgetId = api.ui.createWidget({
          id: String(get('id', '')) || undefined,
          screen: String(get('screenId', '')) || undefined,
          type: String(get('widgetType', 'label')) || 'label',
          text: String(get('text', '')),
          x: Number(get('x', 24)) || 0,
          y: Number(get('y', 24)) || 0,
          anchor: String(get('anchor', 'top-left')) || 'top-left',
          action: String(get('action', 'event')) || 'event',
          target: String(get('target', '')) || undefined,
          color: String(get('color', '#ffffff')) || undefined,
        })
        setOut({ widgetId })
        next()
        break
      }
      case 'ui.updateWidget': {
        const id = String(get('id', ''))
        if (id) {
          const patch: Record<string, any> = { visible: Boolean(get('visible', true)) }
          const txt = String(get('text', ''))
          if (txt !== '') patch.text = txt
          const col = String(get('color', ''))
          if (col !== '') patch.color = col
          const val = get('value', 100)
          if (val !== undefined && val !== '') patch.value = Number(val)
          api.ui.updateWidget(id, patch)
        }
        next()
        break
      }
      case 'ui.removeWidget': {
        const id = String(get('id', ''))
        if (id) api.ui.removeWidget(id)
        next()
        break
      }
      case 'ui.setText': {
        const id = String(get('id', ''))
        if (id) api.ui.setText(id, String(get('text', '')))
        next()
        break
      }
      case 'ui.setVisible': {
        const id = String(get('id', ''))
        if (id) api.ui.setVisible(id, Boolean(get('visible', true)))
        next()
        break
      }
      case 'audio.stop': {
        const h = String(get('handle', ''))
        if (h) api.audio.stop(h)
        next()
        break
      }
      case 'audio.stopAll': {
        api.audio.stopAll()
        next()
        break
      }
      case 'audio.setVolume': {
        const h = String(get('handle', ''))
        if (h) api.audio.setVolume(h, Number(get('volume', 1)) || 0, Number(get('fade', 0)) || 0)
        next()
        break
      }
      case 'audio.setBusVolume': {
        const bus = (String(get('bus', 'master')) || 'master') as any
        api.audio.setBusVolume(bus, Number(get('volume', 1)) || 0)
        next()
        break
      }
      case 'dialogue.start': {
        const aid = String(get('assetId', ''))
        if (aid) api.dialogue.start(aid)
        next()
        break
      }
      case 'dialogue.stop': {
        api.dialogue.stop()
        next()
        break
      }
      case 'quest.setStatus': {
        const qid = String(get('questId', ''))
        const st = (String(get('status', 'active')) || 'active') as any
        if (qid) api.dialogue.setQuestStatus(qid, st)
        next()
        break
      }
      case 'sequencer.play': {
        const aid = String(get('assetId', ''))
        if (aid) api.sequencer.play(aid)
        next()
        break
      }
      case 'sequencer.stop': {
        const aid = String(get('assetId', ''))
        if (aid) api.sequencer.stop(aid)
        next()
        break
      }
      case 'fx.particlePlay': {
        const id = resolveEntityId(get('id', 'self'))
        if (id) api.particles.play(id)
        next()
        break
      }
      case 'fx.particleStop': {
        const id = resolveEntityId(get('id', 'self'))
        if (id) api.particles.stop(id)
        next()
        break
      }
      case 'steam.unlockAchievement': {
        const ach = String(get('id', '')).trim()
        if (ach) void api.steam.unlockAchievement(ach)
        next()
        break
      }
      case 'steam.setRichPresence': {
        const k = String(get('key', 'status')).trim()
        const v = String(get('value', ''))
        if (k) void api.steam.setRichPresence(k, v)
        next()
        break
      }
      case 'steam.createLobby': {
        const name = String(get('name', 'My Lobby')).trim()
        const maxMembers = Number(get('maxMembers', 4)) || 4
        void api.steam.createLobby({ name, maxMembers }).then(() => api.net.connect({ mode: 'steam-p2p', room: name }))
        next()
        break
      }
      case 'steam.joinLobby': {
        const lid = String(get('lobbyId', '')).trim()
        if (lid) void api.steam.joinLobby(lid).then(() => api.net.connect({ mode: 'steam-p2p', room: lid }))
        next()
        break
      }
      case 'steam.leaveLobby': {
        void api.steam.leaveLobby()
        api.net.disconnect()
        next()
        break
      }
      case 'steam.cloudSave': {
        const fn = String(get('filename', 'save.json')).trim()
        const data = String(get('data', '{}'))
        if (fn) void api.steam.cloudWrite(fn, data)
        next()
        break
      }
      case 'net.hostLan': {
        void api.net.hostLan({ room: String(get('room', 'lobby-1')), port: Number(get('port', 8765)) || 8765 })
        next()
        break
      }
      case 'net.sendChat': {
        api.net.sendChat(String(get('text', '')))
        next()
        break
      }
      case 'net.setEntityVar': {
        const id = resolveEntityId(get('id', 'self'))
        const key = String(get('key', 'hp')).trim()
        if (id && key) api.net.setEntityVar(id, key, get('value', 0))
        next()
        break
      }
      case 'net.sendRpc': {
        const rpcName = String(get('name', '')).trim()
        const target = String(get('target', 'all')).trim() || 'all'
        if (rpcName) api.net.rpc(rpcName, get('payload', null), target)
        next()
        break
      }
      case 'net.connect': {
        const room = String(get('room', 'lobby-1')).trim() || 'lobby-1'
        const url = String(get('url', '')).trim()
        void api.net.connect({ room, url: url || 'local' })
        next()
        break
      }
      case 'net.disconnect': {
        api.net.disconnect()
        next()
        break
      }
      case 'anim.setParam': {
        const id = resolveEntityId(get('id', 'self'))
        const pName = String(get('name', 'speed')).trim()
        if (id && pName) api.animation.setParam(id, pName, get('value', 0) as any)
        next()
        break
      }
      case 'anim.setTrigger': {
        const id = resolveEntityId(get('id', 'self'))
        const tName = String(get('name', 'jump')).trim()
        if (id && tName) api.animation.setTrigger(id, tName)
        next()
        break
      }
      case 'anim.playState': {
        const id = resolveEntityId(get('id', 'self'))
        const stName = String(get('state', 'Idle')).trim()
        const bt = Number(get('blendTime', 0.2)) || 0.2
        if (id && stName) api.animation.playState(id, stName, bt)
        next()
        break
      }
      case 'fx.setShader': {
        const id = resolveEntityId(get('id', 'self'))
        const sh = String(get('shader', '')).trim()
        if (id) api.materials.setShader(id, sh || null)
        next()
        break
      }
      case 'fx.setShaderUniform': {
        const rawTarget = String(get('target', 'self')).trim()
        const target = rawTarget === 'self' || !rawTarget ? api.entity.id : rawTarget
        const uName = String(get('name', 'u_speed')).trim()
        const val = get('value', 1.0)
        if (target && uName) api.materials.setShaderUniform(target, uName, val as any)
        next()
        break
      }
      case 'fx.setShaderColor': {
        const rawTarget = String(get('target', 'self')).trim()
        const target = rawTarget === 'self' || !rawTarget ? api.entity.id : rawTarget
        const uName = String(get('name', 'u_color')).trim()
        const col = String(get('color', '#38bdf8')).trim()
        if (target && uName) api.materials.setShaderUniform(target, uName, col)
        next()
        break
      }
      case 'light.setGlow': {
        const id = resolveEntityId(get('id', 'self'))
        if (id) api.lights.setGlow(id, Number(get('glow', 1.5)) || 0, Number(get('falloff', 1.2)) || 1)
        next()
        break
      }
      case 'nav.setObstacle': {
        api.nav.setObstacle(toVec3(get('center', [0, 0, 0])), Number(get('radius', 1.5)) || 1, Boolean(get('blocked', true)))
        next()
        break
      }
      case 'touch.setVisible': {
        api.touch.setVisible(Boolean(get('visible', true)))
        next()
        break
      }
      case 'tween.scaleTo': {
        const id = resolveEntityId(get('id', 'self'))
        const target = toVec3(get('target', [1, 1, 1]))
        const dur = Math.max(0.01, Number(get('duration', 0.4)) || 0.4)
        const obj = id ? api.find(id) : undefined
        if (obj) { const tw = api.createTween(); tw.tweenProperty(obj.scale, 'x', target[0], dur).setTrans('sine').setEase('inOut'); tw.parallel().tweenProperty(obj.scale, 'y', target[1], dur).setTrans('sine').setEase('inOut'); tw.parallel().tweenProperty(obj.scale, 'z', target[2], dur).setTrans('sine').setEase('inOut') }
        next()
        break
      }
      case 'save.saveSlot': {
        void api.saveSystem.save(String(get('slot', 'autosave')) || 'autosave')
        next()
        break
      }
      case 'save.loadSlot': {
        void api.saveSystem.load(String(get('slot', 'autosave')) || 'autosave')
        next()
        break
      }
      case 'platform.ad': {
        const rewarded = Boolean(get('rewarded', false))
        const p = rewarded ? api.platform.showRewarded() : api.platform.showInterstitial()
        void p.then((success) => {
          if (destroyed) return
          setOut({ success })
          runFromPin(scope, node.id, 'completed', { steps: 0 }, depth)
        })
        break
      }
    }
  }

  function fireEvent(eventType: string, outputs: Record<string, any> = {}, outPin = 'exec') {
    if (destroyed) return
    const eventNodes = graph.nodes.filter((n) => n.type === eventType)
    for (const en of eventNodes) {
      const scope: ExecScope = {
        ...mainScopeBase,
        eventData: outputs,
        nodeOutputs: new Map([[en.id, outputs]]),
      }
      runFromPin(scope, en.id, outPin, { steps: 0 }, 0)
    }
  }

  return {
    onCreate() {
      // Subscribe custom event nodes
      for (const n of graph.nodes) {
        if (n.type === 'event.netRpc') {
          const rpcName = String(n.inputs?.name || '').trim()
          if (!rpcName) continue
          const off = api.net.onRpc(rpcName, (payload, sender) => {
            if (destroyed) return
            const scope: ExecScope = {
              ...mainScopeBase,
              eventData: { sender, payload },
              nodeOutputs: new Map([[n.id, { sender, payload }]]),
            }
            runFromPin(scope, n.id, 'exec', { steps: 0 }, 0)
          })
          unsubs.push(off)
        }
        if (n.type === 'event.peerJoin') {
          const off = api.net.onPeerJoin((peerId) => {
            if (destroyed) return
            const scope: ExecScope = {
              ...mainScopeBase,
              eventData: { peerId },
              nodeOutputs: new Map([[n.id, { peerId }]]),
            }
            runFromPin(scope, n.id, 'exec', { steps: 0 }, 0)
          })
          unsubs.push(off)
        }
        if (n.type === 'event.netChat') {
          const off = api.net.onChat((msg) => {
            if (destroyed) return
            const scope: ExecScope = {
              ...mainScopeBase,
              eventData: { sender: msg.name || msg.sender, text: msg.text },
              nodeOutputs: new Map([[n.id, { sender: msg.name || msg.sender, text: msg.text }]]),
            }
            runFromPin(scope, n.id, 'exec', { steps: 0 }, 0)
          })
          unsubs.push(off)
        }
        if (n.type === 'event.peerLeave') {
          const off = api.net.onPeerLeave((peerId) => {
            if (destroyed) return
            const scope: ExecScope = {
              ...mainScopeBase,
              eventData: { peerId },
              nodeOutputs: new Map([[n.id, { peerId }]]),
            }
            runFromPin(scope, n.id, 'exec', { steps: 0 }, 0)
          })
          unsubs.push(off)
        }
        if (n.type === 'event.custom') {
          const evName = String(n.inputs?.eventName || '').trim()
          if (!evName) continue
          const off = api.events.on(evName, (payload) => {
            if (destroyed) return
            const scope: ExecScope = {
              ...mainScopeBase,
              eventData: { payload },
              nodeOutputs: new Map([[n.id, { payload }]]),
            }
            runFromPin(scope, n.id, 'exec', { steps: 0 }, 0)
          })
          unsubs.push(off)
        }
      }
    },
    onStart() {
      fireEvent('event.start')
    },
    onEnable() {
      fireEvent('event.enable')
    },
    onDisable() {
      fireEvent('event.disable')
    },
    onUpdate(dt) {
      fireEvent('event.update', { dt })
      // Poll input action event nodes for pressed/released edges
      for (const n of graph.nodes) {
        if (n.type !== 'event.inputAction') continue
        const action = String(n.inputs?.action || 'Interact')
        const down = api.input.pressed(action)
        const prev = inputPrev.get(n.id) ?? false
        if (down !== prev) {
          inputPrev.set(n.id, down)
          const scope: ExecScope = {
            ...mainScopeBase,
            eventData: {},
            nodeOutputs: new Map([[n.id, {}]]),
          }
          runFromPin(scope, n.id, down ? 'pressed' : 'released', { steps: 0 }, 0)
        }
      }
    },
    onFixedUpdate(dt) {
      fireEvent('event.fixedUpdate', { dt })
    },
    onCollisionEnter(other) {
      fireEvent('event.collision', { other })
    },
    onTriggerEnter(other) {
      fireEvent('event.triggerEnter', { other })
    },
    onTriggerExit(other) {
      fireEvent('event.triggerExit', { other })
    },
    onPointerClick() {
      fireEvent('event.click')
    },
    onDestroy() {
      fireEvent('event.destroy')
      destroyed = true
      for (const tid of activeTimers) window.clearTimeout(tid)
      activeTimers.clear()
      for (const off of unsubs) off()
      unsubs.length = 0
    },
  }
}

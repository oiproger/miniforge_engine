import {
  parseEventGraph,
  UI_WIDGET_ACTIONS,
  type EventGraphData,
  type GraphEdge,
  type GraphNode,
  type Project,
} from '../../project-schema/src'

interface ScopeCtx {
  nodes: Map<string, GraphNode>
  edges: GraphEdge[]
  graph: EventGraphData
  outVars: Map<string, string>
  counter: { n: number }
}

const lit = (v: unknown) => JSON.stringify(v === undefined ? null : v)

function safeId(prefix: string, id: string) {
  return prefix + '_' + id.replace(/[^a-zA-Z0-9_]/g, '_')
}

function genExpr(ctx: ScopeCtx, node: GraphNode, pinId: string, fallback: unknown, depth = 0): string {
  if (depth > 28) return lit(fallback)
  const edge = ctx.edges.find((e) => e.toNode === node.id && e.toPin === pinId)
  if (edge) {
    const outKey = edge.fromNode + ':' + edge.fromPin
    const bound = ctx.outVars.get(outKey)
    if (bound) return bound
    const srcNode = ctx.nodes.get(edge.fromNode)
    if (srcNode) return genPureOutput(ctx, srcNode, edge.fromPin, depth + 1)
  }
  if (node.inputs && node.inputs[pinId] !== undefined) return lit(node.inputs[pinId])
  return lit(fallback)
}

function genPureOutput(ctx: ScopeCtx, node: GraphNode, pinId: string, depth: number): string {
  const g = (p: string, fb: unknown = '') => genExpr(ctx, node, p, fb, depth)
  const eid = () => `_eid(${g('entity', '')})`

  switch (node.type) {
    case 'var.get': {
      const varId = String(node.config?.varId || node.inputs?.varId || '')
      return `_readVar(${lit(varId)})`
    }
    case 'var.getHud':
      return `(api.vars[String(${g('name', '')})] ?? ${g('fallback', 0)})`
    case 'var.getWorld':
      return `api.worldState.get(String(${g('key', '')}), ${g('fallback', '')})`
    case 'math.op': {
      const a = `Number(${g('a', 0)}) || 0`
      const b = `Number(${g('b', 0)}) || 0`
      const op = String(node.inputs?.op ?? '+')
      if (op === '+') return `((${a}) + (${b}))`
      if (op === '-') return `((${a}) - (${b}))`
      if (op === '*') return `((${a}) * (${b}))`
      if (op === '/') return `((${b}) ? ((${a}) / (${b})) : 0)`
      if (op === '%') return `((${b}) ? ((${a}) % (${b})) : 0)`
      if (op === 'min') return `Math.min(${a}, ${b})`
      if (op === 'max') return `Math.max(${a}, ${b})`
      if (op === 'pow') return `Math.pow(${a}, ${b})`
      return `((${a}) + (${b}))`
    }
    case 'math.clamp':
      return `Math.max(Number(${g('min', 0)}) || 0, Math.min(Number(${g('max', 1)}) || 1, Number(${g('value', 0)}) || 0))`
    case 'math.lerp':
      return `((a, b, t) => a + (b - a) * t)(Number(${g('a', 0)}) || 0, Number(${g('b', 1)}) || 0, Number(${g('t', 0.5)}) || 0)`
    case 'math.random':
      return `((mn, mx) => mn + Math.random() * (mx - mn))(Number(${g('min', 0)}) || 0, Number(${g('max', 1)}) || 1)`
    case 'math.compare': {
      const a = g('a', 0), b = g('b', 0), op = String(node.inputs?.op ?? '==')
      if (op === '==') return `(${a} == ${b})`
      if (op === '!=') return `(${a} != ${b})`
      if (op === '>') return `(Number(${a}) > Number(${b}))`
      if (op === '>=') return `(Number(${a}) >= Number(${b}))`
      if (op === '<') return `(Number(${a}) < Number(${b}))`
      if (op === '<=') return `(Number(${a}) <= Number(${b}))`
      return `(${a} == ${b})`
    }
    case 'logic.bool': {
      const a = `Boolean(${g('a', false)})`, b = `Boolean(${g('b', false)})`, op = String(node.inputs?.op ?? 'AND')
      if (op === 'OR') return `(${a} || ${b})`
      if (op === 'NOT') return `(!${a})`
      if (op === 'XOR') return `(${a} !== ${b})`
      return `(${a} && ${b})`
    }
    case 'logic.select':
      return `(Boolean(${g('cond', false)}) ? ${g('a', '')} : ${g('b', '')})`
    case 'string.append':
      return `(String(${g('a', '')}) + String(${g('b', '')}))`
    case 'vec3.make':
      return `[Number(${g('x', 0)}) || 0, Number(${g('y', 0)}) || 0, Number(${g('z', 0)}) || 0]`
    case 'vec3.break': {
      const v = `_v3(${g('vec', [0, 0, 0])})`
      if (pinId === 'x') return `${v}[0]`
      if (pinId === 'y') return `${v}[1]`
      return `${v}[2]`
    }
    case 'vec3.math': {
      const a = `_v3(${g('a', [0, 0, 0])})`, b = `_v3(${g('b', [0, 0, 0])})`, op = String(node.inputs?.op ?? 'add')
      if (pinId === 'distance') return `Math.hypot(${a}[0]-${b}[0], ${a}[1]-${b}[1], ${a}[2]-${b}[2])`
      if (op === 'sub') return `[${a}[0]-${b}[0], ${a}[1]-${b}[1], ${a}[2]-${b}[2]]`
      if (op === 'scale') return `[${a}[0]*${b}[0], ${a}[1]*${b}[1], ${a}[2]*${b}[2]]`
      return `[${a}[0]+${b}[0], ${a}[1]+${b}[1], ${a}[2]+${b}[2]]`
    }
    case 'entity.self':
      return pinId === 'name' ? `api.entity.name` : `api.entity.id`
    case 'entity.findByTag': {
      const list = `api.findByTag(String(${g('tag', '')}))`
      if (pinId === 'entities') return list
      if (pinId === 'count') return `${list}.length`
      return `(${list}[0] || '')`
    }
    case 'entity.findByName': {
      const id = `(api.findByName(String(${g('name', '')})) || '')`
      return pinId === 'found' ? `Boolean(${id})` : id
    }
    case 'entity.findByComponent': {
      const list = `api.findByComponent(String(${g('componentType', '')}))`
      if (pinId === 'entities') return list
      if (pinId === 'count') return `${list}.length`
      return `(${list}[0] || '')`
    }
    case 'entity.getParent': {
      const p = `(api.getParent(${eid()}) || '')`
      return pinId === 'hasParent' ? `Boolean(${p})` : p
    }
    case 'entity.getChildByName': {
      const c = `(api.getChildByName(${eid()}, String(${g('name', '')})) || '')`
      return pinId === 'found' ? `Boolean(${c})` : c
    }
    case 'entity.getChildren': {
      const list = `api.getChildren(${eid()})`
      return pinId === 'count' ? `${list}.length` : list
    }
    case 'entity.hasTag':
      return `api.hasTag(${eid()}, String(${g('tag', '')}))`
    case 'entity.getTags': {
      const list = `api.getTags(${eid()})`
      return pinId === 'count' ? `${list}.length` : list
    }
    case 'entity.hasComponent':
      return `Boolean(api.getComponent(${eid()}, String(${g('componentType', '')})))`
    case 'entity.getComponentProp': {
      const c = `api.getComponent(${eid()}, String(${g('componentType', '')}))`
      const prop = `String(${g('property', '')})`
      if (pinId === 'found') return `Boolean((c => c && (${prop}) in c)(${c}))`
      return `((c, k, fb) => (c && k in c ? c[k] : fb))(${c}, ${prop}, ${g('fallback', '')})`
    }
    case 'entity.getPos':
      return `((o) => o ? [o.position.x, o.position.y, o.position.z] : [0,0,0])(api.find(${eid()}))`
    case 'input.pressed':
      return `api.input.pressed(String(${g('action', 'Interact')}))`
    case 'input.move': {
      if (pinId === 'x') return `api.input.move().x`
      if (pinId === 'y') return `api.input.move().y`
      return `[api.input.move().x, 0, api.input.move().y]`
    }
    case 'player.info':
      return pinId === 'position'
        ? `(api.player.position ? [...api.player.position] : [0,0,0])`
        : `(api.player.id || '')`
    case 'camera.info':
      return pinId === 'forward'
        ? `(api.camera.forward ? [...api.camera.forward] : [0,0,-1])`
        : `(api.camera.position ? [...api.camera.position] : [0,0,0])`
    case 'physics.raycast': {
      const r = `api.physics.raycastHit(_v3(${g('origin', [0, 1, 0])}), _v3(${g('dir', [0, 0, -1])}), Number(${g('maxDist', 20)}) || 20)`
      if (pinId === 'hit') return `Boolean(${r})`
      if (pinId === 'entity') return `(${r}?.entityId || '')`
      if (pinId === 'point') return `(${r}?.point || [0,0,0])`
      return `(${r}?.distance || 0)`
    }
    case 'anim.getBone':
      return `(api.animation.getBonePosition(${eid()}, String(${g('bone', '')})) || [0,0,0])`
    case 'nav.isMoving':
      return `api.nav.isAgentMoving(${eid()})`
    case 'world.surfaceAt':
      return `(api.terrain.getSurfaceMaterialAt(Number(${g('x', 0)}) || 0, Number(${g('z', 0)}) || 0) || '')`
    case 'array.make':
      return `_parseArr(${g('itemsJson', '[]')})`
    case 'array.get':
      return `((a, i) => Array.isArray(a) ? a[Math.floor(Number(i)||0)] : undefined)(${g('array', [])}, ${g('index', 0)})`
    case 'array.length':
      return `((a) => Array.isArray(a) ? a.length : 0)(${g('array', [])})`
    case 'array.contains': {
      const idx = `((a, v) => Array.isArray(a) ? a.indexOf(v) : -1)(${g('array', [])}, ${g('value', '')})`
      return pinId === 'index' ? idx : `(${idx} >= 0)`
    }
    case 'map.make':
      return `_parseObj(${g('json', '{}')})`
    case 'map.get': {
      const m = g('map', {}), k = `String(${g('key', '')})`
      if (pinId === 'hasKey') return `Boolean((o => o && typeof o === 'object' && (${k}) in o)(${m}))`
      return `((o, k, fb) => (o && typeof o === 'object' && k in o ? o[k] : fb))(${m}, ${k}, ${g('fallback', '')})`
    }
    case 'map.keys': {
      const ks = `((o) => o && typeof o === 'object' ? Object.keys(o) : [])(${g('map', {})})`
      return pinId === 'size' ? `${ks}.length` : ks
    }
    case 'object.make':
      return `_parseObj(${g('json', '{}')})`
    case 'object.getField':
      return `((o, f, fb) => (o && typeof o === 'object' && f in o ? o[f] : fb))(${g('object', {})}, String(${g('field', '')}), ${g('fallback', '')})`
    case 'object.toJson':
      return `JSON.stringify(${g('value', null)})`
    case 'object.fromJson': {
      const j = `String(${g('json', '{}')})`
      if (pinId === 'ok') return `((s) => { try { JSON.parse(s); return true } catch { return false } })(${j})`
      return `((s) => { try { return JSON.parse(s) } catch { return null } })(${j})`
    }
    case 'quest.getStatus':
      return `api.dialogue.getQuestStatus(String(${g('questId', '')}))`
    case 'camera.worldToScreen': {
      const sp = `api.camera.worldToScreen(_v3(${g('position', [0, 0, 0])}))`
      if (pinId === 'x') return `(${sp}).x`
      if (pinId === 'y') return `(${sp}).y`
      return `(${sp}).visible`
    }
    case 'enum.equals':
      return `(String(${g('a', '')}) === String(${g('b', '')}))`
    default:
      return 'undefined'
  }
}

function genFromPin(ctx: ScopeCtx, fromNodeId: string, fromPin: string, indent: string, depth = 0): string {
  if (depth > 40) return ''
  const edges = ctx.edges.filter((e) => e.fromNode === fromNodeId && e.fromPin === fromPin)
  let code = ''
  for (const edge of edges) {
    const node = ctx.nodes.get(edge.toNode)
    if (node) code += genExecNode(ctx, node, edge.toPin, indent, depth + 1)
  }
  return code
}

function genExecNode(ctx: ScopeCtx, node: GraphNode, inPin: string, indent: string, depth: number): string {
  const g = (p: string, fb: unknown = '') => genExpr(ctx, node, p, fb, depth)
  const eid = () => `_eid(${g('entity', '')})`
  const next = (pin = 'exec', extraIndent = indent) => genFromPin(ctx, node.id, pin, extraIndent, depth + 1)
  const v = (p: string) => {
    const name = `_v${++ctx.counter.n}`
    ctx.outVars.set(node.id + ':' + p, name)
    return name
  }

  const widgetAction = UI_WIDGET_ACTIONS.find((action) => action.type === node.type)
  if (widgetAction) {
    const fields = widgetAction.fields.map(({ id, defaultValue }) => `${id}: Number(${g(id, defaultValue)})`)
    return `${indent}api.ui.updateWidget(String(${g('id', '')}), { ${fields.join(', ')} });\n` + next()
  }
  switch (node.type) {
    case 'flow.branch':
      return `${indent}if (Boolean(${g('condition', false)})) {\n${next('true', indent + '  ')}${indent}} else {\n${next('false', indent + '  ')}${indent}}\n`
    case 'flow.sequence':
      return next('then0') + next('then1') + next('then2')
    case 'flow.forLoop': {
      const idxVar = v('index')
      const endVar = `_end${++ctx.counter.n}`
      return `${indent}for (let ${idxVar} = Math.floor(Number(${g('start', 0)}) || 0), ${endVar} = Math.floor(Number(${g('end', 5)}) || 0); ${idxVar} < ${endVar}; ${idxVar}++) {\n${next('loopBody', indent + '  ')}${indent}}\n${next('completed')}`
    }
    case 'array.forEach': {
      const arrVar = `_arr${++ctx.counter.n}`
      const idxVar = v('index')
      const elVar = v('element')
      return `${indent}{ const ${arrVar} = ${g('array', [])}; if (Array.isArray(${arrVar})) { for (let ${idxVar} = 0; ${idxVar} < ${arrVar}.length; ${idxVar}++) { const ${elVar} = ${arrVar}[${idxVar}];\n${next('loopBody', indent + '  ')}${indent}} } }\n${next('completed')}`
    }
    case 'flow.delay': {
      const tid = `_t${++ctx.counter.n}`
      return `${indent}{ const ${tid} = window.setTimeout(() => { _timers.delete(${tid}); if (_dead) return;\n${next('exec', indent + '  ')}${indent}}, Math.max(0, (Number(${g('seconds', 1)}) || 0) * 1000)); _timers.add(${tid}); }\n`
    }
    case 'flow.doOnce': {
      const key = lit(node.id)
      if (inPin === 'reset') return `${indent}_doOnce.delete(${key});\n`
      return `${indent}if (!_doOnce.has(${key})) { _doOnce.add(${key});\n${next('exec', indent + '  ')}${indent}}\n`
    }
    case 'flow.flipFlop': {
      const key = lit(node.id)
      const isA = v('isA')
      return `${indent}{ const ${isA} = !_flip.get(${key}); _flip.set(${key}, ${isA}); if (${isA}) {\n${next('a', indent + '  ')}${indent}} else {\n${next('b', indent + '  ')}${indent}} }\n`
    }
    case 'flow.gate': {
      const key = lit(node.id)
      if (inPin === 'open') return `${indent}_gate.set(${key}, true);\n`
      if (inPin === 'close') return `${indent}_gate.set(${key}, false);\n`
      if (inPin === 'toggle') return `${indent}_gate.set(${key}, !(_gate.get(${key}) ?? true));\n`
      return `${indent}if (_gate.get(${key}) ?? true) {\n${next('exec', indent + '  ')}${indent}}\n`
    }
    case 'flow.emit':
      return `${indent}api.events.emit(String(${g('eventName', '')}), ${g('payload', null)});\n` + next()
    case 'flow.print':
      return `${indent}console.log('[EventGraph]', ${g('message', '')});\n` + next()
    case 'enum.switch': {
      const sv = `_sw${++ctx.counter.n}`
      const count = Math.max(1, Math.min(16, Number(node.config?.caseCount ?? 4)))
      let code = `${indent}{ const ${sv} = String(${g('value', '')});\n`
      for (let i = 0; i < count; i++) {
        const kw = i === 0 ? 'if' : 'else if'
        code += `${indent}  ${kw} (${sv} === String(${g('case' + i, 'State_' + i)})) {\n${next('out' + i, indent + '    ')}${indent}  }\n`
      }
      code += `${indent}  else {\n${next('default', indent + '    ')}${indent}  }\n${indent}}\n`
      return code
    }
    case 'var.set': {
      const varId = String(node.config?.varId || node.inputs?.varId || '')
      const out = v('value')
      return `${indent}const ${out} = _writeVar(${lit(varId)}, ${g('value', null)});\n` + next()
    }
    case 'var.setHud':
      return `${indent}api.vars[String(${g('name', '')})] = ${g('value', 0)};\n` + next()
    case 'var.setWorld':
      return `${indent}api.worldState.set(String(${g('key', '')}), ${g('value', '')});\n` + next()
    case 'entity.setPos':
      return `${indent}{ const _o = api.find(${eid()}); const _p = _v3(${g('position', [0, 0, 0])}); if (_o) _o.position.set(_p[0], _p[1], _p[2]); }\n` + next()
    case 'entity.setRot':
      return `${indent}{ const _o = api.find(${eid()}); const _r = _v3(${g('rotation', [0, 0, 0])}); if (_o) _o.rotation.set(_r[0]*Math.PI/180, _r[1]*Math.PI/180, _r[2]*Math.PI/180); }\n` + next()
    case 'entity.setActive':
      return `${indent}api.setActive(${eid()}, Boolean(${g('active', true)}));\n` + next()
    case 'entity.spawnPrefab': {
      const out = v('entity')
      return `${indent}const ${out} = api.spawnPrefab(String(${g('prefabId', '')}), _v3(${g('position', [0, 0, 0])}));\n` + next()
    }
    case 'entity.destroy':
      return `${indent}api.destroy(${eid()});\n` + next()
    case 'entity.loadScene':
      return `${indent}api.scene.load(String(${g('sceneId', '')}));\n` + next()
    case 'entity.addTag':
      return `${indent}api.addTag(${eid()}, String(${g('tag', '')}));\n` + next()
    case 'entity.removeTag':
      return `${indent}api.removeTag(${eid()}, String(${g('tag', '')}));\n` + next()
    case 'entity.setComponentProp':
      return `${indent}{ const _id = ${eid()}, _ct = String(${g('componentType', '')}), _pr = String(${g('property', '')}), _vl = ${g('value', '')}; const _c = api.getComponent(_id, _ct); if (_c && _pr) { _c[_pr] = _vl; if (_ct === 'light' && _pr === 'intensity') api.lights.setIntensity(_id, Number(_vl) || 0); } }\n` + next()
    case 'array.set': {
      const out = v('array')
      return `${indent}const ${out} = ((a, i, x) => { const r = Array.isArray(a) ? a : []; const k = Math.floor(Number(i)||0); if (k >= 0) r[k] = x; return r; })(${g('array', [])}, ${g('index', 0)}, ${g('value', '')});\n` + next()
    }
    case 'array.push': {
      const out = v('array'), len = v('length')
      return `${indent}const ${out} = Array.isArray(${g('array', [])}) ? ${g('array', [])} : []; ${out}.push(${g('value', '')}); const ${len} = ${out}.length;\n` + next()
    }
    case 'array.removeAt': {
      const out = v('array'), rem = v('removed')
      return `${indent}const ${out} = Array.isArray(${g('array', [])}) ? ${g('array', [])} : []; const ${rem} = ${out}.splice(Math.floor(Number(${g('index', 0)}) || 0), 1)[0];\n` + next()
    }
    case 'map.set': {
      const out = v('map')
      return `${indent}const ${out} = ((m) => m && typeof m === 'object' ? m : {})(${g('map', {})}); ${out}[String(${g('key', '')})] = ${g('value', '')};\n` + next()
    }
    case 'map.delete': {
      const out = v('map')
      return `${indent}const ${out} = ((m) => m && typeof m === 'object' ? m : {})(${g('map', {})}); delete ${out}[String(${g('key', '')})];\n` + next()
    }
    case 'object.setField': {
      const out = v('object')
      return `${indent}const ${out} = ((o) => o && typeof o === 'object' ? o : {})(${g('object', {})}); ${out}[String(${g('field', '')})] = ${g('value', '')};\n` + next()
    }
    case 'player.teleport':
      return `${indent}api.player.teleport(_v3(${g('position', [0, 1, 0])}));\n` + next()
    case 'player.setSpeed':
      return `${indent}api.player.setSpeed(Number(${g('speed', 5)}) || 5);\n` + next()
    case 'camera.shake':
      return `${indent}api.camera.shake(Number(${g('intensity', 0.35)}) || 0.35, Number(${g('duration', 0.25)}) || 0.25);\n` + next()
    case 'camera.lookAt':
      return `${indent}api.camera.lookAt(_v3(${g('target', [0, 0, 0])}));\n` + next()
    case 'physics.impulse':
      return `${indent}api.physics.applyImpulse(${eid()}, _v3(${g('impulse', [0, 5, 0])}));\n` + next()
    case 'physics.velocity':
      return `${indent}api.physics.setVelocity(${eid()}, _v3(${g('velocity', [0, 0, 0])}));\n` + next()
    case 'anim.play':
      return `${indent}api.animation.play(${eid()}, String(${g('clip', '')}), Boolean(${g('loop', true)}), Number(${g('speed', 1)}) || 1);\n` + next()
    case 'anim.crossfade':
      return `${indent}api.animation.crossfade(${eid()}, String(${g('clip', '')}), Number(${g('duration', 0.25)}) || 0.25, Boolean(${g('loop', true)}), Number(${g('speed', 1)}) || 1);\n` + next()
    case 'nav.move':
      return `${indent}api.nav.moveAgent(${eid()}, _v3(${g('goal', [0, 0, 0])}), { speed: Number(${g('speed', 3.2)}) || 3.2 });\n` + next()
    case 'nav.stop':
      return `${indent}api.nav.stopAgent(${eid()});\n` + next()
    case 'world.setMatColor':
      return `${indent}api.materials.setColor(String(${g('materialId', '')}), String(${g('color', '#ffffff')}));\n` + next()
    case 'world.setMatEmissive':
      return `${indent}api.materials.setEmissive(String(${g('materialId', '')}), String(${g('color', '#ffaa00')}), Number(${g('intensity', 1)}) || 0);\n` + next()
    case 'world.setLightIntensity':
      return `${indent}api.lights.setIntensity(${eid()}, Number(${g('intensity', 1)}) || 0);\n` + next()
    case 'world.setFlashlight':
      return `${indent}api.lights.setFlashlight(Boolean(${g('enabled', true)}));\n` + next()
    case 'world.setFog':
      return `${indent}api.environment.setFog(Number(${g('start', 10)}) || 0, Number(${g('end', 45)}) || 45, String(${g('color', '#1a2230')}));\n` + next()
    case 'world.burstParticles':
      return `${indent}api.particles.burst(${eid()}, Number(${g('count', 20)}) || 20);\n` + next()
    case 'world.spawnDecal':
      return `${indent}api.decals.spawn({ position: _v3(${g('position', [0, 0.02, 0])}), size: Number(${g('size', 1)}) || 1, color: String(${g('color', '#222222')}) });\n` + next()
    case 'world.tweenMove':
      return `${indent}{ const _o = api.find(${eid()}); const _to = _v3(${g('to', [0, 2, 0])}); if (_o) api.createTween().to(_o.position, { x: _to[0], y: _to[1], z: _to[2] }, Number(${g('duration', 0.6)}) || 0.6); }\n` + next()
    case 'audio.play': {
      const out = v('handle')
      return `${indent}const ${out} = api.audio.play(String(${g('assetId', '')}), { volume: Number(${g('volume', 1)}) || 1, loop: Boolean(${g('loop', false)}) });\n` + next()
    }
    case 'ui.open':
      return `${indent}api.ui.open(String(${g('screenId', '')}));\n` + next()
    case 'ui.close':
      return `${indent}api.ui.close();\n` + next()
    case 'ui.back':
      return `${indent}api.ui.back();\n` + next()
    case 'ui.mount':
      return `${indent}api.ui.mount(String(${g('id', 'hud_custom')}), String(${g('html', '')}), String(${g('css', '')}) || undefined);\n` + next()
    case 'ui.unmount':
      return `${indent}api.ui.unmount(String(${g('id', '')}));\n` + next()
    case 'ui.setHtml':
      return `${indent}api.ui.setHtml(String(${g('id', '')}), String(${g('html', '')}));\n` + next()
    case 'ui.setBlur':
      return `${indent}api.ui.setBlur(String(${g('id', '')}), Number(${g('blurPx', 0)}) || 0);\n` + next()
    case 'ui.createScreen': {
      const out = v('screenId')
      return `${indent}const ${out} = api.ui.createScreen(String(${g('id', '')}), { name: String(${g('name', 'Custom Screen')}), background: String(${g('background', '')}) || undefined, modal: Boolean(${g('modal', false)}), open: Boolean(${g('openNow', true)}) });\n` + next()
    }
    case 'ui.removeScreen':
      return `${indent}api.ui.removeScreen(String(${g('screenId', '')}));\n` + next()
    case 'ui.createWidget': {
      const out = v('widgetId')
      return `${indent}const ${out} = api.ui.createWidget({ id: String(${g('id', '')}) || undefined, screen: String(${g('screenId', '')}) || undefined, type: String(${g('widgetType', 'label')}), text: String(${g('text', '')}), x: Number(${g('x', 24)}) || 0, y: Number(${g('y', 24)}) || 0, anchor: String(${g('anchor', 'top-left')}), action: String(${g('action', 'event')}), target: String(${g('target', '')}) || undefined, color: String(${g('color', '#ffffff')}) || undefined });\n` + next()
    }
    case 'ui.updateWidget':
      return `${indent}api.ui.updateWidget(String(${g('id', '')}), { ...((value) => value === '' ? {} : { text: value })(String(${g('text', '')})), ...((value) => value === '' || value === undefined ? {} : { value: Number(value) })(${g('value', 100)}), ...((value) => value === '' ? {} : { color: value })(String(${g('color', '')})), visible: Boolean(${g('visible', true)}) });\n` + next()
    case 'ui.removeWidget':
      return `${indent}api.ui.removeWidget(String(${g('id', '')}));\n` + next()
    case 'ui.setText':
      return `${indent}api.ui.setText(String(${g('id', '')}), String(${g('text', '')}));\n` + next()
    case 'ui.setVisible':
      return `${indent}api.ui.setVisible(String(${g('id', '')}), Boolean(${g('visible', true)}));\n` + next()
    case 'audio.stop':
      return `${indent}api.audio.stop(String(${g('handle', '')}));\n` + next()
    case 'audio.stopAll':
      return `${indent}api.audio.stopAll();\n` + next()
    case 'audio.setVolume':
      return `${indent}api.audio.setVolume(String(${g('handle', '')}), Number(${g('volume', 1)}) || 0, Number(${g('fade', 0)}) || 0);\n` + next()
    case 'audio.setBusVolume':
      return `${indent}api.audio.setBusVolume(String(${g('bus', 'master')}), Number(${g('volume', 1)}) || 0);\n` + next()
    case 'dialogue.start':
      return `${indent}api.dialogue.start(String(${g('assetId', '')}));\n` + next()
    case 'dialogue.stop':
      return `${indent}api.dialogue.stop();\n` + next()
    case 'quest.setStatus':
      return `${indent}api.dialogue.setQuestStatus(String(${g('questId', '')}), String(${g('status', 'active')}));\n` + next()
    case 'sequencer.play':
      return `${indent}api.sequencer.play(String(${g('assetId', '')}));\n` + next()
    case 'sequencer.stop':
      return `${indent}api.sequencer.stop(String(${g('assetId', '')}));\n` + next()
    case 'fx.particlePlay':
      return `${indent}api.particles.play(${eid()});\n` + next()
    case 'fx.particleStop':
      return `${indent}api.particles.stop(${eid()});\n` + next()
    case 'steam.unlockAchievement':
      return `${indent}void api.steam.unlockAchievement(String(${g('id', '')}));\n` + next()
    case 'steam.setRichPresence':
      return `${indent}void api.steam.setRichPresence(String(${g('key', 'status')}), String(${g('value', '')}));\n` + next()
    case 'steam.createLobby':
      return `${indent}void api.steam.createLobby({ name: String(${g('name', 'My Lobby')}), maxMembers: Number(${g('maxMembers', 4)}) || 4 }).then(() => api.net.connect({ mode: "steam-p2p", room: String(${g('name', 'My Lobby')}) }));\n` + next()
    case 'steam.joinLobby':
      return `${indent}void api.steam.joinLobby(String(${g('lobbyId', '')})).then(() => api.net.connect({ mode: "steam-p2p", room: String(${g('lobbyId', '')}) }));\n` + next()
    case 'steam.leaveLobby':
      return `${indent}void api.steam.leaveLobby(); api.net.disconnect();\n` + next()
    case 'steam.cloudSave':
      return `${indent}void api.steam.cloudWrite(String(${g('filename', 'save.json')}), String(${g('data', '{}')}));\n` + next()
    case 'net.hostLan':
      return `${indent}void api.net.hostLan({ room: String(${g('room', 'lobby-1')}), port: Number(${g('port', 8765)}) || 8765 });\n` + next()
    case 'net.sendChat':
      return `${indent}api.net.sendChat(String(${g('text', '')}));\n` + next()
    case 'net.setEntityVar':
      return `${indent}api.net.setEntityVar(${eid()}, String(${g('key', 'hp')}), ${g('value', 0)});\n` + next()
    case 'net.sendRpc':
      return `${indent}api.net.rpc(String(${g('name', '')}), ${g('payload', null)}, String(${g('target', 'all')}) || "all");\n` + next()
    case 'net.connect':
      return `${indent}void api.net.connect({ room: String(${g('room', 'lobby-1')}), url: String(${g('url', '')}) || "local" });\n` + next()
    case 'net.disconnect':
      return `${indent}api.net.disconnect();\n` + next()
    case 'anim.setParam':
      return `${indent}api.animation.setParam(${eid()}, String(${g('name', 'speed')}), ${g('value', 0)});\n` + next()
    case 'anim.setTrigger':
      return `${indent}api.animation.setTrigger(${eid()}, String(${g('name', 'jump')}));\n` + next()
    case 'anim.playState':
      return `${indent}api.animation.playState(${eid()}, String(${g('state', 'Idle')}), Number(${g('blendTime', 0.2)}) || 0.2);\n` + next()
    case 'fx.setShader':
      return `${indent}api.materials.setShader(${eid()}, String(${g('shader', '')}).trim() || null);\n` + next()
    case 'fx.setShaderUniform':
      return `${indent}{ const _t = String(${g('target', 'self')}).trim(); api.materials.setShaderUniform(_t === "self" || !_t ? api.entity.id : _t, String(${g('name', 'u_speed')}), ${g('value', 1.0)}); }\n` + next()
    case 'fx.setShaderColor':
      return `${indent}{ const _t = String(${g('target', 'self')}).trim(); api.materials.setShaderUniform(_t === "self" || !_t ? api.entity.id : _t, String(${g('name', 'u_color')}), String(${g('color', '#38bdf8')})); }\n` + next()
    case 'light.setGlow':
      return `${indent}api.lights.setGlow(${eid()}, Number(${g('glow', 1.5)}) || 0, Number(${g('falloff', 1.2)}) || 1);\n` + next()
    case 'nav.setObstacle':
      return `${indent}api.nav.setObstacle(_v3(${g('center', [0, 0, 0])}), Number(${g('radius', 1.5)}) || 1, Boolean(${g('blocked', true)}));\n` + next()
    case 'touch.setVisible':
      return `${indent}api.touch.setVisible(Boolean(${g('visible', true)}));\n` + next()
    case 'tween.scaleTo':
      return `${indent}{ const _o = api.find(${eid()}); const _to = _v3(${g('target', [1, 1, 1])}); if (_o) { const _d = Math.max(0.01, Number(${g('duration', 0.4)}) || 0.4); const _tw = api.createTween(); _tw.tweenProperty(_o.scale, 'x', _to[0], _d).setTrans('sine').setEase('inOut'); _tw.parallel().tweenProperty(_o.scale, 'y', _to[1], _d).setTrans('sine').setEase('inOut'); _tw.parallel().tweenProperty(_o.scale, 'z', _to[2], _d).setTrans('sine').setEase('inOut'); } }\n` + next()
    case 'save.save':
      return `${indent}void api.save.save(String(${g('slot', 'slot1')}));\n` + next()
    case 'save.load':
      return `${indent}void api.save.load(String(${g('slot', 'slot1')}));\n` + next()
    case 'ad.show':
      return `${indent}void api.platform.showAd(String(${g('kind', 'interstitial')}));\n` + next()
    default:
      return next()
  }
}

/** Ahead-of-time compile an Event Graph asset into a native ES module ScriptLifecycle (zero eval, CSP-safe). */
export function compileEventGraphToScript(graph: EventGraphData, assetName: string): string {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]))
  const counter = { n: 0 }

  const makeCtx = (initialOutputs: [string, string][] = []): ScopeCtx => ({
    nodes,
    edges: graph.edges,
    graph,
    outVars: new Map(initialOutputs),
    counter,
  })

  const emitEvents = (evType: string, pinBindings: [string, string][] = [], outPin = 'exec') => {
    let body = ''
    for (const n of graph.nodes) {
      if (n.type !== evType) continue
      const ctx = makeCtx(pinBindings.map(([pin, varName]) => [n.id + ':' + pin, varName]))
      body += genFromPin(ctx, n.id, outPin, '      ', 0)
    }
    return body
  }

  // Custom event subscriptions in onCreate
  let customSubs = ''
  for (const n of graph.nodes) {
    if (n.type === 'event.netRpc') {
      const rpcName = String(n.inputs?.name || '').trim()
      if (!rpcName) continue
      const ctx = makeCtx([[n.id + ':sender', 'sender'], [n.id + ':payload', 'payload']])
      const body = genFromPin(ctx, n.id, 'exec', '        ', 0)
      customSubs += `      _unsubs.push(api.net.onRpc(${lit(rpcName)}, (payload: any, sender: string) => {\n        if (_dead) return;\n${body}      }));\n`
      continue
    }
    if (n.type === 'event.peerJoin') {
      const ctx = makeCtx([[n.id + ':peerId', 'peerId']])
      const body = genFromPin(ctx, n.id, 'exec', '        ', 0)
      customSubs += `      _unsubs.push(api.net.onPeerJoin((peerId: string) => {\n        if (_dead) return;\n${body}      }));\n`
      continue
    }
    if (n.type === 'event.netChat') {
      const ctx = makeCtx([[n.id + ':sender', '(msg.name || msg.sender)'], [n.id + ':text', 'msg.text']])
      const body = genFromPin(ctx, n.id, 'exec', '        ', 0)
      customSubs += `      _unsubs.push(api.net.onChat((msg: any) => {\n        if (_dead) return;\n${body}      }));\n`
      continue
    }
    if (n.type === 'event.peerLeave') {
      const ctx = makeCtx([[n.id + ':peerId', 'peerId']])
      const body = genFromPin(ctx, n.id, 'exec', '        ', 0)
      customSubs += `      _unsubs.push(api.net.onPeerLeave((peerId: string) => {\n        if (_dead) return;\n${body}      }));\n`
      continue
    }
    if (n.type !== 'event.custom') continue
    const evName = String(n.inputs?.eventName || '').trim()
    if (!evName) continue
    const ctx = makeCtx([[n.id + ':payload', 'payload']])
    const body = genFromPin(ctx, n.id, 'exec', '        ', 0)
    customSubs += `      _unsubs.push(api.events.on(${lit(evName)}, (payload: any) => {\n        if (_dead) return;\n${body}      }));\n`
  }

  // Input action polling in onUpdate
  let inputPolls = ''
  for (const n of graph.nodes) {
    if (n.type !== 'event.inputAction') continue
    const action = String(n.inputs?.action || 'Interact')
    const key = safeId('_in', n.id)
    const pressedBody = genFromPin(makeCtx(), n.id, 'pressed', '        ', 0)
    const releasedBody = genFromPin(makeCtx(), n.id, 'released', '        ', 0)
    inputPolls += `      { const _dn = api.input.pressed(${lit(action)}); if (_dn !== _inState.${key}) { _inState.${key} = _dn; if (_dn) {\n${pressedBody}      } else {\n${releasedBody}      } } }\n`
  }

  const varDefs = graph.variables.map((v) => ({
    id: v.id,
    name: v.name,
    scope: v.scope || 'local',
    defaultValue: v.defaultValue,
  }))

  return `// Nativized Event Graph: ${assetName.replace(/\r?\n/g, ' ')}
export default function (api: any) {
  const _varDefs = ${JSON.stringify(varDefs)};
  const _localVars = new Map<string, any>();
  for (const d of _varDefs) {
    const ov = api.params && api.params[d.name] !== undefined ? api.params[d.name] : d.defaultValue;
    _localVars.set(d.id, typeof structuredClone === 'function' ? structuredClone(ov) : ov);
  }
  const _doOnce = new Set<string>();
  const _flip = new Map<string, boolean>();
  const _gate = new Map<string, boolean>();
  const _timers = new Set<number>();
  const _unsubs: (() => void)[] = [];
  const _inState: Record<string, boolean> = {};
  let _dead = false;

  const _readVar = (id: string) => {
    const d = _varDefs.find((x: any) => x.id === id);
    if (!d) return undefined;
    if (d.scope === 'vars') return api.vars[d.name] ?? d.defaultValue;
    if (d.scope === 'worldState') return api.worldState.get(d.name, d.defaultValue);
    return _localVars.has(id) ? _localVars.get(id) : d.defaultValue;
  };
  const _writeVar = (id: string, val: any) => {
    const d = _varDefs.find((x: any) => x.id === id);
    if (!d) return val;
    if (d.scope === 'vars') api.vars[d.name] = val;
    else if (d.scope === 'worldState') api.worldState.set(d.name, val);
    else _localVars.set(id, val);
    return val;
  };
  const _eid = (raw: any) => String(raw ?? '').trim() || api.entity.id;
  const _v3 = (v: any): [number, number, number] => Array.isArray(v) && v.length >= 3 ? [Number(v[0])||0, Number(v[1])||0, Number(v[2])||0] : [0, 0, 0];
  const _parseArr = (raw: any) => { try { const p = JSON.parse(String(raw || '[]')); if (Array.isArray(p)) return p; } catch {} return String(raw || '').split(',').map((s: string) => s.trim()).filter(Boolean); };
  const _parseObj = (raw: any) => { try { const p = JSON.parse(String(raw || '{}')); if (p && typeof p === 'object' && !Array.isArray(p)) return p; } catch {} return {}; };

  return {
    onCreate() {
${customSubs}    },
    onStart() {
${emitEvents('event.start')}    },
    onEnable() {
${emitEvents('event.enable')}    },
    onDisable() {
${emitEvents('event.disable')}    },
    onUpdate(dt: number) {
${emitEvents('event.update', [['dt', 'dt']])}${inputPolls}    },
    onFixedUpdate(dt: number) {
${emitEvents('event.fixedUpdate', [['dt', 'dt']])}    },
    onCollisionEnter(other: any) {
${emitEvents('event.collision', [['other', 'other']])}    },
    onTriggerEnter(other: any) {
${emitEvents('event.triggerEnter', [['other', 'other']])}    },
    onTriggerExit(other: any) {
${emitEvents('event.triggerExit', [['other', 'other']])}    },
    onPointerClick() {
${emitEvents('event.click')}    },
    onDestroy() {
${emitEvents('event.destroy')}      _dead = true;
      for (const t of _timers) window.clearTimeout(t);
      _timers.clear();
      for (const off of _unsubs) off();
      _unsubs.length = 0;
    },
  };
}
`
}

/** Rewrite all Event Graph assets and components in a cloned export Project into native TypeScript/JS script assets. */
export function nativizeProjectEventGraphs(project: Project): number {
  const graphAssetIds = new Set<string>()
  for (const asset of project.assets) {
    if (asset.type !== 'graph') continue
    const graphData = parseEventGraph(asset.data)
    asset.type = 'script'
    asset.data = compileEventGraphToScript(graphData, asset.name)
    asset.name = asset.name.replace(/\.[^.]+$/, '') + '.nativized.ts'
    graphAssetIds.add(asset.id)
  }
  if (!graphAssetIds.size) return 0

  const rewriteEntities = (entities: any[]) => {
    for (const ent of entities) {
      if (!Array.isArray(ent.components)) continue
      for (const c of ent.components) {
        if ((c.type === 'eventGraph' || c.type === 'rule') && c.asset && graphAssetIds.has(c.asset)) {
          c.type = 'script'
          c.params = { ...(c.params || {}), ...(c.overrides || {}) }
          delete c.overrides
        }
      }
    }
  }

  for (const scene of project.scenes) rewriteEntities(scene.entities)
  for (const asset of project.assets) {
    if (asset.type === 'prefab') {
      try {
        const nodes = JSON.parse(asset.data)
        if (Array.isArray(nodes)) {
          rewriteEntities(nodes)
          asset.data = JSON.stringify(nodes)
        }
      } catch {}
    }
  }
  return graphAssetIds.size
}

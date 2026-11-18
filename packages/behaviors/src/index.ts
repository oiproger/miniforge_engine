import { Vector3 } from 'three'
import type { GameAPI } from '../../runtime/src/types'
import type { ScriptLifecycle } from '../../runtime/src/lifecycle'

/** Event-driven behaviors share the same API and lifetimes as user scripts. */
export function behavior(kind: string, api: GameAPI): ScriptLifecycle {
  const p = api.params,
    obj = api.object,
    origin = obj.position.clone(),
    point = new Vector3()
  let elapsed = 0
  const when = (handler: () => void, event: string): ScriptLifecycle => {
    const off = api.events.on(p.event || event, handler)
    return { onDestroy: off }
  }
  switch (kind) {
    case 'rotate':
      return {
        onUpdate(dt) {
          const axis = p.axis === 'x' ? 'x' : p.axis === 'z' ? 'z' : 'y'
          obj.rotation[axis] += dt * (p.speed ?? 1)
        },
      }
    case 'move':
      return {
        onUpdate(dt) {
          elapsed += dt
          const t = (1 - Math.cos(elapsed * (p.speed ?? 1))) / 2
          obj.position.copy(origin).addScaledVector(point.set(p.x ?? 2, p.y ?? 0, p.z ?? 0), t)
        },
      }
    case 'follow':
    case 'lookAt':
      return {
        onUpdate(dt) {
          const target = api.find(p.target)
          if (!target) return
          target.getWorldPosition(point)
          if (kind === 'lookAt') obj.lookAt(point)
          else {
            obj.parent?.worldToLocal(point)
            obj.position.lerp(point, 1 - Math.exp(-dt * (p.speed ?? 2)))
          }
        },
      }
    case 'timer':
    case 'destroy':
      return {
        onUpdate(dt) {
          elapsed += dt
          if (elapsed >= (p.seconds ?? 3)) {
            elapsed = p.repeat ? 0 : -Infinity
            if (kind === 'destroy') obj.visible = false
            else api.events.emit(p.event || 'timer.done', api.entity.id)
          }
        },
      }
    case 'clickable':
      return {
        onPointerClick() {
          api.events.emit(p.event || 'object.clicked', api.entity.id)
        },
      }
    case 'sound':
      return when(() => api.audio.play(p.asset), 'coin.collected')
    case 'setVariable':
      return when(() => {
        api.vars[p.key || 'score'] = p.value ?? 1
      }, 'object.clicked')
    case 'toggleUI':
      return when(() => {
        const el = api.ui.get(p.target)
        if (el) el.hidden = !el.hidden
      }, 'object.clicked')
    case 'changeScene':
      return when(() => api.scene.load(p.scene), 'level.completed')
    case 'reward':
      return when(() => {
        void api.platform.showRewarded().then((ok) => {
          if (ok) api.vars.score = (api.vars.score || 0) + (p.points ?? 1)
        })
      }, 'reward.request')
    case 'spawn': {
      const clones = new Set<ReturnType<typeof obj.clone>>()
      const off = api.events.on(p.event || 'spawn', () => {
        const source = api.find(p.target)
        if (!source || !obj.parent) return
        const clone = source.clone()
        clone.visible = true
        clone.position.copy(obj.position)
        obj.parent.add(clone)
        clones.add(clone)
      })
      return {
        onDestroy() {
          off()
          for (const clone of clones) clone.removeFromParent()
        },
      }
    }
    default:
      return {}
  }
}

import { Vector3 } from '../../graphics/src/scene'
import { behaviorParams } from './catalog'
import type { GameAPI } from '../../runtime/src/types'
import type { ScriptLifecycle } from '../../runtime/src/lifecycle'

/** Event-driven and physics behaviors share the same API and lifetimes as user scripts. */
export function behavior(kind: string, api: GameAPI): ScriptLifecycle {
  const p = behaviorParams(kind, api.params),
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
    case 'movingPlatform': {
      let phase = 0
      return {
        onFixedUpdate(dt) {
          const speed = Math.max(0.05, Number(p.speed ?? 1))
          phase += dt * speed
          const pause = Math.max(0, Number(p.pause ?? 0.5))
          const cycle = Math.PI + pause
          const local = phase % (cycle * 2)
          let t = 0
          if (local < Math.PI) t = (1 - Math.cos(local)) / 2
          else if (local < cycle) t = 1
          else if (local < cycle + Math.PI) t = (1 + Math.cos(local - cycle)) / 2
          else t = 0
          obj.position.copy(origin).addScaledVector(point.set(p.x ?? 0, p.y ?? 3, p.z ?? 0), t)
        },
      }
    }
    case 'patrol': {
      let forwardDir = 1
      const targetPos = origin.clone().add(new Vector3(p.x ?? 4, p.y ?? 0, p.z ?? 0))
      return {
        onUpdate(dt) {
          const dest = forwardDir > 0 ? targetPos : origin
          const dx = dest.x - obj.position.x,
            dy = dest.y - obj.position.y,
            dz = dest.z - obj.position.z
          const dist = Math.hypot(dx, dy, dz)
          if (dist < 0.08) {
            forwardDir *= -1
            return
          }
          const step = Math.min(dist, dt * Math.max(0.1, Number(p.speed ?? 2)))
          obj.position.x += (dx / dist) * step
          obj.position.y += (dy / dist) * step
          obj.position.z += (dz / dist) * step
          const desiredYaw = Math.atan2(dx, dz)
          const diff = Math.atan2(Math.sin(desiredYaw - obj.rotation.y), Math.cos(desiredYaw - obj.rotation.y))
          obj.rotation.y += diff * Math.min(1, dt * Number(p.turnSpeed ?? 6))
        },
      }
    }
    case 'buoyancy':
      return {
        onFixedUpdate() {
          const worldPos = obj.getWorldPosition(point)
          const waterLevel = Number(p.waterLevel ?? 0)
          const depth = waterLevel - worldPos.y
          if (depth > 0) {
            const vel = api.physics.getVelocity(api.entity.id) ?? [0, 0, 0]
            const lift = depth * Number(p.strength ?? 18) - vel[1] * Number(p.damping ?? 4)
            api.physics.applyForce(api.entity.id, [0, lift, 0])
          }
        },
      }
    case 'grabbable': {
      let held = false
      const holdKey = '__heldPropId'
      const offInteract = api.events.on('input.Interact', () => {
        if (held) {
          held = false
          if (api.vars[holdKey] === api.entity.id) delete api.vars[holdKey]
          api.physics.setGravityScale(api.entity.id, 1)
          return
        }
        if (api.vars[holdKey]) return
        const hit = api.physics.raycastHit(
          api.camera.position,
          api.camera.forward,
          Number(p.maxReach ?? 3.5),
          api.player.id ? [api.player.id] : [],
        )
        if (hit?.id === api.entity.id) {
          held = true
          api.vars[holdKey] = api.entity.id
          api.physics.setGravityScale(api.entity.id, 0)
        }
      })
      const offThrow = api.events.on('input.Attack', () => {
        if (!held) return
        held = false
        if (api.vars[holdKey] === api.entity.id) delete api.vars[holdKey]
        api.physics.setGravityScale(api.entity.id, 1)
        const fwd = api.camera.forward
        const f = Number(p.throwForce ?? 8)
        api.physics.applyImpulse(api.entity.id, [fwd.x * f, fwd.y * f, fwd.z * f])
      })
      return {
        onFixedUpdate() {
          if (!held) return
          const dist = Number(p.distance ?? 2.2)
          const fwd = api.camera.forward
          const targetX = api.camera.position.x + fwd.x * dist
          const targetY = api.camera.position.y + fwd.y * dist
          const targetZ = api.camera.position.z + fwd.z * dist
          const cur = obj.getWorldPosition(point)
          api.physics.setVelocity(api.entity.id, [
            (targetX - cur.x) * 12,
            (targetY - cur.y) * 12,
            (targetZ - cur.z) * 12,
          ])
        },
        onDestroy() {
          offInteract()
          offThrow()
          if (api.vars[holdKey] === api.entity.id) delete api.vars[holdKey]
        },
      }
    }
    case 'hingeDoor': {
      const closedY = obj.rotation.y
      let opened = false
      let timer = 0
      const toggle = () => {
        opened = !opened
        timer = opened ? Number(p.autoClose ?? 0) : 0
      }
      const offInteract = api.events.on('input.Interact', () => {
        const hit = api.physics.raycastHit(
          api.camera.position,
          api.camera.forward,
          Number(p.maxReach ?? 3),
          api.player.id ? [api.player.id] : [],
        )
        if (hit?.id === api.entity.id) toggle()
      })
      return {
        onPointerClick: toggle,
        onUpdate(dt) {
          if (opened && timer > 0) {
            timer -= dt
            if (timer <= 0) opened = false
          }
          const targetY = closedY + (opened ? (Number(p.openAngle ?? 95) * Math.PI) / 180 : 0)
          obj.rotation.y += (targetY - obj.rotation.y) * Math.min(1, dt * Number(p.speed ?? 4))
        },
        onDestroy: offInteract,
      }
    }
    case 'impulseZone':
      return {
        onTriggerEnter(other) {
          if (!p.continuous) {
            api.physics.applyImpulse(other, [Number(p.x ?? 0), Number(p.y ?? 12), Number(p.z ?? 0)])
          }
        },
        onTriggerStay(other) {
          if (p.continuous) {
            api.physics.applyForce(other, [Number(p.x ?? 0), Number(p.y ?? 12), Number(p.z ?? 0)])
          }
        },
      }
    case 'gravityZone':
      return {
        onTriggerEnter(other) {
          api.physics.setGravityScale(other, Number(p.gravityScale ?? 0.25))
        },
        onTriggerExit(other) {
          api.physics.setGravityScale(other, Number(p.restoreScale ?? 1))
        },
      }
    case 'saveManager': {
      const slot = String(p.slot || 'main')
      const cloudSync = p.cloudSync !== false
      const interval = Math.max(0, Number(p.autoSaveSeconds ?? 60))
      const qsKey = String(p.quickSaveKey || 'F5')
      const qlKey = String(p.quickLoadKey || 'F9')
      let autoTimer = 0
      const offSave = api.events.on(String(p.saveEvent || 'game.save'), () => {
        void api.saveSystem.save(slot, { cloudSync })
      })
      const offLoad = api.events.on(String(p.loadEvent || 'game.load'), () => {
        void api.saveSystem.load(slot, { cloudSync })
      })
      const offExport = api.events.on(String(p.exportEvent || 'game.save.export'), () => {
        api.saveSystem.downloadJSON(slot)
      })
      const onKey = (e: KeyboardEvent) => {
        if (e.code === qsKey || e.key === qsKey) {
          e.preventDefault()
          void api.saveSystem.save(slot, { cloudSync })
        } else if (e.code === qlKey || e.key === qlKey) {
          e.preventDefault()
          void api.saveSystem.load(slot, { cloudSync })
        }
      }
      window.addEventListener('keydown', onKey)
      return {
        onStart() {
          if (p.loadOnStart) void api.saveSystem.load(slot, { cloudSync })
        },
        onUpdate(dt) {
          if (interval > 0) {
            autoTimer += dt
            if (autoTimer >= interval) {
              autoTimer = 0
              void api.saveSystem.save(slot, { cloudSync })
            }
          }
        },
        onDestroy() {
          offSave()
          offLoad()
          offExport()
          window.removeEventListener('keydown', onKey)
        },
      }
    }
    case 'flickerLight':
      return {
        onUpdate(dt) {
          elapsed += dt * Number(p.speed ?? 12)
          const base = Number(p.baseIntensity ?? 2)
          const min = Number(p.minIntensity ?? 0.2)
          const chaos = Math.max(0, Math.min(1, Number(p.chaos ?? 0.6)))
          const wave =
            Math.sin(elapsed) * 0.5 +
            Math.sin(elapsed * 2.7 + 1.3) * 0.3 +
            Math.sin(elapsed * 7.1) * 0.2
          const glitch = Math.sin(elapsed * 13.7) > 1 - chaos * 0.4 ? 0 : 1
          const value = (min + (base - min) * (wave * 0.5 + 0.5)) * (glitch || 0.25)
          api.lights.setIntensity(api.entity.id, value)
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
            if (kind === 'destroy') api.destroy(api.entity.id)
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
    case 'spawn':
      return when(() => {
        const target = p.prefab || p.target
        if (target) api.spawnPrefab(target, obj.getWorldPosition(point).toArray())
      }, 'spawn')
    case 'audioMod': {
      let handle = ''
      let phase = 0
      const startSound = () => {
        if (!p.asset) return
        if (handle) api.audio.stop(handle)
        const baseRate = (Number(p.speed) || 1) * Math.pow(2, (Number(p.semitones) || 0) / 12)
        handle = api.audio.play(p.asset, {
          volume: Number(p.volume ?? 0.9),
          loop: p.loop !== false,
          pitch: baseRate,
        })
        if (handle && Number(p.lowpassHz) > 0 && Number(p.lowpassHz) < 19500) {
          api.audio.setLowpass(handle, Number(p.lowpassHz))
        }
      }
      return {
        onStart() {
          if (p.autoplay !== false) startSound()
          if (p.event) api.events.on(String(p.event), startSound)
        },
        onUpdate(dt: number) {
          if (!handle || !(Number(p.wobbleRate) > 0) || !(Number(p.wobbleSemitones) > 0)) return
          phase += dt * Number(p.wobbleRate) * Math.PI * 2
          const modSt = (Number(p.semitones) || 0) + Math.sin(phase) * Number(p.wobbleSemitones)
          api.audio.setPitch(handle, (Number(p.speed) || 1) * Math.pow(2, modSt / 12))
        },
        onDestroy() {
          if (handle) api.audio.stop(handle)
        },
      }
    }
    case 'dialogueTrigger':
      return {
        onPointerClick() {
          if (p.onClick !== false && p.asset) api.dialogue.start(String(p.asset))
        },
        onTriggerEnter() {
          if (p.onTrigger && p.asset) api.dialogue.start(String(p.asset))
        },
      }
    case 'sequencePlayer':
      return {
        onStart() {
          if (p.autoplay !== false && p.asset) {
            api.sequencer.play(String(p.asset), { loop: Boolean(p.loop), speed: Number(p.speed) || 1 })
          }
          if (p.event && p.asset) {
            api.events.on(String(p.event), () =>
              api.sequencer.play(String(p.asset), { loop: Boolean(p.loop), speed: Number(p.speed) || 1 }),
            )
          }
        },
      }
    default:
      return {}
  }
}

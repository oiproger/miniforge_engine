import type { PluginManifest } from './plugins'

/** 4 Built-in Progressive Example Plugins (Simple -> Intermediate -> Advanced -> Complex) */
export const EXAMPLE_PLUGINS: PluginManifest[] = [
  // 1. SIMPLE: Runtime Debug HUD
  {
    id: 'fps-counter-hud',
    name: '1. FPS & Position HUD (Simple)',
    version: '1.0.0',
    author: 'Miniforge Team',
    description: 'Простой рантайм-плагин: выводит живой счётчик FPS и координаты игрока поверх 3D-сцены через api.ui.mount().',
    category: 'ui',
    enabled: true,
    code: `// Уровень 1 (Простой): живой счётчик FPS и координат игрока
exports.registerRuntime = function (ctx) {
  let frames = 0
  let accum = 0
  let fps = 60
  let el = null

  ctx.onGameStart((api) => {
    el = api.ui.mount(
      'plugin-fps-hud',
      '<div id="mf-fps-box">FPS: 60 · Pos: 0, 0, 0</div>',
      '#mf-fps-box { position:fixed; top:10px; left:10px; padding:6px 10px; border-radius:6px; background:rgba(12,16,22,0.82); color:#7ee787; font:600 12px monospace; border:1px solid rgba(126,231,135,0.35); pointer-events:none; }'
    )
  })

  ctx.onUpdate((dt, api) => {
    frames++
    accum += dt
    if (accum >= 0.35) {
      fps = Math.round(frames / accum)
      frames = 0
      accum = 0
      const p = api.player.position
      const box = el && el.querySelector('#mf-fps-box')
      if (box) {
        box.textContent = 'FPS: ' + fps + ' · Pos: ' + p[0].toFixed(1) + ', ' + p[1].toFixed(1) + ', ' + p[2].toFixed(1)
      }
    }
  })

  ctx.onDestroy((api) => {
    api.ui.unmount('plugin-fps-hud')
  })
}
`,
  },

  // 2. INTERMEDIATE: Editor Plugin (Menu Actions + Scene Spawner)
  {
    id: 'quick-prop-spawner',
    name: '2. Quick Prop Spawner (Editor Plugin)',
    version: '1.0.0',
    author: 'Miniforge Team',
    description: 'Плагин для редактора: добавляет команды быстрого создания уличного фонаря (столб + Spot Light + объёмный луч) и группы ящиков.',
    category: 'editor',
    enabled: true,
    code: `// Уровень 2 (Средний): плагин редактора с действиями в меню Plugins
exports.registerEditor = function (ctx) {
  ctx.registerMenuAction({
    id: 'spawn-street-lamp',
    label: 'Spawn Street Lamp (Pole + Spot + Volumetric)',
    run: () => {
      ctx.patchScene((scene) => {
        const baseId = ctx.uid('lamp')
        scene.entities.push(
          {
            id: baseId,
            name: 'Street Lamp',
            parent: null,
            active: true,
            transform: { position: [0, 2.2, 0], rotation: [0, 0, 0], scale: [0.18, 4.4, 0.18] },
            components: [{ type: 'mesh', shape: 'cylinder', material: 'default-material' }],
            properties: {},
          },
          {
            id: ctx.uid('lamp-light'),
            name: 'Lamp Spot Light',
            parent: baseId,
            active: true,
            transform: { position: [0, 2.1, 0], rotation: [-1.57, 0, 0], scale: [1, 1, 1] },
            components: [
              { type: 'light', kind: 'spot', color: '#ffe3a8', intensity: 3.5, range: 16, angle: 0.75, coneSoftness: 0.35, glow: 0.8 },
              { type: 'volumetric', shape: 'cone', color: '#ffe6b0', intensity: 0.32, softness: 2.2, dustSpeed: 0.25, topRadius: 0.15, bottomRadius: 2.2 },
            ],
            properties: {},
          }
        )
      })
      ctx.notify('Street Lamp spawned on scene!')
    },
  })

  ctx.registerMenuAction({
    id: 'spawn-crate-cluster',
    label: 'Spawn Crates Cluster (3x Physics Boxes)',
    run: () => {
      ctx.patchScene((scene) => {
        [[0, 0.5, 0], [1.1, 0.5, 0.2], [0.55, 1.5, 0.1]].forEach((pos, idx) => {
          scene.entities.push({
            id: ctx.uid('crate'),
            name: 'Physics Crate ' + (idx + 1),
            parent: null,
            active: true,
            transform: { position: pos, rotation: [0, idx * 0.2, 0], scale: [1, 1, 1] },
            components: [
              { type: 'mesh', shape: 'box', material: 'default-material' },
              { type: 'collider', shape: 'box', friction: 0.6, restitution: 0.1 },
              { type: 'body', kind: 'dynamic', mass: 4 },
            ],
            properties: {},
          })
        })
      })
      ctx.notify('Spawned 3 physics crates!')
    },
  })
}
`,
  },

  // 3. ADVANCED: Dynamic Weather & Atmosphere Service + Custom Behavior
  {
    id: 'dynamic-weather-system',
    name: '3. Dynamic Weather System (Service + Behavior)',
    version: '1.0.0',
    author: 'Miniforge Team',
    description: 'Продвинутый плагин: регистрирует сервис api.services.get("weather") с режимами clear/fog/storm, плавной сменой тумана/света и кастомным поведением weatherZone.',
    category: 'graphics',
    enabled: true,
    code: `// Уровень 3 (Продвинутый): сервис погоды + кастомное поведение
exports.registerRuntime = function (ctx) {
  const presets = {
    clear: { fog: 0.008, fogColor: '#a8c2d8', ambient: 0.85, sun: 1.4 },
    fog:   { fog: 0.045, fogColor: '#7d8a96', ambient: 0.55, sun: 0.65 },
    storm: { fog: 0.065, fogColor: '#2c3642', ambient: 0.32, sun: 0.25 },
  }
  let current = 'clear'
  let target = presets.clear
  let curFog = 0.008
  let curAmb = 0.85
  let lightningTimer = 6

  ctx.onGameStart((api) => {
    const service = {
      getState: () => current,
      setWeather(mode) {
        if (!presets[mode]) return false
        current = mode
        target = presets[mode]
        api.events.emit('weather.changed', { mode })
        return true
      },
      cycle() {
        const order = ['clear', 'fog', 'storm']
        const next = order[(order.indexOf(current) + 1) % order.length]
        service.setWeather(next)
        return next
      },
    }
    ctx.registerService('weather', service, api)
    // Горячая клавиша G переключает погоду в рантайме
    api.input.bind('CycleWeather', ['KeyG'])
  })

  let prevKey = false
  ctx.onUpdate((dt, api) => {
    const down = api.input.pressed('CycleWeather')
    if (down && !prevKey) {
      const svc = api.services.get('weather')
      if (svc) svc.cycle()
    }
    prevKey = down

    curFog += (target.fog - curFog) * Math.min(1, dt * 1.5)
    curAmb += (target.ambient - curAmb) * Math.min(1, dt * 1.5)
    api.environment.setFog(curFog, target.fogColor)
    api.environment.setAmbient(curAmb)

    if (current === 'storm') {
      lightningTimer -= dt
      if (lightningTimer <= 0) {
        lightningTimer = 5 + Math.random() * 7
        api.environment.setAmbient(2.4, '#d8ecff')
        api.camera.shake(0.18, 0.25)
      }
    }
  })

  // Регистрируем кастомное поведение для триггер-зон погоды
  ctx.registerBehavior('weatherZone', (api, params) => ({
    onTriggerEnter() {
      const svc = api.services.get('weather')
      if (svc) svc.setWeather(params.weather || 'fog')
    },
  }))
}
`,
  },

  // 4. COMPLEX: Full RPG Inventory & Loot System (WorldState + Interactive HTML UI + Behavior)
  {
    id: 'rpg-inventory-loot',
    name: '4. RPG Inventory & Loot System (Complex)',
    version: '1.0.0',
    author: 'Miniforge Team',
    description: 'Комплексный плагин: персистентный инвентарь в api.worldState (сохраняется через saveSystem), интерактивная HTML-панель (клавиша I), сервис inventory и поведение lootPickup.',
    category: 'gameplay',
    enabled: true,
    code: `// Уровень 4 (Сложный): RPG-инвентарь + HTML-интерфейс + Loot Behavior
exports.registerRuntime = function (ctx) {
  let panelOpen = false
  let rootEl = null

  function getItems(api) {
    const list = api.worldState.get('__plugin_inventory', [])
    return Array.isArray(list) ? list : []
  }

  function renderUI(api) {
    if (!rootEl) return
    const items = getItems(api)
    const box = rootEl.querySelector('#inv-panel')
    if (!box) return
    box.style.display = panelOpen ? 'block' : 'none'
    const grid = rootEl.querySelector('#inv-grid')
    if (!grid) return
    if (!items.length) {
      grid.innerHTML = '<div class="empty">Инвентарь пуст (нажми I для скрытия)</div>'
      return
    }
    grid.innerHTML = items
      .map(
        (it, idx) =>
          '<button class="slot" data-idx="' + idx + '"><b>' + it.name + '</b><span>×' + it.qty + '</span></button>'
      )
      .join('')
    grid.querySelectorAll('.slot').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-idx'))
        const svc = api.services.get('inventory')
        if (svc && items[idx]) svc.useItem(items[idx].id)
      })
    })
  }

  ctx.onGameStart((api) => {
    const svc = {
      list: () => getItems(api),
      addItem(id, name, qty = 1) {
        const items = getItems(api).map((x) => ({ ...x }))
        const found = items.find((x) => x.id === id)
        if (found) found.qty += qty
        else items.push({ id, name: name || id, qty })
        api.worldState.set('__plugin_inventory', items)
        api.events.emit('inventory.changed', { items })
        renderUI(api)
      },
      useItem(id) {
        const items = getItems(api).map((x) => ({ ...x }))
        const idx = items.findIndex((x) => x.id === id)
        if (idx < 0) return false
        items[idx].qty -= 1
        if (items[idx].qty <= 0) items.splice(idx, 1)
        api.worldState.set('__plugin_inventory', items)
        api.events.emit('inventory.used', { id })
        renderUI(api)
        return true
      },
    }
    ctx.registerService('inventory', svc, api)
    api.input.bind('ToggleInventory', ['KeyI'])

    rootEl = api.ui.mount(
      'plugin-rpg-inventory',
      '<div id="inv-panel" style="display:none"><div class="hdr">ИНВЕНТАРЬ [I]</div><div id="inv-grid"></div></div>',
      '#inv-panel{position:fixed;right:18px;top:54px;width:240px;background:rgba(15,20,28,0.92);border:1px solid rgba(243,160,93,0.45);border-radius:10px;padding:10px;color:#edf2f7;font-family:Inter,sans-serif;z-index:9000}#inv-panel .hdr{font-size:11px;font-weight:700;color:#f3a05d;margin-bottom:8px;letter-spacing:0.06em}#inv-grid{display:flex;flex-direction:column;gap:5px}#inv-grid .slot{display:flex;justify-content:space-between;padding:6px 9px;border-radius:6px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#fff;cursor:pointer;font-size:12px}#inv-grid .slot:hover{border-color:#58b8ff}#inv-grid .empty{font-size:11.5px;color:#8b9bb0}'
    )
    renderUI(api)
  })

  let prevInv = false
  ctx.onUpdate((_dt, api) => {
    const down = api.input.pressed('ToggleInventory')
    if (down && !prevInv) {
      panelOpen = !panelOpen
      renderUI(api)
    }
    prevInv = down
  })

  ctx.registerBehavior('lootPickup', (api, params) => ({
    onTriggerEnter() {
      const svc = api.services.get('inventory')
      if (svc) svc.addItem(params.itemId || 'medkit', params.itemName || 'Аптечка', Number(params.qty) || 1)
      api.destroy(api.entity.id)
    },
  }))

  ctx.onDestroy((api) => {
    api.ui.unmount('plugin-rpg-inventory')
  })
}
`,
  },
]

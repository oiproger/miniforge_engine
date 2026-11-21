import {
  getScene,
  makeEntity,
  makeMaterial,
  makePrefab,
  makeProject,
  uid,
} from '../packages/project-schema/src/index.ts'
import type { Component, Entity, Project, Vec3 } from '../packages/project-schema/src/index.ts'

import { createKeyVault } from './key-vault'

export const templates = [
  { id: 'empty', name: 'Blank 3D Project', tag: 'Blank', description: 'Clean 3D scene with floor, lighting, and camera ready to build from scratch.' },
  { id: 'mobile', name: 'Mobile Touch Starter', tag: 'Mobile', description: 'Portrait-ready arena with virtual touch joystick, jump/action buttons, and collectible crystals.' },
  { id: 'coin-rush', name: 'Coin Rush 3D', tag: 'Arcade', description: 'Top-down 3D collectathon with player movement, spinning coins, timer, and HUD score.' },
  { id: 'runner', name: 'Endless Runner 3D', tag: 'Runner', description: '3-lane obstacle track with hazards, barriers, speed flow, and finish collectible.' },
  { id: 'first-person', name: 'FPS Explorer', tag: 'FPS', description: 'First-person controller with architectural landmarks, crates, beacons, and atmospheric lighting.' },
  { id: 'tps', name: 'TPS Adventure', tag: 'TPS', description: 'Third-person adventure courtyard with elevated platforms, stylized foliage, and checkpoints.' },
  { id: 'rpg', name: 'RPG Quest & Loot', tag: 'RPG', description: 'Village square with NPC quest giver, branching dialogue, glowing loot chests, and warm tavern lighting.' },
  { id: 'shooter', name: 'Arena Shooter 3D', tag: 'Shooter', description: 'First-person arena with cover pillars, clickable enemy target drones, ammo/score HUD, and dynamic lighting.' },
  { id: 'key-vault', name: 'Key Vault', tag: 'Puzzle', description: 'Multi-room puzzle adventure with locked seals, collectible keys, lanterns, and UI screens.' },
  { id: 'clicker', name: '3D Clicker', tag: 'Casual', description: 'Interactive 3D treasure clicker with upgrade button, rotating mesh, and score counter.' },
] as const
export type TemplateId = (typeof templates)[number]['id']

const palette = {
  turf: '#93c85c',
  grass: '#74ab51',
  moss: '#c0d76d',
  soil: '#99714e',
  shale: '#716f72',
  granite: '#989a96',
  slate: '#626973',
  limestone: '#c7c5af',
  pine: '#38755a',
  needles: '#53945f',
  tips: '#75ac67',
  bark: '#896544',
  timber: '#bd884e',
  planks: '#d4a360',
  grain: '#a27146',
  straw: '#e5b978',
  gold: '#ffbd39',
  rim: '#ffe779',
  amber: '#e28a23',
  sea: '#4096a2',
  pond: '#66bac1',
  ripple: '#a6e3d5',
  blossom: '#fff1ca',
  petal: '#efb873',
  scarf: '#ef8041',
  leather: '#6a473b',
  skin: '#e6b088',
  hair: '#593d32',
} as const
type Swatch = keyof typeof palette
type MeshOptions = { segments?: number; radiusTop?: number; radiusBottom?: number }
const titles: Partial<Record<Swatch, string>> = {
  turf: 'Meadow',
  shale: 'Cliff stone',
  timber: 'Pine wood',
  gold: 'Coin gold',
  sea: 'Tunic',
}
const behavior = (kind: string, params: Record<string, unknown> = {}): Component => ({
  type: 'behavior',
  kind,
  params,
})
const boxCollider = (size: Vec3): Component => ({ type: 'collider', shape: 'box', size, trigger: false })
const names = {
  player: 'Player',
  coin: 'Gold Coin',
  pine: 'Pine Tree',
  rock: 'Boulder',
  crate: 'Wooden Crate',
  tile: 'Grass Tile',
}

function world(project: Project) {
  const scene = getScene(project)
  const mat = (color: Swatch) => 'mat-' + color
  project.assets.push(
    ...Object.entries(palette).map(([key, color]) => {
      const tile = makeMaterial(
        titles[key as Swatch] ?? key[0].toUpperCase() + key.slice(1),
        color,
        mat(key as Swatch),
      )
      if (['gold', 'rim', 'amber'].includes(key))
        Object.assign(tile.properties, { metalness: 0.12, roughness: 0.42, emissive: '#402300' })
      return tile
    }),
  )
  function node(id: string, name: string, parent: string | null, position: Vec3): Entity {
    const e = makeEntity(name)
    Object.assign(e, { id, parent })
    e.transform.position = position
    scene.entities.push(e)
    return e
  }
  function mesh(
    id: string,
    name: string,
    shape: string,
    color: Swatch,
    parent: string | null,
    p: Vec3,
    s: Vec3,
    opt: MeshOptions = {},
  ): Entity {
    const e = node(id, name, parent, p)
    e.transform.scale = s
    e.components.push({ type: 'mesh', shape, material: mat(color), ...opt })
    return e
  }
  function part(
    parent: string,
    key: string,
    shape: string,
    color: Swatch,
    p: Vec3,
    s: Vec3,
    opt: MeshOptions = {},
  ) {
    return mesh(parent + '-' + key, key.replaceAll('-', ' '), shape, color, parent, p, s, opt)
  }
  function pine(id: string, parent: string, p: Vec3, h: number, rotation: number) {
    const e = node(id, names.pine, parent, p)
    e.transform.rotation[1] = rotation
    e.transform.scale = [h, h, h]
    e.components.push(boxCollider([0.48 * h, 1.5 * h, 0.48 * h]))
    part(id, 'Trunk', 'cylinder', 'bark', [0, 0.4, 0], [0.42, 0.8, 0.42], { segments: 7 })
    part(id, 'Lower-boughs', 'cone', 'pine', [0, 1.02, 0], [1.58, 1.42, 1.58], { segments: 7 })
    part(id, 'Middle-boughs', 'cone', 'needles', [0, 1.55, 0], [1.26, 1.28, 1.26], {
      segments: 7,
    }).transform.rotation[1] = 0.54
    part(id, 'Crown', 'cone', 'tips', [0, 2.06, 0], [0.89, 1.16, 0.89], {
      segments: 7,
    }).transform.rotation[1] = 0.25
    return e
  }
  function crate(id: string, p: Vec3, angle: number) {
    const e = node(id, names.crate, 'crate-group', p)
    e.transform.rotation[1] = angle
    e.components.push(boxCollider([0.91, 1, 0.91]))
    part(id, 'Box', 'box', 'grain', [0, 0.45, 0], [0.91, 0.9, 0.91])
    for (const z of [-0.461, 0.461]) {
      const face = z > 0 ? 'Front' : 'Back'
      part(id, face + '-slats', 'box', 'timber', [0, 0.46, z], [0.74, 0.73, 0.03])
      part(
        id,
        face + '-brace',
        'box',
        'straw',
        [0, 0.46, z * 1.045],
        [0.12, 0.94, 0.052],
      ).transform.rotation[2] = -0.75
    }
    for (const y of [0.08, 0.81])
      part(id, 'Band-' + (y < 0.1 ? 'lower' : 'upper'), 'box', 'planks', [0, y, 0], [0.98, 0.12, 0.98])
    return e
  }
  function hero(p: Vec3, controller = 'player') {
    const e = node('player', names.player, null, p)
    e.components.push(behavior(controller, { speed: 3.4 }), {
      type: 'collider',
      shape: 'capsule',
      size: [0.46, 0.96, 0.46],
      trigger: false,
    })
    // The origin is at the feet so replacing the avatar preserves controller grounding.
    for (const x of [-0.13, 0.13])
      part(
        'player',
        x < 0 ? 'Left-boot' : 'Right-boot',
        'box',
        'leather',
        [x, 0.1, 0.055],
        [0.17, 0.21, 0.25],
      )
    part('player', 'Tunic', 'box', 'sea', [0, 0.39, 0], [0.45, 0.43, 0.3])
    part('player', 'Satchel', 'box', 'timber', [0, 0.45, -0.2], [0.29, 0.31, 0.14])
    part('player', 'Scarf', 'box', 'scarf', [0, 0.63, 0], [0.43, 0.13, 0.33])
    part('player', 'Face', 'box', 'skin', [0, 0.84, 0.035], [0.38, 0.36, 0.34])
    for (const x of [-0.088, 0.088])
      part(
        'player',
        x < 0 ? 'Left-eye' : 'Right-eye',
        'box',
        'hair',
        [x, 0.864, 0.208],
        [0.043, 0.055, 0.022],
      )
    part(
      'player',
      'Scarf-end',
      'box',
      'scarf',
      [0.137, 0.53, 0.17],
      [0.11, 0.21, 0.045],
    ).transform.rotation[2] = -0.23
    part('player', 'Hair', 'box', 'hair', [0, 1.01, 0], [0.41, 0.12, 0.38])
    part('player', 'Cap', 'box', 'sea', [-0.025, 1.1, -0.025], [0.49, 0.15, 0.44])
    part('player', 'Brim', 'box', 'sea', [0, 1.045, 0.15], [0.49, 0.055, 0.24])
    for (const x of [-0.275, 0.275])
      part('player', x < 0 ? 'Left-hand' : 'Right-hand', 'box', 'skin', [x, 0.4, 0.02], [0.12, 0.3, 0.15])
    return e
  }
  function coin(id: string, p: Vec3, index: number) {
    const e = node(id, names.coin, 'coins', p)
    e.transform.rotation[1] = 0.4 + index * 0.12
    e.components.push(
      behavior('collectible', { value: 1, radius: 0.6 }),
      behavior('rotate', { speed: 1.2, axis: 'y' }),
    )
    const disc = part(id, 'Rim', 'cylinder', 'rim', [0, 0, 0], [0.66, 0.13, 0.66], { segments: 12 })
    disc.transform.rotation[0] = Math.PI / 2
    const center = part(id, 'Minted-face', 'cylinder', 'gold', [0, 0, 0], [0.54, 0.147, 0.54], {
      segments: 12,
    })
    center.transform.rotation[0] = Math.PI / 2
    part(id, 'Stamp', 'box', 'rim', [0, 0, 0], [0.095, 0.27, 0.18])
    return e
  }
  function stone(id: string, parent: string, p: Vec3, s: Vec3, angle: number, color: Swatch = 'granite') {
    const e = mesh(id, names.rock, 'icosahedron', color, parent, p, s)
    e.transform.rotation = [0.2, angle, 0.08]
    return e
  }
  function lighting() {
    const c = node('camera', 'Scene Camera', null, [10, 10, 13])
    c.components.push({
      type: 'camera',
      projection: 'orthographic',
      target: [0, 0.35, 0],
      size: 13,
      zoom: 1,
      fov: 45,
    })
    node('lights', 'Lighting', null, [0, 0, 0])
    node('sun', 'Sun', 'lights', [-4, 10, 5]).components.push({
      type: 'light',
      kind: 'directional',
      color: '#fff2ce',
      intensity: 2.35,
    })
    node('ambient', 'Sky Light', 'lights', [0, 4, 0]).components.push({
      type: 'light',
      kind: 'ambient',
      color: '#f1f8ff',
      intensity: 1.55,
    })
  }
  return { node, mesh, part, pine, crate, hero, coin, stone, lighting }
}

function addGameText(project: Project) {
  project.locales = {
    en: {
      'menu.play': 'Play',
      'menu.resume': 'Resume',
      'menu.retry': 'Try again',
      'menu.pause': 'Pause',
      'menu.results': 'Results',
      'hud.score': 'Coins',
      'hud.time': 'Time',
      'hud.best': 'Personal best',
      'menu.reward': 'Watch ad · +15 seconds',
      'menu.controls': 'Move with WASD, arrow keys or the touch stick.',
    },
    ru: {
      'menu.play': 'Играть',
      'menu.resume': 'Продолжить',
      'menu.retry': 'Ещё раз',
      'menu.pause': 'Пауза',
      'menu.results': 'Результаты',
      'hud.score': 'Монеты',
      'hud.time': 'Время',
      'hud.best': 'Рекорд',
      'menu.reward': 'Реклама · +15 секунд',
      'menu.controls': 'Управление — WASD, стрелки или экранный джойстик.',
    },
  }
}

function collectathon(): Project {
  const p = makeProject('Coin Rush 3D')
  p.id = 'coin-rush-3d'
  const scene = getScene(p)
  scene.id = p.activeScene = 'meadow'
  scene.name = 'Meadow Island'
  Object.assign(p.settings, {
    mode: 'collectathon',
    duration: 60,
    bounds: [-3.8, 3.8, -2.55, 2.86],
    sound: true,
  })
  Object.assign(scene.environment, { background: '#202731', ambient: 1.5, exposure: 1, shadows: true })
  addGameText(p)
  const { node, mesh, part, pine, crate, hero, coin, stone, lighting } = world(p)
  node('island', 'Floating Island', null, [0, 0, 0])
  const terraces = [
    ['Undercroft', 'shale', -1.28, 0.95, 11.5, 8.5, 0.43, 0.5],
    ['Rock-ledge', 'granite', -0.77, 0.54, 12, 9, 0.47, 0.5],
    ['Earth', 'soil', -0.38, 0.35, 12.15, 9.15, 0.48, 0.5],
    ['Turf', 'grass', -0.17, 0.28, 12.23, 9.23, 0.494, 0.5],
    ['Meadow', 'turf', -0.055, 0.11, 12.28, 9.28, 0.5, 0.5],
  ] as const
  // A broad central terrace has chamfered corners, with separate facets exposed below it.
  for (const [key, swatch, y, h, w, d, rBottom, rTop] of terraces) {
    const base = part('island', key, 'cylinder', swatch, [0, y, 0], [w, h, d], {
      segments: 8,
      radiusTop: rTop,
      radiusBottom: rBottom,
    })
    // Three rotates scaled cylinders in world space. Keep the oval aligned with the world axes.
    base.properties.floor = true
  }
  // Flanking ledges produce a rugged broken silhouette and a navigable, asymmetric clearing.
  for (const [i, x, z, s] of [
    [0, -4.45, 1.4, 1.3],
    [1, 4.4, -1.35, 1.48],
    [2, -2.9, -3.08, 1.32],
    [3, 2.1, 3.38, 1.14],
  ]) {
    const shelf = part(
      'island',
      'Shelf-' + i,
      'cylinder',
      'granite',
      [x, -0.7, z],
      [s * 2.2, 1.04, s * 1.75],
      { segments: 7, radiusTop: 0.5, radiusBottom: 0.34 },
    )
    shelf.transform.rotation[1] = i * 0.32
    part('island', 'Shelf-grass-' + i, 'cylinder', 'grass', [x, -0.18, z], [s * 2.25, 0.19, s * 1.8], {
      segments: 7,
    }).transform.rotation[1] = i * 0.32
  }
  const cliff: [number, number, number, number, number, number][] = [
    [-4.8, -0.85, 1.65, 1.65, 1.0, 1.25],
    [-3.25, -1.03, 3.05, 2.05, 1.27, 0.94],
    [-1.6, -0.89, 3.82, 1.7, 1.06, 0.9],
    [0.35, -1.03, 4.08, 1.3, 1.25, 0.75],
    [2.0, -0.95, 3.53, 1.85, 1.1, 1.05],
    [3.5, -0.9, 2.75, 1.75, 1.26, 0.95],
    [4.75, -0.82, 1.77, 1.5, 1.16, 1.2],
    [5.5, -0.8, 0.32, 1.1, 1.32, 1.5],
    [5.06, -0.81, -1.57, 1.32, 0.95, 1.2],
  ]
  cliff.forEach(([x, y, z, w, h, d], i) =>
    stone('cliff-' + i, 'island', [x, y, z], [w, h, d], i * 0.73, i % 3 === 0 ? 'shale' : 'granite'),
  )
  node('grove', 'Pine Grove', null, [0, 0, 0])
  const trees: [number, number, number][] = [
    [-3.62, -2.0, 1.33],
    [-4.38, -0.83, 1.02],
    [-2.37, -3.01, 1.15],
    [-0.7, -3.43, 0.88],
    [2.0, -2.76, 1.14],
    [3.95, -1.9, 0.97],
    [4.83, -0.85, 0.77],
    [-3.47, 2.2, 0.78],
  ]
  trees.forEach(([x, z, h], i) => pine('pine-' + i, 'grove', [x, 0, z], h, i * 0.8))
  node('ruins', 'Stone Ruins', null, [0, 0, 0])
  const rocks: [number, number, number][] = [
    [-3.78, 0.6, 0.82],
    [-4.47, 0.76, 0.47],
    [3.85, 0.42, 0.78],
    [4.32, 0.84, 0.46],
    [1.72, -2.0, 0.41],
    [-2.47, -1.73, 0.36],
  ]
  rocks.forEach(([x, z, h], i) => {
    const e = stone(
      'rock-' + i,
      'ruins',
      [x, 0.15 * h, z],
      [1.45 * h, h, 1.28 * h],
      i * 1.28,
      i % 3 === 0 ? 'limestone' : 'granite',
    )
    if (h > 0.6) e.components.push(boxCollider([h * 0.95, h, h * 0.96]))
  })
  // Weathered stone pavers describe a curved path across the clearing.
  const path: [number, number][] = [
    [-1.28, 3.43],
    [-1.05, 2.85],
    [-0.77, 2.23],
    [-0.48, 1.53],
    [-0.48, 0.83],
    [-0.11, 0.2],
    [0.42, -0.34],
    [0.87, -0.87],
    [1.2, -1.44],
    [1.48, -1.93],
  ]
  path.forEach(([x, z], i) => {
    const stone = mesh(
      'paver-' + i,
      'Path stone',
      'cylinder',
      i % 3 === 1 ? 'granite' : 'limestone',
      'island',
      [x, 0.024, z],
      [0.72 + (i % 2) * 0.1, 0.057, 0.39],
      { segments: 6 },
    )
    stone.transform.rotation[1] = 0.19 + i * 0.48
  })
  // Clumps are distributed deterministically so a new project always opens on the same landscape.
  const clumps: [number, number][] = [
    [-4.12, 1.65],
    [-2.45, 2.9],
    [-2.07, 0.43],
    [-3.13, -0.7],
    [-1.52, -2.59],
    [0.63, -2.96],
    [2.97, -1.63],
    [4.72, 0.19],
    [3.19, 1.85],
    [1.44, 3.18],
    [-0.43, 3.71],
  ]
  clumps.forEach(([x, z], i) => {
    for (let j = 0; j < 3; j++) {
      const blade = mesh(
        'grass-' + i + '-' + j,
        'Wild grass',
        'cone',
        j === 1 ? 'moss' : 'grass',
        'island',
        [x + j * 0.072, 0.13, z + (j % 2) * 0.06],
        [0.11, 0.28 + j * 0.046, 0.085],
        { segments: 3 },
      )
      blade.transform.rotation[2] = (j - 1) * 0.28
    }
  })
  // A shallow spring and a trail marker make the clearing legible from the game camera.
  const pond = node('pond', 'Meadow Spring', 'island', [1.7, 0, 2.86])
  pond.transform.rotation[1] = -0.25
  part('pond', 'Shore', 'cylinder', 'moss', [0, 0.022, 0], [2.06, 0.058, 1.09], { segments: 8 })
  part('pond', 'Spring', 'cylinder', 'pond', [0, 0.053, 0], [1.85, 0.028, 0.93], { segments: 8 })
  part('pond', 'Reflection', 'box', 'ripple', [-0.2, 0.075, 0.09], [0.48, 0.014, 0.038])
  part('pond', 'Ripple', 'box', 'ripple', [0.3, 0.075, -0.1], [0.27, 0.014, 0.032])
  stone('spring-pebble', 'pond', [-0.73, 0.09, -0.27], [0.35, 0.24, 0.28], 0.6, 'limestone')
  stone('spring-stone', 'pond', [0.72, 0.1, -0.16], [0.45, 0.28, 0.32], 0.28)
  const sign = node('trail-marker', 'Trail Marker', 'island', [-1.94, 0, 2.43])
  sign.transform.rotation[1] = 0.3
  part(sign.id, 'Pole', 'box', 'bark', [0, 0.31, 0], [0.085, 0.62, 0.085])
  part(sign.id, 'Board', 'box', 'planks', [0.03, 0.61, 0], [0.6, 0.23, 0.072])
  part(sign.id, 'Arrow', 'box', 'blossom', [0.055, 0.62, 0.04], [0.26, 0.028, 0.016])
  for (const [x, z] of [
    [-2.82, 0.93],
    [-2.6, 1.05],
    [2.79, 2.07],
    [2.98, 1.99],
    [-0.38, -2.8],
  ]) {
    const id = 'flower-' + x
    mesh(id, 'Wildflower', 'cylinder', 'needles', 'island', [x, 0.105, z], [0.035, 0.21, 0.035], {
      segments: 4,
    })
    mesh(
      id + '-bud',
      'Bloom',
      'icosahedron',
      x < 0 ? 'blossom' : 'petal',
      'island',
      [x, 0.225, z],
      [0.14, 0.11, 0.13],
    )
  }
  node('crate-group', 'Supply Crates', null, [0, 0, 0])
  crate('crate-0', [2.93, 0, -0.83], 0.14)
  crate('crate-1', [3.89, 0, -0.99], -0.07)
  crate('crate-2', [3.41, 0.89, -0.9], 0.07)
  node('coins', 'Gold Coins', null, [0, 0, 0])
  const coinPositions: [number, number][] = [
    [0, 1.1],
    [1.0, 1.5],
    [2.06, 1.55],
    [2.7, 0.74],
    [1.79, -0.26],
    [0.52, -1.16],
    [-0.9, -1.56],
    [-1.98, -0.69],
    [-2.31, 0.59],
    [-1.58, 1.56],
  ]
  coinPositions.forEach(([x, z], i) => coin('coin-' + i, [x, 0.52, z], i))
  hero([0, 0, 2.2])
  lighting()
  const draft = mesh('grass-tile', 'Grass Tile', 'box', 'turf', 'island', [0, -0.6, 0], [1, 0.2, 1])
  const prefabRoots = [
    ['coin-0', 'coin', 'gold'],
    ['pine-0', 'pine', 'needles'],
    ['crate-0', 'crate', 'timber'],
    ['rock-0', 'rock', 'granite'],
    ['player', 'player', 'sea'],
    [draft.id, 'tile', 'turf'],
  ] as const
  const prefabs = prefabRoots.map(([id, key, color]) => {
    const a = makePrefab(scene, id, names[key])
    a.id = 'prefab-' + key
    const contents = JSON.parse(a.data) as Entity[]
    contents[0].transform.position = [0, key === 'coin' ? 0.52 : 0, 0]
    a.data = JSON.stringify(contents)
    a.properties = { color: palette[color], icon: key, folder: 'Prefabs' }
    return a
  })
  p.assets.unshift(...prefabs)
  scene.entities = scene.entities.filter((e) => e.id !== draft.id)
  return p
}

export function createTemplate(key: string = 'coin-rush'): Project {
  if (key === 'coin-rush' || key === 'collectathon' || key === 'top-down') return collectathon()
  if (key === 'key-vault') return createKeyVault()
  const name = templates.find((t) => t.id === key)?.name
  if (!name) throw new Error('Unknown template: ' + key)
  const p = makeProject(name)
  const { node, mesh, hero, lighting } = world(p)
  const scene = getScene(p)
  scene.name = 'Level 01'
  const floor = mesh('floor', 'Ground', 'box', 'grass', null, [0, -0.2, 0], [12, 0.4, 10])
  floor.properties.floor = true
  floor.components.push(boxCollider([12, 0.4, 10]))
  p.settings.bounds = [-5.65, 5.65, -4.65, 4.65]
  addGameText(p)
  lighting()
  if (key === 'clicker') {
    p.settings.mode = 'clicker'
    p.locales.en['clicker.upgrade'] = 'Upgrade'
    p.locales.ru['clicker.upgrade'] = 'Улучшить'
    p.ui.push(
      { id: 'score', type: 'counter', text: 'hud.score', variable: 'score', x: 5, y: 10 },
      { id: 'upgrade', type: 'button', text: 'clicker.upgrade', event: 'clicker.upgrade', x: 5, y: 20 },
    )
    const target = mesh('target', 'Treasure', 'icosahedron', 'gold', null, [0, 1, 0], [2, 2, 2])
    target.components.push(behavior('clickable', { value: 1 }), behavior('rotate', { speed: 0.45 }))
  } else {
    hero([0, 0, 2], key === 'first-person' ? 'first-person' : 'player')
    if (key === 'empty') { p.name = 'Blank 3D Project'; p.description = 'Clean 3D starter scene with floor, lighting, and camera.'; }
    if (key === 'first-person') {
      p.settings.mode = 'first-person'
      mesh('pillar', 'Landmark', 'cylinder', 'granite', null, [0, 0.75, -2], [1, 1.5, 1], {
        segments: 7,
      }).components.push(boxCollider([1, 1.5, 1]))
      const token = mesh('beacon', 'Beacon', 'sphere', 'amber', null, [2, 0.6, -2], [0.7, 0.7, 0.7])
      token.components.push(behavior('collectible', { value: 1, radius: 0.65 }))
    }
    if (key === 'runner') {
      p.settings.mode = 'runner'
      const track = scene.entities.find((e) => e.id === 'floor')!
      track.transform.scale = [6, 0.4, 30]
      p.settings.bounds = [-2.7, 2.7, -14.5, 14.5]
      const player = scene.entities.find((e) => e.id === 'player')!
      player.transform.position = [0, 0, 12]
      for (let i = 0; i < 6; i++) {
        const obstacle = mesh(
          'obstacle-' + i,
          'Barrier',
          'box',
          'timber',
          null,
          [((i % 3) - 1) * 1.45, 0.4, 8 - i * 3.7],
          [1.0, 0.8, 0.6],
        )
        obstacle.components.push(behavior('damage', { amount: 1 }), boxCollider([1, 0.8, 0.6]))
      }
      node('finish', 'Finish', null, [0, 0.45, -12]).components.push(
        behavior('collectible', { value: 1, radius: 1 }),
      )
    }
    if (key === 'mobile') {
      p.name = 'Mobile Touch Starter'
      p.description = 'Portrait-ready mobile 3D arena with virtual joystick, action button, and glowing crystals.'
      p.settings.mode = 'mobile'
      p.settings.touch = {
        enabled: true,
        emulateTouchFromMouse: true,
        joystick: { enabled: true, side: 'left', radius: 56 },
        buttons: [{ id: 'jump', label: 'JUMP', action: 'Jump', side: 'right' }],
      }
      p.ui.push({ id: 'score', type: 'counter', text: 'hud.score', variable: 'score', x: 5, y: 8 })
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2
        const c = mesh('crystal-' + i, 'Crystal ' + (i + 1), 'octahedron', 'pond', null, [Math.cos(ang) * 3.1, 0.7, Math.sin(ang) * 3.1], [0.6, 0.9, 0.6])
        c.properties.tags = ['collectible', 'crystal']
        c.components.push(behavior('collectible', { value: 10, radius: 0.8 }), behavior('rotate', { speed: 1.4 }))
      }
    }
    if (key === 'tps') {
      p.name = 'TPS Adventure'
      p.description = 'Third-person 3D courtyard with elevated platforms, stylized props, and adventure checkpoints.'
      p.settings.mode = 'tps'
      p.ui.push({ id: 'score', type: 'counter', text: 'hud.score', variable: 'score', x: 5, y: 8 })
      const plat1 = mesh('plat-1', 'Stone Platform 1', 'box', 'granite', null, [-2.6, 0.55, -1.8], [2.4, 0.4, 2.4])
      plat1.components.push(boxCollider([2.4, 0.4, 2.4]))
      const plat2 = mesh('plat-2', 'Stone Platform 2', 'box', 'limestone', null, [2.4, 1.05, -2.6], [2.6, 0.4, 2.6])
      plat2.components.push(boxCollider([2.6, 0.4, 2.6]))
      const relic = mesh('relic', 'Ancient Relic', 'icosahedron', 'gold', null, [2.4, 1.8, -2.6], [0.65, 0.65, 0.65])
      relic.properties.tags = ['checkpoint', 'loot']
      relic.components.push(behavior('collectible', { value: 25, radius: 0.9 }), behavior('rotate', { speed: 1.1 }))
    }
    if (key === 'rpg') {
      p.name = 'RPG Quest & Loot'
      p.description = 'Village square with NPC quest giver, branching dialogue, glowing loot chests, and warm lighting.'
      p.settings.mode = 'rpg'
      p.settings.variables = { hp: 100, gold: 0, quest: 'Talk to Elder' }
      p.ui.push(
        { id: 'hp', type: 'counter', text: 'HP', variable: 'hp', x: 4, y: 6 },
        { id: 'gold', type: 'counter', text: 'Gold', variable: 'gold', x: 4, y: 14 },
      )
      const house = mesh('tavern', 'Village Tavern', 'box', 'timber', null, [-3.2, 1.2, -2.8], [3.2, 2.4, 2.8])
      house.components.push(boxCollider([3.2, 2.4, 2.8]))
      mesh('tavern-roof', 'Tavern Roof', 'cone', 'scarf', null, [-3.2, 3.0, -2.8], [3.8, 1.5, 3.4], { segments: 4 })
      const npc = mesh('npc-elder', 'Village Elder', 'capsule', 'sea', null, [-0.5, 0.9, -2.1], [0.65, 1.4, 0.65])
      npc.properties.tags = ['npc', 'interactable']
      npc.components.push(boxCollider([0.8, 1.6, 0.8]))
      for (let i = 0; i < 3; i++) {
        const chest = mesh('chest-' + i, 'Loot Chest ' + (i + 1), 'box', 'gold', null, [2.5 + i * 0.9, 0.4, -1.5 + i * 1.4], [0.7, 0.55, 0.55])
        chest.properties.tags = ['loot', 'interactable']
        chest.components.push(behavior('collectible', { value: 15, radius: 0.85 }))
      }
    }
    if (key === 'shooter') {
      p.name = 'Arena Shooter 3D'
      p.description = 'First-person 3D target arena with cover pillars, clickable enemy drones, and score HUD.'
      p.settings.mode = 'shooter'
      const pl = scene.entities.find((e) => e.id === 'player')
      if (pl) {
        const b = pl.components.find((c) => c.type === 'behavior')
        if (b) b.kind = 'first-person'
      }
      p.ui.push({ id: 'score', type: 'counter', text: 'Score', variable: 'score', x: 5, y: 8 })
      for (const [cx, cz, idx] of [[-2.8, -0.5, 1], [2.8, -0.5, 2], [0, -2.2, 3]] as const) {
        const cov = mesh('cover-' + idx, 'Cover Pillar ' + idx, 'box', 'slate', null, [cx, 0.75, cz], [1.2, 1.5, 0.7])
        cov.properties.tags = ['cover']
        cov.components.push(boxCollider([1.2, 1.5, 0.7]))
      }
      for (let i = 0; i < 4; i++) {
        const drone = mesh('drone-' + i, 'Target Drone ' + (i + 1), 'icosahedron', 'scarf', null, [-3 + i * 2, 1.45 + (i % 2) * 0.5, -3.6], [0.7, 0.7, 0.7])
        drone.properties.tags = ['enemy', 'target']
        drone.components.push(behavior('clickable', { value: 100 }), behavior('rotate', { speed: 1.8 }))
      }
    }
  }
  return p
}
export const freshTemplate = (key: string): Project => {
  const project = createTemplate(key)
  project.id = uid('project')
  return project
}

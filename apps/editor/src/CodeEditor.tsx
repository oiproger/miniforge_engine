import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js'
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js'
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js'
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution.js'
import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching.js'
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker'

Object.assign(self, { MonacoEnvironment: { getWorker: () => new EditorWorker() } })

export type CodeLanguage = 'glsl' | 'typescript' | 'json' | 'markdown' | 'ini' | 'plaintext'

monaco.languages.register({ id: 'glsl' })
monaco.languages.setMonarchTokensProvider('glsl', {
  keywords: [
    'uniform', 'varying', 'attribute', 'in', 'out', 'inout', 'const', 'void', 'bool', 'int', 'uint',
    'float', 'vec2', 'vec3', 'vec4', 'mat2', 'mat3', 'mat4', 'sampler2D', 'if', 'else', 'for', 'while',
    'return', 'discard', 'struct', 'precision', 'highp', 'mediump', 'lowp',
  ],
  builtins: [
    'iTime', 'iChannel0', 'worldPos', 'worldNormal', 'cameraPos', 'sunDirection', 'localUV', 'texture',
    'sin', 'cos', 'tan', 'pow', 'exp', 'abs', 'floor', 'ceil', 'fract', 'mod', 'min', 'max', 'clamp',
    'mix', 'step', 'smoothstep', 'length', 'distance', 'dot', 'cross', 'normalize', 'reflect', 'refract', 'fwidth',
  ],
  tokenizer: {
    root: [
      [/\/\/.*$/, 'comment'],
      [/\/\*[\s\S]*?\*\//, 'comment'],
      [/#\s*\w+/, 'keyword.directive'],
      [/[a-zA-Z_]\w*/, { cases: { '@keywords': 'keyword', '@builtins': 'type.identifier', '@default': 'identifier' } }],
      [/\b\d+(\.\d+)?([eE][+-]?\d+)?\b/, 'number'],
    ],
  },
})

monaco.languages.register({ id: 'json' })
monaco.languages.setMonarchTokensProvider('json', {
  tokenizer: {
    root: [
      [/"([^"\\]|\\.)*"(?=\s*:)/, 'type.identifier'],
      [/"([^"\\]|\\.)*"/, 'string'],
      [/\b(?:true|false|null)\b/, 'keyword'],
      [/-?\d+(\.\d+)?([eE][+-]?\d+)?/, 'number'],
    ],
  },
})

monaco.languages.register({ id: 'ini' })
monaco.languages.setMonarchTokensProvider('ini', {
  tokenizer: {
    root: [
      [/[;#].*$/, 'comment'],
      [/\[[^\]]+\]/, 'keyword'],
      [/^[^=\s]+(?=\s*=)/, 'type.identifier'],
      [/"[^"]*"/, 'string'],
      [/\b\d+(\.\d+)?\b/, 'number'],
    ],
  },
})

monaco.languages.register({ id: 'markdown' })
monaco.languages.setMonarchTokensProvider('markdown', {
  tokenizer: {
    root: [
      [/^#{1,6}\s.*$/, 'keyword'],
      [/```.*$/, 'string'],
      [/`[^`]+`/, 'type.identifier'],
      [/\*\*[^*]+\*\*/, 'strong'],
      [/^\s*[-*]\s/, 'keyword'],
    ],
  },
})

interface APIMember {
  name: string
  signature: string
  method: boolean
  description: string
  snippet?: string
}

const builtinAPI: Record<string, APIMember[]> = {
  api: [
    { name: 'entity', signature: 'Entity', method: false, description: 'Current entity metadata' },
    { name: 'object', signature: 'SceneNode', method: false, description: 'Entity transform (position, rotation, scale)' },
    { name: 'camera', signature: 'CameraAPI', method: false, description: 'Camera position, forward, yaw/pitch, fov, shake' },
    { name: 'player', signature: 'PlayerAPI', method: false, description: 'Player teleport, speed, crouch, grounded state' },
    { name: 'environment', signature: 'EnvironmentAPI', method: false, description: 'Dynamic fog, sky dome/procedural/cubemap, sun, ambient, exposure' },
    { name: 'graphics', signature: 'GraphicsAPI', method: false, description: 'Post-processing (AO, DoF, Bloom, ACES, Vignette, Chromatic, Grain) & shadows' },
    { name: 'materials', signature: 'MaterialsAPI', method: false, description: 'Runtime material swap, color/emissive tint, shader switch, create()' },
    { name: 'lights', signature: 'LightsAPI', method: false, description: 'Entity Light3D control, gel, shadowLight & flashlight' },
    { name: 'debug', signature: 'DebugAPI', method: false, description: '3D debug line and box drawing' },
    { name: 'audio', signature: 'AudioAPI', method: false, description: '3D Web Audio mixer (loop, volume, pitch, position, buses)' },
    { name: 'physics', signature: 'PhysicsAPI', method: false, description: 'Raycast, raycastHit, impulses, forces, gravity scale' },
    { name: 'ui', signature: 'UIAPI', method: false, description: 'HUD screens, navigation stack, setBlur, and custom DOM mount()' },
    { name: 'services', signature: 'ServicesAPI', method: false, description: 'Cross-script service registry (DayCycle, JobManager, etc.)' },
    { name: 'worldState', signature: 'WorldStateAPI', method: false, description: 'Persistent state across scenes with save/load slots' },
    { name: 'saveSystem', signature: 'SaveSystemAPI', method: false, description: 'Full game Save/Load with JSON export/import & Yandex/Poki cloud sync' },
    { name: 'createTween', signature: '() => Tween', method: true, description: 'Create Godot 4-style chainable/parallel Tween', snippet: "createTween()\n  .setTrans('sine')\n  .setEase('inOut')\n  .tweenProperty(api.object, 'position.y', $1, $2)" },
    { name: 'input', signature: 'Input', method: false, description: 'Keyboard, virtual buttons, and move vector' },
    { name: 'events', signature: 'Events', method: false, description: 'Subscribe (on) and publish (emit) game events' },
    { name: 'vars', signature: 'Record<string, any>', method: false, description: 'Shared round variables synced to HUD' },
    { name: 'params', signature: 'Record<string, any>', method: false, description: 'Per-instance Inspector parameters' },
    { name: 'time', signature: 'number', method: false, description: 'Elapsed simulation seconds' },
    { name: 'find', signature: '(id: string) => SceneNode | undefined', method: true, description: 'Find a SceneNode by entity ID' },
    { name: 'findByTag', signature: '(tag: string) => string[]', method: true, description: 'Find entity IDs by tag' },
    { name: 'hasTag', signature: '(id: string | undefined, tag: string) => boolean', method: true, description: 'Check if entity has a tag' },
    { name: 'addTag', signature: '(id: string | undefined, tag: string) => void', method: true, description: 'Add a tag to an entity' },
    { name: 'removeTag', signature: '(id: string | undefined, tag: string) => void', method: true, description: 'Remove a tag from an entity' },
    { name: 'getTags', signature: '(id?: string) => string[]', method: true, description: 'Get all tags of an entity' },
    { name: 'findByName', signature: '(name: string) => string | undefined', method: true, description: 'Find first entity ID by exact name' },
    { name: 'findByComponent', signature: '(type: string) => string[]', method: true, description: 'Find all entity IDs with component type' },
    { name: 'getParent', signature: '(id?: string) => string | null', method: true, description: 'Get parent entity ID' },
    { name: 'getChildren', signature: '(id?: string) => string[]', method: true, description: 'Get direct child entity IDs' },
    { name: 'getChildByName', signature: '(id: string, name: string) => string | undefined', method: true, description: 'Find child entity by name' },
    { name: 'getComponent', signature: '(id: string, type: string) => Component | undefined', method: true, description: 'Get component of any entity' },
    { name: 'spawnPrefab', signature: '(assetId: string, pos?: Vec3, parent?: string | null) => string', method: true, description: 'Spawn a prefab instance' },
    { name: 'setActive', signature: '(id: string, active: boolean) => void', method: true, description: 'Toggle entity subtree (triggers onEnable/onDisable)' },
    { name: 'destroy', signature: '(id: string) => void', method: true, description: 'Destroy entity subtree' },
    { name: 'scene', signature: '{ load(id: string): void }', method: false, description: 'Scene loader' },
    { name: 'animation', signature: 'AnimationAPI', method: false, description: 'GLTF animation playback' },
    { name: 'save', signature: '{ get(k), set(k, v) }', method: false, description: 'Async key-value storage' },
    { name: 't', signature: '(key: string, params?) => string', method: true, description: 'Localized string lookup' },
  ],
  'api.camera': [
    { name: 'position', signature: 'Vector3', method: false, description: 'Camera world position' },
    { name: 'forward', signature: 'Vector3', method: false, description: 'Normalized camera forward vector' },
    { name: 'right', signature: 'Vector3', method: false, description: 'Normalized camera right vector' },
    { name: 'yaw', signature: 'number', method: false, description: 'Horizontal look angle (radians)' },
    { name: 'pitch', signature: 'number', method: false, description: 'Vertical look angle (radians)' },
    { name: 'fov', signature: 'number', method: false, description: 'Vertical field of view (degrees)' },
    { name: 'eyeHeight', signature: 'number', method: false, description: 'Eye height above player pivot' },
    { name: 'lookAt', signature: '(target: Vec3 | Vector3) => void', method: true, description: 'Aim camera at target' },
    { name: 'setLook', signature: '(yaw: number, pitch: number) => void', method: true, description: 'Set first-person look angles' },
    { name: 'shake', signature: '(intensity: number, duration?: number) => void', method: true, description: 'Trigger camera shake' },
  ],
  'api.player': [
    { name: 'id', signature: 'string | undefined', method: false, description: 'Active player entity ID' },
    { name: 'position', signature: 'Vec3', method: false, description: 'Player world position' },
    { name: 'isGrounded', signature: 'boolean', method: false, description: 'True when standing on ground' },
    { name: 'isCrouching', signature: 'boolean', method: false, description: 'True while crouching' },
    { name: 'isSprinting', signature: 'boolean', method: false, description: 'True while sprinting' },
    { name: 'teleport', signature: '(pos: Vec3, yawDelta?: number, pitchDelta?: number) => void', method: true, description: 'Seamless teleport with optional yaw/pitch shift' },
    { name: 'setSpeed', signature: '(speed: number) => void', method: true, description: 'Override walking speed' },
    { name: 'setCrouch', signature: '(enabled: boolean) => void', method: true, description: 'Force crouch state' },
  ],
  'api.environment': [
    { name: 'setFog', signature: '(density: number, color?: string) => void', method: true, description: 'Update fog density and hex color' },
    { name: 'setFogFade', signature: '(start: number, end: number, depthMode?: boolean) => void', method: true, description: 'Configure LittleJS distance fog fade and depth fog' },
    { name: 'setAmbientGround', signature: '(hex: string, intensity?: number) => void', method: true, description: 'Set hemisphere ground bounce lighting color' },
    { name: 'setBackground', signature: '(hex: string) => void', method: true, description: 'Update clear background color' },
    { name: 'setAmbient', signature: '(intensity: number, color?: string) => void', method: true, description: 'Update ambient light intensity/tint' },
    { name: 'setSun', signature: '(dir: Vec3, color?: string, intensity?: number) => void', method: true, description: 'Update directional sun vector/color/intensity' },
    { name: 'setExposure', signature: '(value: number) => void', method: true, description: 'Adjust global exposure' },
    { name: 'setSky', signature: '(top: string, horizon?: string, bottom?: string, enabled?: boolean) => void', method: true, description: 'Update gradient Sky Dome' },
    { name: 'setProceduralSky', signature: '(opts: ProceduralSkyOptions) => void', method: true, description: 'Configure procedural sky with clouds, sun, and stars' },
    { name: 'setSkyboxFaces', signature: '(faces: SkyboxFaces) => void', method: true, description: 'Set 6-sided cubemap skybox textures/colors' },
    { name: 'setSkyAsset', signature: '(assetId: string | null) => void', method: true, description: 'Apply a saved skybox asset by ID' },
  ],
  'api.graphics': [
    { name: 'setPostProcess', signature: '(opts: PostProcessOptions) => void', method: true, description: 'Set AO, DoF, Bloom, Vignette, Chromatic, Grain, Scanlines, ACES' },
    { name: 'getPostProcess', signature: '() => Required<PostProcessOptions>', method: true, description: 'Read current post-process settings' },
    { name: 'setShadows', signature: '(enabled: boolean, range?: number, softShadowHeight?: number) => void', method: true, description: 'Configure shadow map and soft contact shadow height' },
    { name: 'setSmoothShading', signature: '(enabled: boolean) => void', method: true, description: 'Toggle global smooth shading' },
    { name: 'bakeLighting', signature: '(zoneId?: string) => void', method: true, description: 'Bake static lighting & reflection probes globally or per zone' },
    { name: 'setReflections', signature: "(mode: 'off'|'baked'|'realtime', res?, interval?) => void", method: true, description: 'Configure global cubemap reflections' },
    { name: 'updateZoneProbe', signature: '(zoneId: string) => void', method: true, description: 'Re-capture a Bake Zone reflection cubemap' },
    { name: 'setShadowParams', signature: '({ softness?, bias?, followCamera? }) => void', method: true, description: 'Adjust shadow softness, bias, and camera follow' },
    { name: 'setRenderQuality', signature: '({ anisotropy?, mipmaps?, frustumCulling?, sortTransparent? }) => void', method: true, description: 'Configure anisotropy (1..16), mipmaps, and culling' },
  ],
  'api.materials': [
    { name: 'set', signature: '(entityId: string, materialAssetId: string) => void', method: true, description: 'Apply material asset to entity' },
    { name: 'setColor', signature: '(entityId: string, hex: string, opacity?: number) => void', method: true, description: 'Tint or fade entity color' },
    { name: 'setEmissive', signature: '(entityId: string, hex: string, intensity?: number) => void', method: true, description: 'Set entity emissive glow' },
    { name: 'setShader', signature: '(entityId: string, shaderAssetId: string | null) => void', method: true, description: 'Apply or clear custom GLSL shader on entity' },
    { name: 'create', signature: '(name: string, props: Record<string, any>) => string', method: true, description: 'Create a new material asset at runtime' },
  ],
  'api.lights': [
    { name: 'setIntensity', signature: '(id: string, intensity: number) => void', method: true, description: 'Set entity Light3D intensity' },
    { name: 'setColor', signature: '(id: string, hex: string) => void', method: true, description: 'Set entity Light3D tint color' },
    { name: 'setRange', signature: '(id: string, range: number) => void', method: true, description: 'Set entity Light3D radius' },
    { name: 'setGlow', signature: '(id: string, glow: number, falloff?: number) => void', method: true, description: 'Set volumetric fog glow & falloff on a Light3D' },
    { name: 'setShadowLight', signature: '(id: string | null) => void', method: true, description: 'Assign Spot Light as active shadow caster (or null for sun)' },
    { name: 'setGel', signature: '(id: string, textureAssetId: string | null) => void', method: true, description: 'Set projection gobo/cookie texture on Light3D' },
    { name: 'setEnabled', signature: '(id: string, enabled: boolean) => void', method: true, description: 'Enable or disable light entity' },
    { name: 'setFlashlight', signature: '({ enabled, color?, intensity?, range?, angle? }) => void', method: true, description: 'Control camera-mounted flashlight' },
  ],
  'api.debug': [
    { name: 'drawLine', signature: '(from: Vec3, to: Vec3, color?: string, durationSec?: number) => void', method: true, description: 'Draw a 3D debug line' },
    { name: 'drawBox', signature: '(center: Vec3, size: Vec3, color?: string, durationSec?: number) => void', method: true, description: 'Draw a 3D debug box' },
  ],
  'api.audio': [
    { name: 'play', signature: '(assetId?: string, opts?: AudioPlayOptions) => string', method: true, description: 'Play 2D/3D sound and return handle' },
    { name: 'stop', signature: '(handle: string) => void', method: true, description: 'Stop a playing sound handle' },
    { name: 'stopAll', signature: '() => void', method: true, description: 'Stop all active voices' },
    { name: 'setVolume', signature: '(handle: string, vol: number, fadeSec?: number) => void', method: true, description: 'Smoothly adjust voice volume' },
    { name: 'setPitch', signature: '(handle: string, pitch: number) => void', method: true, description: 'Adjust playback rate / pitch' },
    { name: 'setPosition', signature: '(handle: string, pos: Vec3) => void', method: true, description: 'Update 3D sound world position' },
    { name: 'setBusVolume', signature: '(bus: "sfx"|"ambient"|"ui", vol: number) => void', method: true, description: 'Adjust master bus gain' },
  ],
  'api.physics': [
    { name: 'raycast', signature: '(origin, dir, length) => string | undefined', method: true, description: 'Cast ray and return hit entity ID' },
    { name: 'raycastHit', signature: '(origin, dir, length, excludeIds?) => RaycastHit | undefined', method: true, description: 'Cast ray and return { id, distance, point, normal }' },
    { name: 'applyImpulse', signature: '(id: string, impulse: Vec3) => void', method: true, description: 'Apply instant impulse to dynamic body' },
    { name: 'applyForce', signature: '(id: string, force: Vec3) => void', method: true, description: 'Apply continuous force to dynamic body' },
    { name: 'setVelocity', signature: '(id: string, vel: Vec3) => void', method: true, description: 'Set linear velocity of dynamic body' },
    { name: 'getVelocity', signature: '(id: string) => Vec3 | undefined', method: true, description: 'Read linear velocity of body' },
    { name: 'setGravityScale', signature: '(id: string, scale: number) => void', method: true, description: 'Override body gravity multiplier' },
  ],
  'api.ui': [
    { name: 'get', signature: '(id: string) => HTMLElement | undefined', method: true, description: 'Get HUD element by ID' },
    { name: 'open', signature: '(id: string) => boolean', method: true, description: 'Open a window screen' },
    { name: 'close', signature: '() => boolean', method: true, description: 'Close all open windows' },
    { name: 'back', signature: '() => boolean', method: true, description: 'Pop top window from navigation stack' },
    { name: 'current', signature: '() => string | undefined', method: true, description: 'Current screen ID' },
    { name: 'setBlur', signature: '(id: string, blurPx: number) => void', method: true, description: 'Set backdrop-filter blur (px) on a HUD element' },
    { name: 'setStyle', signature: '(id: string, styles: Partial<CSSStyleDeclaration>) => void', method: true, description: 'Patch inline CSS styles on a HUD element' },
    { name: 'mount', signature: '(id: string, htmlOrEl, css?) => HTMLElement', method: true, description: 'Mount custom HTML/CSS widget inside overlay Shadow DOM' },
    { name: 'unmount', signature: '(id: string) => void', method: true, description: 'Remove custom mounted widget' },
  ],
  'api.saveSystem': [
    { name: 'save', signature: '(slot?: string, opts?: { cloudSync?: boolean }) => Promise<SaveSnapshot>', method: true, description: 'Save full game state locally + optional Yandex/Poki cloud sync' },
    { name: 'load', signature: '(slot?: string, opts?: { cloudSync?: boolean; preferCloud?: boolean }) => Promise<boolean>', method: true, description: 'Load full game state from slot (picks newest local/cloud)' },
    { name: 'capture', signature: '(slot?: string) => SaveSnapshot', method: true, description: 'Capture live SaveSnapshot object without writing' },
    { name: 'exportJSON', signature: '(slot?: string) => string', method: true, description: 'Export save slot as formatted JSON string' },
    { name: 'downloadJSON', signature: '(slot?: string, filename?: string) => void', method: true, description: 'Download save slot as .json file' },
    { name: 'importJSON', signature: '(json: string, slot?: string, applyNow?: boolean) => Promise<boolean>', method: true, description: 'Import save JSON and optionally apply immediately' },
    { name: 'listSlots', signature: '() => string[]', method: true, description: 'List locally stored save slot names' },
    { name: 'deleteSlot', signature: '(slot?: string) => Promise<void>', method: true, description: 'Delete save slot locally and in cloud' },
  ],
  'api.services': [
    { name: 'register', signature: '<T>(name: string, service: T) => T', method: true, description: 'Register shared manager/service' },
    { name: 'get', signature: '<T>(name: string) => T | undefined', method: true, description: 'Get registered service' },
    { name: 'has', signature: '(name: string) => boolean', method: true, description: 'Check if service exists' },
  ],
  'api.worldState': [
    { name: 'get', signature: '<T>(key: string, fallback?: T) => T', method: true, description: 'Read persistent world state value' },
    { name: 'set', signature: '(key: string, value: unknown) => void', method: true, description: 'Write persistent world state value' },
    { name: 'all', signature: '() => Record<string, unknown>', method: true, description: 'Snapshot of all world state' },
    { name: 'save', signature: '(slot?: string) => Promise<void>', method: true, description: 'Persist world state to storage' },
    { name: 'load', signature: '(slot?: string) => Promise<boolean>', method: true, description: 'Load world state from storage' },
  ],
  lifecycle: [
    { name: 'onStart', signature: 'onStart() { ... }', method: true, description: 'Called once when entity starts', snippet: 'onStart() {\n  $0\n},' },
    { name: 'onUpdate', signature: 'onUpdate(dt: number) { ... }', method: true, description: 'Called every frame', snippet: 'onUpdate(dt: number) {\n  $0\n},' },
    { name: 'onFixedUpdate', signature: 'onFixedUpdate(dt: number) { ... }', method: true, description: 'Called at fixed 60 Hz step', snippet: 'onFixedUpdate(dt: number) {\n  $0\n},' },
    { name: 'onEnable', signature: 'onEnable() { ... }', method: true, description: 'Called when re-enabled via setActive', snippet: 'onEnable() {\n  $0\n},' },
    { name: 'onDisable', signature: 'onDisable() { ... }', method: true, description: 'Called when disabled via setActive', snippet: 'onDisable() {\n  $0\n},' },
    { name: 'onTriggerEnter', signature: 'onTriggerEnter(other: string) { ... }', method: true, description: 'Called when entering a trigger', snippet: 'onTriggerEnter(other: string) {\n  $0\n},' },
    { name: 'onTriggerStay', signature: 'onTriggerStay(other: string, dt: number) { ... }', method: true, description: 'Called every fixed tick inside a trigger', snippet: 'onTriggerStay(other: string, dt: number) {\n  $0\n},' },
    { name: 'onTriggerExit', signature: 'onTriggerExit(other: string) { ... }', method: true, description: 'Called when exiting a trigger', snippet: 'onTriggerExit(other: string) {\n  $0\n},' },
    { name: 'onCollisionEnter', signature: 'onCollisionEnter(other: string) { ... }', method: true, description: 'Called on solid collision', snippet: 'onCollisionEnter(other: string) {\n  $0\n},' },
    { name: 'onPointerClick', signature: 'onPointerClick() { ... }', method: true, description: 'Called on crosshair/mouse click', snippet: 'onPointerClick() {\n  $0\n},' },
    { name: 'onDestroy', signature: 'onDestroy() { ... }', method: true, description: 'Called on entity destroy or scene unload', snippet: 'onDestroy() {\n  $0\n},' },
  ],
}

const glslSuggestions: APIMember[] = [
  { name: 'iTime', signature: 'uniform float iTime', method: false, description: 'Elapsed shader time in seconds' },
  { name: 'iChannel0', signature: 'uniform sampler2D iChannel0', method: false, description: 'Primary material texture sampler' },
  { name: 'worldPos', signature: 'varying vec3 worldPos', method: false, description: 'Fragment world-space position' },
  { name: 'worldNormal', signature: 'varying vec3 worldNormal', method: false, description: 'Fragment world-space normal' },
  { name: 'cameraPos', signature: 'uniform vec3 cameraPos', method: false, description: 'Active camera world position' },
  { name: 'sunDirection', signature: 'uniform vec3 sunDirection', method: false, description: 'Directional sun vector' },
  { name: 'localUV', signature: 'varying vec2 localUV', method: false, description: 'Mesh local UV coordinates [0..1]' },
  { name: 'mix', signature: 'mix(a, b, t)', method: true, description: 'Linear interpolation' },
  { name: 'smoothstep', signature: 'smoothstep(edge0, edge1, x)', method: true, description: 'Hermite smooth interpolation' },
  { name: 'clamp', signature: 'clamp(x, minVal, maxVal)', method: true, description: 'Constrain value to range' },
  { name: 'normalize', signature: 'normalize(v)', method: true, description: 'Unit length vector' },
  { name: 'dot', signature: 'dot(a, b)', method: true, description: 'Dot product' },
]

let apiRequest: Promise<Record<string, APIMember[]>> | undefined
function loadAPI(): Promise<Record<string, APIMember[]>> {
  return (apiRequest ??= fetch(new URL(import.meta.env.BASE_URL + 'engine/script-api.json', document.baseURI))
    .then((response) => {
      if (!response.ok) throw Error('API catalog unavailable')
      return response.json()
    })
    .then((remote: Record<string, APIMember[]>) => ({ ...builtinAPI, ...remote }))
    .catch(() => {
      apiRequest = undefined
      return builtinAPI
    }))
}

monaco.languages.registerCompletionItemProvider('typescript', {
  triggerCharacters: ['.'],
  async provideCompletionItems(model, position) {
    const word = model.getWordUntilPosition(position)
    const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
    const before = model.getLineContent(position.lineNumber).slice(0, position.column - 1)
    const path = /\b(api(?:\.\w+)*)\.\w*$/.exec(before)?.[1]
    const catalog = await loadAPI()
    const members = catalog[path ?? 'lifecycle'] ?? []
    return {
      suggestions: members.map((member) => ({
        label: member.name,
        insertText: member.snippet ?? member.name,
        insertTextRules: member.snippet
          ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
          : undefined,
        range,
        kind: member.method
          ? monaco.languages.CompletionItemKind.Method
          : monaco.languages.CompletionItemKind.Property,
        detail: member.signature,
        documentation: member.description,
      })),
    }
  },
})

monaco.languages.registerCompletionItemProvider('glsl', {
  provideCompletionItems(model, position) {
    const word = model.getWordUntilPosition(position)
    const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
    return {
      suggestions: glslSuggestions.map((m) => ({
        label: m.name,
        insertText: m.name,
        range,
        kind: m.method
          ? monaco.languages.CompletionItemKind.Function
          : monaco.languages.CompletionItemKind.Variable,
        detail: m.signature,
        documentation: m.description,
      })),
    }
  },
})

export default function CodeEditor({
  value,
  language,
  readOnly = false,
  findTrigger = 0,
  onSave,
  onChange,
}: {
  value: string
  language: CodeLanguage
  readOnly?: boolean
  findTrigger?: number
  onSave?: () => void
  onChange: (s: string) => void
}) {
  const container = useRef<HTMLDivElement>(null),
    callback = useRef(onChange),
    saveRef = useRef(onSave),
    initial = useRef(value),
    instance = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  callback.current = onChange
  saveRef.current = onSave
  useEffect(() => {
    if (!container.current) return
    const model = monaco.editor.createModel(initial.current, language)
    const editor = monaco.editor.create(container.current, {
      model,
      theme: 'vs-dark',
      fontSize: 13,
      readOnly,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      tabSize: 2,
      quickSuggestions: { other: !readOnly, comments: false, strings: false },
      suggestOnTriggerCharacters: !readOnly,
      bracketPairColorization: { enabled: true },
      autoClosingBrackets: 'always',
      autoClosingQuotes: 'always',
      formatOnPaste: true,
    })
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveRef.current?.()
    })
    const sub = editor.onDidChangeModelContent(() => {
      if (!readOnly) callback.current(editor.getValue())
    })
    instance.current = editor
    return () => {
      sub.dispose()
      editor.dispose()
      model.dispose()
      instance.current = null
    }
  }, [language, readOnly])
  useEffect(() => {
    const editor = instance.current
    if (editor && value !== editor.getValue()) editor.setValue(value)
  }, [value])
  useEffect(() => {
    if (findTrigger > 0) {
      const editor = instance.current
      if (editor) {
        editor.focus()
        void editor.getAction('editor.action.startFindReplaceAction')?.run()
      }
    }
  }, [findTrigger])
  return <div ref={container} className="mf-code" />
}

// Unreal Blueprint-style visual Event Graph schema & node catalog for Miniforge Engine v1.4

export type PinType = 'exec' | 'boolean' | 'number' | 'string' | 'vec3' | 'entity' | 'array' | 'enum' | 'map' | 'object' | 'any'

export interface GraphPinDef {
  id: string
  label: string
  type: PinType
  defaultValue?: any
}

export interface GraphVariable {
  id: string
  name: string
  type: Exclude<PinType, 'exec'>
  defaultValue: any
  exposed?: boolean
  scope?: 'local' | 'vars' | 'worldState'
  enumValues?: string[]
}

export interface GraphNode {
  id: string
  type: string
  x: number
  y: number
  config?: Record<string, any>
  inputs?: Record<string, any>
}

export interface GraphEdge {
  id: string
  fromNode: string
  fromPin: string
  toNode: string
  toPin: string
}

export interface GraphFunction {
  id: string
  name: string
  inputs: { id: string; name: string; type: Exclude<PinType, 'exec'> }[]
  outputs: { id: string; name: string; type: Exclude<PinType, 'exec'> }[]
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface EventGraphData {
  version: 1
  variables: GraphVariable[]
  functions: GraphFunction[]
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface GraphNodeSpec {
  type: string
  title: string
  category:
    | 'Events'
    | 'Flow'
    | 'Variables'
    | 'Functions'
    | 'Math & Logic'
    | 'Entity'
    | 'Player & Input'
    | 'Physics'
    | 'Animation & AI'
    | 'World & FX'
    | 'Audio & UI'
    | 'Collections'
  pure?: boolean
  color?: string
  inputs: GraphPinDef[]
  outputs: GraphPinDef[]
  keywords?: string
}

export const PIN_COLORS: Record<PinType, string> = {
  exec: '#ffffff',
  boolean: '#e5534b',
  number: '#57d163',
  string: '#e066d0',
  vec3: '#f5b82e',
  entity: '#38bdf8',
  array: '#f97316',
  enum: '#a78bfa',
  map: '#14b8a6',
  object: '#eab308',
  any: '#9aa7b8',
}

export const CATEGORY_COLORS: Record<GraphNodeSpec['category'], string> = {
  Events: '#8f2424',
  Flow: '#3b4d63',
  Variables: '#5c3b85',
  Functions: '#1f6e6e',
  'Math & Logic': '#246b3b',
  Entity: '#1e548a',
  'Player & Input': '#1f617a',
  Physics: '#3e428c',
  Collections: '#7c4a15',
  'Animation & AI': '#9a5418',
  'World & FX': '#1b6b66',
  'Audio & UI': '#7a2e5c',
}

export const GRAPH_NODE_CATALOG: GraphNodeSpec[] = [
  // === EVENTS ===
  {
    type: 'event.start',
    title: 'Event On Start',
    category: 'Events',
    inputs: [],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
    keywords: 'begin play init start',
  },
  {
    type: 'event.update',
    title: 'Event On Update (Tick)',
    category: 'Events',
    inputs: [],
    outputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'dt', label: 'Delta Time', type: 'number' },
    ],
    keywords: 'tick frame loop update',
  },
  {
    type: 'event.fixedUpdate',
    title: 'Event On Fixed Update',
    category: 'Events',
    inputs: [],
    outputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'dt', label: 'Delta Time', type: 'number' },
    ],
    keywords: 'physics 60hz fixed',
  },
  {
    type: 'event.triggerEnter',
    title: 'Event On Trigger Enter',
    category: 'Events',
    inputs: [],
    outputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'other', label: 'Other Entity', type: 'entity' },
    ],
    keywords: 'overlap zone enter collider',
  },
  {
    type: 'event.triggerExit',
    title: 'Event On Trigger Exit',
    category: 'Events',
    inputs: [],
    outputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'other', label: 'Other Entity', type: 'entity' },
    ],
    keywords: 'overlap zone leave exit',
  },
  {
    type: 'event.collision',
    title: 'Event On Collision Enter',
    category: 'Events',
    inputs: [],
    outputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'other', label: 'Other Entity', type: 'entity' },
    ],
    keywords: 'hit bump impact collider',
  },
  {
    type: 'event.click',
    title: 'Event On Pointer Click',
    category: 'Events',
    inputs: [],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
    keywords: 'interact click mouse tap',
  },
  {
    type: 'event.custom',
    title: 'On Custom Event',
    category: 'Events',
    inputs: [{ id: 'eventName', label: 'Event Name', type: 'string', defaultValue: 'my.event' }],
    outputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'payload', label: 'Payload', type: 'any' },
    ],
    keywords: 'listen bus message',
  },
  {
    type: 'event.inputAction',
    title: 'On Input Action',
    category: 'Events',
    inputs: [{ id: 'action', label: 'Action', type: 'string', defaultValue: 'Interact' }],
    outputs: [
      { id: 'pressed', label: 'Pressed', type: 'exec' },
      { id: 'released', label: 'Released', type: 'exec' },
    ],
    keywords: 'key button keyboard press',
  },
  {
    type: 'event.enable',
    title: 'Event On Enable',
    category: 'Events',
    inputs: [],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'event.disable',
    title: 'Event On Disable',
    category: 'Events',
    inputs: [],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'event.destroy',
    title: 'Event On Destroy',
    category: 'Events',
    inputs: [],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },

  // === FLOW CONTROL ===
  {
    type: 'flow.branch',
    title: 'Branch (If)',
    category: 'Flow',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'condition', label: 'Condition', type: 'boolean', defaultValue: true },
    ],
    outputs: [
      { id: 'true', label: 'True', type: 'exec' },
      { id: 'false', label: 'False', type: 'exec' },
    ],
    keywords: 'if else condition',
  },
  {
    type: 'flow.sequence',
    title: 'Sequence',
    category: 'Flow',
    inputs: [{ id: 'exec', label: '', type: 'exec' }],
    outputs: [
      { id: 'then0', label: 'Then 0', type: 'exec' },
      { id: 'then1', label: 'Then 1', type: 'exec' },
      { id: 'then2', label: 'Then 2', type: 'exec' },
    ],
    keywords: 'order chain multi',
  },
  {
    type: 'flow.forLoop',
    title: 'For Loop',
    category: 'Flow',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'first', label: 'First Index', type: 'number', defaultValue: 0 },
      { id: 'last', label: 'Last Index', type: 'number', defaultValue: 5 },
    ],
    outputs: [
      { id: 'body', label: 'Loop Body', type: 'exec' },
      { id: 'index', label: 'Index', type: 'number' },
      { id: 'completed', label: 'Completed', type: 'exec' },
    ],
    keywords: 'repeat iterate count',
  },
  {
    type: 'flow.delay',
    title: 'Delay',
    category: 'Flow',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'duration', label: 'Seconds', type: 'number', defaultValue: 1 },
    ],
    outputs: [{ id: 'completed', label: 'Completed', type: 'exec' }],
    keywords: 'wait timer sleep timeout',
  },
  {
    type: 'flow.doOnce',
    title: 'Do Once',
    category: 'Flow',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'reset', label: 'Reset', type: 'exec' },
    ],
    outputs: [{ id: 'completed', label: 'Completed', type: 'exec' }],
    keywords: 'once single trigger',
  },
  {
    type: 'flow.flipFlop',
    title: 'Flip Flop',
    category: 'Flow',
    inputs: [{ id: 'exec', label: '', type: 'exec' }],
    outputs: [
      { id: 'a', label: 'A', type: 'exec' },
      { id: 'b', label: 'B', type: 'exec' },
      { id: 'isA', label: 'Is A', type: 'boolean' },
    ],
    keywords: 'toggle switch alternate',
  },
  {
    type: 'flow.gate',
    title: 'Gate',
    category: 'Flow',
    inputs: [
      { id: 'enter', label: 'Enter', type: 'exec' },
      { id: 'open', label: 'Open', type: 'exec' },
      { id: 'close', label: 'Close', type: 'exec' },
      { id: 'toggle', label: 'Toggle', type: 'exec' },
      { id: 'startClosed', label: 'Start Closed', type: 'boolean', defaultValue: false },
    ],
    outputs: [{ id: 'exit', label: 'Exit', type: 'exec' }],
  },
  {
    type: 'flow.emitEvent',
    title: 'Emit Event',
    category: 'Flow',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'eventName', label: 'Event Name', type: 'string', defaultValue: 'my.event' },
      { id: 'payload', label: 'Payload', type: 'any', defaultValue: '' },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
    keywords: 'broadcast dispatch message',
  },
  {
    type: 'flow.print',
    title: 'Print / Log',
    category: 'Flow',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'value', label: 'Message', type: 'any', defaultValue: 'Hello from Event Graph' },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
    keywords: 'debug console log',
  },

  // === VARIABLES & FUNCTIONS ===
  {
    type: 'var.get',
    title: 'Get Variable',
    category: 'Variables',
    pure: true,
    inputs: [],
    outputs: [{ id: 'value', label: 'Value', type: 'any' }],
    keywords: 'read variable',
  },
  {
    type: 'var.set',
    title: 'Set Variable',
    category: 'Variables',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'value', label: 'Value', type: 'any', defaultValue: 0 },
    ],
    outputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'value', label: 'Value', type: 'any' },
    ],
    keywords: 'write assign variable',
  },
  {
    type: 'vars.get',
    title: 'Get HUD Var (api.vars)',
    category: 'Variables',
    pure: true,
    inputs: [
      { id: 'key', label: 'Key', type: 'string', defaultValue: 'score' },
      { id: 'fallback', label: 'Fallback', type: 'any', defaultValue: 0 },
    ],
    outputs: [{ id: 'value', label: 'Value', type: 'any' }],
  },
  {
    type: 'vars.set',
    title: 'Set HUD Var (api.vars)',
    category: 'Variables',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'key', label: 'Key', type: 'string', defaultValue: 'score' },
      { id: 'value', label: 'Value', type: 'any', defaultValue: 0 },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'worldState.get',
    title: 'Get WorldState',
    category: 'Variables',
    pure: true,
    inputs: [
      { id: 'key', label: 'Key', type: 'string', defaultValue: 'day' },
      { id: 'fallback', label: 'Fallback', type: 'any', defaultValue: 1 },
    ],
    outputs: [{ id: 'value', label: 'Value', type: 'any' }],
  },
  {
    type: 'worldState.set',
    title: 'Set WorldState',
    category: 'Variables',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'key', label: 'Key', type: 'string', defaultValue: 'day' },
      { id: 'value', label: 'Value', type: 'any', defaultValue: 1 },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'func.entry',
    title: 'Function Entry',
    category: 'Functions',
    inputs: [],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'func.return',
    title: 'Return Node',
    category: 'Functions',
    inputs: [{ id: 'exec', label: '', type: 'exec' }],
    outputs: [],
  },
  {
    type: 'func.call',
    title: 'Call Function',
    category: 'Functions',
    inputs: [{ id: 'exec', label: '', type: 'exec' }],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },

  // === MATH, LOGIC & STRINGS ===
  {
    type: 'math.op',
    title: 'Math Operation',
    category: 'Math & Logic',
    pure: true,
    inputs: [
      { id: 'a', label: 'A', type: 'number', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', defaultValue: 1 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number' }],
    keywords: 'add subtract multiply divide modulo power min max + - * /',
  },
  {
    type: 'math.clamp',
    title: 'Clamp',
    category: 'Math & Logic',
    pure: true,
    inputs: [
      { id: 'value', label: 'Value', type: 'number', defaultValue: 0.5 },
      { id: 'min', label: 'Min', type: 'number', defaultValue: 0 },
      { id: 'max', label: 'Max', type: 'number', defaultValue: 1 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number' }],
  },
  {
    type: 'math.lerp',
    title: 'Lerp',
    category: 'Math & Logic',
    pure: true,
    inputs: [
      { id: 'a', label: 'A', type: 'number', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', defaultValue: 1 },
      { id: 'alpha', label: 'Alpha', type: 'number', defaultValue: 0.5 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number' }],
  },
  {
    type: 'math.random',
    title: 'Random Range',
    category: 'Math & Logic',
    pure: true,
    inputs: [
      { id: 'min', label: 'Min', type: 'number', defaultValue: 0 },
      { id: 'max', label: 'Max', type: 'number', defaultValue: 1 },
    ],
    outputs: [{ id: 'result', label: 'Value', type: 'number' }],
  },
  {
    type: 'logic.compare',
    title: 'Compare',
    category: 'Math & Logic',
    pure: true,
    inputs: [
      { id: 'a', label: 'A', type: 'any', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'any', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'boolean' }],
    keywords: 'equals greater less == != > < >= <=',
  },
  {
    type: 'logic.bool',
    title: 'Boolean Logic',
    category: 'Math & Logic',
    pure: true,
    inputs: [
      { id: 'a', label: 'A', type: 'boolean', defaultValue: false },
      { id: 'b', label: 'B', type: 'boolean', defaultValue: false },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'boolean' }],
    keywords: 'and or not xor',
  },
  {
    type: 'logic.select',
    title: 'Select (Ternary)',
    category: 'Math & Logic',
    pure: true,
    inputs: [
      { id: 'cond', label: 'Pick A', type: 'boolean', defaultValue: true },
      { id: 'a', label: 'A', type: 'any', defaultValue: 1 },
      { id: 'b', label: 'B', type: 'any', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'any' }],
  },
  {
    type: 'str.concat',
    title: 'Append String',
    category: 'Math & Logic',
    pure: true,
    inputs: [
      { id: 'a', label: 'A', type: 'string', defaultValue: '' },
      { id: 'b', label: 'B', type: 'string', defaultValue: '' },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'string' }],
  },
  {
    type: 'vec3.make',
    title: 'Make Vec3',
    category: 'Math & Logic',
    pure: true,
    inputs: [
      { id: 'x', label: 'X', type: 'number', defaultValue: 0 },
      { id: 'y', label: 'Y', type: 'number', defaultValue: 0 },
      { id: 'z', label: 'Z', type: 'number', defaultValue: 0 },
    ],
    outputs: [{ id: 'vec', label: 'Vec3', type: 'vec3' }],
  },
  {
    type: 'vec3.break',
    title: 'Break Vec3',
    category: 'Math & Logic',
    pure: true,
    inputs: [{ id: 'vec', label: 'Vec3', type: 'vec3', defaultValue: [0, 0, 0] }],
    outputs: [
      { id: 'x', label: 'X', type: 'number' },
      { id: 'y', label: 'Y', type: 'number' },
      { id: 'z', label: 'Z', type: 'number' },
    ],
  },
  {
    type: 'vec3.math',
    title: 'Vec3 Math',
    category: 'Math & Logic',
    pure: true,
    inputs: [
      { id: 'a', label: 'A', type: 'vec3', defaultValue: [0, 0, 0] },
      { id: 'b', label: 'B', type: 'vec3', defaultValue: [0, 0, 0] },
      { id: 'scalar', label: 'Scalar', type: 'number', defaultValue: 1 },
    ],
    outputs: [
      { id: 'vec', label: 'Vec3', type: 'vec3' },
      { id: 'distance', label: 'Distance', type: 'number' },
    ],
    keywords: 'vector add sub scale distance normalize',
  },

  // === ENTITY & TRANSFORM ===
  {
    type: 'entity.self',
    title: 'Get Self Entity',
    category: 'Entity',
    pure: true,
    inputs: [],
    outputs: [
      { id: 'id', label: 'Self ID', type: 'entity' },
      { id: 'position', label: 'Position', type: 'vec3' },
      { id: 'time', label: 'Game Time', type: 'number' },
    ],
  },
  {
    type: 'entity.findByTag',
    title: 'Find Entity By Tag',
    category: 'Entity',
    pure: true,
    inputs: [{ id: 'tag', label: 'Tag', type: 'string', defaultValue: 'player' }],
    outputs: [
      { id: 'id', label: 'First ID', type: 'entity' },
      { id: 'count', label: 'Count', type: 'number' },
    ],
  },
  {
    type: 'entity.getPos',
    title: 'Get Entity Position',
    category: 'Entity',
    pure: true,
    inputs: [{ id: 'id', label: 'Entity ID', type: 'entity', defaultValue: '' }],
    outputs: [{ id: 'position', label: 'Position', type: 'vec3' }],
  },
  {
    type: 'entity.setPos',
    title: 'Set Entity Position',
    category: 'Entity',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'id', label: 'Entity ID', type: 'entity', defaultValue: '' },
      { id: 'position', label: 'Position', type: 'vec3', defaultValue: [0, 0, 0] },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'entity.setRot',
    title: 'Set Entity Rotation',
    category: 'Entity',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'id', label: 'Entity ID', type: 'entity', defaultValue: '' },
      { id: 'rotation', label: 'Euler (rad)', type: 'vec3', defaultValue: [0, 0, 0] },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'entity.setActive',
    title: 'Set Entity Active',
    category: 'Entity',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'id', label: 'Entity ID', type: 'entity', defaultValue: '' },
      { id: 'active', label: 'Active', type: 'boolean', defaultValue: true },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'entity.spawnPrefab',
    title: 'Spawn Prefab',
    category: 'Entity',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'assetId', label: 'Prefab ID', type: 'string', defaultValue: '' },
      { id: 'position', label: 'Position', type: 'vec3', defaultValue: [0, 0, 0] },
    ],
    outputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'spawnedId', label: 'Spawned ID', type: 'entity' },
    ],
  },
  {
    type: 'entity.destroy',
    title: 'Destroy Entity',
    category: 'Entity',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'id', label: 'Entity ID', type: 'entity', defaultValue: '' },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'scene.load',
    title: 'Load Scene',
    category: 'Entity',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'sceneId', label: 'Scene ID', type: 'string', defaultValue: '' },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },

  // === PLAYER, INPUT & CAMERA ===
  {
    type: 'input.pressed',
    title: 'Is Input Pressed',
    category: 'Player & Input',
    pure: true,
    inputs: [{ id: 'action', label: 'Action', type: 'string', defaultValue: 'Jump' }],
    outputs: [{ id: 'pressed', label: 'Pressed', type: 'boolean' }],
  },
  {
    type: 'input.move',
    title: 'Get Move Input',
    category: 'Player & Input',
    pure: true,
    inputs: [],
    outputs: [
      { id: 'x', label: 'Move X', type: 'number' },
      { id: 'z', label: 'Move Z', type: 'number' },
    ],
  },
  {
    type: 'player.info',
    title: 'Get Player Info',
    category: 'Player & Input',
    pure: true,
    inputs: [],
    outputs: [
      { id: 'id', label: 'Player ID', type: 'entity' },
      { id: 'position', label: 'Position', type: 'vec3' },
      { id: 'grounded', label: 'Is Grounded', type: 'boolean' },
      { id: 'sprinting', label: 'Is Sprinting', type: 'boolean' },
    ],
  },
  {
    type: 'player.teleport',
    title: 'Teleport Player',
    category: 'Player & Input',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'position', label: 'Position', type: 'vec3', defaultValue: [0, 2, 0] },
      { id: 'yawDelta', label: 'Yaw Delta', type: 'number', defaultValue: 0 },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'player.setSpeed',
    title: 'Set Player Speed',
    category: 'Player & Input',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'speed', label: 'Speed', type: 'number', defaultValue: 5 },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'camera.info',
    title: 'Get Camera Info',
    category: 'Player & Input',
    pure: true,
    inputs: [],
    outputs: [
      { id: 'position', label: 'Position', type: 'vec3' },
      { id: 'forward', label: 'Forward', type: 'vec3' },
      { id: 'fov', label: 'FOV', type: 'number' },
    ],
  },
  {
    type: 'camera.shake',
    title: 'Camera Shake',
    category: 'Player & Input',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'intensity', label: 'Intensity', type: 'number', defaultValue: 0.35 },
      { id: 'duration', label: 'Duration', type: 'number', defaultValue: 0.4 },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'camera.lookAt',
    title: 'Camera Look At',
    category: 'Player & Input',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'target', label: 'Target', type: 'vec3', defaultValue: [0, 0, 0] },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },

  // === PHYSICS ===
  {
    type: 'physics.raycast',
    title: 'Physics Raycast',
    category: 'Physics',
    pure: true,
    inputs: [
      { id: 'origin', label: 'Origin', type: 'vec3', defaultValue: [0, 1, 0] },
      { id: 'direction', label: 'Direction', type: 'vec3', defaultValue: [0, -1, 0] },
      { id: 'length', label: 'Length', type: 'number', defaultValue: 10 },
    ],
    outputs: [
      { id: 'hit', label: 'Hit', type: 'boolean' },
      { id: 'id', label: 'Entity ID', type: 'entity' },
      { id: 'distance', label: 'Distance', type: 'number' },
      { id: 'point', label: 'Point', type: 'vec3' },
      { id: 'normal', label: 'Normal', type: 'vec3' },
    ],
  },
  {
    type: 'physics.impulse',
    title: 'Apply Impulse',
    category: 'Physics',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'id', label: 'Entity ID', type: 'entity', defaultValue: '' },
      { id: 'impulse', label: 'Impulse', type: 'vec3', defaultValue: [0, 5, 0] },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'physics.setVelocity',
    title: 'Set Velocity',
    category: 'Physics',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'id', label: 'Entity ID', type: 'entity', defaultValue: '' },
      { id: 'velocity', label: 'Velocity', type: 'vec3', defaultValue: [0, 0, 0] },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },

  // === ANIMATION & NAV AI ===
  {
    type: 'anim.play',
    title: 'Play Animation',
    category: 'Animation & AI',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'id', label: 'Entity ID', type: 'entity', defaultValue: '' },
      { id: 'clip', label: 'Clip Name', type: 'string', defaultValue: 'Idle' },
      { id: 'loop', label: 'Loop', type: 'boolean', defaultValue: true },
      { id: 'speed', label: 'Speed', type: 'number', defaultValue: 1 },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'anim.crossfade',
    title: 'Crossfade Animation',
    category: 'Animation & AI',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'id', label: 'Entity ID', type: 'entity', defaultValue: '' },
      { id: 'clip', label: 'Clip Name', type: 'string', defaultValue: 'Walk' },
      { id: 'duration', label: 'Blend (s)', type: 'number', defaultValue: 0.25 },
      { id: 'loop', label: 'Loop', type: 'boolean', defaultValue: true },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'anim.getBonePos',
    title: 'Get Bone Position',
    category: 'Animation & AI',
    pure: true,
    inputs: [
      { id: 'id', label: 'Entity ID', type: 'entity', defaultValue: '' },
      { id: 'bone', label: 'Bone Name', type: 'string', defaultValue: 'RightHand' },
    ],
    outputs: [{ id: 'position', label: 'Position', type: 'vec3' }],
  },
  {
    type: 'nav.moveAgent',
    title: 'Move NavAgent',
    category: 'Animation & AI',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'id', label: 'Entity ID', type: 'entity', defaultValue: '' },
      { id: 'goal', label: 'Goal', type: 'vec3', defaultValue: [0, 0, 0] },
      { id: 'speed', label: 'Speed', type: 'number', defaultValue: 2.8 },
      { id: 'walkClip', label: 'Walk Clip', type: 'string', defaultValue: 'Walk' },
      { id: 'idleClip', label: 'Idle Clip', type: 'string', defaultValue: 'Idle' },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'nav.stopAgent',
    title: 'Stop NavAgent',
    category: 'Animation & AI',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'id', label: 'Entity ID', type: 'entity', defaultValue: '' },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'nav.isMoving',
    title: 'Is NavAgent Moving',
    category: 'Animation & AI',
    pure: true,
    inputs: [{ id: 'id', label: 'Entity ID', type: 'entity', defaultValue: '' }],
    outputs: [{ id: 'moving', label: 'Moving', type: 'boolean' }],
  },

  // === WORLD, MATERIALS, LIGHTS & FX ===
  {
    type: 'mat.getSurfaceAt',
    title: 'Get Surface Material At',
    category: 'World & FX',
    pure: true,
    inputs: [
      { id: 'position', label: 'Position', type: 'vec3', defaultValue: [0, 1, 0] },
      { id: 'maxDist', label: 'Max Dist', type: 'number', defaultValue: 3 },
    ],
    outputs: [
      { id: 'materialName', label: 'Material Name', type: 'string' },
      { id: 'entityId', label: 'Entity ID', type: 'entity' },
      { id: 'isTerrain', label: 'Is Terrain', type: 'boolean' },
      { id: 'layerIndex', label: 'Layer Index', type: 'number' },
    ],
  },
  {
    type: 'mat.setColor',
    title: 'Set Material Color',
    category: 'World & FX',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'id', label: 'Entity ID', type: 'entity', defaultValue: '' },
      { id: 'color', label: 'Hex Color', type: 'string', defaultValue: '#ffaa33' },
      { id: 'opacity', label: 'Opacity', type: 'number', defaultValue: 1 },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'mat.setEmissive',
    title: 'Set Material Emissive',
    category: 'World & FX',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'id', label: 'Entity ID', type: 'entity', defaultValue: '' },
      { id: 'color', label: 'Hex Color', type: 'string', defaultValue: '#ffdd66' },
      { id: 'intensity', label: 'Intensity', type: 'number', defaultValue: 1.5 },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'light.setIntensity',
    title: 'Set Light Intensity',
    category: 'World & FX',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'id', label: 'Light ID', type: 'entity', defaultValue: '' },
      { id: 'intensity', label: 'Intensity', type: 'number', defaultValue: 2 },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'light.setFlashlight',
    title: 'Set Flashlight',
    category: 'World & FX',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'enabled', label: 'Enabled', type: 'boolean', defaultValue: true },
      { id: 'intensity', label: 'Intensity', type: 'number', defaultValue: 3 },
      { id: 'range', label: 'Range', type: 'number', defaultValue: 20 },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'env.setFog',
    title: 'Set Environment Fog',
    category: 'World & FX',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'density', label: 'Density', type: 'number', defaultValue: 0.02 },
      { id: 'color', label: 'Color', type: 'string', defaultValue: '#9ab2c4' },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'fx.particleBurst',
    title: 'Burst 3D Particles',
    category: 'World & FX',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'id', label: 'Emitter ID', type: 'entity', defaultValue: '' },
      { id: 'count', label: 'Count', type: 'number', defaultValue: 24 },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'fx.decalSpawn',
    title: 'Spawn 3D Decal',
    category: 'World & FX',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'position', label: 'Position', type: 'vec3', defaultValue: [0, 0.02, 0] },
      { id: 'color', label: 'Color', type: 'string', defaultValue: '#222222' },
      { id: 'lifetime', label: 'Lifetime (s)', type: 'number', defaultValue: 15 },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'tween.moveTo',
    title: 'Tween Move To',
    category: 'World & FX',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'id', label: 'Entity ID', type: 'entity', defaultValue: '' },
      { id: 'target', label: 'Target Pos', type: 'vec3', defaultValue: [0, 2, 0] },
      { id: 'duration', label: 'Duration (s)', type: 'number', defaultValue: 0.6 },
    ],
    outputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'finished', label: 'Finished', type: 'exec' },
    ],
  },

  // === AUDIO, UI, SAVE & PLATFORM ===
  {
    type: 'audio.play',
    title: 'Play Audio',
    category: 'Audio & UI',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'assetId', label: 'Audio ID', type: 'string', defaultValue: '' },
      { id: 'volume', label: 'Volume', type: 'number', defaultValue: 1 },
      { id: 'pitch', label: 'Pitch', type: 'number', defaultValue: 1 },
    ],
    outputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'handle', label: 'Handle', type: 'string' },
    ],
  },
  {
    type: 'ui.open',
    title: 'Open UI Screen',
    category: 'Audio & UI',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'screenId', label: 'Screen ID', type: 'string', defaultValue: '' },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'ui.close',
    title: 'Close UI Screen',
    category: 'Audio & UI',
    inputs: [{ id: 'exec', label: '', type: 'exec' }],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'save.saveSlot',
    title: 'Save Game Slot',
    category: 'Audio & UI',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'slot', label: 'Slot Name', type: 'string', defaultValue: 'autosave' },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'save.loadSlot',
    title: 'Load Game Slot',
    category: 'Audio & UI',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'slot', label: 'Slot Name', type: 'string', defaultValue: 'autosave' },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
  },
  {
    type: 'platform.ad',
    title: 'Show Rewarded / Interstitial Ad',
    category: 'Audio & UI',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'rewarded', label: 'Rewarded', type: 'boolean', defaultValue: false },
    ],
    outputs: [
      { id: 'completed', label: 'Completed', type: 'exec' },
      { id: 'success', label: 'Success', type: 'boolean' },
    ],
  },
  // === Hierarchy & Component Nodes (v2.5) ===
  {
    type: 'entity.findByName',
    title: 'Find Entity By Name',
    category: 'Entity',
    pure: true,
    inputs: [{ id: 'name', label: 'Name', type: 'string', defaultValue: '' }],
    outputs: [
      { id: 'entity', label: 'Entity', type: 'entity' },
      { id: 'found', label: 'Found', type: 'boolean' },
    ],
    keywords: 'find entity name search lookup reference',
  },
  {
    type: 'entity.findByComponent',
    title: 'Find Entity By Component',
    category: 'Entity',
    pure: true,
    inputs: [{ id: 'componentType', label: 'Component Type', type: 'string', defaultValue: 'light' }],
    outputs: [
      { id: 'entity', label: 'First Entity', type: 'entity' },
      { id: 'entities', label: 'All Entities', type: 'array' },
      { id: 'count', label: 'Count', type: 'number' },
    ],
    keywords: 'find entity type component light collider audio behavior',
  },
  {
    type: 'entity.getParent',
    title: 'Get Parent Entity',
    category: 'Entity',
    pure: true,
    inputs: [{ id: 'entity', label: 'Entity', type: 'entity', defaultValue: '' }],
    outputs: [
      { id: 'parent', label: 'Parent', type: 'entity' },
      { id: 'hasParent', label: 'Has Parent', type: 'boolean' },
    ],
    keywords: 'parent hierarchy transform root',
  },
  {
    type: 'entity.getChildByName',
    title: 'Get Child By Name',
    category: 'Entity',
    pure: true,
    inputs: [
      { id: 'entity', label: 'Parent Entity', type: 'entity', defaultValue: '' },
      { id: 'name', label: 'Child Name', type: 'string', defaultValue: '' },
    ],
    outputs: [
      { id: 'child', label: 'Child', type: 'entity' },
      { id: 'found', label: 'Found', type: 'boolean' },
    ],
    keywords: 'child hierarchy find nested subentity',
  },
  {
    type: 'entity.getChildren',
    title: 'Get Children',
    category: 'Entity',
    pure: true,
    inputs: [{ id: 'entity', label: 'Parent Entity', type: 'entity', defaultValue: '' }],
    outputs: [
      { id: 'children', label: 'Children', type: 'array' },
      { id: 'count', label: 'Count', type: 'number' },
    ],
    keywords: 'children hierarchy array list subentities',
  },
  {
    type: 'entity.hasComponent',
    title: 'Has Component',
    category: 'Entity',
    pure: true,
    inputs: [
      { id: 'entity', label: 'Entity', type: 'entity', defaultValue: '' },
      { id: 'componentType', label: 'Component Type', type: 'string', defaultValue: 'light' },
    ],
    outputs: [{ id: 'result', label: 'Has Component', type: 'boolean' }],
    keywords: 'has component check type',
  },
  {
    type: 'entity.getComponentProp',
    title: 'Get Component Property',
    category: 'Entity',
    pure: true,
    inputs: [
      { id: 'entity', label: 'Entity', type: 'entity', defaultValue: '' },
      { id: 'componentType', label: 'Component Type', type: 'string', defaultValue: 'light' },
      { id: 'property', label: 'Property', type: 'string', defaultValue: 'intensity' },
      { id: 'fallback', label: 'Fallback', type: 'any', defaultValue: '' },
    ],
    outputs: [
      { id: 'value', label: 'Value', type: 'any' },
      { id: 'found', label: 'Found', type: 'boolean' },
    ],
    keywords: 'get component property field read',
  },
  {
    type: 'entity.setComponentProp',
    title: 'Set Component Property',
    category: 'Entity',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'entity', label: 'Entity', type: 'entity', defaultValue: '' },
      { id: 'componentType', label: 'Component Type', type: 'string', defaultValue: 'light' },
      { id: 'property', label: 'Property', type: 'string', defaultValue: 'intensity' },
      { id: 'value', label: 'Value', type: 'any', defaultValue: '' },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
    keywords: 'set component property field write modify',
  },

  // === Collections: Array, Map, Object, Enum (v2.5) ===
  {
    type: 'array.make',
    title: 'Make Array',
    category: 'Collections',
    pure: true,
    inputs: [{ id: 'itemsJson', label: 'JSON / CSV', type: 'string', defaultValue: '[]' }],
    outputs: [{ id: 'array', label: 'Array', type: 'array' }],
    keywords: 'array list create make',
  },
  {
    type: 'array.get',
    title: 'Array Get',
    category: 'Collections',
    pure: true,
    inputs: [
      { id: 'array', label: 'Array', type: 'array' },
      { id: 'index', label: 'Index', type: 'number', defaultValue: 0 },
    ],
    outputs: [{ id: 'value', label: 'Item', type: 'any' }],
    keywords: 'array get index element',
  },
  {
    type: 'array.set',
    title: 'Array Set',
    category: 'Collections',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'array', label: 'Array', type: 'array' },
      { id: 'index', label: 'Index', type: 'number', defaultValue: 0 },
      { id: 'value', label: 'Value', type: 'any', defaultValue: '' },
    ],
    outputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'array', label: 'Array', type: 'array' },
    ],
    keywords: 'array set replace index',
  },
  {
    type: 'array.push',
    title: 'Array Push',
    category: 'Collections',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'array', label: 'Array', type: 'array' },
      { id: 'value', label: 'Item', type: 'any', defaultValue: '' },
    ],
    outputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'array', label: 'Array', type: 'array' },
      { id: 'length', label: 'Length', type: 'number' },
    ],
    keywords: 'array push append add item',
  },
  {
    type: 'array.removeAt',
    title: 'Array Remove At',
    category: 'Collections',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'array', label: 'Array', type: 'array' },
      { id: 'index', label: 'Index', type: 'number', defaultValue: 0 },
    ],
    outputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'array', label: 'Array', type: 'array' },
      { id: 'removed', label: 'Removed', type: 'any' },
    ],
    keywords: 'array remove delete splice index',
  },
  {
    type: 'array.length',
    title: 'Array Length',
    category: 'Collections',
    pure: true,
    inputs: [{ id: 'array', label: 'Array', type: 'array' }],
    outputs: [{ id: 'length', label: 'Length', type: 'number' }],
    keywords: 'array length count size',
  },
  {
    type: 'array.contains',
    title: 'Array Contains',
    category: 'Collections',
    pure: true,
    inputs: [
      { id: 'array', label: 'Array', type: 'array' },
      { id: 'value', label: 'Item', type: 'any', defaultValue: '' },
    ],
    outputs: [
      { id: 'result', label: 'Contains', type: 'boolean' },
      { id: 'index', label: 'Index', type: 'number' },
    ],
    keywords: 'array contains includes find index',
  },
  {
    type: 'array.forEach',
    title: 'For Each (Array)',
    category: 'Collections',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'array', label: 'Array', type: 'array' },
    ],
    outputs: [
      { id: 'loopBody', label: 'Loop Body', type: 'exec' },
      { id: 'element', label: 'Element', type: 'any' },
      { id: 'index', label: 'Index', type: 'number' },
      { id: 'completed', label: 'Completed', type: 'exec' },
    ],
    keywords: 'array foreach loop iterate elements',
  },
  {
    type: 'map.make',
    title: 'Make Map',
    category: 'Collections',
    pure: true,
    inputs: [{ id: 'json', label: 'Initial JSON', type: 'string', defaultValue: '{}' }],
    outputs: [{ id: 'map', label: 'Map', type: 'map' }],
    keywords: 'map dictionary create make',
  },
  {
    type: 'map.get',
    title: 'Map Get',
    category: 'Collections',
    pure: true,
    inputs: [
      { id: 'map', label: 'Map', type: 'map' },
      { id: 'key', label: 'Key', type: 'string', defaultValue: '' },
      { id: 'fallback', label: 'Fallback', type: 'any', defaultValue: '' },
    ],
    outputs: [
      { id: 'value', label: 'Value', type: 'any' },
      { id: 'hasKey', label: 'Has Key', type: 'boolean' },
    ],
    keywords: 'map dictionary get lookup key',
  },
  {
    type: 'map.set',
    title: 'Map Set',
    category: 'Collections',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'map', label: 'Map', type: 'map' },
      { id: 'key', label: 'Key', type: 'string', defaultValue: '' },
      { id: 'value', label: 'Value', type: 'any', defaultValue: '' },
    ],
    outputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'map', label: 'Map', type: 'map' },
    ],
    keywords: 'map dictionary set put key value',
  },
  {
    type: 'map.delete',
    title: 'Map Delete',
    category: 'Collections',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'map', label: 'Map', type: 'map' },
      { id: 'key', label: 'Key', type: 'string', defaultValue: '' },
    ],
    outputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'map', label: 'Map', type: 'map' },
    ],
    keywords: 'map dictionary delete remove key',
  },
  {
    type: 'map.keys',
    title: 'Map Keys',
    category: 'Collections',
    pure: true,
    inputs: [{ id: 'map', label: 'Map', type: 'map' }],
    outputs: [
      { id: 'keys', label: 'Keys', type: 'array' },
      { id: 'size', label: 'Size', type: 'number' },
    ],
    keywords: 'map keys size count',
  },
  {
    type: 'object.make',
    title: 'Make Object',
    category: 'Collections',
    pure: true,
    inputs: [{ id: 'json', label: 'JSON', type: 'string', defaultValue: '{}' }],
    outputs: [{ id: 'object', label: 'Object', type: 'object' }],
    keywords: 'object struct json create',
  },
  {
    type: 'object.getField',
    title: 'Get Object Field',
    category: 'Collections',
    pure: true,
    inputs: [
      { id: 'object', label: 'Object', type: 'object' },
      { id: 'field', label: 'Field', type: 'string', defaultValue: '' },
      { id: 'fallback', label: 'Fallback', type: 'any', defaultValue: '' },
    ],
    outputs: [{ id: 'value', label: 'Value', type: 'any' }],
    keywords: 'object struct property get field',
  },
  {
    type: 'object.setField',
    title: 'Set Object Field',
    category: 'Collections',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'object', label: 'Object', type: 'object' },
      { id: 'field', label: 'Field', type: 'string', defaultValue: '' },
      { id: 'value', label: 'Value', type: 'any', defaultValue: '' },
    ],
    outputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'object', label: 'Object', type: 'object' },
    ],
    keywords: 'object struct property set field',
  },
  {
    type: 'object.toJson',
    title: 'To JSON String',
    category: 'Collections',
    pure: true,
    inputs: [{ id: 'value', label: 'Value', type: 'any' }],
    outputs: [{ id: 'json', label: 'JSON', type: 'string' }],
    keywords: 'json stringify serialize object array map',
  },
  {
    type: 'object.fromJson',
    title: 'Parse JSON',
    category: 'Collections',
    pure: true,
    inputs: [{ id: 'json', label: 'JSON', type: 'string', defaultValue: '{}' }],
    outputs: [
      { id: 'value', label: 'Value', type: 'any' },
      { id: 'ok', label: 'Valid', type: 'boolean' },
    ],
    keywords: 'json parse deserialize object array map',
  },
  {
    type: 'enum.switch',
    title: 'Switch on Enum / String',
    category: 'Collections',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'value', label: 'Enum', type: 'enum', defaultValue: '' },
      { id: 'case0', label: 'Case 0', type: 'string', defaultValue: 'Idle' },
      { id: 'case1', label: 'Case 1', type: 'string', defaultValue: 'Patrol' },
      { id: 'case2', label: 'Case 2', type: 'string', defaultValue: 'Chase' },
      { id: 'case3', label: 'Case 3', type: 'string', defaultValue: 'Attack' },
    ],
    outputs: [
      { id: 'out0', label: 'Case 0', type: 'exec' },
      { id: 'out1', label: 'Case 1', type: 'exec' },
      { id: 'out2', label: 'Case 2', type: 'exec' },
      { id: 'out3', label: 'Case 3', type: 'exec' },
      { id: 'default', label: 'Default', type: 'exec' },
    ],
    keywords: 'enum switch branch state machine match',
  },
  {
    type: 'enum.equals',
    title: 'Enum Equals',
    category: 'Collections',
    pure: true,
    inputs: [
      { id: 'a', label: 'Enum A', type: 'enum', defaultValue: '' },
      { id: 'b', label: 'Value B', type: 'string', defaultValue: '' },
    ],
    outputs: [{ id: 'result', label: 'Equal', type: 'boolean' }],
    keywords: 'enum equals compare state',
  },

  {
    type: 'entity.hasTag',
    title: 'Has Tag',
    category: 'Entity',
    pure: true,
    inputs: [
      { id: 'entity', label: 'Entity', type: 'entity', defaultValue: '' },
      { id: 'tag', label: 'Tag', type: 'string', defaultValue: 'enemy' },
    ],
    outputs: [{ id: 'result', label: 'Has Tag', type: 'boolean' }],
    keywords: 'tag check has entity label',
  },
  {
    type: 'entity.getTags',
    title: 'Get Entity Tags',
    category: 'Entity',
    pure: true,
    inputs: [{ id: 'entity', label: 'Entity', type: 'entity', defaultValue: '' }],
    outputs: [
      { id: 'tags', label: 'Tags', type: 'array' },
      { id: 'count', label: 'Count', type: 'number' },
    ],
    keywords: 'tags list array get entity',
  },
  {
    type: 'entity.addTag',
    title: 'Add Tag',
    category: 'Entity',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'entity', label: 'Entity', type: 'entity', defaultValue: '' },
      { id: 'tag', label: 'Tag', type: 'string', defaultValue: 'enemy' },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
    keywords: 'add tag entity label',
  },
  {
    type: 'entity.removeTag',
    title: 'Remove Tag',
    category: 'Entity',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'entity', label: 'Entity', type: 'entity', defaultValue: '' },
      { id: 'tag', label: 'Tag', type: 'string', defaultValue: 'enemy' },
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
    keywords: 'remove delete tag entity label',
  },

]

export const GRAPH_NODE_MAP: Record<string, GraphNodeSpec> = Object.fromEntries(
  GRAPH_NODE_CATALOG.map((s) => [s.type, s]),
)

export function getNodePins(
  node: GraphNode,
  graph: EventGraphData,
  currentFn?: GraphFunction,
): { title: string; category: GraphNodeSpec['category']; inputs: GraphPinDef[]; outputs: GraphPinDef[] } {
  const spec = GRAPH_NODE_MAP[node.type]
  if (node.type === 'var.get') {
    const v = graph.variables.find((x) => x.id === node.config?.varId)
    return {
      title: v ? `Get ${v.name}` : 'Get Variable',
      category: 'Variables',
      inputs: [],
      outputs: [{ id: 'value', label: v?.name ?? 'Value', type: v?.type ?? 'any' }],
    }
  }
  if (node.type === 'var.set') {
    const v = graph.variables.find((x) => x.id === node.config?.varId)
    return {
      title: v ? `Set ${v.name}` : 'Set Variable',
      category: 'Variables',
      inputs: [
        { id: 'exec', label: '', type: 'exec' },
        { id: 'value', label: v?.name ?? 'Value', type: v?.type ?? 'any', defaultValue: v?.defaultValue ?? 0 },
      ],
      outputs: [
        { id: 'exec', label: '', type: 'exec' },
        { id: 'value', label: 'Value', type: v?.type ?? 'any' },
      ],
    }
  }
  if (node.type === 'func.entry') {
    const fn = currentFn ?? graph.functions.find((f) => f.id === node.config?.fnId)
    return {
      title: fn ? `Function: ${fn.name}` : 'Function Entry',
      category: 'Functions',
      inputs: [],
      outputs: [
        { id: 'exec', label: '', type: 'exec' },
        ...(fn?.inputs ?? []).map((p) => ({ id: p.id, label: p.name, type: p.type as PinType })),
      ],
    }
  }
  if (node.type === 'func.return') {
    const fn = currentFn ?? graph.functions.find((f) => f.id === node.config?.fnId)
    return {
      title: 'Return',
      category: 'Functions',
      inputs: [
        { id: 'exec', label: '', type: 'exec' },
        ...(fn?.outputs ?? []).map((p) => ({ id: p.id, label: p.name, type: p.type as PinType })),
      ],
      outputs: [],
    }
  }
  if (node.type === 'func.call') {
    const fn = graph.functions.find((f) => f.id === node.config?.fnId)
    return {
      title: fn ? `Call ${fn.name}()` : 'Call Function',
      category: 'Functions',
      inputs: [
        { id: 'exec', label: '', type: 'exec' },
        ...(fn?.inputs ?? []).map((p) => ({ id: p.id, label: p.name, type: p.type as PinType })),
      ],
      outputs: [
        { id: 'exec', label: '', type: 'exec' },
        ...(fn?.outputs ?? []).map((p) => ({ id: p.id, label: p.name, type: p.type as PinType })),
      ],
    }
  }
  if (!spec) {
    return { title: node.type, category: 'Flow', inputs: [], outputs: [] }
  }
  let title = spec.title
  if (node.type === 'math.op' && node.config?.op) title = `Math (${node.config.op})`
  if (node.type === 'logic.compare' && node.config?.op) title = `Compare (${node.config.op})`
  if (node.type === 'logic.bool' && node.config?.op) title = `Logic (${node.config.op})`
  if (node.type === 'vec3.math' && node.config?.op) title = `Vec3 (${node.config.op})`
  return {
    title,
    category: spec.category,
    inputs: spec.inputs,
    outputs: spec.outputs,
  }
}

export function makeDefaultEventGraph(): EventGraphData {
  return {
    version: 1,
    variables: [
      { id: 'var-count', name: 'Count', type: 'number', defaultValue: 0, exposed: true, scope: 'local' },
    ],
    functions: [],
    nodes: [
      { id: 'n-start', type: 'event.start', x: 80, y: 120 },
      {
        id: 'n-print',
        type: 'flow.print',
        x: 360,
        y: 120,
        inputs: { value: 'Event Graph ready!' },
      },
    ],
    edges: [
      { id: 'e-1', fromNode: 'n-start', fromPin: 'exec', toNode: 'n-print', toPin: 'exec' },
    ],
  }
}

export function parseEventGraph(raw?: string): EventGraphData {
  try {
    const parsed = JSON.parse(raw || '')
    if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
      return {
        version: 1,
        variables: Array.isArray(parsed.variables) ? parsed.variables : [],
        functions: Array.isArray(parsed.functions) ? parsed.functions : [],
        nodes: parsed.nodes,
        edges: parsed.edges,
      }
    }
  } catch {
    /* fallback to default */
  }
  return makeDefaultEventGraph()
}

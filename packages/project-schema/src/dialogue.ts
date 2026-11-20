// Dialogue & Quest Graph schema for Miniforge Engine v2.0

export type DialogueNodeType = 'start' | 'line' | 'condition' | 'action' | 'end'

export interface DialogueChoice {
  id: string
  text: string
  nextNodeId: string
  conditionKey?: string
  conditionOp?: '==' | '!=' | '>' | '>=' | '<' | '<='
  conditionValue?: string | number | boolean
}

export interface DialogueNode {
  id: string
  type: DialogueNodeType
  x: number
  y: number
  speaker?: string
  text?: string
  nextNodeId?: string
  // For 'line' nodes with branching answers
  choices?: DialogueChoice[]
  // For 'condition' nodes
  conditionScope?: 'worldState' | 'vars' | 'quest'
  conditionKey?: string
  conditionOp?: '==' | '!=' | '>' | '>=' | '<' | '<='
  conditionValue?: string | number | boolean
  trueNodeId?: string
  falseNodeId?: string
  // For 'action' nodes (quests, vars, events)
  actionKind?: 'setQuest' | 'setWorldState' | 'setVar' | 'addVar' | 'emitEvent'
  actionKey?: string
  actionValue?: string | number | boolean
}

export interface QuestDef {
  id: string
  title: string
  description: string
  defaultStatus: 'inactive' | 'active' | 'completed' | 'failed'
}

export interface DialogueGraphData {
  version: 1
  title: string
  quests: QuestDef[]
  nodes: DialogueNode[]
}

export function makeDefaultDialogueGraph(): DialogueGraphData {
  return {
    version: 1,
    title: 'NPC Dialogue',
    quests: [
      {
        id: 'quest_intro',
        title: 'Поговорить со старожилом',
        description: 'Узнать новости в посёлке.',
        defaultStatus: 'inactive',
      },
    ],
    nodes: [
      { id: 'd-start', type: 'start', x: 60, y: 120, nextNodeId: 'd-line-1' },
      {
        id: 'd-line-1',
        type: 'line',
        x: 290,
        y: 100,
        speaker: 'Сосед Петрович',
        text: 'Здорово! Выручишь с одним делом?',
        choices: [
          { id: 'c-1', text: 'Конечно, рассказывай', nextNodeId: 'd-act-1' },
          { id: 'c-2', text: 'Позже зайду', nextNodeId: 'd-end' },
        ],
      },
      {
        id: 'd-act-1',
        type: 'action',
        x: 590,
        y: 60,
        actionKind: 'setQuest',
        actionKey: 'quest_intro',
        actionValue: 'active',
        nextNodeId: 'd-end',
      },
      { id: 'd-end', type: 'end', x: 860, y: 140 },
    ],
  }
}

export function parseDialogueGraph(raw?: string): DialogueGraphData {
  try {
    const parsed = JSON.parse(raw || '')
    if (parsed && Array.isArray(parsed.nodes)) {
      return {
        version: 1,
        title: String(parsed.title || 'Dialogue'),
        quests: Array.isArray(parsed.quests) ? parsed.quests : [],
        nodes: parsed.nodes,
      }
    }
  } catch {
    /* fallback */
  }
  return makeDefaultDialogueGraph()
}

import {
  DEFAULT_DIALOGUE_SCREEN_ID,
  parseDialogueGraph,
  parseDbJson,
  parseDbPathText,
  type DialogueChoice,
  type DialogueGraphData,
  type DialogueNode,
  type Project,
  type UIElement,
} from '../../project-schema/src'
import type { GameAPI } from './types'

export interface DialogueAPI {
  start(assetId: string): boolean
  stop(): void
  isOpen(): boolean
  getQuestStatus(questId: string): string
  setQuestStatus(questId: string, status: 'inactive' | 'active' | 'completed' | 'failed'): void
  listQuests(): Record<string, string>
}

function evalCond(
  actual: any,
  op: string | undefined,
  expected: any,
): boolean {
  const o = op || '=='
  if (o === '==') return actual == expected
  if (o === '!=') return actual != expected
  if (o === '>') return Number(actual) > Number(expected)
  if (o === '>=') return Number(actual) >= Number(expected)
  if (o === '<') return Number(actual) < Number(expected)
  if (o === '<=') return Number(actual) <= Number(expected)
  return false
}

export function createDialogueRuntime(project: Project, getApi: () => GameAPI): DialogueAPI {
  let activeGraph: DialogueGraphData | null = null
  let currentNodeId: string | null = null
  let currentNode: DialogueNode | null = null
  let currentChoices: DialogueChoice[] = []
  let activeScreenId: string | null = null
  let unsubs: (() => void)[] = []
  let choiceUnsubs: (() => void)[] = []
  let spawnedChoiceIds: string[] = []
  let boxEl: HTMLElement | null = null

  const getQuestStatus = (questId: string) => {
    const api = getApi()
    const quests = (api.worldState.get('__quests', {}) as Record<string, string>) || {}
    return quests[questId] ?? 'inactive'
  }

  const setQuestStatus = (questId: string, status: 'inactive' | 'active' | 'completed' | 'failed') => {
    const api = getApi()
    const quests = { ...((api.worldState.get('__quests', {}) as Record<string, string>) || {}) }
    quests[questId] = status
    api.worldState.set('__quests', quests)
    api.events.emit('quest.updated', { questId, status })
  }

  const listQuests = () => {
    const api = getApi()
    return { ...((api.worldState.get('__quests', {}) as Record<string, string>) || {}) }
  }

  const removeBox = () => {
    if (boxEl) {
      boxEl.remove()
      boxEl = null
    }
  }

  const clearChoiceListeners = () => {
    for (const off of choiceUnsubs) off()
    choiceUnsubs = []
  }

  const clearSpawnedChoices = () => {
    if (!spawnedChoiceIds.length) return
    const api = getApi()
    for (const id of spawnedChoiceIds) api.ui.removeWidget(id)
    spawnedChoiceIds = []
  }

  const clearListeners = () => {
    clearChoiceListeners()
    for (const off of unsubs) off()
    unsubs = []
  }

  const resolveDialogueScreen = (): string | null => {
    const pref = String(project.settings?.dialogueScreen ?? '').trim()
    if (pref === 'builtin') return null
    const screens = project.screens || []
    let screen = pref
      ? screens.find((s) => s.phase === 'window' && (s.id === pref || s.name === pref))
      : screens.find((s) => s.phase === 'window' && s.id === DEFAULT_DIALOGUE_SCREEN_ID)
    if (!screen) return null
    const widgets = project.ui.filter((u) => u.screen === screen!.id)
    const hasDialogueBinding = widgets.some(
      (u) =>
        u.id === 'dialogue_text' ||
        u.id.endsWith('_dialogue_text') ||
        u.type === 'html',
    )
    return hasDialogueBinding ? screen.id : null
  }

  const findWidget = (widgets: UIElement[], exactId: string, eventName?: string): UIElement | undefined =>
    widgets.find((u) => u.id === exactId) ||
    widgets.find((u) => u.id.endsWith('_' + exactId)) ||
    (eventName ? widgets.find((u) => u.type === 'button' && u.action === 'event' && u.event === eventName) : undefined)

  const stop = () => {
    activeGraph = null
    currentNodeId = null
    currentNode = null
    currentChoices = []
    clearListeners()
    clearSpawnedChoices()
    removeBox()
    const api = getApi()
    if (activeScreenId) {
      if (api.ui.current() === activeScreenId) api.ui.close()
      activeScreenId = null
    }
    api.input.setModal(false)
    api.events.emit('dialogue.ended', {})
  }

  const readScopeVal = (scope: string | undefined, key: string) => {
    const api = getApi()
    if (scope === 'quest') return getQuestStatus(key)
    if (scope === 'vars') return api.vars[key]
    return api.worldState.get(key)
  }

  const bindScreenEvents = () => {
    clearListeners()
    const api = getApi()
    unsubs.push(
      api.events.on('dialogue.next', () => {
        if (!currentNode) return
        if (currentNode.nextNodeId) stepTo(currentNode.nextNodeId)
        else stop()
      }),
    )
    unsubs.push(
      api.events.on('dialogue.close', () => {
        stop()
      }),
    )

    unsubs.push(
      api.events.on('dialogue.choice', (payload: any) => {
        if (!currentChoices.length) return
        if (typeof payload === 'number') {
          const ch = currentChoices[payload]
          if (ch) stepTo(ch.nextNodeId)
          return
        }
        const idx = typeof payload?.index === 'number' ? payload.index : -1
        const ch =
          (idx >= 0 ? currentChoices[idx] : undefined) ||
          currentChoices.find((c) => c.id === payload?.id)
        if (ch) stepTo(ch.nextNodeId)
      }),
    )
  }

  const renderLineOnScreen = (screenId: string, node: DialogueNode, choices: DialogueChoice[]) => {
    const api = getApi()
    clearChoiceListeners()
    clearSpawnedChoices()

    // Bind dynamic choice listeners for ANY number of choices (unlimited)
    for (let i = 0; i < choices.length; i++) {
      const idx = i
      choiceUnsubs.push(
        api.events.on(`dialogue.choose.${idx}`, () => {
          const ch = currentChoices[idx]
          if (ch) stepTo(ch.nextNodeId)
        }),
      )
    }

    const widgets = api.ui.getWidgets(screenId) as UIElement[]
    const speakerEl = findWidget(widgets, 'dialogue_speaker')
    const textEl = findWidget(widgets, 'dialogue_text')
    const nextEl = findWidget(widgets, 'dialogue_next', 'dialogue.next')
    const choicesContainer = findWidget(widgets, 'dialogue_choices')

    if (speakerEl) api.ui.setText(speakerEl.id, node.speaker || 'NPC')
    if (textEl) api.ui.setText(textEl.id, node.text || '')

    if (choicesContainer && choicesContainer.type === 'container') {
      const templateBtn =
        findWidget(widgets, 'dialogue_choice_template') ||
        widgets.find((u) => u.parentId === choicesContainer.id && u.type === 'button')
      if (templateBtn) api.ui.setVisible(templateBtn.id, false)

      if (choices.length > 0) {
        api.ui.setVisible(choicesContainer.id, true)
        for (let i = 0; i < choices.length; i++) {
          const ch = choices[i]
          const wid = `__dlg_ch_${i}`
          api.ui.createWidget({
            id: wid,
            screen: screenId,
            parentId: choicesContainer.id,
            type: 'button',
            text: ch.text || '…',
            action: 'event',
            event: `dialogue.choose.${i}`,
            anchor: 'top-left',
            x: 0,
            y: 0,
            background: templateBtn?.background ?? '#222c38',
            color: templateBtn?.color ?? '#ffffff',
            fontSize: templateBtn?.fontSize ?? 14,
            align: templateBtn?.align ?? 'left',
            borderRadius: templateBtn?.borderRadius ?? 6,
            borderColor: templateBtn?.borderColor,
            backdropBlur: templateBtn?.backdropBlur,
            zIndex: (templateBtn?.zIndex ?? (choicesContainer.zIndex ?? 3)) + 1,
            visible: true,
          })
          spawnedChoiceIds.push(wid)
        }
      } else {
        api.ui.setVisible(choicesContainer.id, false)
      }
    } else {
      // Fallback for custom screens using static numbered buttons (dialogue_choice_1, dialogue_choice_2, ...)
      const maxSlots = Math.max(choices.length, 12)
      for (let i = 0; i < maxSlots; i++) {
        const choiceEl = findWidget(widgets, `dialogue_choice_${i + 1}`, `dialogue.choose.${i}`)
        if (!choiceEl) continue
        const ch = choices[i]
        if (ch) {
          api.ui.setText(choiceEl.id, ch.text || '…')
          api.ui.setVisible(choiceEl.id, true)
        } else {
          api.ui.setVisible(choiceEl.id, false)
        }
      }
    }

    if (nextEl) {
      if (choices.length > 0) {
        api.ui.setVisible(nextEl.id, false)
      } else {
        api.ui.setText(nextEl.id, node.nextNodeId ? 'Далее →' : 'Закрыть')
        api.ui.setVisible(nextEl.id, true)
      }
    }
    if (api.ui.current() !== screenId) api.ui.open(screenId)
  }

  const renderLineBuiltin = (node: DialogueNode, choices: DialogueChoice[]) => {
    removeBox()
    const wrap = document.createElement('div')
    wrap.style.cssText =
      'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);width:min(680px,92vw);' +
      'background:rgba(16,21,28,0.94);border:1px solid rgba(243,160,93,0.45);border-radius:10px;' +
      'padding:16px 20px;color:#edf2f7;font-family:Inter,system-ui,sans-serif;z-index:9999;' +
      'box-shadow:0 16px 40px rgba(0,0,0,0.55);backdrop-filter:blur(6px);'

    const sp = document.createElement('div')
    sp.textContent = node.speaker || 'NPC'
    sp.style.cssText = 'font-weight:700;font-size:13px;color:#f3a05d;margin-bottom:6px;letter-spacing:0.03em;'
    wrap.appendChild(sp)

    const txt = document.createElement('div')
    txt.textContent = node.text || ''
    txt.style.cssText = 'font-size:15px;line-height:1.5;margin-bottom:14px;'
    wrap.appendChild(txt)

    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex;flex-direction:column;gap:6px;'

    if (choices.length > 0) {
      for (const ch of choices) {
        const btn = document.createElement('button')
        btn.textContent = ch.text || '…'
        btn.style.cssText =
          'text-align:left;padding:8px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.16);' +
          'background:rgba(255,255,255,0.06);color:#fff;cursor:pointer;font-size:13.5px;'
        btn.onclick = () => stepTo(ch.nextNodeId)
        actions.appendChild(btn)
      }
    } else {
      const btn = document.createElement('button')
      btn.textContent = node.nextNodeId ? 'Далее →' : 'Закрыть'
      btn.style.cssText =
        'align-self:flex-end;padding:7px 14px;border-radius:6px;border:none;background:#f3a05d;' +
        'color:#141920;font-weight:700;cursor:pointer;font-size:13px;'
      btn.onclick = () => (node.nextNodeId ? stepTo(node.nextNodeId) : stop())
      actions.appendChild(btn)
    }
    wrap.appendChild(actions)
    document.body.appendChild(wrap)
    boxEl = wrap
  }

  const stepTo = (nodeId?: string, guard = 0) => {
    if (!activeGraph || !nodeId || guard > 64) {
      stop()
      return
    }
    const node = activeGraph.nodes.find((n) => n.id === nodeId)
    if (!node || node.type === 'end') {
      stop()
      return
    }
    currentNodeId = node.id
    currentNode = node
    const api = getApi()

    if (node.type === 'start') {
      stepTo(node.nextNodeId, guard + 1)
      return
    }
    if (node.type === 'condition') {
      const actual = readScopeVal(node.conditionScope, String(node.conditionKey || ''))
      const pass = evalCond(actual, node.conditionOp, node.conditionValue)
      stepTo(pass ? node.trueNodeId : node.falseNodeId, guard + 1)
      return
    }
    if (node.type === 'action') {
      const k = String(node.actionKey || '')
      if (node.actionKind === 'setQuest' && k) {
        setQuestStatus(k, (String(node.actionValue || 'active') as any))
      } else if (node.actionKind === 'setWorldState' && k) {
        api.worldState.set(k, node.actionValue)
      } else if (node.actionKind === 'setVar' && k) {
        api.vars[k] = node.actionValue
      } else if (node.actionKind === 'addVar' && k) {
        api.vars[k] = (Number(api.vars[k]) || 0) + (Number(node.actionValue) || 0)
      } else if (node.actionKind === 'setDbValue') {
        const db = node.actionDbId ?? ''
        const row = node.actionDbRow ?? ''
        const path = node.actionDbPath ?? ''
        const segments = parseDbPathText(path)
        const value = parseDbJson(node.actionDbJson ?? 'null')
        if (segments === undefined || value === undefined || !api.db.set(db, row, segments, value)) {
          api.events.emit('db.error', { db, row, path, error: 'Check the database, row, field path and JSON value.' })
        }
      } else if (node.actionKind === 'emitEvent' && k) {
        api.events.emit(k, node.actionValue)
      }
      stepTo(node.nextNodeId, guard + 1)
      return
    }
    if (node.type === 'line') {
      const choices: DialogueChoice[] = (node.choices || []).filter((ch) => {
        if (!ch.conditionKey) return true
        const actual = api.worldState.get(ch.conditionKey, api.vars[ch.conditionKey])
        return evalCond(actual, ch.conditionOp, ch.conditionValue)
      })
      currentChoices = choices
      api.events.emit('dialogue.line', {
        nodeId: node.id,
        speaker: node.speaker || 'NPC',
        text: node.text || '',
        choices: choices.map((c, index) => ({ id: c.id, index, text: c.text })),
        hasNext: Boolean(node.nextNodeId),
      })
      if (activeScreenId) renderLineOnScreen(activeScreenId, node, choices)
      else renderLineBuiltin(node, choices)
    }
  }

  return {
    start(assetId: string) {
      const key = String(assetId || '').trim()
      const asset = project.assets.find((a) => a.type === 'dialogue' && (a.id === key || a.name === key))
      if (!asset) {
        const msg = `[Dialogue] Asset not found: "${key}"`
        console.warn(msg)
        return false
      }
      activeGraph = parseDialogueGraph(asset.data)
      // Initialize default quest statuses if unset
      for (const q of activeGraph.quests) {
        if (getQuestStatus(q.id) === 'inactive' && q.defaultStatus !== 'inactive') {
          setQuestStatus(q.id, q.defaultStatus)
        }
      }
      const startNode = activeGraph.nodes.find((n) => n.type === 'start') ?? activeGraph.nodes[0]
      if (!startNode) return false
      activeScreenId = resolveDialogueScreen()
      if (activeScreenId) bindScreenEvents()
      else clearListeners()
      getApi().input.setModal(true)
      try {
        if (typeof document !== 'undefined' && document.pointerLockElement) {
          document.exitPointerLock?.()
        }
      } catch {
        /* ignore */
      }
      getApi().events.emit('dialogue.started', { assetId })
      stepTo(startNode.id)
      return true
    },
    stop,
    isOpen: () => Boolean(activeGraph && currentNodeId),
    getQuestStatus,
    setQuestStatus,
    listQuests,
  }
}

// import { getDefaultStore } from 'jotai'
import {
  node_list,
  transition_list,
  automaton_type,
  initial_state,
  stage_ref,
  store,
} from './stores'
import { getTransitionPoints } from './editor'

let updateFromState = false
let unresolvedTransitions = []

function getTrustedOrigin() {
  return window.location.origin
}

function isTrustedParentMessage(event) {
  return event.origin === getTrustedOrigin() && event.source === window.parent
}

function buildNodeMap(nodes) {
  const nodeMap = []
  nodes.forEach((node) => {
    if (node?.id != null) {
      nodeMap[node.id] = node
    }
  })
  return nodeMap
}

function attachTransitionsToNodes(nodes, transitions) {
  transitions.forEach((transition) => {
    if (!transition) return

    const transitionRef = {
      from: transition.from,
      to: transition.to,
      id: transition.id,
    }

    if (nodes[transition.from]) {
      nodes[transition.from] = {
        ...nodes[transition.from],
        transitions: [...(nodes[transition.from].transitions || []), transitionRef],
      }
    }

    if (transition.from !== transition.to && nodes[transition.to]) {
      nodes[transition.to] = {
        ...nodes[transition.to],
        transitions: [...(nodes[transition.to].transitions || []), transitionRef],
      }
    }
  })
}

function buildTransitionAtoms(transitions, existingTransitions, nodesMap) {
  const transitionDrafts = []

  transitions.forEach((t) => {
    const existing =
      existingTransitions[t.id] ?? existingTransitions.find((tr) => tr && tr.id === t.id)
    const output = t.output ?? t.mealy_output ?? ''

    const labelFromParent =
      typeof t.input === 'string' && typeof output === 'string'
        ? `${t.input}/${output}`
        : (t.label ?? existing?.label ?? '0/0')

    const draft = existing
      ? {
          ...existing,
          label: labelFromParent,
          from: t.from,
          to: t.to,
        }
      : {
          id: t.id,
          from: t.from,
          to: t.to,
          label: labelFromParent,
          stroke: '#ffffffdd',
          strokeWidth: 2,
          fill: '#ffffffdd',
          points: [],
          tension: t.from === t.to ? 1 : 0.5,
          fontSize: 20,
          fontStyle: 'bold',
          label_fill: '#ffffff',
          label_align: 'center',
        }

    const wasChanged =
      !existing ||
      existing.from !== draft.from ||
      existing.to !== draft.to ||
      String(existing.label ?? '') !== String(draft.label ?? '')

    const nextRenderNonce = wasChanged
      ? Number(existing?.renderNonce ?? 0) + 1
      : Number(existing?.renderNonce ?? 0)

    transitionDrafts.push({
      ...draft,
      renderNonce: nextRenderNonce,
    })
  })

  const transitionMap = []
  transitionDrafts.forEach((transition) => {
    transitionMap[transition.id] = transition
  })

  transitionDrafts.forEach((transition) => {
    transitionMap[transition.id] = {
      ...transition,
      points: getTransitionPoints(
        transition.from,
        transition.to,
        transition.id,
        nodesMap,
        transitionMap,
      ),
    }
  })

  return transitionMap
}

function getRemovedTransitionIds(existingTransitions, transitionMap) {
  const nextIds = new Set(
    transitionMap.map((transition) => transition?.id).filter((id) => id != null),
  )

  return existingTransitions
    .map((transition) => transition?.id)
    .filter((id) => id != null && !nextIds.has(id))
}

function removeRenderedTransitions(transitionIds) {
  if (!transitionIds.length) return

  const stage = store.get(stage_ref)
  if (!stage) return

  transitionIds.forEach((id) => {
    const group = stage.findOne(`#tr_${id}`)
    group?.destroy()
  })

  stage.batchDraw()
}

function syncRenderedTransitions(transitionAtoms) {
  const stage = store.get(stage_ref)
  if (!stage) return

  transitionAtoms.forEach((transition) => {
    if (!transition) return

    const transitionShape = stage.findOne(`#transition_${transition.id}`)
    const labelShape = stage.findOne(`#tr_label${transition.id}`)
    const textShape = stage.findOne(`#trtext_${transition.id}`)
    const labelText = transition.label && transition.label.length > 0 ? transition.label : ''

    if (transitionShape) {
      transitionShape.points(transition.points)
      transitionShape.tension(transition.tension)
    }

    if (textShape) {
      textShape.text(labelText)
    }

    if (labelShape) {
      labelShape.x(transition.points[2] - 2 * labelText.length)
      labelShape.y(transition.points[3] - 10)
    }
  })

  stage.batchDraw()
}

function recomputeCommittedTransitionGeometry() {
  const nodes = store.get(node_list) ?? []
  const transitions = store.get(transition_list) ?? []
  const nodesMap = buildNodeMap(nodes)

  const recalculatedTransitions = transitions.map((transition) => {
    if (!transition) return transition

    return {
      ...transition,
      points: getTransitionPoints(
        transition.from,
        transition.to,
        transition.id,
        nodesMap,
        transitions,
      ),
    }
  })

  store.set(transition_list, recalculatedTransitions)
  return recalculatedTransitions
}

function normalizeTransitionForParent(transition) {
  const label = String(transition?.label ?? '')
  const [inputFromLabel = '', outputFromLabel = ''] = label.split('/')
  const input = String(transition?.input ?? inputFromLabel ?? '')
  const output = String(transition?.output ?? transition?.mealy_output ?? outputFromLabel ?? '')

  return {
    id: transition?.id ?? 0,
    from: transition?.from ?? 0,
    to: transition?.to ?? -1,
    toPattern: transition?.toPattern,
    input,
    output,
    mealy_output: output,
  }
}

// changed default store to store from stores.js since we have a custom store where editor / app.jsx data is saved
export function extractFsmData() {
  const nodes = store.get(node_list) ?? []
  const definedNodes = nodes.filter(Boolean)
  const transitions = (store.get(transition_list) ?? []).filter(
    (transition) => transition && !transition.isDraft,
  )
  const automatonType = store.get(automaton_type) ?? 'mealy'
  const nodeIds = new Set(definedNodes.map((n) => n?.id).filter((id) => id != null))

  const visibleTransitions = transitions.map((t) => normalizeTransitionForParent(t))
  const visibleTransitionIds = new Set(visibleTransitions.map((t) => t.id))
  const visibleTransitionKeys = new Set(visibleTransitions.map((t) => `${t.from}:${t.input}`))
  const preservedUnresolvedTransitions = unresolvedTransitions
    .map((t) => normalizeTransitionForParent(t))
    .filter((t) => {
      if (visibleTransitionIds.has(t.id)) return false
      if (visibleTransitionKeys.has(`${t.from}:${t.input}`)) return false
      if (!nodeIds.has(t.from)) return false
      if (typeof t.toPattern === 'string' && t.toPattern.length > 0) return true
      return nodeIds.has(t.to)
    })

  return {
    states: definedNodes.map((n) => ({
      id: n.id,
      name: n.name,
      initial: !!n.type?.initial,
      final: !!n.type?.final,
      moore_output: n.moore_output ?? '',
    })),
    transitions: [...visibleTransitions, ...preservedUnresolvedTransitions],
    automatonType,
  }
}

export function sendExportToMainState() {
  if (updateFromState) return

  const fsm = extractFsmData()
  window.parent.postMessage({ action: 'export', fsm }, getTrustedOrigin())
}

// import of state table data as automaton state data
// NEW: tried to make auto layout look like the fsm layout
window.addEventListener('message', (event) => {
  if (!isTrustedParentMessage(event)) return
  if (event.data?.action !== 'automatonimport') return

  const fsm = event.data.fsm
  if (!fsm) return

  const states = fsm.states ?? []
  const transitions = fsm.transitions ?? []
  const { automatonType = 'mealy' } = fsm

  const existingNodes = store.get(node_list) ?? []
  const nodeAtoms = []

  states.forEach((s, index) => {
    const existing = existingNodes[s.id]
    const moore_output = s.moore_output ?? existing?.moore_output ?? ''

    if (existing) {
      // auto layout only on new states
      nodeAtoms[s.id] = {
        ...existing,
        name: s.name ?? existing.name,
        moore_output,
        transitions: [],
        type: {
          ...existing.type,
          initial: !!s.initial,
          final: !!s.final,
        },
      }
      return
    }

    const col = index % 6
    const row = Math.floor(index / 6)
    const baseX = 150
    const baseY = 120
    const dx = 140
    const dy = 160

    const name = s.name ?? `q${s.id}`

    nodeAtoms[s.id] = {
      id: s.id,
      name,
      x: baseX + col * dx,
      y: baseY + row * dy,
      radius: name.length + 35,
      fill: '#ffffff80',
      moore_output,
      type: {
        initial: !!s.initial,
        intermediate: !s.initial,
        final: !!s.final,
      },
      transitions: [],
    }
  })

  const initialNode = states.find((state) => !!state?.initial)
  store.set(initial_state, initialNode?.id ?? null)

  const existingTransitions = store.get(transition_list) ?? []
  const renderableTransitions = transitions.filter((t) => {
    if (!t || typeof t !== 'object') return false
    if (typeof t.toPattern === 'string' && t.toPattern.length > 0) return false

    const fromExists = nodeAtoms.some((n) => n && n.id === t.from)
    const toExists = nodeAtoms.some((n) => n && n.id === t.to)
    return fromExists && toExists
  })
  unresolvedTransitions = transitions.filter((t) => !renderableTransitions.includes(t))
  attachTransitionsToNodes(nodeAtoms, renderableTransitions)

  updateFromState = true
  store.set(node_list, nodeAtoms)

  const nodesMap = buildNodeMap(nodeAtoms)
  const transitionAtoms = buildTransitionAtoms(renderableTransitions, existingTransitions, nodesMap)
  const removedTransitionIds = getRemovedTransitionIds(existingTransitions, transitionAtoms)

  // Force a deterministic remount of transition shapes after each import update.
  store.set(transition_list, [])
  store.set(automaton_type, automatonType)
  requestAnimationFrame(() => {
    removeRenderedTransitions(removedTransitionIds)
    store.set(transition_list, transitionAtoms)
    requestAnimationFrame(() => {
      const recalculatedTransitions = recomputeCommittedTransitionGeometry()
      requestAnimationFrame(() => {
        syncRenderedTransitions(recalculatedTransitions)
        updateFromState = false
      })
    })
  })
})

export function clearFsmFromParent() {
  store.set(node_list, [])
  store.set(transition_list, [])
  store.set(initial_state, null)
  unresolvedTransitions = []
}

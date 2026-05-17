// import { getDefaultStore } from 'jotai'
import { node_list, transition_list, fsm_type, initial_state, stage_ref, store } from './stores'
import { getTransitionPoints } from './editor'

let updateFromState = false
let unresolvedTransitions = []

function getTrustedOrigin() {
  return window.location.origin
}

function isTrustedParentMessage(event) {
  return event.origin === getTrustedOrigin() && event.source === window.parent
}

function normalizePatternBits(value, length, fill = 'x', align = 'left') {
  const source = String(value ?? '').replace(/-/g, 'x')
  if (length <= 0) return ''
  if (source.length >= length) {
    return align === 'left' ? source.slice(-length) : source.slice(0, length)
  }
  return align === 'left' ? source.padStart(length, fill) : source.padEnd(length, fill)
}

function resolveNodeIdByBinary(nodes, binaryId, nodeBitCount) {
  const normalized = normalizePatternBits(binaryId, nodeBitCount, 'x', 'left')
  if (!/^[01]+$/.test(normalized)) return -1

  const match = nodes.find((node) => {
    if (!node?.id && node?.id !== 0) return false
    const nodeBinary = Number(node.id).toString(2).padStart(nodeBitCount, '0')
    return nodeBinary === normalized
  })

  return match?.id ?? -1
}

function expandDontCares(pattern) {
  const normalized = String(pattern ?? '').replace(/-/g, 'x')
  if (!normalized) return []

  const expanded = []
  const walk = (current, index) => {
    if (index >= normalized.length) {
      expanded.push(current)
      return
    }

    const bit = normalized.charAt(index).toLowerCase()
    if (bit === 'x') {
      walk(`${current}0`, index + 1)
      walk(`${current}1`, index + 1)
      return
    }

    walk(`${current}${bit}`, index + 1)
  }

  walk('', 0)
  return expanded
}

function mergeBitPatterns(patterns, fallbackLength) {
  const normalizedPatterns = patterns.filter((pattern) => typeof pattern === 'string')
  const length = Math.max(fallbackLength, ...normalizedPatterns.map((pattern) => pattern.length))

  if (length <= 0) return ''
  if (!normalizedPatterns.length) return 'x'.repeat(length)

  const paddedPatterns = normalizedPatterns.map((pattern) =>
    normalizePatternBits(pattern, length, 'x', 'left'),
  )

  return Array.from({ length }, (_, index) => {
    const bit = paddedPatterns[0]?.charAt(index) ?? 'x'
    return paddedPatterns.every((pattern) => pattern.charAt(index) === bit) ? bit : 'x'
  }).join('')
}

/**
 * CUSTOM: compress a list of binary patterns (0/1 strings) into a smaller set
 * of patterns containing 'x' where possible by iteratively merging pairs that
 * differ in exactly one bit. This helps the editor display compact
 * transitions (e.g. 001 and 011 -> 0x1) while preserving grouping via groupId.
 */
function compressBinaryPatterns(patterns) {
  // work on unique patterns
  let set = Array.from(new Set(patterns.filter((p) => typeof p === 'string')))
  if (!set.length) return []

  const mergeTwo = (a, b) => {
    if (a.length !== b.length) return null
    let diffCount = 0
    const chars = []
    for (let i = 0; i < a.length; i++) {
      const ca = a.charAt(i)
      const cb = b.charAt(i)
      if (ca === cb) {
        chars.push(ca)
        continue
      }
      // if either is 'x', result is 'x' at this pos, don't count as concrete difference
      if (ca === 'x' || cb === 'x') {
        chars.push('x')
        continue
      }
      // both are concrete but different
      diffCount += 1
      if (diffCount > 1) return null
      chars.push('x')
    }
    return diffCount === 1 ? chars.join('') : null
  }

  let changed = true
  while (changed) {
    changed = false
    const used = new Array(set.length).fill(false)
    const next = []

    for (let i = 0; i < set.length; i++) {
      if (used[i]) continue
      let merged = false
      for (let j = i + 1; j < set.length; j++) {
        if (used[j]) continue
        const m = mergeTwo(set[i], set[j])
        if (m) {
          next.push(m)
          used[i] = true
          used[j] = true
          merged = true
          changed = true
          break
        }
      }
      if (!merged && !used[i]) {
        next.push(set[i])
      }
    }

    // remove duplicates
    set = Array.from(new Set(next))
  }

  return set
}

function getTransitionGroupKey(transition) {
  return transition?.groupId ?? transition?.id ?? 0
}

function getTransitionTargetPattern(transition, nodeBitCount, definedNodes) {
  if (typeof transition?.toBinaryId === 'string') {
    return normalizePatternBits(transition.toBinaryId, nodeBitCount, 'x', 'left')
  }

  if (Number.isFinite(transition?.to) && transition.to >= 0) {
    const nodeBinary = Number(transition.to).toString(2).padStart(nodeBitCount, '0')
    const resolved = resolveNodeIdByBinary(definedNodes, nodeBinary, nodeBitCount)
    return resolved >= 0 ? nodeBinary : 'x'.repeat(nodeBitCount)
  }

  return 'x'.repeat(nodeBitCount)
}

function collapseTransitionsForExport(transitions, definedNodes) {
  const nodeBitCount =
    definedNodes.length <= 1 ? 1 : Math.max(1, Math.ceil(Math.log2(definedNodes.length)))
  const groups = new Map()

  transitions.forEach((transition) => {
    const key = String(getTransitionGroupKey(transition))
    const bucket = groups.get(key) ?? []
    bucket.push(transition)
    groups.set(key, bucket)
  })

  return Array.from(groups.values()).map((group) => {
    const representative = group[0]
    const mergedToBinaryId = mergeBitPatterns(
      group.map((transition) => getTransitionTargetPattern(transition, nodeBitCount, definedNodes)),
      nodeBitCount,
    )
    const resolvedTo = /^[01]+$/.test(mergedToBinaryId)
      ? resolveNodeIdByBinary(definedNodes, mergedToBinaryId, nodeBitCount)
      : -1

    return normalizeTransitionForParent({
      ...representative,
      id: representative?.groupId ?? representative?.id ?? 0,
      to: resolvedTo,
      toBinaryId: mergedToBinaryId,
    })
  })
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

    // Do not attach hidden don't-care transitions to node transition lists
    if (transition.hiddenDontCare) return

    const transitionRef = {
      from: transition.from,
      to: transition.to,
      id: transition.id,
      tr_name: transition.id,
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
    const groupId = t.groupId ?? existing?.groupId ?? t.id

    const labelFromParent =
      typeof t.input === 'string' && typeof output === 'string'
        ? `${t.input}/${output}`
        : String(t.label ?? existing?.label ?? '0/0').replace(/-/g, 'x')

    const draft = existing
      ? {
          ...existing,
          groupId,
          toBinaryId: t.toBinaryId ?? existing.toBinaryId,
          label: labelFromParent,
          from: t.from,
          to: t.to,
          hiddenDontCare: t.hiddenDontCare ?? existing.hiddenDontCare,
        }
      : {
          id: t.id,
          groupId,
          toBinaryId: t.toBinaryId,
          from: t.from,
          to: t.to,
          label: labelFromParent,
          hiddenDontCare: t.hiddenDontCare ?? false,
          stroke: '#ffffffdd',
          strokeWidth: 2,
          fill: '#ffffffdd',
          points: [],
          tension: t.from === t.to ? 1 : 0.5,
          fontSize: 14,
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

function shouldRenderTransition(transition) {
  if (!transition || typeof transition !== 'object') return false

  return Number.isFinite(transition.to) && transition.to >= 0
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
    const labelText =
      transition.label && transition.label.length > 0 ? String(transition.label) : ''

    if (transitionShape) {
      transitionShape.points(transition.points)
      transitionShape.tension(transition.tension)
    }

    if (textShape) {
      textShape.text(labelText)
    }

    if (labelShape) {
      const pts = transition.points
      const mx = 0.25 * pts[0] + 0.5 * pts[2] + 0.25 * pts[4]
      const my = 0.25 * pts[1] + 0.5 * pts[3] + 0.25 * pts[5]
      const halfW = labelText.length * 4 + 5
      labelShape.x(mx - halfW)
      labelShape.y(my - 12)
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
  const labelIsValid = /^[01x]+\/[01x]+$/.test(String(label).trim())
  const [inputFromLabel = '', outputFromLabel = ''] = label.split('/')
  const hasExplicitInput = typeof transition?.input === 'string'
  const hasExplicitOutput =
    typeof transition?.output === 'string' || typeof transition?.mealy_output === 'string'
  const hasExplicittoBinaryId = typeof transition?.toBinaryId === 'string'
  const hasExplicitParentFields = hasExplicitInput || hasExplicitOutput || hasExplicittoBinaryId

  const input = String(hasExplicitInput ? transition?.input : (inputFromLabel ?? '')).replace(
    /-/g,
    'x',
  )
  const output = String(
    hasExplicitOutput
      ? (transition?.output ?? transition?.mealy_output ?? '')
      : (outputFromLabel ?? ''),
  ).replace(/-/g, 'x')
  const nodes = (store.get(node_list) ?? []).filter(Boolean)
  const maxIndex = Math.max(nodes.length - 1, 0)
  const stateBits = Math.max(maxIndex.toString(2).length, 1)
  const shouldBeUnresolved =
    !!transition?.forceUnresolved || (!hasExplicitParentFields && !labelIsValid)

  return {
    id: transition?.id ?? 0,
    from: transition?.from ?? 0,
    to: shouldBeUnresolved ? -1 : (transition?.to ?? -1),
    toBinaryId: shouldBeUnresolved
      ? 'x'.repeat(stateBits)
      : typeof transition?.toBinaryId === 'string'
        ? String(transition.toBinaryId).replace(/-/g, 'x')
        : transition?.toBinaryId,
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
    (transition) => transition && !transition.isDraft && !transition.hiddenDontCare,
  )
  const fsmType = store.get(fsm_type) ?? 'mealy'
  const visibleTransitions = collapseTransitionsForExport(transitions, definedNodes)
  const visibleTransitionIds = new Set(visibleTransitions.map((t) => t.id))
  const visibleTransitionKeys = new Set(visibleTransitions.map((t) => `${t.from}:${t.input}`))
  const preservedUnresolvedTransitions = unresolvedTransitions
    .map((t) => normalizeTransitionForParent(t))
    .filter((t) => {
      if (visibleTransitionIds.has(t.id)) return false
      if (visibleTransitionKeys.has(`${t.from}:${t.input}`)) return false
      if (!definedNodes.some((node) => node?.id === t.from)) return false
      if (typeof t.toBinaryId === 'string' && t.toBinaryId.length > 0) return true
      return definedNodes.some((node) => node?.id === t.to)
    })

  return {
    states: definedNodes.map((n) => ({
      id: n.id,
      name: n.name,
      initial: !!n.type?.initial,
      final: !!n.type?.final,
      x: n.x,
      y: n.y,
      moore_output: n.moore_output ?? '',
    })),
    transitions: [...visibleTransitions, ...preservedUnresolvedTransitions],
    fsmType,
  }
}

export function sendExportToMainState() {
  if (updateFromState) return

  const fsm = extractFsmData()
  window.parent.postMessage({ action: 'export', fsm }, getTrustedOrigin())
}

// import of state table data as fsm state data
// NEW: tried to make auto layout look like the fsm layout
window.addEventListener('message', (event) => {
  if (!isTrustedParentMessage(event)) return
  if (event.data?.action !== 'fsmimport') return

  const fsm = event.data.fsm
  if (!fsm) return

  const states = fsm.states ?? []
  const transitions = fsm.transitions ?? []
  const { fsmType = 'mealy' } = fsm

  const existingNodes = store.get(node_list) ?? []
  const nodeAtoms = []
  const nodeBitCount = states.length <= 1 ? 1 : Math.max(1, Math.ceil(Math.log2(states.length)))
  let nextTransitionId = 0

  states.forEach((s, index) => {
    const existing = existingNodes[s.id]
    const moore_output = s.moore_output ?? existing?.moore_output ?? ''
    const x = typeof s.x === 'number' ? s.x : existing?.x
    const y = typeof s.y === 'number' ? s.y : existing?.y

    if (existing) {
      // auto layout only on new states
      nodeAtoms[s.id] = {
        ...existing,
        name: s.name ?? existing.name,
        x: x ?? existing.x,
        y: y ?? existing.y,
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
      x: x ?? baseX + col * dx,
      y: y ?? baseY + row * dy,
      radius: name.length + 35,
      fill: '#4a6fae88',
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
  const renderableTransitions = []
  unresolvedTransitions = []

  const mergedTransitions = (() => {
    const grouped = new Map()

    transitions.forEach((transition) => {
      const baseLabelInput = String(transition.input ?? '').replace(/-/g, 'x')
      const baseLabelOutput = String(transition.output ?? transition.mealy_output ?? '').replace(
        /-/g,
        'x',
      )
      const targetPattern = normalizePatternBits(
        transition.toBinaryId ?? (transition.to >= 0 ? Number(transition.to).toString(2) : ''),
        nodeBitCount,
        'x',
        'left',
      )
      const key = `${transition.from}:${targetPattern}:${baseLabelOutput}`
      const existing = grouped.get(key) || {
        transition,
        inputs: [],
        baseLabelOutput,
        targetPattern,
      }

      existing.inputs.push(baseLabelInput)
      grouped.set(key, existing)
    })

    return Array.from(grouped.values()).map((entry) => {
      const fallbackLength = Math.max(1, ...entry.inputs.map((input) => input.length))
      const mergedInput = mergeBitPatterns(entry.inputs, fallbackLength)
      return {
        ...entry.transition,
        input: mergedInput,
        output: entry.baseLabelOutput,
        mealy_output: entry.baseLabelOutput,
        toBinaryId: entry.targetPattern,
      }
    })
  })()

  mergedTransitions.forEach((transition) => {
    const baseLabelInput = String(transition.input ?? '').replace(/-/g, 'x')
    const baseLabelOutput = String(transition.output ?? transition.mealy_output ?? '').replace(
      /-/g,
      'x',
    )
    const normalizedLabel =
      typeof transition.label === 'string'
        ? transition.label.replace(/-/g, 'x')
        : `${baseLabelInput}/${baseLabelOutput}`
    const targetPattern = normalizePatternBits(
      transition.toBinaryId ?? (transition.to >= 0 ? Number(transition.to).toString(2) : ''),
      nodeBitCount,
      'x',
      'left',
    )
    const isHiddenDontCare =
      /^x+$/.test(baseLabelInput) &&
      /^x+$/.test(targetPattern) &&
      typeof baseLabelOutput === 'string' &&
      baseLabelOutput.length > 0 &&
      /^x+$/.test(baseLabelOutput)

    if (isHiddenDontCare) {
      renderableTransitions.push({
        ...transition,
        id: nextTransitionId++,
        groupId: transition.groupId ?? transition.id ?? 0,
        toBinaryId: targetPattern,
        input: baseLabelInput,
        output: baseLabelOutput,
        mealy_output: baseLabelOutput,
        label: normalizedLabel,
        isDraft: false,
        hiddenDontCare: true,
      })
      return
    }
    const concreteTargets = expandDontCares(targetPattern)

    if (concreteTargets.length > 0) {
      const fromExists = nodeAtoms.some((n) => n && n.id === transition.from)
      if (fromExists) {
        // Group concrete targets by resolved target node id (same z^{n+1})
        const targetsByResolved = new Map()
        concreteTargets.forEach((binaryTarget) => {
          const resolvedTo = resolveNodeIdByBinary(nodeAtoms, binaryTarget, nodeBitCount)
          if (resolvedTo < 0) return
          const key = String(resolvedTo)
          const arr = targetsByResolved.get(key) || []
          arr.push(binaryTarget)
          targetsByResolved.set(key, arr)
        })

        targetsByResolved.forEach((binaryList, resolvedKey) => {
          // compress binaryList into merged patterns where possible (e.g. 001 + 011 -> 0x1)
          const merged = compressBinaryPatterns(binaryList)
          merged.forEach((pattern) => {
            renderableTransitions.push({
              ...transition,
              id: nextTransitionId++,
              groupId: transition.groupId ?? transition.id ?? 0,
              from: transition.from,
              to: Number(resolvedKey),
              toBinaryId: pattern,
              input: baseLabelInput,
              output: baseLabelOutput,
              mealy_output: baseLabelOutput,
              label: normalizedLabel,
              isDraft: false,
              hiddenDontCare: false,
            })
          })
        })

        return
      }
    }

    if (shouldRenderTransition(transition)) {
      const fromExists = nodeAtoms.some((n) => n && n.id === transition.from)
      const toExists = nodeAtoms.some((n) => n && n.id === transition.to)
      if (fromExists && toExists) {
        renderableTransitions.push({
          ...transition,
          id: nextTransitionId++,
          groupId: transition.groupId ?? transition.id ?? 0,
          hiddenDontCare: false,
          label: normalizedLabel,
        })
        return
      }
    }

    unresolvedTransitions.push(transition)
  })

  attachTransitionsToNodes(nodeAtoms, renderableTransitions)

  updateFromState = true
  store.set(node_list, nodeAtoms)

  const nodesMap = buildNodeMap(nodeAtoms)
  const transitionAtoms = buildTransitionAtoms(renderableTransitions, existingTransitions, nodesMap)
  const removedTransitionIds = getRemovedTransitionIds(existingTransitions, transitionAtoms)

  // Force a deterministic remount of transition shapes after each import update.
  store.set(transition_list, [])
  store.set(fsm_type, fsmType)
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

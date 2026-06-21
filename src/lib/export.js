// import { getDefaultStore } from 'jotai'
import {
  node_list,
  transition_list,
  fsm_type,
  initial_state,
  stage_ref,
  deleted_nodes,
  store,
} from './stores'
import { getTransitionPoints, getBezierPoint } from './editor'

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

function buildAllowedNodeBits(nodes, bitCount) {
  const allowed = Array.from({ length: bitCount }, () => ({ zero: false, one: false }))

  nodes.forEach((node) => {
    if (!node || node.id == null) return
    const bits = Number(node.id).toString(2).padStart(bitCount, '0')
    for (let index = 0; index < bitCount; index += 1) {
      const bit = bits.charAt(index)
      if (bit === '0') allowed[index].zero = true
      if (bit === '1') allowed[index].one = true
    }
  })

  return allowed
}

function normalizeToBinaryIdPattern(pattern, bitCount, nodes) {
  const normalized = normalizePatternBits(pattern, bitCount, 'x', 'left')
  const allowed = buildAllowedNodeBits(nodes, bitCount)

  return Array.from({ length: bitCount }, (_, index) => {
    const bit = normalized.charAt(index)
    const allowZero = allowed[index].zero
    const allowOne = allowed[index].one

    if (allowZero && !allowOne) return '0'
    if (allowOne && !allowZero) return '1'

    if (bit === '0' || bit === '1') return bit
    return 'x'
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
  // Use the highest node id to compute the required bit count, not the
  // compacted definedNodes.length. definedNodes may be a compacted array and
  // using its length can produce incorrect bit widths for sparse ids.
  const maxNodeId = definedNodes.reduce((m, n) => Math.max(m, Number(n?.id ?? -1)), 0)
  const totalStates = Math.max(1, maxNodeId + 1)
  const nodeBitCount = totalStates <= 1 ? 1 : Math.max(1, Math.ceil(Math.log2(totalStates)))
  const isMoore = store.get(fsm_type) === 'moore'
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

    const normalizedTransition = normalizeTransitionForParent({
      ...representative,
      id: representative?.groupId ?? representative?.id ?? 0,
      to: resolvedTo,
      toBinaryId: mergedToBinaryId,
    })

    if (!isMoore) return normalizedTransition

    const output = resolveMooreTransitionOutput(normalizedTransition, definedNodes)
    return {
      ...normalizedTransition,
      output,
      mealy_output: output,
    }
  })
}

function resolveMooreTransitionOutput(transition, definedNodes) {
  const targetNode = definedNodes.find((node) => node?.id === transition?.to)
  if (targetNode) {
    return String(targetNode.moore_output ?? '').replace(/-/g, 'x')
  }
  return String(transition?.output ?? transition?.mealy_output ?? '').replace(/-/g, 'x')
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
  const isMoore = store.get(fsm_type) === 'moore'

  transitions.forEach((t) => {
    let existing =
      existingTransitions[t.id] ?? existingTransitions.find((tr) => tr && tr.id === t.id)
    if (!existing && t.groupId != null) {
      existing = existingTransitions.find((tr) => tr && (tr.groupId ?? tr.id) === t.groupId)
    }
    const output = t.output ?? t.mealy_output ?? ''
    const groupId = t.groupId ?? existing?.groupId ?? t.id

    let labelFromParent = String(t.label ?? existing?.label ?? '0/0').replace(/-/g, 'x')
    if (typeof t.input === 'string') {
      labelFromParent = isMoore
        ? String(t.input).replace(/-/g, 'x')
        : typeof output === 'string'
          ? `${t.input}/${output}`
          : labelFromParent
    }

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

function removeRenderedStates(existingNodeIds, newNodeList) {
  const newIds = new Set(newNodeList.filter(Boolean).map((n) => n.id))
  const removedIds = existingNodeIds.filter((id) => id != null && !newIds.has(id))
  if (!removedIds.length) return

  const stage = store.get(stage_ref)
  if (!stage) return

  removedIds.forEach((id) => {
    const group = stage.findOne(`#state_${id}`)
    group?.destroy()
  })

  stage.batchDraw()
}

function syncRenderedTransitions(transitionAtoms) {
  const stage = store.get(stage_ref)
  if (!stage) return
  const isMoore = store.get(fsm_type) === 'moore'

  transitionAtoms.forEach((transition) => {
    if (!transition) return

    const transitionShape = stage.findOne(`#transition_${transition.id}`)
    const labelShape = stage.findOne(`#tr_label${transition.id}`)
    const textShape = stage.findOne(`#trtext_${transition.id}`)
    const labelText =
      transition.label && transition.label.length > 0
        ? String(transition.label)
        : isMoore
          ? String(transition.input ?? '')
          : ''

    if (transitionShape) {
      transitionShape.points(transition.points)
      transitionShape.tension(transition.tension)
    }

    if (textShape) {
      textShape.text(labelText)
    }

    if (labelShape) {
      const pts = transition.points
      const mid = getBezierPoint(pts, 0.5)
      const textWidth = labelText.length * 4 + 5

      labelShape.x(mid.x - textWidth / 2)
      labelShape.y(mid.y - 8)
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
  const isMoore = store.get(fsm_type) === 'moore'
  const output = String(
    isMoore
      ? ''
      : hasExplicitOutput
        ? (transition?.output ?? transition?.mealy_output ?? '')
        : (outputFromLabel ?? ''),
  ).replace(/-/g, 'x')
  const allNodes = store.get(node_list) ?? []
  const maxNodeId = allNodes.reduce((m, n) => Math.max(m, Number(n?.id ?? -1)), 0)
  const totalStates = Math.max(1, maxNodeId + 1)
  const stateBits = totalStates <= 1 ? 1 : Math.max(1, Math.ceil(Math.log2(totalStates)))
  const shouldBeUnresolved =
    !!transition?.forceUnresolved || (!hasExplicitParentFields && !labelIsValid)
  const normalizedToBinaryId = normalizeToBinaryIdPattern(
    transition?.toBinaryId ?? 'x'.repeat(stateBits),
    stateBits,
    allNodes,
  )
  const resolvedTargetId =
    typeof normalizedToBinaryId === 'string' && /^[01]+$/.test(normalizedToBinaryId)
      ? resolveNodeIdByBinary(allNodes, normalizedToBinaryId, stateBits)
      : -1
  const resolvedTo = resolvedTargetId >= 0 ? resolvedTargetId : (transition?.to ?? -1)
  const resolvedToBinaryId = resolvedTargetId >= 0 ? undefined : normalizedToBinaryId

  return {
    id: transition?.id ?? 0,
    groupId: transition?.groupId ?? transition?.id ?? 0,
    from: transition?.from ?? 0,
    to: shouldBeUnresolved ? -1 : resolvedTo,
    toBinaryId: shouldBeUnresolved
      ? normalizedToBinaryId
      : typeof transition?.toBinaryId === 'string'
        ? resolvedToBinaryId
        : transition?.toBinaryId,
    input,
    output,
    mealy_output: isMoore ? '' : output,
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

  const exportedTransitions =
    fsmType === 'moore'
      ? visibleTransitions.filter((transition) => transition.to >= 0)
      : visibleTransitions

  const exportedPreservedTransitions = fsmType === 'moore' ? [] : preservedUnresolvedTransitions

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
    transitions: [...exportedTransitions, ...exportedPreservedTransitions],
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
  const isMoore = fsmType === 'moore'

  const existingNodes = store.get(node_list) ?? []
  const nodeAtoms = []
  const maxIncomingId = states.reduce((m, s) => Math.max(m, Number(s?.id ?? -1)), 0)
  const nodeBitCount = maxIncomingId <= 0 ? 1 : Math.max(1, Math.ceil(Math.log2(maxIncomingId + 1)))
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

  if (false && isMoore) {
    transitions.forEach((transition) => {
      const baseLabelInput = String(transition.input ?? '').replace(/-/g, 'x')
      const baseLabelOutput = ''
      const targetPattern = normalizePatternBits(
        transition.toBinaryId ?? (transition.to >= 0 ? Number(transition.to).toString(2) : ''),
        nodeBitCount,
        'x',
        'left',
      )
      const concreteTargets = expandDontCares(targetPattern)

      if (concreteTargets.length > 0) {
        const fromExists = nodeAtoms.some((n) => n && n.id === transition.from)
        if (fromExists) {
          const targetsByResolved = new Map()
          concreteTargets.forEach((binaryTarget) => {
            const resolvedTo = resolveNodeIdByBinary(nodeAtoms, binaryTarget, nodeBitCount)
            if (resolvedTo < 0) return
            const key = String(resolvedTo)
            const arr = targetsByResolved.get(key) || []
            arr.push(binaryTarget)
            targetsByResolved.set(key, arr)
          })

          // If the original transition is a full don't-care on input and target,
          // treat the expanded concrete transitions as hidden don't-care so they
          // don't render visually but remain available to be overwritten by the user.
          const wasTargetAllDontCare = /^x+$/.test(targetPattern)
          const isInputAllDontCare = /^x+$/.test(baseLabelInput)

          targetsByResolved.forEach((binaryList, resolvedKey) => {
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
                label: baseLabelInput,
                isDraft: false,
                hiddenDontCare: isInputAllDontCare && wasTargetAllDontCare,
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
          const isHiddenDontCare = /^x+$/.test(baseLabelInput) && /^x+$/.test(targetPattern)
          renderableTransitions.push({
            ...transition,
            id: nextTransitionId++,
            groupId: transition.groupId ?? transition.id ?? 0,
            hiddenDontCare: isHiddenDontCare,
            label: baseLabelInput,
            output: baseLabelOutput,
            mealy_output: baseLabelOutput,
          })
          return
        }
      }

      unresolvedTransitions.push(transition)
    })
  } else {
    const mergedTransitions = (() => {
      const grouped = new Map()

      transitions.forEach((transition) => {
        const baseLabelInput = String(transition.input ?? '').replace(/-/g, 'x')
        const baseLabelOutput = isMoore
          ? ''
          : String(transition.output ?? transition.mealy_output ?? '').replace(/-/g, 'x')
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
      const baseLabelOutput = isMoore
        ? ''
        : String(transition.output ?? transition.mealy_output ?? '').replace(/-/g, 'x')
      const normalizedLabel =
        typeof transition.label === 'string'
          ? transition.label.replace(/-/g, 'x')
          : isMoore
            ? baseLabelInput
            : `${baseLabelInput}/${baseLabelOutput}`
      const targetPattern = normalizePatternBits(
        transition.toBinaryId ?? (transition.to >= 0 ? Number(transition.to).toString(2) : ''),
        nodeBitCount,
        'x',
        'left',
      )
      const isHiddenDontCare = isMoore
        ? /^x+$/.test(baseLabelInput) && /^x+$/.test(targetPattern)
        : /^x+$/.test(baseLabelInput) &&
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
  }

  // For Moore: merge transitions that share the same from/to/toBinaryId by
  // combining their input patterns (e.g. '0' + '1' -> 'x') to keep the editor
  // compact like Mealy. The editor will expand 'x' back into concrete inputs
  // on import.
  if (false && isMoore && renderableTransitions.length > 0) {
    const grouped = new Map()
    renderableTransitions.forEach((rt) => {
      const key = `${rt.from}:${rt.to}:${String(rt.toBinaryId ?? '')}`
      const bucket = grouped.get(key) || []
      bucket.push(rt)
      grouped.set(key, bucket)
    })

    const mergedRT = []
    grouped.forEach((bucket) => {
      if (!bucket || bucket.length === 0) return
      if (bucket.length === 1) {
        mergedRT.push(bucket[0])
        return
      }

      const inputs = bucket.map((b) => String(b.input ?? ''))
      const fallbackLength = Math.max(1, ...inputs.map((s) => s.length))
      const mergedInput = mergeBitPatterns(inputs, fallbackLength)

      const rep = bucket[0]
      const isInputAllDontCare = /^x+$/.test(mergedInput)
      const wasTargetAllDontCare = /^x+$/.test(String(rep.toBinaryId ?? ''))

      mergedRT.push({
        ...rep,
        input: mergedInput,
        label: String(mergedInput),
        hiddenDontCare: isInputAllDontCare && wasTargetAllDontCare,
      })
    })

    renderableTransitions.length = 0
    mergedRT.forEach((m) => renderableTransitions.push(m))
  }

  attachTransitionsToNodes(nodeAtoms, renderableTransitions)

  updateFromState = true
  // Safety: if the RAF chain below fails for any reason, ensure
  // updateFromState is reset after a maximum delay so future user
  // actions (like removeState) aren't silently blocked.
  const forceUnlockId = setTimeout(() => {
    updateFromState = false
  }, 2000)

  // Record existing node IDs before overwriting, so we can clean up
  // orphaned Konva shapes for nodes that no longer exist after import.
  const existingNodeIds = existingNodes.map((n) => n?.id)
  // set nodes silently. The app renumbers IDs, so any previously deleted
  // IDs are stale — clear the list to prevent overwriting valid nodes
  // on the next "add" action.
  store.set(deleted_nodes, [])
  store.set(node_list, nodeAtoms)

  try {
    const nodesMap = buildNodeMap(nodeAtoms)
    // Use the shared builder for transition atoms for both Mealy and Moore so
    // grouping, ids and renderNonce handling stay consistent between modes.
    const transitionAtoms = buildTransitionAtoms(
      renderableTransitions,
      existingTransitions,
      nodesMap,
    )
    const removedTransitionIds = getRemovedTransitionIds(existingTransitions, transitionAtoms)

    // Force a deterministic remount of transition shapes after each import update.
    store.set(transition_list, [])
    store.set(fsm_type, fsmType)
    // transition atoms are created below
    requestAnimationFrame(() => {
      removeRenderedTransitions(removedTransitionIds)
      removeRenderedStates(existingNodeIds, nodeAtoms)
      store.set(transition_list, transitionAtoms)
      requestAnimationFrame(() => {
        const recalculatedTransitions = recomputeCommittedTransitionGeometry()
        requestAnimationFrame(() => {
          syncRenderedTransitions(recalculatedTransitions)
          updateFromState = false
          clearTimeout(forceUnlockId)
        })
      })
    })
  } catch (error) {
    updateFromState = false
    clearTimeout(forceUnlockId)
    throw error
  }
})

export function clearFsmFromParent() {
  store.set(node_list, [])
  store.set(transition_list, [])
  store.set(initial_state, null)
  unresolvedTransitions = []
}

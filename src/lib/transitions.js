import { getLabelPosition, getTransitionPoints } from './editor'
import { sendExportToMainState } from './export'
import { addToHistory } from './history'
import {
  active_transition,
  editor_state,
  fsm_type,
  input_bit_count,
  node_list,
  output_bit_count,
  show_popup,
  stage_ref,
  store,
  transition_list,
} from './stores'

// Allow up to 5 input/output bits (same as the table)
export const MAX_IO_BITS = 5

function getTransitionGroupId(transition) {
  return transition?.groupId ?? transition?.id ?? 0
}

function normalizeBitsPattern(value) {
  return String(value ?? '')
    .trim()
    .replace(/-/g, 'x')
}

function patternsOverlap(leftPattern, rightPattern) {
  const left = normalizeBitsPattern(leftPattern)
  const right = normalizeBitsPattern(rightPattern)
  const length = Math.max(left.length, right.length)
  const paddedLeft = left.padEnd(length, 'x').slice(0, length)
  const paddedRight = right.padEnd(length, 'x').slice(0, length)

  for (let index = 0; index < length; index += 1) {
    const leftBit = paddedLeft.charAt(index)
    const rightBit = paddedRight.charAt(index)
    if (leftBit !== 'x' && rightBit !== 'x' && leftBit !== rightBit) {
      return false
    }
  }

  return true
}

function getInputFromLabel(label) {
  const [input = ''] = String(label ?? '').split('/')
  return normalizeBitsPattern(input)
}

function getOutputFromLabel(label) {
  const [, output = ''] = String(label ?? '').split('/')
  return normalizeBitsPattern(output)
}

function isExactBitLabel(label, inputBits, outputBits) {
  const [input = '', output = ''] = String(label ?? '').split('/')
  return (
    input.length === inputBits &&
    output.length === outputBits &&
    /^[01x]+$/.test(input) &&
    /^[01x]+$/.test(output)
  )
}

function isMooreMode() {
  return store.get(fsm_type) === 'moore'
}

// Rows whose input pattern does not match the current bit count are leftovers and must not block new ones
function hasStaleInput(label) {
  const inputBits = store.get(input_bit_count) || 1
  return getInputFromLabel(label).length !== inputBits
}

// Calculates bit width of a next-state pattern (derived from the highest state id)
function getNodeBitCount(nodes) {
  const maxNodeId = (nodes ?? []).reduce((max, node) => Math.max(max, Number(node?.id ?? -1)), -1)
  const totalStates = Math.max(1, maxNodeId + 1)
  return totalStates <= 1 ? 1 : Math.max(1, Math.ceil(Math.log2(totalStates)))
}

function toBinaryPattern(nodeId, bitCount) {
  return Number(nodeId).toString(2).padStart(bitCount, '0')
}

function padBinaryPattern(pattern, bitCount) {
  const source = String(pattern ?? '').replace(/-/g, 'x')
  if (source.length >= bitCount) return source.slice(-bitCount)
  return source.padStart(bitCount, /x/.test(source) ? 'x' : '0')
}

// Shows a stored pattern (0/1/x) with the don't-care character used in the UI
function showPattern(pattern) {
  return String(pattern ?? '').replace(/x/g, '-')
}

// Concrete next-state patterns of a transition group (a cluster has one entry per target)
function getGroupTargetPatterns(transitions, groupIds, bitCount) {
  const patterns = []
  groupIds.forEach((transitionId) => {
    const transition = transitions[transitionId]
    if (!transition) return
    const pattern = String(transition.toBinaryId ?? '')
    if (/^[01]+$/.test(pattern)) {
      patterns.push(padBinaryPattern(pattern, bitCount))
      return
    }
    if (Number.isFinite(transition.to) && transition.to >= 0) {
      patterns.push(toBinaryPattern(transition.to, bitCount))
    }
  })
  return Array.from(new Set(patterns))
}

function getNodeNamesForPatterns(nodes, patterns, bitCount) {
  return patterns.map((pattern) => {
    const node = (nodes ?? []).find(
      (candidate) =>
        candidate && Number(candidate.id).toString(2).padStart(bitCount, '0') === pattern,
    )
    return node?.name ? String(node.name) : pattern
  })
}

// Keep messages short when a pattern would cover many states
function formatNodeNames(names, max = 3) {
  const quoted = names.map((name) => `"${name}"`)
  if (quoted.length <= 1) return quoted[0] ?? ''
  if (quoted.length <= max)
    return `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`
  return `${quoted.slice(0, max).join(', ')} and ${names.length - max} more`
}

// "the next state \"q1\"" / "the next states \"q1\" and \"q2\""
function nextStatePhrase(names) {
  const formatted = formatNodeNames(names)
  return names.length <= 1 ? `the next state ${formatted}` : `the next states ${formatted}`
}

export function removeTransitionById(id) {
  const transitionEntry = store.get(transition_list).find((t) => t?.id === id)
  if (!transitionEntry) return false

  const from_state = transitionEntry.from
  const to_state = transitionEntry.to
  const targetGroupId = getTransitionGroupId(transitionEntry)
  const transitionIds = (store.get(transition_list) ?? [])
    .map((transition, index) =>
      transition && getTransitionGroupId(transition) === targetGroupId ? index : -1,
    )
    .filter((transitionId) => transitionId >= 0)

  transitionIds.forEach((transitionId) => {
    const transition = store.get(stage_ref).findOne(`#tr_${transitionId}`)
    transition?.destroy()
  })

  store.set(transition_list, (old) => {
    const newTrList = [...old]
    transitionIds.forEach((transitionId) => {
      delete newTrList[transitionId]
    })
    return newTrList
  })

  store.set(node_list, (old) => {
    const newNodes = [...old]

    if (newNodes[from_state]) {
      newNodes[from_state] = {
        ...newNodes[from_state],
        transitions: newNodes[from_state].transitions.filter(
          (tr) => !transitionIds.includes(tr.id),
        ),
      }
    }

    if (from_state !== to_state && newNodes[to_state]) {
      newNodes[to_state] = {
        ...newNodes[to_state],
        transitions: newNodes[to_state].transitions.filter((tr) => !transitionIds.includes(tr.id)),
      }
    }
    return newNodes
  })

  return true
}

function padLabelToBitLengths(label, maxInput, maxOutput) {
  const [inpRaw = '', outRaw = ''] = label.split('/')
  const inp = inpRaw.padEnd(maxInput, 'x').slice(0, maxInput)
  if (isMooreMode()) {
    return inp
  }
  const out = outRaw.padEnd(maxOutput, 'x').slice(0, maxOutput)

  return `${inp}/${out}`
}

// Handle a click event on a transition
export function handleTransitionClick(id) {
  if (store.get(editor_state) === 'Remove') {
    if (!removeTransitionById(id)) return
    addToHistory()
    sendExportToMainState()
    return
  }
  store.set(show_popup, true)
  store.set(active_transition, () => id)
}

// Checks whether a row of the same source state already uses this input
export function getTransitionConflict({ input, output = '' } = {}) {
  const activeTransitionIndex = store.get(active_transition)
  const transitions = store.get(transition_list) ?? []
  const nodes = (store.get(node_list) ?? []).filter(Boolean)
  const bitCount = getNodeBitCount(nodes)
  const activeTransition = transitions[activeTransitionIndex]
  if (!activeTransition) return null

  const requestedInput = normalizeBitsPattern(input)
  const requestedOutput = normalizeBitsPattern(output)
  const sourceNode = activeTransition.from
  const activeGroupId = getTransitionGroupId(activeTransition)
  const overlappingGroupIdsFound = new Set()
  let overlapping = null

  transitions.forEach((transition, index) => {
    if (!transition || index === activeTransitionIndex) return
    if (transition.from !== sourceNode) return
    if (getTransitionGroupId(transition) === activeGroupId) return
    if (transition.hiddenDontCare) return
    if (hasStaleInput(transition.label)) return
    if (!patternsOverlap(requestedInput, getInputFromLabel(transition.label))) return
    overlappingGroupIdsFound.add(getTransitionGroupId(transition))
    if (!overlapping) overlapping = transition
  })

  if (!overlapping) return null

  const overlappingGroupId = getTransitionGroupId(overlapping)
  const overlappingGroupEntries = transitions
    .map((transition, index) =>
      transition && getTransitionGroupId(transition) === overlappingGroupId ? index : -1,
    )
    .filter((transitionId) => transitionId >= 0)
  const existingTargets = getGroupTargetPatterns(transitions, overlappingGroupEntries, bitCount)
  const existingInput = getInputFromLabel(overlapping.label)
  const existingOutput = getOutputFromLabel(overlapping.label)
  const existingNameList = getNodeNamesForPatterns(nodes, existingTargets, bitCount)
  const existingTargetsPhrase = nextStatePhrase(existingNameList)
  const info = {
    groupId: overlappingGroupId,
    input: existingInput,
    output: existingOutput,
  }

  // Only a pattern of the new transition itself can "cover" several existing rows
  const requestedIsPattern = requestedInput.includes('x')
  const existingIsPattern = existingInput.includes('x')

  if (requestedIsPattern && overlappingGroupIdsFound.size > 1) {
    return {
      ...info,
      message: `The input pattern "${showPattern(requestedInput)}" covers inputs that already have their own next state.`,
    }
  }

  if (!activeTransition.isDraft) {
    return {
      ...info,
      message: `This input already maps to ${existingTargetsPhrase} - one row holds one next state.`,
    }
  }

  if (!Number.isFinite(activeTransition.to) || activeTransition.to < 0) {
    return {
      ...info,
      message: `This input already maps to ${existingTargetsPhrase} - one row holds one next state.`,
    }
  }

  const draftPattern = toBinaryPattern(activeTransition.to, bitCount)

  if (requestedInput !== existingInput) {
    // Name the direction the pattern covers, otherwise the hint points at the wrong input
    if (requestedIsPattern && existingIsPattern) {
      return {
        ...info,
        message: `"${showPattern(existingInput)}" and "${showPattern(requestedInput)}" overlap, so they cannot share one row.`,
      }
    }

    if (requestedIsPattern) {
      return {
        ...info,
        message: `The pattern "${showPattern(requestedInput)}" also covers the input "${showPattern(existingInput)}" (${existingTargetsPhrase}).`,
      }
    }

    if (existingIsPattern) {
      return {
        ...info,
        message: `This input is already covered by the pattern "${showPattern(existingInput)}" (${existingTargetsPhrase}).`,
      }
    }

    return {
      ...info,
      message: `This input already maps to ${existingTargetsPhrase} - one row holds one next state.`,
    }
  }

  // One row per state and input: the only allowed edit updates the values of that row
  if (existingTargets.includes(draftPattern)) {
    const draftName =
      getNodeNamesForPatterns(nodes, [draftPattern], bitCount)[0] ?? showPattern(draftPattern)

    if (requestedOutput === existingOutput) {
      return {
        ...info,
        message: `This input already maps to ${nextStatePhrase([draftName])} - nothing would change.`,
      }
    }

    return {
      ...info,
      replacesRow: true,
      output: requestedOutput,
    }
  }

  return {
    ...info,
    message: `This input already maps to ${existingTargetsPhrase} - one row holds one next state.`,
  }
}

// Handle Save on Changing a Transition's Label
export function handleTransitionSave(labels) {
  const moore = isMooreMode()
  const active_tr = store.get(active_transition)
  const activeTransition = store.get(transition_list)[active_tr]
  if (!activeTransition) return
  const src_node = activeTransition.from
  const groupId = getTransitionGroupId(activeTransition)
  const groupTransitionIds = (store.get(transition_list) ?? [])
    .map((transition, index) =>
      transition && getTransitionGroupId(transition) === groupId ? index : -1,
    )
    .filter((transitionId) => transitionId >= 0)

  const stringLabels = labels.map((l) => String(l).trim().replace(/-/g, 'x'))
  // Validate and pad against the fixed bit counts
  const maxInput = store.get(input_bit_count) || 1
  const maxOutput = store.get(output_bit_count) || 1
  for (const label of stringLabels) {
    if (moore) {
      if (label.length !== maxInput || !/^[01x]+$/.test(label)) {
        return
      }
      continue
    }

    if (!isExactBitLabel(label, maxInput, maxOutput)) {
      return
    }
  }

  const nextLabel = stringLabels[0] ?? ''
  const nextInput = getInputFromLabel(nextLabel)
  const nextOutput = getOutputFromLabel(nextLabel)
  const allTransitions = store.get(transition_list) ?? []

  // check whether any of the new labels overlap with existing transitions from the same source node
  const nextInputs = stringLabels.map((label) => getInputFromLabel(label))
  const overlapsAnyLabel = (pattern) =>
    nextInputs.some((nextInput) => patternsOverlap(nextInput, pattern))

  // Rows with a don't-care next state are not drawn, so a new transition takes their place
  const overlappingHiddenIds = allTransitions
    .map((transition, index) =>
      transition &&
      transition.from === src_node &&
      transition.hiddenDontCare &&
      overlapsAnyLabel(getInputFromLabel(transition.label))
        ? index
        : -1,
    )
    .filter((id) => id >= 0)

  const duplicateExists = allTransitions.some((transition, index) => {
    if (!transition || index === active_tr) return false
    if (transition.from !== src_node) return false
    if (getTransitionGroupId(transition) === groupId) return false
    // Hidden rows are not drawn, so they never block a new transition
    if (transition.hiddenDontCare) return false
    // leftover rows from another bit width must not block the new transition
    if (hasStaleInput(transition.label)) return false
    return overlapsAnyLabel(getInputFromLabel(transition.label))
  })

  if (duplicateExists) {
    const conflict = getTransitionConflict({ input: nextInput, output: moore ? '' : nextOutput })

    // Same target: the drawn transition replaces the values of the existing row
    if (activeTransition.isDraft && conflict?.replacesRow) {
      const replacedGroupId = conflict.groupId
      addToHistory()
      store.set(transition_list, (old) =>
        old.map((transition) =>
          transition && getTransitionGroupId(transition) === replacedGroupId
            ? {
                ...transition,
                label: moore ? conflict.input : `${conflict.input}/${conflict.output}`,
                input: conflict.input,
                output: moore ? '' : conflict.output,
                mealyOutput: moore ? undefined : conflict.output,
                mealy_output: moore ? undefined : conflict.output,
                hiddenDontCare: false,
                isDraft: false,
              }
            : transition,
        ),
      )
      // Drop the draft, so the state and input keep exactly one arrow
      removeTransitionById(active_tr)
      store.set(show_popup, false)
      store.set(active_transition, null)
      sendExportToMainState()
      return
    }

    store.set(show_popup, false)
    if (activeTransition.isDraft) {
      removeTransitionById(active_tr)
    }
    return
  }

  // Update the New Labels in store
  addToHistory()
  store.set(show_popup, false)

  // A draft that overlaps hidden rows updates those rows instead of adding another one
  if (activeTransition.isDraft && overlappingHiddenIds.length > 0) {
    const nodesMap = store.get(node_list) ?? []
    const existing = store.get(transition_list) ?? []
    const updated = [...existing]
    overlappingHiddenIds.forEach((hid) => {
      if (!updated[hid]) return
      const hasConcreteTarget = Number.isFinite(activeTransition.to) && activeTransition.to >= 0
      const nextTo = hasConcreteTarget ? activeTransition.to : updated[hid].to
      const nextToBinaryId =
        typeof activeTransition.toBinaryId === 'string'
          ? activeTransition.toBinaryId
          : hasConcreteTarget
            ? undefined
            : updated[hid].toBinaryId

      updated[hid] = {
        ...updated[hid],
        label: nextLabel,
        input: nextInput,
        output: moore ? '' : nextOutput,
        mealyOutput: moore ? undefined : nextOutput,
        mealy_output: moore ? undefined : nextOutput,
        to: nextTo,
        toBinaryId: nextToBinaryId,
        forcePreserved: false,
        isDraft: false,
        hiddenDontCare: false,
        groupId: updated[hid].groupId ?? updated[hid].id,
        tension: updated[hid].from === nextTo ? 1 : 0.5,
        points: getTransitionPoints(updated[hid].from, nextTo, hid, nodesMap, updated),
      }
    })

    store.set(transition_list, updated)

    // Attach overwritten transitions to node lists (they were previously hidden)
    store.set(node_list, (old) => {
      const newNodes = [...old]
      overlappingHiddenIds.forEach((hid) => {
        const tr = updated[hid]
        if (!tr) return
        const transitionRef = {
          from: tr.from,
          to: tr.to,
          id: hid,
          tr_name: hid,
        }
        if (newNodes[tr.from]) {
          newNodes[tr.from] = {
            ...newNodes[tr.from],
            transitions: [...(newNodes[tr.from].transitions || []), transitionRef],
          }
        }
        if (tr.from !== tr.to && newNodes[tr.to]) {
          newNodes[tr.to] = {
            ...newNodes[tr.to],
            transitions: [...(newNodes[tr.to].transitions || []), transitionRef],
          }
        }
      })
      return newNodes
    })

    // remove the draft transition if it was the active one
    removeTransitionById(active_tr)

    store.set(active_transition, null)
    sendExportToMainState()
    return
  }

  store.set(transition_list, (old) => {
    const newTrList = [...old]
    groupTransitionIds.forEach((transitionId) => {
      if (!newTrList[transitionId]) return
      newTrList[transitionId] = {
        ...newTrList[transitionId],
        label: nextLabel,
        input: nextInput,
        output: moore ? '' : nextOutput,
        mealyOutput: moore ? undefined : nextOutput,
        mealy_output: moore ? undefined : nextOutput,
        isDraft: false,
      }
    })
    return newTrList
  })

  // Update labels + position in UI for the whole logical transition group.
  const labelText = moore ? nextInput : nextLabel

  groupTransitionIds.forEach((transitionId) => {
    const displayText = store.get(stage_ref).findOne(`#trtext_${transitionId}`)
    const labelShape = store.get(stage_ref).findOne(`#tr_label${transitionId}`)
    const transition = store.get(transition_list).find((t) => t?.id === transitionId)

    if (displayText) displayText.text(labelText)
    if (labelShape && transition) {
      const points = transition.points
      const pos = getLabelPosition(points, labelText, transition.fontSize, transition.fontStyle)

      labelShape.x(pos.x)
      labelShape.y(pos.y)
    }
  })

  store.set(transition_list, (old) => {
    return old.map((t) => {
      if (!t) return t
      const rawLabel = String(t.label ?? '')
      return {
        ...t,
        label: padLabelToBitLengths(rawLabel, maxInput, maxOutput),
      }
    })
  })

  store.set(active_transition, null)
  sendExportToMainState()
}

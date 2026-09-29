import { getLabelPosition, getTransitionPoints } from './editor'
import { expandDontCares, sendExportToMainState } from './export'
import { addToHistory } from './history'
import {
  active_transition,
  alert,
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

// Smallest pattern covering all targets, x = don't-care. Returns '' if no targets.
function getEnclosingPattern(patterns) {
  if (!patterns.length) return ''
  const width = Math.max(...patterns.map((pattern) => pattern.length))
  const padded = patterns.map((pattern) => padBinaryPattern(pattern, width))
  return Array.from({ length: width }, (_, index) => {
    const bit = padded[0].charAt(index)
    return padded.every((pattern) => pattern.charAt(index) === bit) ? bit : 'x'
  }).join('')
}

// Targets form one don't-care pattern only when they cover its cube completely
function getExactCubePattern(patterns) {
  const cube = getEnclosingPattern(patterns)
  if (!cube) return null
  const variants = 2 ** (cube.match(/x/g)?.length ?? 0)
  return variants === patterns.length ? cube : null
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

// Moore targets must agree on every output bit, otherwise the cluster is invalid
function haveCompatibleMooreOutputs(nodes, patterns, bitCount) {
  const outputs = (nodes ?? [])
    .filter(
      (node) => node && patterns.includes(Number(node.id).toString(2).padStart(bitCount, '0')),
    )
    .map((node) => String(node.moore_output ?? ''))
  const width = Math.max(0, ...outputs.map((output) => output.length))

  for (let index = 0; index < width; index += 1) {
    const bits = new Set(
      outputs
        .map((output) => output.charAt(index) || 'x')
        .filter((bit) => bit === '0' || bit === '1'),
    )
    if (bits.size > 1) return false
  }

  return true
}

// Check if an existing output pattern covers a requested output pattern.
function isOutputCoveredBy(existingOutput, requestedOutput) {
  const existing = normalizeBitsPattern(existingOutput)
  const requested = normalizeBitsPattern(requestedOutput)
  const width = Math.max(existing.length, requested.length)
  return Array.from({ length: width }, (_, index) => {
    const bit = existing.charAt(index) || 'x'
    const wanted = requested.charAt(index) || 'x'
    return bit === 'x' || bit === wanted
  }).every(Boolean)
}

// Keep messages short when a pattern would cover many states
function formatNodeNames(names, max = 3) {
  if (names.length <= max) return names.join(', ')
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`
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

// checks whether a transition's input pattern overlaps with any other transition from the same source node
export function getClusterMergeInfo({ input, output = '' } = {}) {
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
  const existingNames = getNodeNamesForPatterns(nodes, existingTargets, bitCount).join(', ')
  const info = {
    mergeable: false,
    cube: null,
    groupId: overlappingGroupId,
    input: existingInput,
    output: existingOutput,
    targets: existingTargets,
  }

  if (overlappingGroupIdsFound.size > 1) {
    return {
      ...info,
      message: `The input pattern "${showPattern(requestedInput)}" also covers inputs that already have their own next state. One row carries one input pattern, and the state table stores one next state per state and input, so it cannot show another one.`,
    }
  }

  if (!activeTransition.isDraft) {
    return {
      ...info,
      message: `This state already uses the input "${showPattern(existingInput)}" for the next state ${existingNames}. A state and input pair carries one next state, so combine both targets in the state table.`,
    }
  }

  if (!Number.isFinite(activeTransition.to) || activeTransition.to < 0) {
    return {
      ...info,
      message: `This state already uses the input "${showPattern(existingInput)}" for the next state ${existingNames}. The state table stores one next state per state and input, so it cannot show another one.`,
    }
  }

  const draftPattern = toBinaryPattern(activeTransition.to, bitCount)
  const draftName = getNodeNamesForPatterns(nodes, [draftPattern], bitCount)[0]
  const outputNote =
    !isMooreMode() && requestedOutput !== existingOutput
      ? ` The row keeps its output "${showPattern(existingOutput)}", which already allows "${showPattern(requestedOutput)}".`
      : ''

  if (requestedInput !== existingInput) {
    return {
      ...info,
      message: `This state already uses the input pattern "${showPattern(existingInput)}" for the next state ${existingNames}, which also covers other inputs. The state table stores one next state per state and input, so it cannot show both as separate rows.`,
    }
  }

  if (!isMooreMode() && !isOutputCoveredBy(existingOutput, requestedOutput)) {
    return {
      ...info,
      message: `This state already uses the input "${showPattern(existingInput)}" with the output "${showPattern(existingOutput)}". One row carries one output, so the state table cannot show both outputs for this input.`,
    }
  }

  if (existingTargets.includes(draftPattern)) {
    return {
      ...info,
      message: `This state already uses the input "${showPattern(existingInput)}" for the next state ${draftName}. The state table stores one next state per state and input, so this transition would not change anything.`,
    }
  }

  const targets = Array.from(new Set([...existingTargets, draftPattern]))
  const enclosing = getEnclosingPattern(targets)
  const cube = getExactCubePattern(targets)

  if (!cube) {
    const differing = (enclosing.match(/x/g) ?? []).length
    const extraNames = formatNodeNames(
      getNodeNamesForPatterns(
        nodes,
        expandDontCares(enclosing).filter((pattern) => !targets.includes(pattern)),
        bitCount,
      ),
    )
    return {
      ...info,
      message: `${existingNames} and ${draftName} differ in ${differing} bits, so no don't-care pattern covers exactly them: "${showPattern(enclosing)}" would also target ${extraNames}. The state table stores one next state per state and input, so it cannot display this configuration.`,
    }
  }

  if (isMooreMode() && !haveCompatibleMooreOutputs(nodes, targets, bitCount)) {
    return {
      ...info,
      message: `The states ${formatNodeNames(getNodeNamesForPatterns(nodes, targets, bitCount))} have conflicting Moore outputs, so combining them would make the fsm invalid - the state table cannot store this cluster.`,
    }
  }

  return {
    ...info,
    mergeable: true,
    cube,
    message: `Submitting combines both targets into the don't-care row "${showPattern(cube)}", because the state table stores one next state per state and input.${outputNote}`,
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
        store.set(
          alert,
          `The label "${label}" is invalid. Please enter exactly ${maxInput} input bit${
            maxInput === 1 ? '' : 's'
          } using only 0, 1 or -.`,
        )
        store.set(show_popup, false)
        setTimeout(() => store.set(alert, ''), 3500)
        return
      }
      continue
    }

    if (!isExactBitLabel(label, maxInput, maxOutput)) {
      store.set(
        alert,
        `The label "${label}" is invalid. Please enter exactly ${maxInput} input bit${
          maxInput === 1 ? '' : 's'
        } and ${maxOutput} output bit${maxOutput === 1 ? '' : 's'} using only 0, 1 or -.`,
      )
      store.set(show_popup, false)
      setTimeout(() => store.set(alert, ''), 3500)
      return
    }
  }

  const nextLabel = stringLabels[0] ?? ''
  const nextInput = getInputFromLabel(nextLabel)
  const nextOutput = getOutputFromLabel(nextLabel)
  const allTransitions = store.get(transition_list) ?? []
  const handleHiddenDontCareTransitions = true

  // check whether any of the new labels overlap with existing transitions from the same source node
  const nextInputs = stringLabels.map((label) => getInputFromLabel(label))
  const overlapsAnyLabel = (pattern) =>
    nextInputs.some((nextInput) => patternsOverlap(nextInput, pattern))

  const overlappingHiddenIds = handleHiddenDontCareTransitions
    ? allTransitions
        .map((transition, index) =>
          transition &&
          transition.from === src_node &&
          transition.hiddenDontCare &&
          overlapsAnyLabel(getInputFromLabel(transition.label))
            ? index
            : -1,
        )
        .filter((id) => id >= 0)
    : []

  const duplicateExists = allTransitions.some((transition, index) => {
    if (!transition || index === active_tr) return false
    if (transition.from !== src_node) return false
    if (getTransitionGroupId(transition) === groupId) return false
    // ignore hidden don't-care transitions for the purpose of duplication checks
    if (handleHiddenDontCareTransitions && transition.hiddenDontCare) return false
    return overlapsAnyLabel(getInputFromLabel(transition.label))
  })

  if (duplicateExists) {
    const mergeInfo = getClusterMergeInfo({ input: nextInput, output: moore ? '' : nextOutput })

    // One input carries one next-state pattern: add the draft as a second cluster target
    if (activeTransition.isDraft && mergeInfo?.mergeable) {
      addToHistory()
      store.set(transition_list, (old) => {
        const newTrList = [...old]
        const draft = newTrList[active_tr]
        if (!draft) return newTrList
        newTrList[active_tr] = {
          ...draft,
          groupId: mergeInfo.groupId,
          label: moore ? mergeInfo.input : `${mergeInfo.input}/${mergeInfo.output}`,
          input: mergeInfo.input,
          output: moore ? '' : mergeInfo.output,
          mealyOutput: moore ? undefined : mergeInfo.output,
          mealy_output: moore ? undefined : mergeInfo.output,
          hiddenDontCare: false,
          isDraft: false,
        }
        return newTrList
      })

      store.set(show_popup, false)
      store.set(active_transition, null)
      store.set(alert, `Combined into the don't-care row "${showPattern(mergeInfo.cube)}".`)
      setTimeout(() => store.set(alert, ''), 3500)
      sendExportToMainState()
      return
    }

    store.set(show_popup, false)
    if (activeTransition.isDraft) {
      removeTransitionById(active_tr)
      store.set(alert, 'The new transition is invalid and was discarded.')
    } else {
      store.set(alert, 'The new transition is invalid and cannot be saved.')
    }
    setTimeout(() => store.set(alert, ''), 3500)
    return
  }

  // Update the New Labels in store
  addToHistory()
  store.set(show_popup, false)

  // if  a draft transition "overlaps" with hidden don't-care transitions, update those instead of removing the draft
  if (
    handleHiddenDontCareTransitions &&
    activeTransition.isDraft &&
    overlappingHiddenIds.length > 0
  ) {
    const nodesMap = store.get(node_list) ?? []
    const existing = store.get(transition_list) ?? []
    const updated = [...existing]
    const replacedOutputInfo =
      !moore &&
      overlappingHiddenIds.some((hid) => {
        const previous = existing[hid]
        return (
          previous &&
          !/^x+$/.test(String(previous.output ?? previous.mealy_output ?? '').replace(/-/g, 'x'))
        )
      })
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

    if (replacedOutputInfo) {
      store.set(
        alert,
        `Replaced the don't-care transition for this input; its output is now "${showPattern(nextOutput)}".`,
      )
      setTimeout(() => store.set(alert, ''), 3500)
    }

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

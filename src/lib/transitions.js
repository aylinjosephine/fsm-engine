import { getLabelPosition, getTransitionPoints } from './editor'
import { sendExportToMainState } from './export'
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

// Existing transition from the same state overlapping the given input
export function findOverlappingTransition(inputPattern) {
  const active_tr = store.get(active_transition)
  const activeTransition = store.get(transition_list)[active_tr]
  if (!activeTransition) return null
  const src_node = activeTransition.from
  const groupId = getTransitionGroupId(activeTransition)
  const normalizedInput = normalizeBitsPattern(inputPattern)
  const allTransitions = store.get(transition_list) ?? []
  return (
    allTransitions.find((transition, index) => {
      if (!transition || index === active_tr) return false
      if (transition.from !== src_node) return false
      if (getTransitionGroupId(transition) === groupId) return false
      if (transition.hiddenDontCare) return false
      return patternsOverlap(normalizedInput, getInputFromLabel(transition.label))
    }) ?? null
  )
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
          } using only 0, 1 or x.`,
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
        } and ${maxOutput} output bit${maxOutput === 1 ? '' : 's'} using only 0, 1 or x.`,
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

  const overlappingHiddenIds = handleHiddenDontCareTransitions
    ? allTransitions
        .map((transition, index) =>
          transition &&
          transition.from === src_node &&
          transition.hiddenDontCare &&
          patternsOverlap(nextInput, getInputFromLabel(transition.label))
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
    return patternsOverlap(nextInput, getInputFromLabel(transition.label))
  })

  if (duplicateExists) {
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

  // If this new transition only overwrites hidden don't-care transitions, allow it
  if (
    handleHiddenDontCareTransitions &&
    activeTransition.isDraft &&
    overlappingHiddenIds.length > 0
  ) {
    const nodesMap = store.get(node_list) ?? []
    const existing = store.get(transition_list) ?? []
    const updated = [...existing]
    overlappingHiddenIds.forEach((hid) => {
      if (!updated[hid]) return
      const nextTo = Number.isFinite(activeTransition.to) ? activeTransition.to : updated[hid].to
      const nextToBinaryId =
        typeof activeTransition.toBinaryId === 'string'
          ? activeTransition.toBinaryId
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
        forceUnresolved: false,
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

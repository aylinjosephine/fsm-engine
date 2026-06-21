import {
  active_transition,
  editor_state,
  node_list,
  show_popup,
  stage_ref,
  store,
  transition_list,
  engine_mode,
  alert,
  fsm_type,
} from './stores'
import { addToHistory } from './history'
import { getAlphabetsFor } from './special_functions'
import { sendExportToMainState } from './export'
import { getTransitionPoints } from './editor'

const MIN_IO_BITS = 1
const MAX_IO_BITS = 10

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

// compute x / y bit number
export function getEditorBitLengths() {
  const transitions = store.get(transition_list) ?? []
  const moore = isMooreMode()
  const nodes = store.get(node_list) ?? []

  let maxInput = 1
  let maxOutput = 1

  for (const t of transitions) {
    if (!t) continue
    if (!moore && t.hiddenDontCare) continue
    const label = String(t.label ?? '')
    const [inp = '', out = ''] = label.split('/')
    maxInput = Math.max(maxInput, inp.length || 1)
    if (moore) {
      for (const node of nodes) {
        if (!node) continue
        maxOutput = Math.max(maxOutput, String(node.moore_output ?? '').length || 1)
      }
    } else {
      maxOutput = Math.max(maxOutput, out.length || 1)
    }
  }

  return { maxInput, maxOutput }
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

function clampBitsCount(value) {
  return Math.min(MAX_IO_BITS, Math.max(MIN_IO_BITS, Number(value) || MIN_IO_BITS))
}

export function setTransitionBitLengths(inputBits, outputBits) {
  const targetInput = clampBitsCount(inputBits)
  const targetOutput = clampBitsCount(outputBits)
  const { maxInput, maxOutput } = getEditorBitLengths()

  if (targetInput === maxInput && targetOutput === maxOutput) return false

  addToHistory()
  store.set(transition_list, (old) =>
    old.map((t) => {
      if (!t) return t
      return {
        ...t,
        label: padLabelToBitLengths(String(t.label ?? ''), targetInput, targetOutput),
      }
    }),
  )

  sendExportToMainState()
  return true
}

export function changeTransitionBitLengths(inputDelta = 0, outputDelta = 0) {
  const { maxInput, maxOutput } = getEditorBitLengths()
  return setTransitionBitLengths(maxInput + inputDelta, maxOutput + outputDelta)
}

function isValidBits(value) {
  return /^[01x]+$/.test(String(value ?? '').trim())
}

function getStateBits() {
  const nodes = (store.get(node_list) ?? []).filter(Boolean)
  const maxId = nodes.reduce((m, n) => Math.max(m, n?.id ?? -1), -1)
  const totalStates = Math.max(1, maxId + 1)
  return totalStates <= 1 ? 1 : Math.max(1, Math.ceil(Math.log2(totalStates)))
}

export function handleInvalidTransitionFallback(inputValue, outputValue) {
  const active_tr = store.get(active_transition)
  const activeTransition = store.get(transition_list)[active_tr]
  if (!activeTransition) return

  const { maxInput, maxOutput } = getEditorBitLengths()
  const normalizedInputValue = String(inputValue ?? '')
    .replace(/-/g, 'x')
    .trim()
  const normalizedOutputValue = String(outputValue ?? '')
    .replace(/-/g, 'x')
    .trim()
  const input = isValidBits(normalizedInputValue) ? normalizedInputValue : 'x'.repeat(maxInput)
  const output = isValidBits(normalizedOutputValue) ? normalizedOutputValue : 'x'.repeat(maxOutput)
  const paddedLabel = isMooreMode()
    ? padLabelToBitLengths(input, maxInput, maxOutput)
    : padLabelToBitLengths(`${input}/${output}`, maxInput, maxOutput)
  const unresolvedPattern = 'x'.repeat(getStateBits())

  addToHistory()
  store.set(show_popup, false)

  store.set(transition_list, (old) => {
    const next = [...old]
    if (next[active_tr]) {
      next[active_tr] = {
        ...next[active_tr],
        label: paddedLabel,
        isDraft: false,
        to: -1,
        toBinaryId: unresolvedPattern,
        forceUnresolved: true,
      }
    }
    return next
  })

  store.set(alert, 'Transition invalid: stored as unresolved (next state = x...x).')
  setTimeout(() => store.set(alert, ''), 2500)
  store.set(active_transition, null)
  sendExportToMainState()
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

// Handle Save on Changing a Transition's Label
export function handleTransitionSave(labels) {
  const automata_type = store.get(engine_mode).type
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
  const { maxInput, maxOutput } = getEditorBitLengths()
  for (const label of stringLabels) {
    if (moore) {
      if (label.length !== maxInput || !/^[01x]+$/.test(label)) {
        store.set(
          alert,
          `"${label}" invalid, enter exactly ${maxInput} input bit${maxInput === 1 ? '' : 's'} using {0,1,x}!`,
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
        `"${label}" invalid, enter exactly ${maxInput} input bit${
          maxInput === 1 ? '' : 's'
        } and ${maxOutput} output bit${maxOutput === 1 ? '' : 's'} using {0,1,x}!`,
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
      store.set(alert, 'The new transition is invalid and cannot be saved')
    }
    setTimeout(() => store.set(alert, ''), 3500)
    return
  }

  if (automata_type === 'DFA') {
    // If Automata is a DFA, don't allow multiple
    // transitions on the same alphabet from a state
    const consumed_letters = getAlphabetsFor(src_node)

    let err_msg = null

    const new_letters = labels.filter((alph) => !consumed_letters.includes(alph))

    if (new_letters.length == 0) {
      err_msg = `State '${
        store.get(node_list)[src_node].name
      }' already has a transition on the alphabets you picked!`
    }

    if (consumed_letters.filter(Boolean).length === store.get(engine_mode).alphabets.length) {
      err_msg = `State '${
        store.get(node_list)[src_node].name
      }' has already consumed all letters in language`
    }

    if (err_msg) {
      store.set(show_popup, () => false)
      store.set(alert, () => err_msg) // Display the error
      setTimeout(() => store.set(alert, () => ''), 3500)
      return // dont' add the transition
    }
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
        const transitionRef = { from: tr.from, to: tr.to, id: hid, tr_name: hid }
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
      const mid = getBezierPoint(points, 0.5)

      labelShape.x(mid.x)
      labelShape.y(mid.y)
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

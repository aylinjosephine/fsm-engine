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
} from './stores'
import { addToHistory } from './history'
import { getAlphabetsFor } from './special_functions'
import { sendExportToMainState } from './export'

// compute x / y bit number
export function getEditorBitLengths() {
  const transitions = store.get(transition_list) ?? []

  let maxInput = 1
  let maxOutput = 1

  for (const t of transitions) {
    if (!t) continue
    const label = String(t.label ?? '')
    const [inp = '', out = ''] = label.split('/')
    maxInput = Math.max(maxInput, inp.length || 1)
    maxOutput = Math.max(maxOutput, out.length || 1)
  }

  return { maxInput, maxOutput }
}

function padLabelToBitLengths(label, maxInput, maxOutput) {
  const [inpRaw = '', outRaw = ''] = label.split('/')

  const inp = inpRaw.padEnd(maxInput, 'x')
  const out = outRaw.padEnd(maxOutput, 'x')

  return `${inp}/${out}`
}


// Handle a click event on a transition
export function handleTransitionClick(id) {
  if (store.get(editor_state) === 'Remove') {
    const from_state = store.get(transition_list)[id].from
    const to_state = store.get(transition_list)[id].to

    // Delete the Display arrow
    const transition = store.get(stage_ref).findOne(`#tr_${id}`)
    transition?.destroy()

    // Remove this transition in store
    store.set(transition_list, (old) => {
      const newTrList = [...old]
      newTrList[id] = undefined
      return newTrList
    })

    // Remove this transition from Node
    store.set(node_list, (old) => {
      const newNodes = [...old]

      newNodes[from_state] = {
        ...newNodes[from_state],
        transitions: newNodes[from_state].transitions.filter(
          (tr) => tr.from !== from_state || tr.to !== to_state,
        ),
      }

      if (from_state !== to_state) {
        newNodes[to_state] = {
          ...newNodes[to_state],
          transitions: newNodes[to_state].transitions.filter(
            (tr) => tr.from !== from_state || tr.to !== to_state,
          ),
        }
      }
      return newNodes
    })
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
  const active_tr = store.get(active_transition)
  const src_node = store.get(transition_list)[active_tr].from

  // label validation: either x or x/y
  const stringLabels = labels.map((l) => String(l).trim())
  for (const label of stringLabels) {
    if (!/^[01x]+(?:\/[01x]+)?$/.test(label)) {
      store.set(alert, `"${label}" invalid, only {0,1,x}* or {0,1,x}*/{0,1,x}* allowed!`)
      store.set(show_popup, false)
      setTimeout(() => store.set(alert, ''), 3500)
      return
    }
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

  store.set(transition_list, (old) => {
    const newTrList = [...old]
    if (newTrList[active_tr]) {
      newTrList[active_tr] = {
        ...newTrList[active_tr],
        label: stringLabels[0] ?? '', // Sort them before updating labels
      }
    }
    return newTrList
  })

  // Update labels + position in UI (NEW: not casted to string, because unnecessary, nicer layout with space)
  const displayText = store.get(stage_ref).findOne(`#trtext_${active_tr}`)
  const labelShape = store.get(stage_ref).findOne(`#tr_label${active_tr}`)

  const labelText = stringLabels[0] ?? ''

  if (displayText) displayText.text(labelText)
  if (labelShape) {
    const points = store.get(transition_list)[active_tr].points
    labelShape.x(points[2] - 2 * labelText.length)
    labelShape.y(points[3] - 10)
  }

   const { maxInput, maxOutput } = getEditorBitLengths()

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

}

/*
 * This file has all the functions that are used in the Settings Component
 */

import { sendExportToMainState } from './export'
import { addToHistory } from './history'
import {
  current_selected,
  editor_state,
  fsm_type,
  initial_state,
  node_list,
  output_bit_count,
  store,
} from './stores'

function sanitizeMooreOutput(value) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/-/g, 'x')
    .replace(/[^01x]/gi, '')
  // Pad to the FSM's fixed output bit count so the stored value is exactly
  // as wide as configured.
  const outputBits = store.get(output_bit_count) || 1
  const padded = normalized.padEnd(outputBits, 'x').slice(0, outputBits)
  return padded.length > 0 ? padded : 'x'
}

// Resolve the fill color for a node, preserving the alpha channel if the base color is unchanged.
function resolveFill(currentFill, newColor) {
  const current = String(currentFill ?? '')
  const nextBase = String(newColor ?? '').toLowerCase()
  if (!/^#[0-9a-f]{6}$/.test(nextBase) || nextBase === current.slice(0, 7).toLowerCase()) {
    return current
  }
  return `${nextBase}${current.slice(7) || '80'}`
}

export function HandleSaveSettings(newName, newColor, newType, newMooreOutput = '') {
  const nodes = store.get(node_list) ?? []
  const id = store.get(current_selected)
  const node = nodes[id]
  if (!node) {
    store.set(editor_state, () => null)
    return
  }

  const isMoore = store.get(fsm_type) === 'moore'
  const nextInitial = !!newType?.initial
  const nextFill = resolveFill(node.fill, newColor)
  const nextOutput = isMoore ? sanitizeMooreOutput(newMooreOutput) : ''

  const changed =
    newName !== node.name ||
    nextFill !== node.fill ||
    nextInitial !== !!node.type?.initial ||
    nextOutput !== (node.moore_output ?? '')

  store.set(editor_state, () => null)
  if (!changed) return

  const previousInitialId = store.get(initial_state)
  const nextNodes = [...nodes]

  // The initial flag only adds the arrow and an fsm without is is valid
  if (
    nextInitial &&
    previousInitialId != null &&
    previousInitialId !== id &&
    nextNodes[previousInitialId]
  ) {
    nextNodes[previousInitialId] = {
      ...nextNodes[previousInitialId],
      type: { ...nextNodes[previousInitialId].type, initial: false, intermediate: true },
    }
  }

  // Always write a fresh node object, an in-place mutation would not notify the UI
  nextNodes[id] = {
    ...node,
    name: newName,
    fill: nextFill,
    type: { ...node.type, initial: nextInitial, intermediate: !nextInitial },
    moore_output: nextOutput,
  }
  store.set(node_list, () => nextNodes)

  if (nextInitial) {
    store.set(initial_state, () => id)
  } else if (previousInitialId === id) {
    store.set(initial_state, () => null)
  }

  addToHistory()
  sendExportToMainState()
}

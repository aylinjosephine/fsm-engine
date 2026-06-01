/*
 * This file has all the functions that are used in the Settings Component
 */

import { current_selected, editor_state, initial_state, fsm_type, node_list, store } from './stores'

export function HandleSaveSettings(newName, newColor, newType, newMooreOutput = '') {
  const nodeList = store.get(node_list)
  const id = store.get(current_selected)
  const isMoore = store.get(fsm_type) === 'moore'

  const name = nodeList[id].name
  const color = nodeList[id].fill
  const type = nodeList[id].type
  const currentMooreOutput = nodeList[id].moore_output ?? ''

  if (newName !== name) {
    // If name of the state has changed
    const newRadius = newName.length + 35

    // Update Name in Store
    store.set(node_list, (prev) => {
      prev[id].name = newName
      prev[id].radius = newRadius
      return prev
    })
  }

  //  color.substr because we only consider the first 6 chars for rgb and no alpha
  if (newColor !== color.substr(0, 7)) {
    // Update Name in Store
    store.set(node_list, (prev) => {
      prev[id].fill = `${newColor}}80`
      return prev
    })
  }

  if (JSON.stringify(newType) !== JSON.stringify(type)) {
    // If this state has been set as initial state then update the stores
    if (newType.initial) {
      if (store.get(initial_state) == null) {
        // Set initial state as current node
        store.set(initial_state, (_) => id)
      } else {
        // Remove the previous state's type as initial
        const prev_initial = store.get(initial_state)
        store.set(node_list, (prev) => {
          prev[prev_initial].type.initial = false
          return prev
        })

        // Update initial_state to point to this state
        store.set(initial_state, (_) => id)
      }
    }

    store.set(node_list, (prev) => {
      prev[id].type = newType

      return prev
    })
  }

  if (isMoore) {
    const resolvedOutput = newMooreOutput.trim() ? newMooreOutput.trim() : 'x'
    if (resolvedOutput !== currentMooreOutput) {
      store.set(node_list, (prev) => {
        prev[id].moore_output = resolvedOutput
        return prev
      })
    }
  } else if (currentMooreOutput !== '') {
    store.set(node_list, (prev) => {
      prev[id].moore_output = ''
      return prev
    })
  }

  store.set(editor_state, (_prev) => null)
  return
}

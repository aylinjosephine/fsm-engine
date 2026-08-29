/*
This file contains all the algorithmic implementations
*/

import { HandleAutoLayout } from './editor'
import { deleted_nodes, node_list, store, transition_list } from './stores'

export async function HandleLoadFSM() {
  // Create a hidden file input
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.fsm,application/json'

  // Handle file selection
  input.onchange = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    const text = await file.text()
    try {
      const data = JSON.parse(text) // assign to global variable
      store.set(node_list, () => data.nodes)
      store.set(transition_list, () => data.transitions)
      store.set(deleted_nodes, () => data.deleted_nodes)
    } catch (err) {
      console.error('Invalid JSON:', err)
    }

    // Clean up
    document.body.removeChild(input)

    HandleAutoLayout() // Format the FSM
  }

  document.body.appendChild(input)
  input.click()
}

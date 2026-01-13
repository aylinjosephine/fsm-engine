// This file contains all the global state variables

import { atom, createStore } from 'jotai'

// Global State for konva stage reference
export const stage_ref = atom(null)

// Global Store to hold value of Konva Stage ref
export const editor_state = atom('Guide')

// Global Store to hold value of Konva Layer ref
export const layer_ref = atom(null)

// Global Store to keep track of States
export const node_list = atom([])
// NEW: A single item of node_list has the following shape:
/*
{
  id: number,
  x: number,
  y: number,
  name: string,
  radius: number,
  fill: string,
  type: {
    initial: boolean,
    intermediate: boolean,
    final: boolean,
  },
  moore_output: string, // Moore output for this state (used if automaton_type === 'moore')
  transitions: Array<{
    from: number,
    to: number,
    id: number,
  }>,
}
*/

// Global Store to keep track of Transitions
export const transition_list = atom([])

// A array to keep track of deleted State Id's
// Why?
/*
 *  Say the user adds q0, q1 and q2, then deletes q1.
 *  The Next time the user adds a new state it should have the name q1 and not q3.
 * For this, we keep an array of state id's previously deleted
 */
export const deleted_nodes = atom([])

// Kepp track of the currently selected Node
export const current_selected = atom(null)

// Keep track of which state is the initial state
export const initial_state = atom(null)

// Keep track of the two states that are clicked on when in Connect Mode
export const transition_pairs = atom(null)

// NEW: Keep track of Automaton Type which has been set in project
// AutomatonType = 'mealy' | 'moore'
export const automaton_type = atom('mealy')

// Alert Message
export const alert = atom('')

// Store to keep track of current FSM Mode
export const engine_mode = atom({
  type: 'Free Style',
  alphabets: [],
})

// Show Popup
export const show_popup = atom(false)
export const active_transition = atom(null)

// Store to cache contributors
export const contributors_data = atom(null)

// Store to toggle Transition Table visibility
export const show_transition_table = atom(false)

// Store for Confirm Dialog
export const confirm_dialog_atom = atom({
  isOpen: false,
  message: '',
  onConfirm: null,
  onCancel: null,
})

// Export store provider
export const store = createStore()

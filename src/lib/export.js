// import { getDefaultStore } from 'jotai'
import { node_list, transition_list, store } from './stores'
import { HandleAutoLayout } from './editor'

let updateFromState = false

// changed default store to store from stores.js since we have a custom store where editor / app.jsx data is saved
export function extractFsmData() {
  const nodes = store.get(node_list) ?? []
  const transitions = store.get(transition_list) ?? []

  console.log('exported from export.js:', nodes)
  return {
    states: nodes.map((n) => ({
      id: n.id,
      name: n.name,
      initial: !!n.type?.initial,
      final: !!n.type?.final,
    })),
    transitions: transitions.map((t) => ({
      id: t.id,
      from: t.from,
      to: t.to,
      label: String(t.label ?? ''),
    })),
  }
}

export function sendExportToParent() {
if (updateFromState) return

  const fsm = extractFsmData()
  window.parent.postMessage({ action: 'export', fsm }, '*')
}

// import of state table data as automaton state data
window.addEventListener('message', (event) => {
  if (event.data?.action !== 'automatonimport') return

  const fsm = event.data.fsm
  if (!fsm) return

  const states = fsm.states ?? []
  const transitions = fsm.transitions ?? []

  const nodeAtoms = states.map((s, index) => {
    const col = index % 5
    const row = Math.floor(index / 5)
    const baseX = 200
    const baseY = 150
    const dx = 220
    const dy = 160

    return {
      id: s.id,
      name: s.name ?? '',
      x: baseX + col * dx,
      y: baseY + row * dy,
      radius: 40,
      fill: '#1f2937',
      type: {
        initial: !!s.initial,
        final: !!s.final,
      },
      transitions: [],
    }
  })

  const transitionAtoms = transitions.map((t) => ({
    id: t.id,
    from: t.from,
    to: t.to,
    label: t.label ?? '',
    stroke: '#ffffff',
    strokeWidth: 2,
    fill: '#ffffff',
    points: [0, 0, 100, 0],
    tension: 0,
    fontSize: 16,
    fontStyle: 'normal',
    label_fill: '#000000',
    label_align: 'center',
  }))
  updateFromState = true
  store.set(node_list, nodeAtoms)
  store.set(transition_list, transitionAtoms)
  HandleAutoLayout()
  updateFromState = false
})

export function clearFsmFromParent() {
  store.set(node_list, [])
  store.set(transition_list, [])
}

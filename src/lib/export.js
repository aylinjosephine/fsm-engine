// import { getDefaultStore } from 'jotai'
import { node_list, transition_list, automaton_type, store } from './stores'
import { getTransitionPoints } from './editor'

let updateFromState = false

// changed default store to store from stores.js since we have a custom store where editor / app.jsx data is saved
export function extractFsmData() {
  const nodes = store.get(node_list) ?? []
  const transitions = store.get(transition_list) ?? []
  const automatonType = store.get(automaton_type) ?? 'mealy'

  return {
    states: nodes.map((n) => ({
      id: n.id,
      name: n.name,
      initial: !!n.type?.initial,
      final: !!n.type?.final,
      moore_output: n.moore_output ?? '',
    })),
    transitions: transitions.map((t) => {
      const label = String(t.label ?? '')
      const [input = '', out = ''] = label.split('/')
      return {
        id: t.id,
        from: t.from,
        to: t.to,
        input,
        mealy_output: out,
      }
    }),
    automatonType,
  }
}

export function sendExportToMainState() {
  if (updateFromState) return

  const fsm = extractFsmData()
  window.parent.postMessage({ action: 'editorToTableExport', fsm }, '*')
}

// import of state table data as automaton state data
// NEW: tried to make auto layout look like the fsm layout
window.addEventListener('message', (event) => {
  console.log('automatonimport event arrived in fsm engine')
  if (event.data?.action !== 'automatonimport') return

  const fsm = event.data.fsm
  if (!fsm) return

  const states = fsm.states ?? []
  const transitions = fsm.transitions ?? []
  const { automatonType = 'mealy' } = fsm

  const existingNodes = store.get(node_list) ?? []

  const nodeAtoms = states.map((s, index) => {
    const existing = existingNodes.find((n) => n && n.id === s.id)
    const moore_output = s.moore_output ?? existing?.moore_output ?? ''

    if (existing) {
      // auto layout only on new states
      return {
        ...existing,
        name: s.name ?? existing.name,
        moore_output,
        type: {
          ...existing.type,
          initial: !!s.initial,
          final: !!s.final,
        },
      }
    }

    const col = index % 6
    const row = Math.floor(index / 6)
    const baseX = 150
    const baseY = 120
    const dx = 140
    const dy = 160

    const name = s.name ?? `q${s.id}`

    return {
      id: s.id,
      name,
      x: baseX + col * dx,
      y: baseY + row * dy,
      radius: name.length + 35,
      fill: '#ffffff80',
      moore_output,
      type: {
        initial: !!s.initial,
        intermediate: !s.initial,
        final: !!s.final,
      },
      transitions: [],
    }
  })

  const existingTransitions = store.get(transition_list) ?? []

  // only transitions with all data
  const transitionAtoms = transitions
    .filter((t) => {
      const fromExists = nodeAtoms.some((n) => n && n.id === t.from)
      const toExists = nodeAtoms.some((n) => n && n.id === t.to)
      return fromExists && toExists
    })
    .map((t) => {
      const existing = existingTransitions.find((tr) => tr && tr.id === t.id)

      const labelFromParent =
        typeof t.input === 'string' && typeof t.mealy_output === 'string'
          ? `${t.input}/${t.mealy_output}`
          : (t.label ?? existing?.label ?? '0/0')

      if (existing) {
        return {
          ...existing,
          label: labelFromParent,
          from: t.from,
          to: t.to,
        }
      }

      const points = getTransitionPoints(t.from, t.to, t.id)

      return {
        id: t.id,
        from: t.from,
        to: t.to,
        label: labelFromParent,
        stroke: '#ffffffdd',
        strokeWidth: 2,
        fill: '#ffffffdd',
        points,
        tension: t.from === t.to ? 1 : 0.5,
        fontSize: 20,
        fontStyle: 'bold',
        label_fill: '#ffffff',
        label_align: 'center',
      }
    })

  updateFromState = true
  store.set(node_list, nodeAtoms)
  store.set(transition_list, transitionAtoms)
  store.set(automaton_type, automatonType)
  setTimeout(() => {
    updateFromState = false
  }, 0)
})

export function clearFsmFromParent() {
  store.set(node_list, [])
  store.set(transition_list, [])
}

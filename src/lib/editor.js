/* eslint-disable @typescript-eslint/no-unused-vars */

/*
 * This file has all the functions that are used in the Editor Component
 */

import {
  active_transition,
  alert,
  current_selected,
  deleted_nodes,
  editor_state,
  engine_mode,
  automaton_type,
  initial_state,
  node_list,
  show_popup,
  stage_ref,
  store,
  transition_list,
  transition_pairs,
  confirm_dialog_atom,
} from './stores'
import { addToHistory, undo, redo, clearHistory } from './history'
import { sendExportToMainState } from './export'
import dagre from 'dagre'
import Konva from 'konva'

// Handler function for dropping the initial arrow handle onto a state
export function handleInitialArrowDrop(dropX, dropY) {
  const nodes = store.get(node_list)
  let closest = null
  let minDist = Infinity

  nodes.forEach((node) => {
    if (!node) return
    const dist = Math.sqrt((node.x - dropX) ** 2 + (node.y - dropY) ** 2)
    const snapRadius = node.radius + 40
    if (dist < snapRadius && dist < minDist) {
      closest = node
      minDist = dist
    }
  })

  if (!closest) return
  const prevInitialId = store.get(initial_state)
  if (prevInitialId === closest.id) return

  store.set(node_list, (prev) => {
    const next = [...prev]
    if (prevInitialId != null && next[prevInitialId]) {
      next[prevInitialId] = {
        ...next[prevInitialId],
        type: { ...next[prevInitialId].type, initial: false, intermediate: true },
      }
    }
    next[closest.id] = {
      ...next[closest.id],
      type: { ...next[closest.id].type, initial: true, intermediate: false },
    }
    return next
  })
  store.set(initial_state, closest.id)
  addToHistory()
  sendExportToMainState()
}

// Handler function that is called when the editor is clicked
export function HandleEditorClick(e) {
  const group = e.target.getStage().findOne('Layer')
  if (!group) return

  // Deselect if clicking on background
  if (e.target === e.target.getStage()) {
    store.set(current_selected, null)
  }

  if (store.get(editor_state) === 'Add') {
    // Add a new State to the editor if it is in Add Mode
    const clickPos = group.getRelativePointerPosition()

    let circle_id = store.get(node_list).length

    if (store.get(deleted_nodes).length > 0) {
      // Check if a deleted state id is available
      circle_id = store.get(deleted_nodes)[0]
      store.set(deleted_nodes, (prev) => {
        prev.shift()
        return prev
      })
    }

    const circle = makeCircle(clickPos, circle_id)
    const nodes_copy = store.get(node_list).slice()

    if (circle_id !== nodes_copy.length) {
      nodes_copy[circle_id] = circle
    } else {
      if (circle_id === 0) {
        // This is the first state and so the initial one
        if (store.get(initial_state) == null) store.set(initial_state, (_) => 0)
      }
      nodes_copy.push(circle)
    }

    store.set(node_list, (_prev) => nodes_copy) // Update Node List
    addToHistory()
  }
}

// Handler function to update Position of nodes when they are dragged around
export function HandleDragEnd(e, id) {
  const draggedState = store.get(stage_ref).findOne(`#state_${id}`) // Get the Circle
  const position = [draggedState.x(), draggedState.y()] // Get it's positions
  // Update the State's Position in store
  store.set(node_list, (prev) => {
    const newNodes = [...prev]
    newNodes[id] = { ...newNodes[id], x: position[0], y: position[1] }
    return newNodes
  })
  addToHistory()
}

// Handler Function for when a State is clicked
export function HandleStateClick(e, id) {
  e.cancelBubble = true
  const clickType = e.evt.button === 0 ? 'left' : e.evt.button === 2 ? 'right' : 'middle'

  if (clickType === 'right') {
    // Set Current Selected to the node's id
    store.set(current_selected, (_prev) => id)
    // Open the Settings for the State on right Click
    store.set(editor_state, (_prev) => 'settings')
    return
  }

  const clickedNode = store.get(stage_ref).findOne(`#state_${id}`)

  if (store.get(editor_state) === 'Remove') {
    removeState(id, clickedNode)
    return
  }

  if (store.get(editor_state) === 'Connect') {
    if (store.get(transition_pairs) == null) {
      // If this is the first state that is clicked, then remember it
      store.set(transition_pairs, (_) => id)
      store.set(current_selected, (_) => id) // Highlight the source node
      return
    } else {
      // Get the two states for drawing a transitions
      const start_node = store.get(transition_pairs)
      const end_node = id
      const tr_id = getNextTransitionId()

      // Define a new Transition
      const newTransition = makeTransition(tr_id, start_node, end_node)

      // Update the transition_list store
      store.set(transition_list, (prev) => {
        const nextTransitions = [...prev]
        nextTransitions[tr_id] = newTransition
        return nextTransitions
      })

      // Reset the transition_pairs store
      store.set(transition_pairs, (_) => null)
      store.set(current_selected, null) // Clear highlight after connection

      // Also update the corresponding state's transition array
      store.set(node_list, (prev) => {
        const newNodes = [...prev]
        const tr = {
          from: start_node,
          to: end_node,
          id: tr_id,
        }
        // Update for start node
        newNodes[start_node] = {
          ...newNodes[start_node],
          transitions: [...newNodes[start_node].transitions, tr],
        }

        if (start_node !== end_node) {
          // Update for end node
          newNodes[end_node] = {
            ...newNodes[end_node],
            transitions: [...newNodes[end_node].transitions, tr],
          }
        }

        return newNodes
      })

      addToHistory()

      // Open Popup for labeling
      if (store.get(automaton_type) !== 'Free Style') {
        store.set(active_transition, () => tr_id)
        store.set(show_popup, true)
      }
    }
  }

  // CUSTOM: add Button to change label
  if (store.get(editor_state) === 'Label') {
    store.set(current_selected, id)
    store.set(editor_state, 'settings')
    return
  }

  // If not in special modes, select the node
  if (!['Add', 'Remove', 'Connect', 'Label'].includes(store.get(editor_state))) {
    store.set(current_selected, (_prev) => id)
  }
}

// Handler function for when the editor is scrolled
export function HandleScrollWheel(e) {
  // Zoom in or zoom out

  const stage = store.get(stage_ref)

  // Got this part of the code from Konva Documentation
  const oldScale = stage.scaleX()
  const pointer = stage.getPointerPosition()

  const mousePointTo = {
    x: (pointer.x - stage.x()) / oldScale,
    y: (pointer.y - stage.y()) / oldScale,
  }

  // how to scale? Zoom in? Or zoom out?
  let direction = e.evt.deltaY > 0 ? 1 : -1

  // when we zoom on trackpad, e.evt.ctrlKey is true
  // in that case lets revert direction
  if (e.evt.ctrlKey) {
    direction = -direction
  }

  const scaleBy = 1.01
  const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy

  stage.scale({ x: newScale, y: newScale })

  const newPos = {
    x: pointer.x - mousePointTo.x * newScale,
    y: pointer.y - mousePointTo.y * newScale,
  }

  stage.position(newPos)
}

// Function to update the positions of transition arrows when a node is dragged around
export function HandleStateDrag(e, id) {
  const state = store.get(node_list)[id] // Get the state

  const group = store.get(stage_ref).findOne('Group')
  let transition
  let transition_label

  state.transitions.forEach((tr) => {
    transition = group.findOne(`#transition_${tr.id}`)
    transition_label = group.findOne(`#tr_label${tr.id}`)

    const points = getTransitionPoints(tr.from, tr.to, tr.id)

    // Update it in store
    store.set(transition_list, (prev) => {
      const newTrList = [...prev]
      if (newTrList[tr.id]) {
        newTrList[tr.id] = { ...newTrList[tr.id], points: points }
      }
      return newTrList
    })

    transition.points(points) // Update it on display

    // Update transition Label display
    transition_label.x(points[2] - 2 * store.get(transition_list)[tr.id].label.toString().length)
    transition_label.y(points[3] - 10)
  })
}

export function handleShortCuts(key) {
  const keyBindings = ['Add', 'Remove', 'Connect']

  /*
	Key Bindings as follows:
	1 -> Pan,
	2 -> Add,
	3 -> Remove,
	...
  */

  if ((key === 'z' || key === 'Z') && store.get(editor_state) !== 'Controls') {
    undo(getTransitionPoints)
    return
  }

  if ((key === 'y' || key === 'Y') && store.get(editor_state) !== 'Controls') {
    redo(getTransitionPoints)
    return
  }

  if (
    !store.get(show_popup) &&
    !['Controls', 'Guide', 'Save FSM'].includes(store.get(editor_state)) &&
    key - 1 < keyBindings.length
  ) {
    if (key == 1) {
      store.set(confirm_dialog_atom, {
        isOpen: true,
        message: 'Are you sure you want to start a new project? Any unsaved work will be lost!',
        onConfirm: () => {
          newProject()
        },
      })
      return
    }
    store.set(editor_state, (_) => keyBindings[key - 1])
  }
}

/************** HELPER FUNCTIONS ***************/
/*
 * This function takes the x,y position of the circle and
 * returns a circle object that can be added to node_list as a state
 */
function makeCircle(position, id) {
  const x = position.x
  const y = position.y

  const circle = {
    id: id,
    x: x,
    y: y,
    name: `q${id}`,
    fill: '#4a6fae88',
    radius: `q${id}`.length + 35,
    type: {
      initial: id === 0,
      intermediate: id !== 0,
      final: false,
    },
    moore_output: '',
    transitions: [], // This will have the object {from: num,to: num, label: string}
  }
  return circle
}

function removeState(id, clickedNode) {
  const nodes = store.get(node_list) ?? []
  const transitions = store.get(transition_list) ?? []
  const state = nodes[id]

  if (!state) return

  if (id === store.get(current_selected)) store.set(current_selected, () => null)

  clickedNode?.destroy()

  const connectedTransitionIds = new Set(
    transitions
      .filter((transition) => transition && (transition.from === id || transition.to === id))
      .map((transition) => transition.id),
  )

  connectedTransitionIds.forEach((transitionId) => {
    const transitionShape = store.get(stage_ref).findOne(`#tr_${transitionId}`)
    transitionShape?.destroy()
  })

  store.set(transition_list, (prev) => {
    const nextTransitions = [...prev]
    connectedTransitionIds.forEach((transitionId) => {
      nextTransitions[transitionId] = undefined
    })
    return nextTransitions
  })

  store.set(node_list, (prev) => {
    const nextNodes = [...prev]

    nextNodes.forEach((node, nodeId) => {
      if (!node) return

      if (nodeId === id) {
        nextNodes[nodeId] = undefined
        return
      }

      nextNodes[nodeId] = {
        ...node,
        transitions: node.transitions.filter(
          (transition) => !connectedTransitionIds.has(transition.id),
        ),
      }
    })

    return nextNodes
  })

  store.set(deleted_nodes, (prev) => {
    if (prev.includes(id)) return prev
    const nextDeleted = [...prev, id]
    nextDeleted.sort((left, right) => left - right)
    return nextDeleted
  })

  if (store.get(initial_state) === id) {
    store.set(initial_state, (_) => null)
  }

  addToHistory()
  sendExportToMainState()
}

function getNextTransitionId() {
  const transitions = store.get(transition_list) ?? []
  let maxId = -1

  transitions.forEach((transition, index) => {
    if (!transition) return
    maxId = Math.max(maxId, transition.id ?? index)
  })

  return maxId + 1
}

// This function returns the points for the
// state transition arrow between states id1 and id2
// Optional: nodesMap / transitionsOverride can be passed to compute points against
// incoming state during imports instead of the currently committed store.
export function getTransitionPoints(id1, id2, tr_id, nodesMap = null, transitionsOverride = null) {
  const nodes = nodesMap || store.get(node_list)
  const startNode = nodes[id1]
  const clickedGroup = nodes[id2]

  if (!startNode || !clickedGroup) {
    return [0, 0, 100, 0]
  }

  // Get all transitions between these two nodes
  const allTransitions = (transitionsOverride || store.get(transition_list)).filter(
    (t) => t && t.from === id1 && t.to === id2,
  )

  // Sort them by ID to ensure consistent ordering
  allTransitions.sort((a, b) => a.id - b.id)

  // Find index of current transition
  const index = allTransitions.findIndex((t) => t.id === tr_id)
  const count = allTransitions.length

  // If this is a new transition being created (not in list yet), it will be the last one
  const effectiveIndex = index === -1 ? count : index

  if (id1 == id2) {
    // Self-loop
    const node = startNode
    const x = node.x
    const y = node.y
    const radius = node.radius
    const slotsPerLevel = 4
    const level = Math.floor(effectiveIndex / slotsPerLevel)
    const slotInLevel = effectiveIndex % slotsPerLevel
    const sideAngles = [
      (-2 * Math.PI) / 3, // 11 o'clock
      -Math.PI / 3, // 1 o'clock
      Math.PI / 3, // 5 o'clock
      (2 * Math.PI) / 3, // 7 o'clock
    ]
    const sideAngle = sideAngles[slotInLevel] ?? -Math.PI / 2

    const openingAngle = 0.22
    const anchorRadius = radius + 5
    const baseControlRadius = radius + 52
    const controlRadius = baseControlRadius * (1 + level * 0.5)

    const startAngle = sideAngle - openingAngle
    const endAngle = sideAngle + openingAngle

    const points = [
      x + anchorRadius * Math.cos(startAngle),
      y + anchorRadius * Math.sin(startAngle),
      x + controlRadius * Math.cos(sideAngle),
      y + controlRadius * Math.sin(sideAngle),
      x + anchorRadius * Math.cos(endAngle),
      y + anchorRadius * Math.sin(endAngle),
    ]

    return points
  }

  const dx = clickedGroup.x - startNode.x
  const dy = clickedGroup.y - startNode.y
  const angle = Math.atan2(-dy, dx)

  const startRadius = startNode.radius + 10
  const endRadius = clickedGroup.radius + 10

  const start = [
    startNode.x + -startRadius * Math.cos(angle + Math.PI),
    startNode.y + startRadius * Math.sin(angle + Math.PI),
  ]

  const end = [
    clickedGroup.x + -endRadius * Math.cos(angle),
    clickedGroup.y + endRadius * Math.sin(angle),
  ]

  const midpoint = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]
  const dist = Math.sqrt((start[0] - end[0]) ** 2 + (start[1] - end[1]) ** 2)

  // Dynamic curvature calculation
  const baseCurvature = 0.2
  const curvatureStep = 0.15
  const curvature = baseCurvature + effectiveIndex * curvatureStep

  let subpoint2

  // Adjust the subpoint 2 based on if the states
  // are arranged horizontally or vertically
  const xdiff = Math.abs(start[0] - end[0])
  const ydiff = Math.abs(start[1] - end[1])

  if (xdiff > ydiff) {
    // States are arranged horizontally
    subpoint2 =
      start[0] < end[0]
        ? [midpoint[0], midpoint[1] - curvature * dist]
        : [midpoint[0], midpoint[1] + curvature * dist]

    end[1] = start[0] < end[0] ? end[1] - 20 : end[1] + 20
  } else {
    // States are arranged vertically
    subpoint2 =
      start[1] < end[1]
        ? [midpoint[0] + curvature * dist, midpoint[1]]
        : [midpoint[0] - curvature * dist, midpoint[1]]

    end[0] = start[1] < end[1] ? end[0] + 20 : end[0] - 20
  }

  const points = [
    start[0],
    start[1],
    subpoint2[0],
    subpoint2[1],
    end[0], // Prevent overlapping of arrow heads
    end[1],
  ]

  return points
}

function makeTransition(id, start_node, end_node) {
  const points = getTransitionPoints(start_node, end_node, id)

  const newTransition = {
    id,
    stroke: '#ffffffdd',
    strokeWidth: 2,
    fill: '#ffffffdd',
    points,
    tension: start_node == end_node ? 1 : 0.5,
    label: '',
    fontSize: 14,
    fontStyle: 'bold',
    label_fill: '#ffffff',
    label_align: 'center',
    from: start_node,
    to: end_node,
    isDraft: true,
  }

  return newTransition
}

export function HandleAutoLayout() {
  const nodes = store.get(node_list)
  const transitions = store.get(transition_list)
  const stage = store.get(stage_ref)

  // Filter out undefined nodes (deleted ones)
  const validNodeIds = nodes.map((n, i) => (n ? i : -1)).filter((i) => i !== -1)

  if (validNodeIds.length === 0) return

  // Create a new directed graph
  const g = new dagre.graphlib.Graph()

  // Set an object for the graph label
  g.setGraph({
    rankdir: 'LR', // Left-to-Right layout
    // align: "UL", // Align to Upper-Left
    ranksep: 180, // Separation between ranks
    nodesep: 100, // Separation between nodes in the same rank
    marginx: 50,
    marginy: 50,
  })

  // Default to assigning a new object as a label for each new edge.
  g.setDefaultEdgeLabel(() => ({}))

  // Add nodes to the graph.
  validNodeIds.forEach((id) => {
    const node = nodes[id]
    const size = node.radius * 2 + 20
    g.setNode(`${id}`, { width: size, height: size })
  })

  // Add edges to the graph.
  transitions.forEach((tr) => {
    if (!tr) return
    g.setEdge(`${tr.from}`, `${tr.to}`)
  })

  // Run the layout
  dagre.layout(g)

  // Calculate final positions
  const finalPositions = {}
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity

  g.nodes().forEach((v) => {
    const nodeData = g.node(v)
    const id = parseInt(v)
    // dagre gives center coordinates
    finalPositions[id] = { x: nodeData.x, y: nodeData.y }

    // Update bounds for auto-fit calculation
    const node = nodes[id]
    const radius = node.radius
    minX = Math.min(minX, nodeData.x - radius)
    minY = Math.min(minY, nodeData.y - radius)
    maxX = Math.max(maxX, nodeData.x + radius)
    maxY = Math.max(maxY, nodeData.y + radius)
  })

  // Calculate Auto-Fit Scale and Position
  const padding = 100
  const graphWidth = maxX - minX + 2 * padding
  const graphHeight = maxY - minY + 2 * padding

  const stageWidth = stage.width()
  const stageHeight = stage.height()

  const scaleX = stageWidth / graphWidth
  const scaleY = stageHeight / graphHeight
  const scale = Math.min(scaleX, scaleY, 1) // Don't zoom in too much (max scale 1)

  // Center the graph
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  const targetStageX = stageWidth / 2 - centerX * scale
  const targetStageY = stageHeight / 2 - centerY * scale

  // Animate Stage
  new Konva.Tween({
    node: stage,
    duration: 0.5,
    easing: Konva.Easings.EaseInOut,
    x: targetStageX,
    y: targetStageY,
    scaleX: scale,
    scaleY: scale,
  }).play()

  // Animate Nodes
  let completedTweens = 0
  const totalTweens = validNodeIds.length

  validNodeIds.forEach((id) => {
    const nodeShape = stage.findOne(`#state_${id}`)
    if (!nodeShape) return

    const targetPos = finalPositions[id]

    new Konva.Tween({
      node: nodeShape,
      duration: 0.5,
      easing: Konva.Easings.EaseInOut,
      x: targetPos.x,
      y: targetPos.y,
      onFinish: () => {
        completedTweens++
        if (completedTweens === totalTweens) {
          // All animations done. Sync Store.

          // Update Nodes
          const newNodes = [...nodes]
          validNodeIds.forEach((nid) => {
            if (newNodes[nid]) {
              newNodes[nid].x = finalPositions[nid].x
              newNodes[nid].y = finalPositions[nid].y
            }
          })
          store.set(node_list, () => newNodes)

          // Update Transitions (Recalculate points based on new positions)
          const newTransitions = [...transitions]
          newTransitions.forEach((tr, i) => {
            if (!tr) return
            // Now the store has new node positions, so this works
            const points = getTransitionPoints(tr.from, tr.to, tr.id)
            newTransitions[i].points = points
          })
          store.set(transition_list, () => newTransitions)
        }
      },
    }).play()
  })

  // Animation Loop for Arrows
  const anim = new Konva.Animation(() => {
    // Build a map of current node positions from the shapes
    const currentNodes = [...nodes]
    let updated = false

    validNodeIds.forEach((id) => {
      const shape = stage.findOne(`#state_${id}`)
      if (shape) {
        currentNodes[id] = { ...currentNodes[id], x: shape.x(), y: shape.y() }
        updated = true
      }
    })

    if (!updated) return

    // Update all transitions
    transitions.forEach((tr) => {
      if (!tr) return
      const trShape = stage.findOne(`#transition_${tr.id}`)
      const trLabel = stage.findOne(`#tr_label${tr.id}`)

      if (trShape) {
        const points = getTransitionPoints(tr.from, tr.to, tr.id, currentNodes)
        trShape.points(points)

        if (trLabel) {
          trLabel.x(points[2] - 2 * tr.label.toString().length)
          trLabel.y(points[3] - 10)
        }
      }
    })
  }, stage.findOne('Layer'))

  anim.start()

  // Stop animation after tween duration
  setTimeout(() => {
    anim.stop()
    addToHistory()
  }, 550)
}

export function newProject() {
  // Clear all stores and start a new project
  store.set(node_list, () => [])
  store.set(transition_list, () => [])
  store.set(deleted_nodes, () => [])
  store.set(current_selected, () => null)
  store.set(initial_state, () => null)
  store.set(transition_pairs, () => null)
  store.set(show_popup, () => false)
  store.set(active_transition, () => null)
  clearHistory()
  window.dispatchEvent(new CustomEvent('fsm-clear'))
}

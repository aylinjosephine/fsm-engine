import { useAtom, useAtomValue } from 'jotai'
import { useEffect, useState } from 'react'
import { Arrow, Circle, Group, Label, Layer, Stage, Tag, Text } from 'react-konva'
import {
  HandleDragEnd,
  HandleEditorClick,
  HandleScrollWheel,
  HandleStateClick,
  HandleStateDrag,
  handleInitialArrowDrop,
} from '../lib/editor'
import {
  editor_state,
  layer_ref,
  node_list,
  stage_ref,
  transition_list,
  current_selected,
  automaton_type,
} from '../lib/stores'
import { handleTransitionClick } from '../lib/transitions'

const Editor = () => {
  // Jotai Atoms
  const nodeList = useAtomValue(node_list)
  const editorState = useAtomValue(editor_state)
  const [_stageRef, setStageRef] = useAtom(stage_ref)
  const [transitionList, _setTransitionList] = useAtom(transition_list)
  const [_layerRef, setLayerRef] = useAtom(layer_ref)
  const currentSelected = useAtomValue(current_selected)
  const automatonType = useAtomValue(automaton_type)

  // responsive stage size
  const [stageSize, setStageSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  })

  useEffect(() => {
    function handleResize() {
      setStageSize({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <Stage
      width={stageSize.width}
      height={stageSize.height}
      onClick={HandleEditorClick}
      draggable
      ref={(el) => setStageRef(el)}
      onWheel={HandleScrollWheel}
    >
      <Layer ref={(el) => setLayerRef(el)}>
        <Group>
          {
            /******** Display The States of the FSM ********/
            nodeList.map(
              (circle, i) =>
                circle && (
                  <Group
                    key={i}
                    id={`state_${circle.id}`}
                    x={circle.x}
                    y={circle.y}
                    draggable={!['Add', 'Remove'].includes(editorState)}
                    onDragEnd={(e) => {
                      HandleDragEnd(e, circle.id)
                      HandleStateDrag(e, circle.id)
                    }}
                    onClick={(e) => HandleStateClick(e, circle.id)}
                  >
                    <Circle
                      x={0}
                      y={0}
                      radius={2 * circle.name.length + circle.radius}
                      fill={
                        circle.fill === '#ffffff80' || circle.fill === '#ffffff'
                          ? '#4a6fae88'
                          : circle.fill
                      }
                      stroke={currentSelected === circle.id ? '#3b82f6' : null}
                      strokeWidth={currentSelected === circle.id ? 4 : 0}
                    />
                    <Text
                      x={-circle.radius - circle.name.length / 2}
                      y={-circle.radius / 4}
                      width={2 * circle.radius + circle.name.length}
                      height={2 * circle.radius}
                      text={circle.name}
                      fontSize={20}
                      fontStyle="bold"
                      fill="#ffffff"
                      align="center"
                    />
                    {/* if automaton is moore, show output on node*/}
                    {automatonType === 'moore' && (
                      <Text
                        x={-circle.radius - circle.moore_output.length / 2}
                        y={0}
                        width={2 * circle.radius + circle.moore_output.length}
                        height={circle.radius}
                        text={circle.moore_output}
                        fontSize={18}
                        fontStyle="bold"
                        fill="#ffffff"
                        align="center"
                      />
                    )}

                    {/* If state is initial, draw an incoming arrow */}
                    {/* arrow is now rendered top-level for drag support */}

                    {/* If state is final, draw an extra outer circle */}
                    {circle.type.final && (
                      <Circle
                        x={0}
                        y={0}
                        radius={2 * circle.name.length + circle.radius + 5}
                        fill={'transparent'}
                        strokeWidth={3}
                        stroke={
                          circle.fill === '#ffffff80' || circle.fill === '#ffffff'
                            ? '#4a6fae88'
                            : circle.fill
                        }
                      />
                    )}
                  </Group>
                ),
            )
          }

          {/******** Initial State Arrow (top-level, draggable handle) ********/}
          {nodeList.map(
            (circle) =>
              circle?.type?.initial &&
              (() => {
                const offset = 2 * circle.radius + 2.5 * circle.name.length
                const tailX = circle.x - offset - circle.radius / 1.5
                const headX = circle.x - offset + circle.radius - 5
                const y = circle.y
                return (
                  <Group key={`initial_arrow_${circle.id}`}>
                    <Arrow
                      points={[tailX, y, headX, y]}
                      pointerLength={8}
                      pointerWidth={8}
                      fill={'#6b7280cc'}
                      stroke={'#6b7280cc'}
                      strokeWidth={2}
                      listening={false}
                    />
                    {/* Draggable tail handle */}
                    <Circle
                      x={tailX}
                      y={y}
                      radius={5}
                      fill={'#6b7280'}
                      stroke={'#ffffff50'}
                      strokeWidth={1}
                      draggable
                      onDragEnd={(e) => {
                        const pos = e.target.position()
                        handleInitialArrowDrop(pos.x, pos.y)
                        e.target.position({ x: tailX, y })
                      }}
                    />
                  </Group>
                )
              })(),
          )}

          <Group key={transitionList}>
            {
              /******** Display The Transitions of the FSM ********/
              transitionList.map(
                (transition) =>
                  transition && (
                    <Group
                      key={`${transition.id}-${transition.renderNonce ?? 0}`}
                      id={`tr_${transition.id}`}
                    >
                      {/* Transition arrow object */}
                      <Arrow
                        id={`transition_${transition.id}`}
                        stroke={transition.stroke}
                        strokeWidth={transition.strokeWidth}
                        fill={transition.fill}
                        points={transition.points}
                        tension={transition.tension}
                        onClick={() => handleTransitionClick(transition.id)}
                      />

                      {/* Add a Label to the middle of the arrow */}
                      {(() => {
                        const labelText =
                          transition.label && transition.label.length > 0 ? transition.label : ''
                        const pts = transition.points
                        // quadratic bezier midpoint at t=0.5
                        const mx = 0.25 * pts[0] + 0.5 * pts[2] + 0.25 * pts[4]
                        const my = 0.25 * pts[1] + 0.5 * pts[3] + 0.25 * pts[5]
                        // center pill on midpoint: half-width ≈ chars * (fontSize*0.6/2) + padding
                        const halfW = labelText.length * 4 + 5

                        return (
                          <Label
                            id={`tr_label${transition.id}`}
                            x={mx - halfW}
                            y={my - 12}
                            onClick={() => handleTransitionClick(transition.id)}
                          >
                            <Tag fill="#0d0d18" opacity={0.85} cornerRadius={6} lineJoin="round" />
                            <Text
                              id={`trtext_${transition.id}`}
                              text={labelText}
                              fontSize={transition.fontSize}
                              fontStyle={transition.fontStyle}
                              fill={transition.label_fill}
                              align={transition.label_align}
                              padding={5}
                            />
                          </Label>
                        )
                      })()}
                    </Group>
                  ),
              )
            }
          </Group>
        </Group>
      </Layer>
    </Stage>
  )
}

export default Editor

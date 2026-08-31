import { useAtom, useAtomValue } from 'jotai'
import { useEffect, useState } from 'react'
import { Arrow, Circle, Group, Label, Layer, Stage, Tag, Text } from 'react-konva'
import {
  HandleDragEnd,
  HandleEditorClick,
  HandleScrollWheel,
  HandleStateClick,
  HandleStateDrag,
  getLabelPosition,
  handleInitialArrowDrop,
} from '../lib/editor'
import {
  editor_state,
  layer_ref,
  node_list,
  stage_ref,
  transition_list,
  current_selected,
  fsm_type,
} from '../lib/stores'
import { handleTransitionClick } from '../lib/transitions'
import { getCurrentThemeMode } from '../lib/theme.js'

const Editor = () => {
  // Jotai Atoms
  const nodeList = useAtomValue(node_list)
  const editorState = useAtomValue(editor_state)
  const [_stageRef, setStageRef] = useAtom(stage_ref)
  const [transitionList, _setTransitionList] = useAtom(transition_list)
  const [_layerRef, setLayerRef] = useAtom(layer_ref)
  const currentSelected = useAtomValue(current_selected)
  const fsmType = useAtomValue(fsm_type)
  const [hoveredStateId, setHoveredStateId] = useState(null)
  const [hoveredTransitionId, setHoveredTransitionId] = useState(null)
  const [themeMode, setThemeMode] = useState(getCurrentThemeMode)
  const hoverDisabledModes = new Set(['Add', 'Undo', 'Redo', 'Auto Layout', 'Guide'])
  const allowObjectHoverHighlight = !hoverDisabledModes.has(editorState)
  const transitionsSelectable = editorState !== 'Connect'
  const isLightMode = themeMode === 'light'
  const onSurfaceTextColor = isLightMode ? '#152033' : '#ffffff'
  const transitionStrokeColor = isLightMode ? '#334155cc' : '#ffffffdd'
  const transitionLabelFill = isLightMode ? '#edf3ff' : '#0d0d18'
  const transitionLabelTextColor = isLightMode ? '#152033' : '#ffffff'

  useEffect(() => {
    const updateTheme = () => setThemeMode(getCurrentThemeMode())
    updateTheme()

    const root = document.documentElement
    const parentRoot = window.parent?.document?.documentElement
    const observer = new MutationObserver(updateTheme)
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    if (parentRoot && parentRoot !== root) {
      observer.observe(parentRoot, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    }

    return () => observer.disconnect()
  }, [])

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
                    onMouseEnter={(e) => {
                      if (!allowObjectHoverHighlight) return
                      setHoveredStateId(circle.id)
                      e.target.getStage().container().style.cursor = 'pointer'
                    }}
                    onMouseLeave={(e) => {
                      setHoveredStateId((prev) => (prev === circle.id ? null : prev))
                      e.target.getStage().container().style.cursor = 'default'
                    }}
                  >
                    <Circle
                      x={0}
                      y={0}
                      radius={circle.radius}
                      fill={
                        circle.fill === '#ffffff80' || circle.fill === '#ffffff'
                          ? '#4a6fae88'
                          : circle.fill
                      }
                      stroke={
                        currentSelected === circle.id
                          ? '#3b82f6'
                          : allowObjectHoverHighlight && hoveredStateId === circle.id
                            ? '#93c5fd'
                            : null
                      }
                      strokeWidth={
                        currentSelected === circle.id
                          ? 4
                          : allowObjectHoverHighlight && hoveredStateId === circle.id
                            ? 2
                            : 0
                      }
                    />
                    {(() => {
                      const labelText =
                        fsmType === 'moore'
                          ? `${circle.name} / ${String(circle.moore_output ?? '').replace(/x/g, '-')}`
                          : circle.name
                      // Shrink the font so the label always fits the circle
                      const labelLength = labelText.length
                      const availableWidth = 2 * circle.radius - 8
                      const fontSize = Math.max(
                        6,
                        Math.min(16, Math.floor(availableWidth / (labelLength * 0.6))),
                      )

                      return (
                        <Text
                          x={-circle.radius}
                          y={-circle.radius / 3}
                          width={2 * circle.radius}
                          height={(2 * circle.radius) / 3}
                          text={labelText}
                          fontSize={fontSize}
                          fontStyle="bold"
                          fill={onSurfaceTextColor}
                          align="center"
                          verticalAlign="middle"
                          wrap="none"
                        />
                      )
                    })()}

                    {/* If state is initial, draw an incoming arrow */}
                    {/* arrow is now rendered top-level for drag support */}

                    {/* If state is final, draw an extra outer circle */}
                    {/*circle.type.final && (
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
                    )*/}
                  </Group>
                ),
            )
          }

          {/******** Initial State Arrow (top-level, draggable handle) ********/}
          {nodeList.map(
            (circle) =>
              circle?.type?.initial &&
              (() => {
                // The arrow offset only depends on the fixed circle radius
                const headX = circle.x - circle.radius - 4
                const tailX = headX - 45
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
                  transition &&
                  !transition.hiddenDontCare && (
                    <Group
                      key={`${transition.id}-${transition.renderNonce ?? 0}`}
                      id={`tr_${transition.id}`}
                    >
                      {/* Transition arrow object */}
                      <Arrow
                        id={`transition_${transition.id}`}
                        stroke={
                          hoveredTransitionId === transition.id
                            ? '#93c5fd'
                            : transition.stroke &&
                                transition.stroke !== '#ffffffdd' &&
                                transition.stroke !== '#334155cc'
                              ? transition.stroke
                              : transitionStrokeColor
                        }
                        strokeWidth={
                          hoveredTransitionId === transition.id
                            ? transition.strokeWidth + 1
                            : transition.strokeWidth
                        }
                        fill={transition.fill}
                        points={transition.points}
                        tension={transition.tension}
                        onClick={() => {
                          if (!transitionsSelectable) return
                          handleTransitionClick(transition.id)
                        }}
                        onMouseEnter={(e) => {
                          if (!transitionsSelectable) return
                          if (!allowObjectHoverHighlight) return
                          setHoveredTransitionId(transition.id)
                          e.target.getStage().container().style.cursor = 'pointer'
                        }}
                        onMouseLeave={(e) => {
                          setHoveredTransitionId((prev) => (prev === transition.id ? null : prev))
                          e.target.getStage().container().style.cursor = 'default'
                        }}
                      />

                      {/* Add a Label to the middle of the arrow */}
                      {(() => {
                        const rawLabelText =
                          transition.label && transition.label.length > 0 ? transition.label : ''
                        const labelText = rawLabelText.replace(/x/g, '-')
                        const pos = getLabelPosition(
                          transition.points,
                          labelText,
                          transition.fontSize,
                          transition.fontStyle,
                        )

                        return (
                          <Label
                            id={`tr_label${transition.id}`}
                            x={pos.x}
                            y={pos.y}
                            onClick={() => {
                              if (!transitionsSelectable) return
                              handleTransitionClick(transition.id)
                            }}
                            onMouseEnter={(e) => {
                              if (!transitionsSelectable) return
                              if (!allowObjectHoverHighlight) return
                              setHoveredTransitionId(transition.id)
                              e.target.getStage().container().style.cursor = 'pointer'
                            }}
                            onMouseLeave={(e) => {
                              setHoveredTransitionId((prev) =>
                                prev === transition.id ? null : prev,
                              )
                              e.target.getStage().container().style.cursor = 'default'
                            }}
                          >
                            <Tag
                              fill={
                                hoveredTransitionId === transition.id
                                  ? isLightMode
                                    ? '#dfe9ff'
                                    : '#1b2638'
                                  : transitionLabelFill
                              }
                              opacity={0.9}
                              cornerRadius={6}
                              lineJoin="round"
                            />
                            <Text
                              id={`trtext_${transition.id}`}
                              text={labelText}
                              fontSize={transition.fontSize}
                              fontStyle={transition.fontStyle}
                              fill={
                                transition.label_fill &&
                                transition.label_fill !== '#ffffff' &&
                                transition.label_fill !== '#152033'
                                  ? transition.label_fill
                                  : transitionLabelTextColor
                              }
                              verticalAlign="middle"
                              align="center"
                              padding={1}
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

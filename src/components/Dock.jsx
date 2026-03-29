import { useAtom } from 'jotai'
import {
  BookHeart,
  Cable,
  CircleHelp,
  FilePlus,
  ImageDown,
  MinusCircleIcon,
  PlusCircleIcon,
  Undo2,
  Redo2,
  Edit,
  Sparkles,
} from 'lucide-react'
import { editor_state, transition_pairs, confirm_dialog_atom, engine_mode } from '../lib/stores'
import { newProject, getTransitionPoints, HandleAutoLayout } from '../lib/editor'
import { undo, redo } from '../lib/history'
import { useSetAtom } from 'jotai'
import { useState } from 'react'

// Define the Components of the Dock
// Icon Look Constants
const iconFillColor = '#ffffff'
const iconSize = 18

// Define the Components of the Dock
const Dock = () => {
  // Jotai Atoms
  const [editorState, setEditorState] = useAtom(editor_state)
  const [_transitionPairs, setTransitionPairs] = useAtom(transition_pairs)
  const setConfirmDialog = useSetAtom(confirm_dialog_atom)
  const [engineMode, setEngineMode] = useAtom(engine_mode)
  const [showLegend, setShowLegend] = useState(false)
  // Jotai Atoms

  const dockItems = [
    {
      name: 'Add',
      icon: <PlusCircleIcon stroke={iconFillColor} size={iconSize} />,
    },
    {
      name: 'Remove',
      icon: <MinusCircleIcon stroke={iconFillColor} size={iconSize} />,
    },
    {
      name: 'Connect',
      icon: <Cable stroke={iconFillColor} size={iconSize} />,
    },
    {
      name: 'Auto Layout',
      icon: <Sparkles stroke={iconFillColor} size={iconSize} />,
      onclick: () => HandleAutoLayout(),
    },
    {
      name: 'Undo',
      icon: <Undo2 stroke={iconFillColor} size={iconSize} />,
      onclick: () => undo(getTransitionPoints),
    },
    {
      name: 'Redo',
      icon: <Redo2 stroke={iconFillColor} size={iconSize} />,
      onclick: () => redo(getTransitionPoints),
    },
  ]

  function default_onclick(item) {
    if (item.name == 'Connect') setTransitionPairs(null)
    item.name == editorState ? setEditorState(null) : setEditorState(item.name)
  }

  return (
    <>
      <div className="fixed top-3 right-3 z-40 select-none">
        <button
          type="button"
          onClick={() => setShowLegend((prev) => !prev)}
          title="Legend"
          className="text-white flex justify-center items-center bg-secondary-bg h-9 w-9 border border-border-bg rounded-lg cursor-pointer hover:-translate-y-0.5 hover:scale-105 active:scale-95 transition-all ease-in-out"
        >
          <CircleHelp stroke={iconFillColor} size={iconSize} />
        </button>

        {showLegend && (
          <div className="mt-1.5 w-80 bg-primary-bg border border-border-bg rounded-lg shadow-[0px_0px_30px_0px_#00000080] px-3 py-3">
            <div className="font-github text-sm text-white mb-2">Legend</div>

            <div className="space-y-2.5 text-white/90 font-github text-xs">
              <div className="flex gap-2 items-center">
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                  <circle
                    cx="12"
                    cy="12"
                    r="8"
                    fill="#4a6fae88"
                    stroke="#ffffff80"
                    strokeWidth="1"
                  />
                </svg>
                <div className="flex flex-col">
                  <span className="text-white text-sm">State</span>
                  <span className="text-white/60 text-xs">Each circle represents a state. </span>
                </div>
              </div>

              <div className="flex gap-2 items-center">
                <svg width="36" height="24" viewBox="0 0 36 24" aria-hidden="true">
                  <circle
                    cx="12"
                    cy="12"
                    r="8"
                    fill="#4a6fae88"
                    stroke="#ffffff80"
                    strokeWidth="1"
                  />
                  <text
                    x="12"
                    y="15"
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="8"
                    fontFamily="monospace"
                  >
                    q0
                  </text>
                </svg>
                <div className="flex flex-col">
                  <span className="text-white text-sm">State name</span>
                  <span className="text-white/60 text-xs">
                    The labels inside the states represent their names / titles.{' '}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 items-center">
                <svg width="40" height="14" viewBox="0 0 40 14" aria-hidden="true">
                  <line x1="4" y1="7" x2="32" y2="7" stroke="#ffffffdd" strokeWidth="2" />
                  <polygon points="32,3 38,7 32,11" fill="#ffffffdd" />
                </svg>
                <div className="flex flex-col">
                  <span className="text-white text-sm">Transition</span>
                  <span className="text-white/60 text-xs">
                    Each arrow from one state to another represents a transition.{' '}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 items-center">
                <div className="px-2 py-0.5 rounded bg-secondary-bg border border-border-bg text-[11px] text-white font-mono">
                  01-/1-0
                </div>
                <div className="flex flex-col">
                  <span className="text-white text-sm">Input / Output</span>
                  <span className="text-white/60 text-xs">
                    {' '}
                    0 or 1 represent the value of the input or output bit, " - " stands for "don't
                    care".{' '}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 items-center">
                <svg width="24" height="10" viewBox="0 0 28 12" aria-hidden="true">
                  <line x1="5" y1="6" x2="22" y2="6" stroke="#6b7280" strokeWidth="2" />
                  <polygon points="22,3 27,6 22,9" fill="#6b7280" />
                  <circle cx="4" cy="6" r="2.3" fill="#6b7280" stroke="#ffffff50" strokeWidth="1" />
                </svg>
                <div className="flex flex-col">
                  <span className="text-white text-sm">Initial state</span>
                  <span className="text-white/60 text-xs">The grey arrow with the point on one end marks the start state. It does not represent a transition. </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-5 w-screen flex justify-center items-center">
        <div className="flex flex-col gap-1 justify-center items-center max-w-[95vw] w-fit px-2 py-2 bg-primary-bg border border-border-bg rounded-2xl shadow-[0px_0px_50px_0px_#00000080] select-none">
          <div className="flex flex-wrap gap-3 justify-center items-center w-full">
            {dockItems.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={item.onclick ? item.onclick : () => default_onclick(item)}
                className={`text-white flex gap-2 justify-center items-center font-github whitespace-nowrap ${
                  item.name === editorState ? 'bg-blue-500' : 'bg-secondary-bg'
                } text-sm md:text-base px-3 py-2 border border-border-bg rounded-xl cursor-pointer hover:-translate-y-1 hover:scale-105 active:scale-95 transition-all ease-in-out`}
              >
                {item.icon}
                {item.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

export default Dock

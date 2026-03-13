import { useAtom } from 'jotai'
import {
  BookHeart,
  Cable,
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
    <div className="absolute bottom-5 w-screen flex justify-center items-center">
      <div className="flex flex-col gap-1 justify-center items-center max-w-[95vw] w-fit px-2 py-2 bg-primary-bg border border-border-bg rounded-2xl shadow-[0px_0px_50px_0px_#00000080] select-none">
        <div className="flex flex-wrap gap-3 justify-center items-center w-full">
          {dockItems.map((item, idx) => (
            <div key={idx} className="contents">
              <button
                type="button"
                onClick={item.onclick ? item.onclick : () => default_onclick(item)}
                className={`text-white flex gap-2 justify-center items-center font-github whitespace-nowrap ${
                  item.name === editorState ? 'bg-blue-500' : 'bg-secondary-bg'
                } text-sm md:text-base px-3 py-2 border border-border-bg rounded-xl cursor-pointer hover:-translate-y-1 hover:scale-105 active:scale-95 transition-all ease-in-out`}
              >
                {item.icon}
                {item.name}
              </button>

              {item.name === 'Connect' && (
                <span className="text-secondary-fg/85 flex gap-1.5 justify-center items-center font-github text-xs px-2 py-1  rounded-lg bg-secondary-bg/60 whitespace-nowrap">
                  <svg width="28" height="12" viewBox="0 0 28 12" aria-hidden="true">
                    <line x1="5" y1="6" x2="22" y2="6" stroke="#6b7280" strokeWidth="2" />
                    <polygon points="22,3 27,6 22,9" fill="#6b7280" />
                    <circle
                      cx="4"
                      cy="6"
                      r="2.5"
                      fill="#6b7280"
                      stroke="#ffffff50"
                      strokeWidth="1"
                    />
                  </svg>
                  initial state
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Dock

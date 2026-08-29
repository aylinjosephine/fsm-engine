import { useEffect } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import {
  Cable,
  Eye,
  EyeOff,
  FilePlus,
  ImageDown,
  MinusCircleIcon,
  Move,
  PlusCircleIcon,
  Undo2,
  Redo2,
  Edit,
  Sparkles,
} from 'lucide-react'
import {
  editor_state,
  transition_pairs,
  confirm_dialog_atom,
  show_hidden_transitions,
} from '../lib/stores'
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
  const [showHidden, setShowHidden] = useAtom(show_hidden_transitions)

  // Tell parent about the read-only view so it can show an info badge
  useEffect(() => {
    window.parent.postMessage(
      { action: 'show-hidden-changed', show: showHidden },
      window.location.origin,
    )
  }, [showHidden])
  // Jotai Atoms

  const dockItems = [
    {
      name: 'Move',
      icon: <Move stroke={iconFillColor} size={iconSize} />,
      onclick: () => setEditorState(null),
    },
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
      name: 'Show hidden transitions',
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
    if (item.name === 'Move') {
      setEditorState(null)
      return
    }

    if (item.name == 'Connect') setTransitionPairs(null)
    item.name == editorState ? setEditorState(null) : setEditorState(item.name)
  }

  function isModeButton(name) {
    return ['Move', 'Add', 'Remove', 'Connect'].includes(name)
  }

  return (
    <>
      <div className="absolute bottom-5 w-screen flex justify-center items-center">
        <div className="flex flex-col gap-1 justify-center items-center max-w-[95vw] w-fit px-2 py-2 bg-primary-bg border border-border-bg rounded-2xl shadow-[0px_0px_50px_0px_#00000080] select-none">
          <div className="flex flex-wrap gap-3 justify-center items-center w-full">
            {dockItems.map((item, idx) => {
              const showButton = item.name === 'Show hidden transitions'
              const disabled = showHidden && !showButton
              const active = showButton
                ? showHidden
                : !disabled &&
                  isModeButton(item.name) &&
                  ((item.name === 'Move' && editorState === null) || item.name === editorState)

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={disabled}
                  onClick={
                    showButton
                      ? () => {
                          const next = !showHidden
                          if (next) {
                            setEditorState(null)
                            // Always show the current table state
                            window.parent.postMessage(
                              { action: 'fsmimport-request' },
                              window.location.origin,
                            )
                          }
                          setShowHidden(next)
                        }
                      : item.onclick
                        ? item.onclick
                        : () => default_onclick(item)
                  }
                  className={`text-white flex gap-2 justify-center items-center font-github whitespace-nowrap ${
                    active ? 'bg-blue-500' : 'bg-secondary-bg'
                  } text-sm md:text-base px-3 py-2 border border-border-bg rounded-xl cursor-pointer hover:-translate-y-1 hover:scale-105 active:scale-95 transition-all ease-in-out disabled:opacity-30 disabled:hover:translate-y-0 disabled:hover:scale-100`}
                >
                  {showButton ? (
                    showHidden ? (
                      <EyeOff stroke={iconFillColor} size={iconSize} />
                    ) : (
                      <Eye stroke={iconFillColor} size={iconSize} />
                    )
                  ) : (
                    item.icon
                  )}
                  {item.name}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}

export default Dock

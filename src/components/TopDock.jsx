import { ChevronDown, FolderOpen, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { editor_state } from '../lib/stores'
import { useAtom } from 'jotai'
import { HandleAutoLayout } from '../lib/editor'
import { HandleLoadFSM } from '../lib/special_functions'

const TopDock = () => {
  const [isVisible, setIsVisible] = useState(false)
  const [_EditorState, setEditorState] = useAtom(editor_state)

  // Constants
  const iconFillColor = 'currentColor'
  const iconSize = 18

  const dockItems = [
    {
      name: 'Load FSM',
      icon: <FolderOpen stroke={iconFillColor} size={iconSize} />,
      condition: true,
      onclick: () => {
        HandleLoadFSM()
        setIsVisible(false)
      },
    },
    // reuse!
    {
      name: 'Auto Layout',
      icon: <Sparkles stroke={iconFillColor} size={iconSize} />,
      condition: true,
      onclick: () => {
        HandleAutoLayout()
        setIsVisible(false)
      },
    },
  ]

  return (
    <div
      className={`absolute w-screen h-15 ${
        isVisible ? 'top-2' : '-top-15'
      } flex justify-center items-center transition-all ease-in-out duration-500`}
    >
      <div className="flex justify-center items-center gap-3 w-fit px-2 h-full bg-primary-bg border border-border-bg rounded-xl shadow-[0px_0px_50px_0px_#00000080] select-none">
        {dockItems.map(
          (item, idx) =>
            item.condition && (
              <button
                key={idx}
                onClick={item.onclick}
                className={`flex gap-2 justify-center items-center font-github whitespace-nowrap bg-secondary-bg text-base text-on-surface px-4 py-2 border border-border-bg rounded-lg cursor-pointer hover:-translate-y-1 hover:scale-102 active:scale-90 transition-all ease-in-out`}
              >
                {item.icon}
                {item.name}
              </button>
            ),
        )}
        <button
          type="button"
          onClick={() => setIsVisible(!isVisible)}
          className={`flex justify-center items-center gap-1 absolute -bottom-10 font-github bg-primary-bg text-on-surface text-sm font-bold px-3 py-2 border border-border-bg rounded-lg cursor-pointer`}
        >
          FSM
          <ChevronDown
            className={`${isVisible && 'rotate-180'} transition-all ease-in-out duration-500`}
            size={24}
            color="currentColor"
          />
        </button>
      </div>
    </div>
  )
}

export default TopDock

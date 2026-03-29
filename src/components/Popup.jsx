import { useAtomValue } from 'jotai'
import { CircleCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { active_transition, engine_mode, show_popup, transition_list, store } from '../lib/stores'
import {
  handleTransitionSave,
  handleInvalidTransitionFallback,
  removeTransitionById,
} from '../lib/transitions'

const Popup = () => {
  const showPopup = useAtomValue(show_popup)
  const activeTransition = useAtomValue(active_transition)
  const transitionList = useAtomValue(transition_list)
  const popups = [<ChooseTransitionLabelFreeStyle />, <ChooseTransitionLabelDFA />]
  const EngineMode = useAtomValue(engine_mode)

  const engine_mode_popup_map = {
    'Free Style': 0,
    DFA: 1,
    NFA: 1,
  }

  function handleBackdropClick() {
    if (!showPopup) return

    if (transitionList[activeTransition]?.isDraft) {
      removeTransitionById(activeTransition)
    }

    store.set(show_popup, false)
    store.set(active_transition, null)
  }

  return (
    <div
      onMouseDown={handleBackdropClick}
      className={`absolute inset-0 z-50 flex justify-center pt-12 transition-opacity ease-in-out duration-300 ${
        showPopup ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="h-fit w-fit py-5 px-5 flex flex-col justify-center items-center bg-primary-bg rounded-xl border border-border-bg shadow-[0px_0px_50px_0px_#00000080]"
      >
        {popups[engine_mode_popup_map[EngineMode.type]]}
      </div>
    </div>
  )
}

export default Popup

/******* POPUP COMPONENTS *********/
function ChooseTransitionLabelDFA() {
  const LanguageAlphabets = useAtomValue(engine_mode)
  const ActiveTransition = useAtomValue(active_transition)
  const TransitionList = useAtomValue(transition_list)

  const setShowPopup = store.set // jotai store aus ./stores
  const [labels, setLabels] = useState([])

  useEffect(() => {
    const currentLabel = TransitionList[ActiveTransition]?.label
    setLabels(currentLabel ? [currentLabel] : [])
  }, [ActiveTransition, TransitionList])

  function toggleAlphabet(val) {
    if (labels.includes(val)) setLabels(labels.filter((x) => x !== val))
    else setLabels([...labels, val])
  }

  function handleCancel() {
    if (TransitionList[ActiveTransition]?.isDraft) {
      removeTransitionById(ActiveTransition)
    }
    store.set(show_popup, false)
    store.set(active_transition, null)
    setLabels([])
  }

  return (
    <>
      <p className="text-sm font-github text-center text-white mb-5 select-none">
        Choose Input Alphabets for this transition
      </p>
      <div className="grid grid-cols-4 gap-5 justify-center items-center">
        {LanguageAlphabets.alphabets.map((a) => (
          <p
            key={a}
            onClick={() => toggleAlphabet(a)}
            className={`font-github text-white text-balance ${
              labels?.includes(a) ? 'bg-blue-500' : 'bg-secondary-bg'
            } px-3 py-1 rounded-md border border-border-bg select-none cursor-pointer hover:scale-120 active:scale-100 transition-all ease-in-out`}
          >
            {a}
          </p>
        ))}
      </div>
      <div className="flex gap-3 mt-5">
        <button
          type="button"
          onClick={handleCancel}
          className="font-github text-sm hover:scale-110 active:scale-100 transition-all ease-in-out text-white bg-gray-600 px-6 py-2 rounded-lg border border-border-bg flex gap-2 items-center"
        >
          <X size={16} color="#ffffff" />
          Abbrechen
        </button>
        <button
          type="button"
          onClick={() => {
            if (labels.length > 0) {
              handleTransitionSave(labels)
              setLabels([])
            }
          }}
          className="font-github text-sm hover:scale-110 active:scale-100 transition-all ease-in-out text-white bg-blue-500 px-8 py-2 rounded-lg border border-border-bg flex gap-2 items-center"
        >
          <CircleCheck size={18} color="#ffffff" />
          Done
        </button>
      </div>
    </>
  )
}

function ChooseTransitionLabelFreeStyle() {
  const ActiveTransition = useAtomValue(active_transition)
  const TransitionList = useAtomValue(transition_list)
  const [inputValue, setInputValue] = useState('')
  const [outputValue, setOutputValue] = useState('')

  function keepAllowedSymbols(value) {
    return value.replace(/[^01-]/g, '')
  }

  function isValidBits(value) {
    return /^[01-]+$/.test(value)
  }

  useEffect(() => {
    const currentTransition = TransitionList[ActiveTransition]
    const rawLabel = currentTransition?.isDraft ? '' : (currentTransition?.label ?? '')
    const [input = '', output = ''] = String(rawLabel).split('/')
    setInputValue(input)
    setOutputValue(output)
  }, [ActiveTransition, TransitionList])

  function handleCancel() {
    if (TransitionList[ActiveTransition]?.isDraft) {
      removeTransitionById(ActiveTransition)
    }
    store.set(show_popup, false)
    store.set(active_transition, null)
    setInputValue('')
    setOutputValue('')
  }

  return (
    <>
      <span className="w-full mb-2">
        <p className="font-github text-white text-xs pb-1">input: </p>
        <input
          value={inputValue}
          className="px-1 py-2 text-sm h-9 w-full font-medium text-white font-github rounded-lg border border-border-bg outline-none hover:border-white/30 focus:border-blue-500 transition-all ease-in-out"
          type="text"
          pattern="[01-]*"
          onChange={(e) => setInputValue(keepAllowedSymbols(e.target.value))}
          placeholder=""
        />
      </span>
      <span className="w-full">
        <p className="font-github text-white text-xs pb-1">output: </p>
        <input
          value={outputValue}
          className="px-1 py-2 text-sm h-9 w-full font-medium text-white font-github rounded-lg border border-border-bg outline-none hover:border-white/30 focus:border-blue-500 transition-all ease-in-out"
          type="text"
          pattern="[01-]*"
          onChange={(e) => setOutputValue(keepAllowedSymbols(e.target.value))}
          placeholder=""
        />
      </span>
      <div className="flex gap-3 mt-5">
        <button
          type="button"
          onClick={handleCancel}
          className="font-github text-sm hover:scale-110 active:scale-100 transition-all ease-in-out text-white bg-gray-600 px-6 py-2 rounded-lg border border-border-bg flex gap-2 items-center"
        >
          <X size={16} color="#ffffff" />
          Abbrechen
        </button>
        <button
          type="button"
          onClick={() => {
            const input = inputValue.trim()
            const output = outputValue.trim()
            const valid = isValidBits(input) && isValidBits(output)

            if (!valid) {
              handleInvalidTransitionFallback(input, output)
              setInputValue('')
              setOutputValue('')
              return
            }

            handleTransitionSave([`${input}/${output}`])
            setInputValue('')
            setOutputValue('')
          }}
          className="font-github text-sm hover:scale-110 active:scale-100 transition-all ease-in-out text-white bg-blue-500 px-8 py-2 rounded-lg border border-border-bg flex gap-2 items-center"
        >
          <CircleCheck size={18} color="#ffffff" />
          Done
        </button>
      </div>
    </>
  )
}

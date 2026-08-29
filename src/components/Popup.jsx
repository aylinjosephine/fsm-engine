import { useAtomValue } from 'jotai'
import { CircleCheck, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { sendExportToMainState } from '../lib/export'
import {
  active_transition,
  alert,
  engine_mode,
  fsm_type,
  input_bit_count,
  output_bit_count,
  show_popup,
  store,
  transition_list,
} from '../lib/stores'
import { handleTransitionSave, removeTransitionById } from '../lib/transitions'

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
  // Allow up to 5 input/output bits (same as the table)
  const MAX_IO_BITS = 5
  const ActiveTransition = useAtomValue(active_transition)
  const TransitionList = useAtomValue(transition_list)
  const FsmType = useAtomValue(fsm_type)
  const showPopup = useAtomValue(show_popup)
  // Fixed i/o bit counts, set once during project init / import
  const inputBits = useAtomValue(input_bit_count)
  const outputBits = useAtomValue(output_bit_count)

  // One entry per bit ('' = empty, '0'/'1'/'-' = value). '-'-' is don't-care.
  const [inputBitsArr, setInputBitsArr] = useState([])
  const [outputBitsArr, setOutputBitsArr] = useState([])
  const inputRefs = useRef([])
  const outputRefs = useRef([])

  // Split a stored bit string (0/1/x) into per-bit display chars ('-' for x)
  function toBits(value, length) {
    const cleaned = String(value ?? '')
      .replace(/x/g, '-')
      .replace(/[^01-]/g, '')
      .slice(0, Math.min(length, MAX_IO_BITS))
    const arr = cleaned.split('')
    while (arr.length < Math.min(length, MAX_IO_BITS)) arr.push('')
    return arr
  }

  function isComplete(arr, length) {
    return (
      arr.length >= length &&
      arr.slice(0, length).every((bit) => bit === '0' || bit === '1' || bit === '-')
    )
  }

  useEffect(() => {
    if (!showPopup) return
    const currentTransition = TransitionList[ActiveTransition]
    const rawLabel = currentTransition?.isDraft ? '' : (currentTransition?.label ?? '')
    const [input = '', output = ''] = String(rawLabel).split('/')
    setInputBitsArr(toBits(input, inputBits))
    setOutputBitsArr(toBits(output, outputBits))
    // Focus the first bit box once the boxes are rendered
    requestAnimationFrame(() => inputRefs.current[0]?.focus())
  }, [showPopup, ActiveTransition, TransitionList, inputBits, outputBits])

  function handleBitChange(kind, index, rawValue) {
    let ch = String(rawValue).slice(-1)
    if (ch === 'x') ch = '-'
    if (!/^[01-]$/.test(ch)) return
    const setter = kind === 'input' ? setInputBitsArr : setOutputBitsArr
    setter((prev) => {
      const next = [...prev]
      while (next.length <= index) next.push('')
      next[index] = ch
      return next
    })
    // Auto-advance to the next bit box
    const count = kind === 'input' ? inputBits : outputBits
    if (index < count - 1) {
      const refs = kind === 'input' ? inputRefs.current : outputRefs.current
      requestAnimationFrame(() => refs[index + 1]?.focus())
    }
  }

  function handleBackspace(kind, index) {
    const arr = kind === 'input' ? inputBitsArr : outputBitsArr
    const setter = kind === 'input' ? setInputBitsArr : setOutputBitsArr
    const refs = kind === 'input' ? inputRefs.current : outputRefs.current
    if (arr[index]) {
      setter((prev) => {
        const next = [...prev]
        next[index] = ''
        return next
      })
    } else if (index > 0) {
      // Clear the previous bit and jump back
      setter((prev) => {
        const next = [...prev]
        next[index - 1] = ''
        return next
      })
      requestAnimationFrame(() => refs[index - 1]?.focus())
    }
  }

  function handleKeyDown(kind, index, event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleSubmit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      handleCancel()
    } else if (event.key === 'Backspace') {
      event.preventDefault()
      handleBackspace(kind, index)
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      const refs = kind === 'input' ? inputRefs.current : outputRefs.current
      refs[index - 1]?.focus()
    } else if (event.key === 'ArrowRight') {
      const count = kind === 'input' ? inputBits : outputBits
      if (index < count - 1) {
        event.preventDefault()
        const refs = kind === 'input' ? inputRefs.current : outputRefs.current
        refs[index + 1]?.focus()
      }
    }
    // Tab / Shift+Tab keep the browser default (Shift+Tab jumps back a box)
  }

  function handleCancel() {
    if (TransitionList[ActiveTransition]?.isDraft) {
      removeTransitionById(ActiveTransition)
    }
    store.set(show_popup, false)
    store.set(active_transition, null)
  }

  function handleSubmit() {
    const input = inputBitsArr.join('')
    const output = outputBitsArr.join('')
    const inputOk = isComplete(inputBitsArr, inputBits)
    const outputOk = FsmType === 'moore' ? true : isComplete(outputBitsArr, outputBits)

    if (!inputOk || !outputOk) {
      const required = `Enter exactly ${inputBits} input bit${inputBits === 1 ? '' : 's'}${
        FsmType !== 'moore'
          ? ` and ${outputBits} output bit${outputBits === 1 ? '' : 's'} (0/1/x)`
          : ' (0/1/x)'
      }`
      store.set(alert, required)
      setTimeout(() => store.set(alert, ''), 3000)
      if (TransitionList[ActiveTransition]?.isDraft) {
        removeTransitionById(ActiveTransition)
        sendExportToMainState()
      }
      store.set(show_popup, false)
      store.set(active_transition, null)
      return
    }

    // Persist using 'x' as internal don't-care, convert '-' back to 'x'
    const persistedInput = input.replace(/-/g, 'x')
    const persistedOutput = output.replace(/-/g, 'x')
    handleTransitionSave(
      FsmType === 'moore' ? [persistedInput] : [`${persistedInput}/${persistedOutput}`],
    )
  }

  function renderBitRow(kind, label, count, arr, refs) {
    const total = Math.min(count, MAX_IO_BITS)
    return (
      <span className="w-full mb-2">
        <p className="font-github text-white text-xs pb-1">
          {label} ({total} bit{total === 1 ? '' : 's'}):
        </p>
        <div className="flex gap-1.5">
          {Array.from({ length: total }, (_, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="text"
              maxLength={1}
              value={arr[i] ?? ''}
              className="w-6 h-8 text-center bg-surface-1 border border-surface-3 rounded outline-none font-mono text-sm text-white hover:border-white/40 focus:border-blue-500 transition-colors"
              onChange={(e) => handleBitChange(kind, i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(kind, i, e)}
            />
          ))}
        </div>
      </span>
    )
  }

  return (
    <>
      {renderBitRow('input', 'input', inputBits, inputBitsArr, inputRefs)}
      {FsmType !== 'moore' &&
        renderBitRow('output', 'output', outputBits, outputBitsArr, outputRefs)}
      <div className="flex gap-3 mt-5">
        <button
          type="button"
          onClick={handleCancel}
          className="font-github text-sm hover:scale-110 active:scale-100 transition-all ease-in-out text-white bg-gray-600 px-6 py-2 rounded-lg border border-border-bg flex gap-2 items-center"
        >
          <X size={16} color="#ffffff" />
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="font-github text-sm hover:scale-110 active:scale-100 transition-all ease-in-out text-white bg-blue-500 px-8 py-2 rounded-lg border border-border-bg flex gap-2 items-center"
        >
          <CircleCheck size={18} color="#ffffff" />
          Done
        </button>
      </div>
    </>
  )
}

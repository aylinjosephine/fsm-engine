import { useAtomValue } from 'jotai'
import { CircleCheck, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getCurrentThemeMode } from '../lib/theme.js'
import {
  active_transition,
  fsm_type,
  input_bit_count,
  output_bit_count,
  show_popup,
  store,
  transition_list,
} from '../lib/stores'
import {
  getTransitionConflict,
  handleTransitionSave,
  removeTransitionById,
} from '../lib/transitions'

const Popup = () => {
  return <ChooseTransitionLabel />
}

export default Popup

/******* POPUP COMPONENT *********/
function ChooseTransitionLabel() {
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
  const [invalidAttempt, setInvalidAttempt] = useState(false)
  const [hint, setHint] = useState('')
  const inputRefs = useRef([])
  const outputRefs = useRef([])
  const [themeMode, setThemeMode] = useState(getCurrentThemeMode)
  const isLightMode = themeMode === 'light'

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

  // Build a problem-specific hint when the input is not valid
  function getValidationHint() {
    const inputComplete = isComplete(inputBitsArr, inputBits)
    const outputComplete = FsmType === 'moore' ? true : isComplete(outputBitsArr, outputBits)
    if (inputComplete && outputComplete) return ''
    const parts = []
    if (!inputComplete) parts.push(`${inputBits} input bit${inputBits === 1 ? '' : 's'}`)
    if (!outputComplete) parts.push(`${outputBits} output bit${outputBits === 1 ? '' : 's'}`)
    return `Please fill in ${parts.join(' and ')}.`
  }

  useEffect(() => {
    if (!showPopup) return
    const currentTransition = TransitionList[ActiveTransition]
    const rawLabel = currentTransition?.isDraft ? '' : (currentTransition?.label ?? '')
    const [input = '', output = ''] = String(rawLabel).split('/')
    setInputBitsArr(toBits(input, inputBits))
    setOutputBitsArr(toBits(output, outputBits))
    setInvalidAttempt(false)
    setHint('')
    // Focus the first bit box once the boxes are rendered
    requestAnimationFrame(() => inputRefs.current[0]?.focus())
  }, [showPopup, ActiveTransition, TransitionList, inputBits, outputBits])

  useEffect(() => {
    if (!showPopup) return
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        handleCancel()
      }
    }
    // Any close other than an explicit save discards the draft (Escape semantics)
    const onRequestClose = () => handleCancel()
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('fsm-close-popups', onRequestClose)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('fsm-close-popups', onRequestClose)
    }
  }, [
    showPopup,
    TransitionList,
    ActiveTransition,
    inputBitsArr,
    outputBitsArr,
    inputBits,
    outputBits,
    FsmType,
  ])

  const hasOutput = FsmType !== 'moore'

  function focusBox(kind, index) {
    const refs = kind === 'input' ? inputRefs.current : outputRefs.current
    refs[index]?.focus()
  }

  function getNextBox(kind, index) {
    const count = kind === 'input' ? inputBits : outputBits
    if (index < count - 1) return { kind, index: index + 1 }
    if (kind === 'input' && hasOutput && outputBits >= 1) return { kind: 'output', index: 0 }
    return null
  }

  function getPrevBox(kind, index) {
    if (index > 0) return { kind, index: index - 1 }
    if (kind === 'output' && inputBits >= 1) return { kind: 'input', index: inputBits - 1 }
    return null
  }

  function moveNext(kind, index) {
    const next = getNextBox(kind, index)
    if (next) focusBox(next.kind, next.index)
    return next
  }

  function movePrev(kind, index) {
    const prev = getPrevBox(kind, index)
    if (prev) focusBox(prev.kind, prev.index)
    return prev
  }

  function moveDown(kind, index) {
    if (kind === 'input' && hasOutput && outputBits >= 1) {
      focusBox('output', Math.min(index, outputBits - 1))
    }
  }

  function moveUp(kind, index) {
    if (kind === 'output' && inputBits >= 1) {
      focusBox('input', Math.min(index, inputBits - 1))
    }
  }

  function handleBitChange(kind, index, rawValue) {
    let ch = String(rawValue).slice(-1)
    if (ch === 'x' || ch === 'X') ch = '-'
    if (!/^[01-]$/.test(ch)) return
    setInvalidAttempt(false)
    setHint('')
    const setter = kind === 'input' ? setInputBitsArr : setOutputBitsArr
    setter((prev) => {
      const next = [...prev]
      while (next.length <= index) next.push('')
      next[index] = ch
      return next
    })
    // Auto-advance to the next bit box (input -> output rows)
    const next = getNextBox(kind, index)
    if (next) {
      requestAnimationFrame(() => focusBox(next.kind, next.index))
    }
  }

  function handleBackspace(kind, index) {
    const arr = kind === 'input' ? inputBitsArr : outputBitsArr
    const setter = kind === 'input' ? setInputBitsArr : setOutputBitsArr
    if (arr[index]) {
      setter((prev) => {
        const next = [...prev]
        next[index] = ''
        return next
      })
      return
    }
    // If the current box is already empty, move to the previous box and clear it
    const prev = getPrevBox(kind, index)
    if (!prev) return
    const prevArr = prev.kind === 'input' ? inputBitsArr : outputBitsArr
    if (prevArr[prev.index] === undefined) return
    const prevSetter = prev.kind === 'input' ? setInputBitsArr : setOutputBitsArr
    prevSetter((p) => {
      const n = [...p]
      n[prev.index] = ''
      return n
    })
    requestAnimationFrame(() => focusBox(prev.kind, prev.index))
  }

  function handleKeyDown(kind, index, event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleSubmit()
    } else if (event.key === 'Backspace') {
      event.preventDefault()
      handleBackspace(kind, index)
    } else if (event.key === 'Tab') {
      event.preventDefault()
      if (event.shiftKey) movePrev(kind, index)
      else moveNext(kind, index)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      movePrev(kind, index)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      moveNext(kind, index)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveDown(kind, index)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveUp(kind, index)
    } else if (event.key.length === 1 && !/^[01x-]$/i.test(event.key)) {
      // Only 0, 1, x or - (don't-care)
      event.preventDefault()
    }
  }

  function handleCancel() {
    if (TransitionList[ActiveTransition]?.isDraft) {
      removeTransitionById(ActiveTransition)
    }
    store.set(show_popup, false)
    store.set(active_transition, null)
  }

  // Check whether this state and input already hold a next state
  const conflict = useMemo(() => {
    if (!showPopup) return null
    const inputComplete = isComplete(inputBitsArr, inputBits)
    const outputComplete = FsmType === 'moore' || isComplete(outputBitsArr, outputBits)
    if (!inputComplete || !outputComplete) return null
    return getTransitionConflict({
      input: inputBitsArr.join('').replace(/-/g, 'x'),
      output: FsmType === 'moore' ? '' : outputBitsArr.join('').replace(/-/g, 'x'),
    })
  }, [
    showPopup,
    inputBitsArr,
    outputBitsArr,
    inputBits,
    outputBits,
    FsmType,
    TransitionList,
    ActiveTransition,
  ])

  const duplicateBlocked = Boolean(conflict && !conflict.replacesRow)
  const hintText = conflict?.message ?? hint

  function handleSubmit() {
    const input = inputBitsArr.join('')
    const output = outputBitsArr.join('')
    const inputOk = isComplete(inputBitsArr, inputBits)
    const outputOk = FsmType === 'moore' ? true : isComplete(outputBitsArr, outputBits)

    if (!inputOk || !outputOk) {
      // Keep the popup open; empty fields stay highlighted (red border)
      setInvalidAttempt(true)
      setHint(getValidationHint())
      return
    }

    // A row for this state and input already exists and cannot be updated here
    if (duplicateBlocked) {
      setHint('')
      return
    }

    setInvalidAttempt(false)
    setHint('')
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
      <span className="w-full mb-2.5">
        <p className="font-github text-on-surface text-sm pb-2 font-semibold">
          {label}: {total} bit{total === 1 ? '' : 's'}
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
              aria-label={`${label} bit ${i + 1}`}
              className={`w-7 h-9 text-center bg-surface-1 border rounded-lg outline-none font-mono text-sm transition-colors duration-100 text-on-surface ${
                invalidAttempt && !(arr[i] ?? '') ? 'border-red-500' : 'border-border-bg'
              } hover:border-surface-3 focus:border-primary`}
              onChange={(e) => handleBitChange(kind, i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(kind, i, e)}
            />
          ))}
        </div>
      </span>
    )
  }

  return (
    <div
      onMouseDown={handleCancel}
      className={`absolute inset-0 z-50 flex justify-center pt-12 transition-opacity ease-in-out duration-300 ${
        showPopup ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="h-fit w-fit py-5 px-5 flex flex-col justify-center items-center bg-surface-1 rounded-3xl border border-border-bg shadow-[0px_0px_50px_0px_#000000]/70"
      >
        <h2 className="font-github text-2xl text-on-surface font-medium text-center mb-4">
          Edit Transition
        </h2>
        {renderBitRow('input', 'input', inputBits, inputBitsArr, inputRefs)}
        {FsmType !== 'moore' &&
          renderBitRow('output', 'output', outputBits, outputBitsArr, outputRefs)}
        <p className="min-h-[16px] max-w-[260px] text-[11px] font-github -mt-1 mb-2 text-center select-none text-red-400">
          {hintText}
        </p>
        <div className="flex gap-3 mt-1">
          <button
            type="button"
            onClick={handleCancel}
            className="font-github text-sm hover:scale-110 active:scale-100 transition-all ease-in-out text-on-surface bg-surface-2 px-6 py-2 rounded-lg border border-border-bg flex gap-2 items-center"
          >
            <X size={16} color={isLightMode ? '#152033' : '#ffffff'} />
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={duplicateBlocked}
            className={`font-github text-sm transition-all ease-in-out text-on-primary bg-primary px-8 py-2 rounded-lg border border-border-bg flex gap-2 items-center ${
              duplicateBlocked
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:scale-110 active:scale-100'
            }`}
          >
            <CircleCheck size={18} color="#ffffff" />
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

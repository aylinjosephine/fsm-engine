import { useAtom, useAtomValue } from 'jotai'
import { CircleCheck, CirclePower, CircleX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { MAX_STATE_NAME_LENGTH, sanitizeStateName } from '../lib/constants'
import { getCurrentThemeMode } from '../lib/theme.js'
import { HandleSaveSettings } from '../lib/settings'
import {
  current_selected,
  editor_state,
  fsm_type,
  node_list,
  output_bit_count,
} from '../lib/stores'
import { MAX_IO_BITS } from '../lib/transitions'

const Settings = () => {
  const [editorState, setEditorState] = useAtom(editor_state)
  const [currentSelected, _setCurrentSelected] = useAtom(current_selected)
  const [nodeList, _setNodeList] = useAtom(node_list)
  const [fsmType] = useAtom(fsm_type)
  const outputBitCount = useAtomValue(output_bit_count)

  // State Hooks for input fields
  const [stateName, setStateName] = useState('')
  const [mooreBits, setMooreBits] = useState([])
  const [stateColor, setStateColor] = useState('#4a6fae')
  const [isInitial, setIsInitial] = useState(false)
  const [hint, setHint] = useState('')
  // State Hooks for input fields
  const nameInputRef = useRef(null)
  const mooreRefs = useRef([])

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

  useEffect(() => {
    if (editorState === 'settings') {
      nameInputRef.current?.focus()
    }
  }, [editorState])

  // Escape cancels the popup, Enter submits it, so both keys always act on the current draft
  useEffect(() => {
    if (editorState !== 'settings') return
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        handleCancel()
      } else if (event.key === 'Enter') {
        event.preventDefault()
        handleSave()
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    editorState,
    currentSelected,
    stateName,
    stateColor,
    isInitial,
    mooreBits,
    fsmType,
    outputBitCount,
  ])

  // Get the existing values of the State properties
  function setDefaultValues() {
    const node = nodeList[currentSelected]
    if (!node) return

    setStateName(node.name ?? '')
    setMooreBits(toBits(node.moore_output ?? '', outputBitCount))
    setHint('')
    setStateColor(String(node.fill ?? '').substr(0, 7))
    setIsInitial(!!node.type?.initial)
  }

  // Returns the reason why the name cannot be saved (empty or already used by another state)
  function getNameHint() {
    const name = sanitizeStateName(stateName)
    if (!name.trim()) return 'Please enter a state name.'
    const currentName = String(nodeList[currentSelected]?.name ?? '')
    if (name !== currentName && isDuplicateName(name)) {
      return 'A state with this name already exists.'
    }
    return ''
  }

  function isDuplicateName(name) {
    const normalized = String(name).trim().toLowerCase()
    return nodeList.some(
      (node) =>
        node &&
        node.id !== currentSelected &&
        String(node.name ?? '')
          .trim()
          .toLowerCase() === normalized,
    )
  }

  // Sanitize the state name (no HTML/script injection)
  function handleNameChange(rawValue) {
    setStateName(sanitizeStateName(rawValue))
  }

  function handleCancel() {
    setEditorState(null)
  }

  function normalizeOutputBits(value) {
    // Limit to the FSM's fixed output bit count (capped at the global max).
    const limit = Math.min(outputBitCount, MAX_IO_BITS)
    const normalized = String(value ?? '')
      .replace(/-/g, 'x')
      .replace(/[^01x]/g, '')
      .slice(0, limit)
    return normalized.length > 0 ? normalized : 'x'
  }

  // Split a stored Moore output string (0/1/x) into per-bit display chars ('-' for x)
  function toBits(value, length) {
    const cleaned = String(value ?? '')
      .replace(/x/g, '-')
      .replace(/[^01-]/g, '')
      .slice(0, Math.min(length, MAX_IO_BITS))
    const arr = cleaned.split('')
    while (arr.length < Math.min(length, MAX_IO_BITS)) arr.push('')
    return arr
  }

  function handleMooreBitChange(index, rawValue) {
    let ch = String(rawValue).slice(-1)
    if (ch === 'x' || ch === 'X') ch = '-'
    if (!/^[01-]$/.test(ch)) return
    setHint('')
    setMooreBits((prev) => {
      const next = [...prev]
      while (next.length <= index) next.push('')
      next[index] = ch
      return next
    })
    if (index < outputBitCount - 1) {
      requestAnimationFrame(() => mooreRefs.current[index + 1]?.focus())
    }
  }

  function handleMooreKeyDown(index, event) {
    if (event.key === 'Backspace') {
      event.preventDefault()
      if (mooreBits[index]) {
        setMooreBits((prev) => {
          const next = [...prev]
          next[index] = ''
          return next
        })
      } else if (index > 0) {
        setMooreBits((prev) => {
          const next = [...prev]
          next[index - 1] = ''
          return next
        })
        requestAnimationFrame(() => mooreRefs.current[index - 1]?.focus())
      }
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      mooreRefs.current[index - 1]?.focus()
    } else if (event.key === 'ArrowRight' && index < outputBitCount - 1) {
      event.preventDefault()
      mooreRefs.current[index + 1]?.focus()
    } else if (event.key.length === 1 && !/^[01x-]$/i.test(event.key)) {
      event.preventDefault()
    }
  }

  function isComplete(arr, length) {
    return (
      arr.length >= length &&
      arr.slice(0, length).every((bit) => bit === '0' || bit === '1' || bit === '-')
    )
  }

  // Build a problem-specific hint when the Moore output is not valid.
  function getValidationHint() {
    if (fsmType !== 'moore') return ''
    if (isComplete(mooreBits, outputBitCount)) return ''
    return `Please fill in ${outputBitCount} output bit${outputBitCount === 1 ? '' : 's'}.`
  }

  // Saving is only ever explicit (Enter or Save) and only for a valid draft
  function handleSave() {
    if (!canSubmit) return
    const name = sanitizeStateName(stateName)
    setHint('')
    const mooreOutputValue = mooreBits.join('').replace(/-/g, 'x')
    HandleSaveSettings(
      name,
      stateColor,
      { initial: isInitial, intermediate: !isInitial },
      fsmType === 'moore' ? normalizeOutputBits(mooreOutputValue) : '',
    )
  }

  // Reset the draft (only) when the popup opens or another state is selected.
  useEffect(() => {
    if (editorState !== 'settings' || currentSelected == null) return
    setDefaultValues()
  }, [editorState, currentSelected])

  // an invalid draft shows its reason and cannot be submitted
  const nameHint = getNameHint()
  const outputHint = fsmType === 'moore' ? getValidationHint() : ''
  const validationHint = nameHint || outputHint
  const hintText = hint || validationHint
  const canSubmit = !validationHint

  return (
    <div
      onMouseDown={handleCancel}
      className={`absolute top-0 left-0 w-screen h-screen z-20 flex justify-center items-center bg-secondary-bg/30 ${
        editorState !== 'settings' && 'hidden'
      }`}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="flex flex-col gap-5 justify-center px-5 py-5 w-fit h-fit bg-surface-1 border border-border-bg rounded-3xl shadow-[0px_0px_50px_0px_#000000]/70 select-none"
      >
        <h2 className="font-github text-2xl text-on-surface font-medium text-center">
          State Options
        </h2>

        <span>
          <p className="font-github text-on-surface text-sm pb-2 font-semibold">State Name</p>
          <input
            ref={nameInputRef}
            value={stateName}
            maxLength={MAX_STATE_NAME_LENGTH}
            className={`px-1 py-2 text-sm h-9 w-full font-medium text-on-surface font-github rounded-lg border outline-none transition-all ease-in-out ${
              nameHint ? 'border-red-500' : 'border-border-bg'
            } hover:border-surface-3 focus:border-primary`}
            type="text"
            onChange={(e) => handleNameChange(e.target.value)}
          />
        </span>

        <span>
          <p className="font-github text-on-surface text-sm pb-2 font-semibold">State Color</p>
          <div className="flex items-center gap-4">
            <input
              type="color"
              className="rounded-lg border border-border-bg"
              value={stateColor}
              onChange={(e) => setStateColor(e.target.value)}
            />
            <span
              onClick={() => setIsInitial((v) => !v)}
              role="button"
              aria-pressed={isInitial}
              className={`flex items-center justify-center gap-2 px-3 py-2 border rounded-lg cursor-pointer hover:scale-105 active:scale-95 transition-all ease-in-out ${
                isInitial ? 'bg-blue-500 border-blue-500' : 'bg-secondary-bg border-border-bg'
              }`}
            >
              <CirclePower color={isLightMode ? '#152033' : '#ffffff'} size={18} />
              <p className="text-on-surface font-github text-xs font-medium">Initial State</p>
            </span>
          </div>
        </span>

        {fsmType === 'moore' && (
          <span>
            <p className="font-github text-on-surface text-sm pb-2 font-semibold">
              Output: {outputBitCount} bit{outputBitCount === 1 ? '' : 's'}
            </p>
            <div className="flex gap-1.5">
              {Array.from({ length: Math.min(outputBitCount, MAX_IO_BITS) }, (_, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    mooreRefs.current[i] = el
                  }}
                  type="text"
                  maxLength={1}
                  value={mooreBits[i] ?? ''}
                  aria-label={`state output bit ${i + 1}`}
                  className={`w-7 h-9 text-center bg-surface-1 border rounded-lg outline-none font-mono text-sm transition-colors duration-100 text-on-surface ${
                    !(mooreBits[i] ?? '') ? 'border-red-500' : 'border-border-bg'
                  } hover:border-surface-3 focus:border-primary`}
                  onChange={(e) => handleMooreBitChange(i, e.target.value)}
                  onKeyDown={(e) => handleMooreKeyDown(i, e)}
                />
              ))}
            </div>
          </span>
        )}

        <p className="min-h-4 max-w-[260px] text-[11px] text-red-400 font-github text-center select-none">
          {hintText}
        </p>

        <span className="flex gap-5 items-center justify-center my-2 w-full">
          <span
            onClick={handleCancel}
            className="flex items-center justify-center gap-2 bg-surface-2 text-on-surface w-fit px-2 py-2 rounded-lg cursor-pointer hover:scale-105 active:scale-95 transition-all ease-in-out"
          >
            <CircleX color={isLightMode ? '#152033' : '#ffffff'} size={18} />
            <p className="font-github text-sm font-semibold">Cancel</p>
          </span>

          <span
            onClick={() => canSubmit && handleSave()}
            role="button"
            aria-disabled={!canSubmit}
            className={`flex items-center justify-center gap-2 w-fit px-2 py-2 rounded-lg transition-all ease-in-out ${
              canSubmit
                ? 'bg-primary text-on-primary cursor-pointer hover:scale-105 active:scale-95'
                : 'bg-surface-2 text-on-surface-disabled opacity-60 cursor-not-allowed'
            }`}
          >
            <CircleCheck color={canSubmit ? '#ffffff' : '#9498a3'} size={18} />
            <p className="font-github text-sm font-semibold">Save</p>
          </span>
        </span>
      </div>
    </div>
  )
}

export default Settings

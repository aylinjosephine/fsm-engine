import { useAtomValue } from 'jotai'
import { useEffect } from 'react'
import Alert from './components/Alert'
import Controls from './components/Controls'
import Dock from './components/Dock'
import Editor from './components/Editor'
import Guide from './components/Guide'
import Popup from './components/Popup'
import SaveDialog from './components/SaveDialog'
import Settings from './components/Settings'
import TopDock from './components/TopDock'
import TransitionTable from './components/TransitionTable'
import ConfirmDialog from './components/ConfirmDialog'
import { handleShortCuts } from './lib/editor'
import { editor_state, node_list, transition_list } from './lib/stores'
import { useState } from 'react'
import { sendExportToParent, importFsmFromParent, clearFsmFromParent } from './lib/export.js'

export function App() {
  // Disable right click context menu
  // Got this useEffect code from StackOverflow
  const [isMobile, SetMobile] = useState(false)

  // CUSTOM: set nodes and transitions for live export
  const nodes = useAtomValue(node_list)
  const transitions = useAtomValue(transition_list)
  const EditorState = useAtomValue(editor_state)

  // CUSTOM: live export states and transitions when store changed
  useEffect(() => {
    sendExportToParent()
    console.log('fsm exported data to state table')
  }, [nodes, transitions])

  // CUSTOM: listener for import / clear from parent
  useEffect(() => {
    const messageHandler = (event) => {
      if (event.data?.action === 'import') {
        importFsmFromParent(event.data.fsm)
      } else if (event.data?.action === 'clear') {
        clearFsmFromParent()
      }
    }

    // event listener for messages
    window.addEventListener('message', messageHandler)
    return () => window.removeEventListener('message', messageHandler)
  }, [])

  useEffect(() => {
    const Device = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    )

    SetMobile(Device)
  }, [])

  useEffect(() => {
    const handleContextmenu = (e) => {
      e.preventDefault()
    }
    document.addEventListener('contextmenu', handleContextmenu)
    return function cleanup() {
      document.removeEventListener('contextmenu', handleContextmenu)
    }
  }, [])

  // Add KeyBoard Shortcuts
  function handleKeyPress(event) {
    handleShortCuts(event.key)
  }

  useEffect(() => {
    document.addEventListener('keyup', handleKeyPress)

    return () => {
      document.removeEventListener('keyup', handleKeyPress)
    }
  }, [handleKeyPress])


  return (
    <div id="body" className="w-full h-full bg-primary-bg overflow-hidden">
      <Editor />

      <Dock />

      <Settings />

      <Controls />

      <Alert />

      <Popup />

      <TopDock />

      <SaveDialog />

      <SaveDialog />

      <TransitionTable />

      <ConfirmDialog />
    </div>
  )
}

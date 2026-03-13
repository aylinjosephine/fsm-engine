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
import { node_list, transition_list } from './lib/stores'
import { sendExportToMainState } from './lib/export.js'

export function App() {
  // CUSTOM: set nodes and transitions for live export
  const nodes = useAtomValue(node_list)
  const transitions = useAtomValue(transition_list)

  // CUSTOM: live export states and transitions when store changed
  useEffect(() => {
    const timeout = setTimeout(() => {
      sendExportToMainState()
    }, 100)

    return () => clearTimeout(timeout)
  }, [nodes, transitions])

  useEffect(() => {
    const handleContextmenu = (e) => {
      e.preventDefault()
    }
    document.addEventListener('contextmenu', handleContextmenu)
    return function cleanup() {
      document.removeEventListener('contextmenu', handleContextmenu)
    }
  }, [])

  useEffect(() => {
    const handleKeyPress = (event) => {
      handleShortCuts(event.key)
    }

    document.addEventListener('keyup', handleKeyPress)

    return () => {
      document.removeEventListener('keyup', handleKeyPress)
    }
  }, [])

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

      <TransitionTable />

      <ConfirmDialog />
    </div>
  )
}

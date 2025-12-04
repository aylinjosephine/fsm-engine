import { useAtomValue } from "jotai";
import { useEffect, useState, useCallback, useRef } from "react";
import Alert from "./components/Alert";
import Controls from "./components/Controls";
import Dock from "./components/Dock";
import Editor from "./components/Editor";
import Popup from "./components/Popup";
import SaveDialog from "./components/SaveDialog";
import Settings from "./components/Settings";
import TopDock from "./components/TopDock";
import TransitionTable from "./components/TransitionTable";
import ConfirmDialog from "./components/ConfirmDialog";
import { handleShortCuts } from "./lib/editor";
import { editor_state, node_list, transition_list } from "./lib/stores";
import {
  sendExportToParent,
  importFsmFromParent,
  clearFsmFromParent,
} from "./lib/export";

export function App() {
  const [isMobile, setIsMobile] = useState(false);
  const debounceTimerRef = useRef(null);
  const EditorState = useAtomValue(editor_state);

  useEffect(() => {
    const isMobileDevice =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
    setIsMobile(isMobileDevice);
  }, []);

  useEffect(() => {
    const handleContextMenu = (e) => e.preventDefault();
    document.addEventListener("contextmenu", handleContextMenu);
    return () => document.removeEventListener("contextmenu", handleContextMenu);
  }, []);

  const handleKeyPress = useCallback((event) => {
    handleShortCuts(event.key);
  }, []);

  useEffect(() => {
    document.addEventListener("keyup", handleKeyPress);
    return () => document.removeEventListener("keyup", handleKeyPress);
  }, [handleKeyPress]);

  useEffect(() => {
    const debouncedExport = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        sendExportToParent();
      }, 500);
    };

    const handleParentMessage = (event) => {
      const { action, data } = event.data || {};

      switch (action) {
        case "export":
          sendExportToParent();
          break;
        case "import":
          if (data) importFsmFromParent(data);
          break;
        case "clear":
          clearFsmFromParent();
          break;
        default:
          console.warn("Unknown action:", action);
      }
    };

    const nodeUnsubscribe = atomEffect(() => {
      debouncedExport();
    }, [node_list]);

    const transitionUnsubscribe = atomEffect(() => {
      debouncedExport();
    }, [transition_list]);

    window.addEventListener("message", handleParentMessage);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      window.removeEventListener("message", handleParentMessage);
      nodeUnsubscribe?.();
      transitionUnsubscribe?.();
    };
  }, []);

  if (isMobile) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-linear-to-br from-gray-900 via-gray-800 to-gray-700 text-gray-200 p-6 text-center">
        <p className="text-2xl font-semibold tracking-wide text-gray-100 drop-shadow-[0_0_7px_rgba(255,255,255,0.7)]">
          FSM Engine is Designed for Desktop/Laptop use only..!
          <br />
          Please open this application on a bigger device
        </p>
      </div>
    );
  }

  return (
    <div id="body" className="w-screen h-screen bg-primary-bg overflow-hidden">
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
  );
}

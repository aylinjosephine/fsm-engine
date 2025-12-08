import { StrictMode } from "react";
import { Provider } from "jotai";
import { App } from "./app.jsx";
import { createStore } from "jotai";
import { stage_ref, editor_state, layer_ref } from "./lib/stores.js";

// fresh store per mount
export function AppRoot() {
  const freshStore = createStore();

  return (
    <StrictMode>
      <Provider store={freshStore}>
        <App />
      </Provider>
    </StrictMode>
  );
}

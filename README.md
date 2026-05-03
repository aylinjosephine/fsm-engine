# FSM Engine

## FSM Engine as Git Submodule

Since we needed an editor with comfortable UI, we included the FSM Engine of karthik-saiharsh (Github: [FSM Engine](https://github.com/karthik-saiharsh/fsm-engine) in our project.
We added and disabled some functions and customized the editor design a bit, but mostly, the editor remained as it has been.

## Changes

All changes can be found in the commit history of the submodule.
The main changes were the following:

- We customized the entry into the submodule by adding `d.ts`-files. This has been necessary to ensure that the submodule, which is written in JavaScript, is correctly integrated into our main module, which is written in TypeScript.
- We added the whole export path (mainly in `app.jsx`).
- We added more attributes of states and transitions, e.g. their coordinates, the fsm type ('mealy' or 'moore'). We disabled some other attributes or ignored them.
- We changed the way transitions can be edited.
- We customized the menu by adding the settings and guide button and removing other menus and buttons.
- We used a flex layout and flexible viewport instead of static (non-)display options.

## Usage

All changes have to be commited separately in the submodule. Afterwards, the submodule must be built separately (`npm run build`).

## Integration

The FSM editor is embedded as an iframe panel and connected to the central fsm app state.

- Panel integration: `src/panels/FsmEnginePanel.vue`
- Iframe wrapper: `src/components/IFramePanel.vue`
- Sync coordinator: `src/projects/fsm/FsmProject.ts`

## Original FSM Engine

A web-based tool for creating, and visualizing, Finite State Machines (FSMs). Built with React, JavaScript, Tailwind CSS, Jotai, and React Konva for an interactive canvas experience.

<img width="2775" height="1527" alt="Screenshot_20251119_190809" src="https://github.com/user-attachments/assets/4e85ac97-f47b-46ad-88b5-0760492dc26b" />

### Features

- Interactive Canvas Editor
  - Zoom and Pan across an infinite canvas
  - Smooth drag to reposition states
- Multiple Modes
  - Create: Click on the canvas to add new states
  - Select: Drag states to move them
  - Connect: Click two states to create a directed transition (supports self-loops)
  - Delete: Remove states with a single click
  - Grab: Move the Nodes
- State Types
  - initial, intermediate, final
- Dynamic Transitions
  - Arrows automatically adjust their position and curve as you move states
- Welcome/Tutorial Overlay
  - First-run walkthrough with short clips

### Try it at

https://fsm-engine.vercel.app

### Tech Stack

- Frontend: React + JavaScript
- State Management: Jotai
- Canvas: React Konva
- Styling: Tailwind CSS
- Tooling: Vite
- Icons: lucide-react

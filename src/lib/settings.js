/*
 * This file has all the functions that are used in the Settings Component
 */

import {
	current_selected,
	editor_state,
	initial_state,
	fsm_type,
	node_list,
	store,
} from "./stores";
import { addToHistory } from "./history";
import { sendExportToMainState } from "./export";

function sanitizeMooreOutput(value) {
	const normalized = String(value ?? "")
		.trim()
		.replace(/-/g, "x")
		.replace(/[^01x]/gi, "");
	return normalized.length > 0 ? normalized : "x";
}

export function HandleSaveSettings(
	newName,
	newColor,
	newType,
	newMooreOutput = "",
) {
	const nodeList = store.get(node_list);
	const id = store.get(current_selected);
	const isMoore = store.get(fsm_type) === "moore";

	const name = nodeList[id].name;
	const color = nodeList[id].fill;
	const type = nodeList[id].type;
	const currentMooreOutput = nodeList[id].moore_output ?? "";

	let changed = false;

	if (newName !== name) {
		const newRadius = newName.length + 35;
		store.set(node_list, (prev) => {
			prev[id].name = newName;
			prev[id].radius = newRadius;
			return prev;
		});
		changed = true;
	}

	if (newColor !== color.substr(0, 7)) {
		store.set(node_list, (prev) => {
			prev[id].fill = `${newColor}80`;
			return prev;
		});
		changed = true;
	}

	if (JSON.stringify(newType) !== JSON.stringify(type)) {
		if (newType.initial) {
			if (store.get(initial_state) == null) {
				store.set(initial_state, () => id);
			} else {
				const prev_initial = store.get(initial_state);
				store.set(node_list, (prev) => {
					prev[prev_initial].type.initial = false;
					return prev;
				});
				store.set(initial_state, () => id);
			}
		}
		store.set(node_list, (prev) => {
			prev[id].type = newType;
			return prev;
		});
		changed = true;
	}

	if (isMoore) {
		const resolvedOutput = sanitizeMooreOutput(newMooreOutput);
		if (resolvedOutput !== currentMooreOutput) {
			store.set(node_list, (prev) => {
				prev[id].moore_output = resolvedOutput;
				return prev;
			});
			changed = true;
		}
	} else if (currentMooreOutput !== "") {
		store.set(node_list, (prev) => {
			prev[id].moore_output = "";
			return prev;
		});
		changed = true;
	}

	store.set(editor_state, () => null);

	if (changed) {
		addToHistory();
		sendExportToMainState();
	}
}

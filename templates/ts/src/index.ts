// src/index.ts
//
// F3/F4 test view for mithril-lynx-v2. Two things this specifically probes
// on a real device:
//
// - The title's `ontap` mutates state and calls NOTHING else — no
//   `redraw()`, no `m.redraw()`. If F1's fix holds on-device the way it
//   already does in `mithril-lynx-v2/test/end-to-end.test.ts`, the color
//   flips anyway. This is exactly the bug v1 shipped with (AGENTS.md
//   "Estado actual" section) — the whole point of the rewrite.
// - The `<input>` is what F4 checks: type into it, then (live, while the
//   dev server is running) add a NEW sibling node to this file's return
//   array and save — if reload B + the keyed-diff hypothesis
//   (mithril-lynx-v2-desde-cero.md §3.6) holds, the input keeps its focus
//   and in-progress text through that structural change.

import m from "mithril-runtime";

let active = true;

export function view() {
	return m("view", { class: "Page" }, [
		m(
			"text",
			{
				key: "title",
				class: active ? "TitleBlue" : "TitleRed",
				ontap: () => {
					active = !active;
				},
			},
			"mithril-lynx-v2 — F3/F4 test",
		),
		m("input", {
			key: "input",
			placeholder: "Escribi algo y probá el reload...",
		}),
	]);
}

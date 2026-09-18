// src/index.ts
//
// The starting view. Tapping the title flips its color by mutating plain
// state — no `redraw()`/`m.redraw()` call anywhere here: mithril-lynx
// redraws automatically after any event, the same contract real Mithril
// has always had. The `<input>` is there to try live-editing this file
// while `npm run dev` is running — both text/prop edits and structural
// ones (adding/removing a sibling element with a stable `key`) hot-reload
// in place, keeping the input's focus and in-progress text.

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
			"Hello, mithril-lynx!",
		),
		m("input", {
			key: "input",
			placeholder: "Type here and try a live edit...",
		}),
	]);
}

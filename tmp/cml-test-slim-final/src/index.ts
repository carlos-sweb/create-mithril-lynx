import m from "mithril-runtime";

export function view() {
	return m("view", { class: "Page" }, [
		m("text", { class: "Title" }, "Hello, mithril-lynx!"),
	]);
}

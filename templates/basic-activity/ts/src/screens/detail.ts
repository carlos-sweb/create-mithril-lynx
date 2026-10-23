import m from "mithril-runtime";
import route from "mithril-lynx/route";
import { AppBar } from "../app-bar.js";
import { themeClass } from "../data/theme-store.js";

export function view() {
	return m("view", { class: "Page " + themeClass() }, [
		AppBar("Details", () => route.back()),
		m("view", { class: "Content" }, [
			m("text", { class: "Description" }, String(route.param("message") ?? "")),
		]),
	]);
}

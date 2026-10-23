import m from "mithril-runtime";
import { isDarkMode, themeClass, toggleTheme } from "./data/theme-store.js";

export function view() {
	return m("view", { class: "Page " + themeClass() }, [
		m("text", { class: "Title" }, "Hello, mithril-lynx!"),
		m(
			"view",
			{
				class: "ThemeButton",
				ontap: () => toggleTheme(),
			},
			[
				m(
					"text",
					{ class: "ThemeButton-label" },
					isDarkMode() ? "Switch to Light Mode" : "Switch to Dark Mode",
				),
			],
		),
	]);
}

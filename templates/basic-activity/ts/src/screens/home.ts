import m from "mithril-runtime";
import route from "mithril-lynx/route";
import { AppBar } from "../app-bar.js";
import { isDarkMode, themeClass, toggleTheme } from "../data/theme-store.js";

export function view() {
	return m("view", { class: "Page " + themeClass() }, [
		AppBar("Basic Activity"),
		m("view", { class: "Content" }, [
			m("text", { class: "Description" }, "This is the main screen."),
			m(
				"view",
				{
					class: "Button",
					ontap: () => toggleTheme(),
				},
				[
					m(
						"text",
						{ class: "Button-label" },
						isDarkMode() ? "Switch to Light Mode" : "Switch to Dark Mode",
					),
				],
			),
			m(
				route.Link,
				{ href: "/detail", params: { message: "Hello from the main screen!" }, selector: "view", class: "Button" },
				[m("text", { class: "Button-label" }, "Next")],
			),
		]),
	]);
}

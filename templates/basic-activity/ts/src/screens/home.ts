import m from "mithril-runtime";
import route from "mithril-lynx/route";
import { AppBar } from "../app-bar.js";

export function view() {
	return m("view", { class: "Page" }, [
		AppBar("Basic Activity"),
		m("view", { class: "Content" }, [
			m("text", { class: "Description" }, "This is the main screen."),
			m(
				route.Link,
				{ href: "/detail", params: { message: "Hello from the main screen!" }, selector: "view", class: "Button" },
				[m("text", { class: "Button-label" }, "Next")],
			),
		]),
	]);
}

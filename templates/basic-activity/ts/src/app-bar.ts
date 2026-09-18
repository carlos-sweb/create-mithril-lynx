import m from "mithril-runtime";

// A reusable app bar: a title, plus a back affordance when `onBack` is
// given. No m.route.Link involved for the back button — see
// mithril-lynx/route.js's README section on route.back(): Lynx has no
// hardware back button, so a screen's own back affordance has to call
// route.back() explicitly.
export function AppBar(title: string, onBack?: () => void) {
	return m("view", { class: "AppBar" }, [
		onBack != null ? m("text", { class: "AppBar-back", ontap: onBack }, "←") : null,
		m("text", { class: "AppBar-title" }, title),
	]);
}

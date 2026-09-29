import m from "mithril-runtime";

// A reusable app bar: a title, plus a back affordance when `onBack` is
// given. No m.route.Link involved for this on-screen affordance: it calls
// route.back() explicitly. The generated Android host's system Back bridge
// reaches the same history separately through route.listenBackButton().
export function AppBar(title: string, onBack?: () => void) {
	return m("view", { class: "AppBar" }, [
		onBack != null ? m("text", { class: "AppBar-back", ontap: onBack }, "←") : null,
		m("text", { class: "AppBar-title" }, title),
	]);
}

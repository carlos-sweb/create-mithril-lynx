// "mithril-runtime" (https://github.com/carlos-sweb/mithril-runtime) has no
// types of its own yet — it's a same-shaped subset of real Mithril (m.route/
// m.trust/m.request removed, see that repo's README and tests). Reusing
// @types/mithril here is a deliberate approximation: it still types
// m.route/m.trust/m.request as present, which mithril-runtime doesn't have
// — don't reference those from app code; nothing in this app does.
declare module "mithril-runtime" {
	import m from "mithril";
	export = m;
}

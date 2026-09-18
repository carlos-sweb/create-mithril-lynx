// src/background.ts
//
// A stable-host wrapper PER SCREEN, so a hot-update never unmounts/
// remounts either screen — `current*` is a live binding re-pointed by
// `module.hot.accept`, read fresh on every redraw. route(...) (mithril-lynx/
// route) is what actually mounts the app — it calls renderApp() internally
// the first time a route resolves, so this file never calls it directly.

import route from "mithril-lynx/route";
import * as homeModule from "./screens/home.js";
import * as detailModule from "./screens/detail.js";

let currentHome: typeof homeModule = homeModule;
let currentDetail: typeof detailModule = detailModule;

const HomeHost = { view: () => currentHome.view() };
const DetailHost = { view: () => currentDetail.view() };

route("/", {
	"/": HomeHost,
	"/detail": DetailHost,
});

declare const module: {
	hot?: {
		accept(path: string, callback: () => void): void;
	};
};
declare const require: (id: string) => unknown;

if (module.hot) {
	module.hot.accept("./screens/home.js", () => {
		currentHome = require("./screens/home.js") as typeof homeModule;
		route.set(route.get() ?? "/", null, { replace: true });
	});
	module.hot.accept("./screens/detail.js", () => {
		currentDetail = require("./screens/detail.js") as typeof detailModule;
		route.set(route.get() ?? "/", null, { replace: true });
	});
}

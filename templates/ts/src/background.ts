// src/background.ts
//
// F3 (reload A — datos): stable-host pattern. `host` never changes
// identity across a hot-update, so Mithril never unmounts/remounts it;
// `currentView` is a live binding re-pointed by `module.hot.accept`, read
// fresh on every redraw. Same pattern v1 validated on-device (F1 of the
// old plan) — reused here because it was never the buggy part; what's new
// in v2 is that `app.redraw()` always works (see mithril-lynx-v2's
// src/commit.js), including the auto-redraw path this app's index.ts
// relies on for its title tap.

import m from "mithril-runtime";
import { renderApp } from "mithril-lynx-v2/background";
import * as indexModule from "./index.js";

let currentView: typeof indexModule = indexModule;

const host: m.Component = {
	view() {
		return currentView.view();
	},
};

const app = renderApp({ root: () => m(host) });

declare const module: {
	hot?: {
		accept(path: string, callback: () => void): void;
	};
};
declare const require: (id: string) => typeof indexModule;

if (module.hot) {
	module.hot.accept("./index.js", () => {
		currentView = require("./index.js");
		app.redraw();
	});
}

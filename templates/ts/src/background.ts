// src/background.ts
//
// The stable-host pattern: `host` never changes identity across a
// hot-update, so Mithril never unmounts/remounts it; `currentView` is a
// live binding re-pointed by `module.hot.accept`, read fresh on every
// redraw. This is what lets editing `index.ts` hot-reload in place
// without losing an `<input>`'s focus or in-progress text.

import m from "mithril-runtime";
import { renderApp } from "mithril-lynx/background";
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

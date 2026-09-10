import shim from "mithril-lynx";
import app from "./index.js";

// The native engine unconditionally invokes a global processData(initData)
// hook on every __RenderPage/__UpdatePage — install a pass-through default.
// (mithril-lynx/main-thread's setupApp() does this for you in data-channel
// mode; this bare main-thread-owned pattern doesn't go through that module.)
Object.assign(globalThis, {
  processData: (data: unknown) => data,
});

// Main-thread-owned mode — the simplest of mithril-lynx's three rendering
// modes: no background.ts, no dual-bundle build. The app renders directly
// on the main thread, synchronously, on first paint; every later update
// flows through shim.redraw(), called from event handlers bound via
// Mithril's own on* attrs (see src/index.ts).
lynx.getEngine().addEventListener("__RenderPage", () => {
  const page = __CreatePage("0", 0);
  shim.renderToPage(page, app.root);
});

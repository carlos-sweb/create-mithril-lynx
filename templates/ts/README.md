# __APP_NAME__

A [Lynx](https://lynxjs.org) app built with [Mithril.js](https://mithril.js.org), via [`mithril-lynx`](https://github.com/carlos-sweb/mithril-lynx).

## Getting started

```bash
npm install
npm run dev      # scan the printed QR code with LynxExplorer, or open it in Lynx Go
npm run build    # production bundle, in dist/
```

## How this app is structured

- `src/main-thread.ts` — starts the main-thread patch-replay runtime
  (`setupRenderer()`). No app code lives here — mithril-lynx has exactly
  one rendering mode: the whole view runs in the background thread.
- `src/background.ts` — the stable-host pattern: mounts the app once and
  wires `module.hot.accept("./index.js", ...)` so editing `index.ts`
  hot-reloads without losing focus/state in an `<input>` (see the reload
  section below).
- `src/index.ts` — the actual view. Plain Mithril hyperscript.
- `scripts/adb-log.sh` — filters `adb logcat` down to this framework's
  `[mrl-trace]` diagnostic lines, useful when debugging a reload that
  isn't behaving as expected.

## The three reload modes

Edit `src/index.ts` while `npm run dev` is running and the app open on a
device or in Lynx Web:

- **Text/props/CSS changes** and **structural changes** (adding/removing/
  reordering elements, as long as siblings that shouldn't move have a
  stable `key`) both hot-reload in place — no full reload, focus and
  in-progress input text are preserved.
- **Editing `background.ts` itself**, or anything not reachable through
  `index.ts`'s `module.hot.accept`, falls back to a full reload (state
  resets) — the same fallback that fires for a genuinely new dependency
  webpack's HMR runtime can't hot-swap.

See [`mithril-lynx`](https://github.com/carlos-sweb/mithril-lynx)'s own
README for the full design rationale and the device evidence behind
these three modes.

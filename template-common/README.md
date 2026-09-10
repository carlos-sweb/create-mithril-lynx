# {{PROJECT_NAME}}

A [Lynx](https://lynxjs.org) app built with [Mithril.js](https://mithril.js.org), via [`mithril-lynx`](https://github.com/carlos-sweb/mithril-lynx).

## Getting started

```bash
npm install
npm run dev      # scan the printed QR code with LynxExplorer
npm run build     # production bundle, in dist/
```

## Learn more

- `src/main-thread.{js,ts}` wires the app up using **main-thread-owned mode**, the simplest of `mithril-lynx`'s three rendering modes.
- `src/index.{js,ts}` is the app itself — plain Mithril hyperscript, no JSX, no virtual DOM beyond what Mithril already does.
- Everything about the framework — the three rendering modes, refs, gestures, list virtualization, cross-thread calls — is documented in [`mithril-lynx`'s own README](https://github.com/carlos-sweb/mithril-lynx#readme).

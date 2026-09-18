# {{PROJECT_NAME}}

A [Lynx](https://lynxjs.org) app built with [Mithril.js](https://mithril.js.org), via [`mithril-lynx`](https://github.com/carlos-sweb/mithril-lynx).

## Getting started

```bash
npm install
npm run dev      # scan the printed QR code with LynxExplorer, or open it in Lynx Go
npm run build    # production bundle, in dist/
```

## Learn more

- `src/main-thread.ts` starts the main-thread patch-replay runtime (`setupRenderer()`) — mithril-lynx has exactly one rendering mode, so no app code lives here.
- `src/background.ts` is where the app actually mounts (`renderApp()`), running the real Mithril view tree in the background thread.
- Everything about the framework — the three reload modes, routing, networking — is documented in [`mithril-lynx`'s own README](https://github.com/carlos-sweb/mithril-lynx#readme).

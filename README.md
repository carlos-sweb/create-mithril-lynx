# create-mithril-lynx

Scaffolds a new [`mithril-lynx`](https://github.com/carlos-sweb/mithril-lynx) app. Three templates, matching the "Hello World" / "Blank" / "Basic Activity" naming most native app scaffolds already use, each available in TypeScript or JavaScript.

## Usage

```bash
npm create mithril-lynx@latest
```

Prompts for a project name, a template, and a variant (TypeScript or JavaScript), scaffolds it, and offers to install dependencies for you.

### Non-interactive

```bash
npx create-mithril-lynx my-app --hello-world --ts
npx create-mithril-lynx my-app --basic-activity --js --no-install
```

## Templates

| Template | What it is |
|---|---|
| **Hello World** (recommended) | The Mithril.js analog of Lynx's official React hello-world ([`lynx-examples/examples/hello-world`](https://github.com/lynx-family/lynx-examples/tree/main/examples/hello-world)) — same layout, same "tap the logo" interaction, running through Mithril hyperscript instead of JSX. |
| **Blank** | A single centered line of text. Nothing else — the starting point when you don't want any of Hello World's styling/assets in your way. |
| **Basic Activity** | Two screens (Main → Details) wired with [`mithril-lynx/navigation`](https://github.com/carlos-sweb/mithril-lynx#navigation) — a stack-based, in-memory navigator (deliberately not `m.route`; see that package's README for why Lynx pages can't use URL-based routing). Includes a reusable app-bar-with-back-button pattern. Confirmed working end to end on a real device: `push()` with data, the back button, and `pop()` all round-trip correctly. |

## Variants

| Variant | Adds over the base template |
|---|---|
| **TypeScript** (recommended) | `.ts` source files, `tsconfig.json` (project references, matching `@lynx-js/rspeedy`'s own generated config), `@rsbuild/plugin-type-check`, `@types/mithril` for real editor autocomplete on `m()` calls. |
| **JavaScript** | Same app, plain `.js` with ES module `import`/`export` — no type-checking, no `tsconfig.json`. |

## Package structure

```
create-mithril-lynx/
  src/index.js              the CLI itself
  templates/
    _shared/
      common/                gitignore, project README — shared by every template
      js/                    lynx.config.js, package.json, main-thread.js — shared by every JS variant
      ts/                    lynx.config.ts, tsconfig*, package.json, main-thread.ts — shared by every TS variant
    hello-world/
      common/src/            logo/arrow assets, style.css
      js/src/index.js
      ts/src/index.ts
    blank/
      common/src/style.css
      js/src/index.js
      ts/src/index.ts
    basic-activity/
      common/src/style.css
      js/src/index.js
      ts/src/index.ts
```

`src/index.js` copies, in order, `templates/_shared/common` → `templates/_shared/<variant>` → `templates/<template>/common` → `templates/<template>/<variant>` into the target directory (later copies never need to overwrite earlier ones — each layer contributes different files), renames `gitignore` to `.gitignore` (npm doesn't publish dotfiles reliably otherwise), and replaces `{{PROJECT_NAME}}`/`{{MITHRIL_LYNX_VERSION}}` placeholders in `package.json` and `README.md`.

Every template's `src/index.{js,ts}` exports the same shape (`{ root }`), so `_shared/{js,ts}/src/main-thread.{js,ts}` — the actual `__RenderPage` wiring — is 100% shared and never duplicated per template.

## License

MIT

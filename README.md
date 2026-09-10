# create-mithril-lynx

Scaffolds a new [`mithril-lynx`](https://github.com/carlos-sweb/mithril-lynx) app — the Mithril.js analog of Lynx's official React hello-world template ([`lynx-examples/examples/hello-world`](https://github.com/lynx-family/lynx-examples/tree/main/examples/hello-world)). Same layout, same "tap the logo" interaction, running through Mithril hyperscript instead of JSX.

## Usage

```bash
npm create mithril-lynx@latest
```

Prompts for a project name and a variant (TypeScript or JavaScript), scaffolds it, and offers to install dependencies for you.

### Non-interactive

```bash
npx create-mithril-lynx my-app --ts
npx create-mithril-lynx my-app --js --no-install
```

## What it scaffolds

| Variant | Adds over the base template |
|---|---|
| **TypeScript** (recommended) | `.ts` source files, `tsconfig.json` (project references, matching `@lynx-js/rspeedy`'s own generated config), `@rsbuild/plugin-type-check`, `@types/mithril` for real editor autocomplete on `m()` calls. |
| **JavaScript** | Same app, plain `.js` with ES module `import`/`export` — no type-checking, no `tsconfig.json`. |

Both variants share `template-common/`: the logo/arrow image assets, `style.css`, `.gitignore`, and the project's own `README.md`.

## Package structure

```
create-mithril-lynx/
  src/index.js        the CLI itself
  template-common/    shared across both variants
  template-js/        JavaScript-only files
  template-ts/        TypeScript-only files
```

`src/index.js` copies `template-common/` then `template-<variant>/` into the target directory, renames `gitignore` to `.gitignore` (npm doesn't publish dotfiles reliably otherwise), and replaces `{{PROJECT_NAME}}`/`{{MITHRIL_LYNX_VERSION}}` placeholders in `package.json` and `README.md`.

## License

MIT

# create-mithril-lynx

Scaffolds a new [`mithril-lynx`](https://github.com/carlos-sweb/mithril-lynx) app. Three templates, matching the "Hello World" / "Blank" / "Basic Activity" naming most native app scaffolds already use.

It can also generate the **native Android host** — the whole Gradle project that wraps the bundle into an installable APK — so you never hand-write the ~20 Kotlin/Gradle/XML files that takes. That path automates [`mithril-lynx`'s ANDROID_APK_GUIDE.md](https://github.com/carlos-sweb/mithril-lynx/blob/main/ANDROID_APK_GUIDE.md).

> **Note:** this is a complete rewrite of the previous `create-mithril-lynx`, matching [`mithril-lynx`'s own rewrite](https://github.com/carlos-sweb/mithril-lynx). The old tool's **Basic Activity** template used `mithril-lynx/navigation` (a stack-based, in-memory navigator) — that module doesn't exist in the new `mithril-lynx`, so this template was rewritten from scratch around [`mithril-lynx/route`](https://github.com/carlos-sweb/mithril-lynx/blob/main/ROUTE.md) instead. Everything else (Hello World, Blank, the Android host) ports over unchanged, since none of it depended on the part of the framework that got rewritten.

## Usage

```bash
npm create mithril-lynx@latest
```

Prompts for a project name and a template, scaffolds it, and offers to install dependencies for you.

### Non-interactive

```bash
npx create-mithril-lynx my-app --hello-world
npx create-mithril-lynx my-app --basic-activity --no-install
```

### With the Android host

```bash
# Scaffold the JS app plus a sibling my-app-android/ Gradle project:
npx create-mithril-lynx my-app --blank --android

cd my-app
npm install
npm run android          # bundle -> assets -> installDebug -> launch on the device
```

The interactive prompt offers it too, and the literal `target=android` form works as well:

```bash
npm create mithril-lynx@latest my-app target=android
```

Every flag, in one table — `npx create-mithril-lynx --help` prints the same list:

| Flag | Effect |
|---|---|
| `<name>` (positional) | Project name, and the directory to create. Omit it and you're prompted. |
| `--hello-world` / `--blank` / `--basic-activity` | Template to scaffold. Omit it and you're prompted. |
| `--no-install` | Don't install dependencies (also skips that prompt). |
| `-h`, `--help` | Print usage and exit. |
| `--android` / `--target android` / `--target=android` / `target=android` | Also scaffold the sibling `<name>-android/` Gradle project. |
| `--android-id <id>` | `applicationId` / `namespace` (default `com.example.<name>`). |
| `--app-name <name>` | Launcher label (default: the project name). |
| `--with-font <file.ttf>` | Bundle the font into `src/assets/fonts/` and register it with `lynx.addFont()` in a loop. **DEV** (`npm run dev` / Lynx Go): `require()` inlines a `data:` URI so the font shows up in Explorer. **PROD** (`npm run build` / APK): `asset:///fonts/<file>` resolved by `AssetFontFaceLoader` on the host (keeps the bundle small — embedding `data:` URIs in the APK re-introduces the cold-start cost tracked in [lynx#9431](https://github.com/lynx-family/lynx/issues/9431)). Comma-separate for more than one file. |
| `--find-font <term>` | Search [Fontsource](https://fontsource.org)'s catalog for `<term>`, prompt you to pick a family and a weight/style, download that one `.ttf`, and bundle it exactly like `--with-font`. Needs a real terminal (the picking is inherently interactive — use `--with-font <file.ttf>` in scripts/CI). Mutually exclusive with `--with-font`. Comma-separate terms for more than one — quote the whole thing if any term has a space. |
| `--font-family <name>` | Override the family name derived from the font's file name (or from Fontsource, with `--find-font`). Only valid with exactly one font. |

Anything not listed — in particular the four Android flags — requires `--android`
(or one of its aliases); `--with-font`/`--find-font` imply it on their own.

### More than one font

Both flags take a comma-separated list — useful for a body font plus a
monospace one for code, for example:

```bash
npx create-mithril-lynx my-app --blank --android --find-font "Inter,JetBrains Mono"
```

Each font is one entry in a `FONTS` array in `src/background.ts`, registered
with a single `for…of` + `lynx.addFont()` loop (DEV `require` / PROD
`asset:///` — see the `--with-font` row above). Only the **first** one gets
the automatic `text { font-family: ...; }` rule in `src/style.css` (there's
no way for the CLI to guess which elements should use which font past that)
— the rest are registered and ready to use, but you assign them to your own
classes by hand, e.g.:

```css
.code {
  font-family: "JetBrains Mono", monospace;
}
```

### Adding fonts after the project exists

```bash
cd my-app
npx create-mithril-lynx add-font --with-font ./Another.ttf
npx create-mithril-lynx add-font --find-font "Roboto Mono"
```

Copying the `.ttf` into `src/assets/fonts/` (and the Android host's
`assets/fonts/` when present) is always safe. Wiring `background.ts` /
`style.css` is automatic **only while those files still match the stock
template** (including a previously generated `FONTS` block on top of it). If
you've edited them, the command prints the exact block to paste by hand and
leaves your files untouched.

### `--find-font`, in more detail

Fontsource's own API (`api.fontsource.org`) has no free-text search — only
exact `id`/`family` filters — so `--find-font` downloads the whole font list
once (~2100 fonts, ~540KB as of 2026-09), caches it for 24h in the OS temp
directory, and filters client-side on `family`/`id` substrings. Picking a
family fetches that font's own detail (its real weight/style/subset `.ttf`
URLs), lets you pick one variant (defaulting to 400/normal if available),
downloads it to a temp file, and hands it to the same code path
`--with-font <file>` uses — there's no separate font-loading mechanism to
maintain.

```bash
npx create-mithril-lynx my-app --blank --android --find-font Inter
```

### What the generated Android host gives you

The sibling `<name>-android/` project is a complete, no-Android-Studio Gradle CLI project, including:

- the Gradle wrapper (`gradlew`, `gradlew.bat`, `gradle-wrapper.jar`), so nothing needs to be installed besides a JDK and the Android SDK;
- `local.properties` with `sdk.dir` auto-detected from `ANDROID_HOME`/`ANDROID_SDK_ROOT` (with a written warning if it can't be found);
- the Kotlin host: the `Application` (registers `AssetFontFaceLoader`), `MainActivity` (async `AssetTemplateProvider`, splash screen, `NoopGenericResourceFetcher` for the fast `data:` font path — [lynx#9431](https://github.com/lynx-family/lynx/issues/9431));
- resource files that compile as-is (theme, splash theme, adaptive launcher icon);
- an opt-in release signing setup driven by a gitignored `keystore.properties`.

And in the JS project, a `scripts/android.mjs` bridge plus npm scripts:

```bash
npm run android            # build + sync + installDebug + launch, printing TotalTime
npm run android:apk        # build + sync + assembleDebug
npm run android:release    # build + sync + assembleRelease (signed if keystore.properties exists)
npm run android:sync       # build + sync bundle into app/src/main/assets/, no Gradle
npm run android:keystore   # generate release.keystore + keystore.properties (KEYSTORE_PASSWORD=...)
```

This part of the tool is framework-agnostic — it just wraps whatever bundle `rspeedy build` produces into a native host — so it needed no changes for the `mithril-lynx` rewrite beyond what's inherited automatically through the generated JS project.

## Templates

| Template | What it is |
|---|---|
| **Hello World** (recommended) | The Mithril.js analog of Lynx's official React hello-world ([`lynx-examples/examples/hello-world`](https://github.com/lynx-family/lynx-examples/tree/main/examples/hello-world)) — same layout, same "tap the logo" interaction, running through Mithril hyperscript instead of JSX. |
| **Blank** | A single centered line of text. Nothing else — the starting point when you don't want any of Hello World's styling/assets in your way. |
| **Basic Activity** | Two screens (Main → Details) wired with [`mithril-lynx/route`](https://github.com/carlos-sweb/mithril-lynx/blob/main/ROUTE.md) — an in-memory router (`m.route`, reimplemented for an environment with no URL bar). Includes a reusable app-bar-with-back-button pattern, using `route.back()` since Lynx has no hardware back button for a route to hook into automatically. |

## Package structure

```
create-mithril-lynx/
  src/index.js              the CLI itself (+ add-font subcommand)
  src/fontsource.js         --find-font: local search over Fontsource's catalog
  src/fonts-wire.js         FONTS block builder + stock-template detect/patch
  templates/
    _shared/
      common/                gitignore, project README — shared by every template
      ts/                    lynx.config.ts, tsconfig*, package.json, main-thread.ts,
                              background.ts (single-view mount) — shared by every
                              template that doesn't override background.ts itself
    hello-world/
      common/src/            logo/arrow assets, style.css
      ts/src/index.ts
    blank/
      common/src/style.css
      ts/src/index.ts
    basic-activity/
      common/src/style.css
      ts/src/{app-bar.ts, background.ts, screens/{home,detail}.ts}
    android/                 only used with --android
      host/                  the Gradle project -> <name>-android/
                             (includes AssetFontFaceLoader +
                             NoopGenericResourceFetcher for lynx#9431)
      app-scripts/android.mjs       the bridge -> <name>/scripts/android.mjs
                             (syncs bundle + src/assets/fonts/ → assets/fonts/)
```

`src/index.js` copies, in order, `templates/_shared/common` → `templates/_shared/ts` → `templates/<template>/common` → `templates/<template>/ts` into the target directory — later copies overwrite same-named files from earlier ones, which is exactly how **Basic Activity**'s own routing-based `src/background.ts` replaces `_shared/ts`'s generic single-view one (Hello World and Blank don't ship their own, so they keep the shared file). It then renames `gitignore` to `.gitignore` (npm doesn't publish dotfiles reliably otherwise) and replaces `{{PROJECT_NAME}}`/`{{MITHRIL_LYNX_VERSION}}` placeholders in `package.json` and `README.md`.

With `--android` it then copies `templates/android/host` into a sibling `<name>-android/` (renaming `package-path` to the real package directory and `App.kt` to the Application class) and substitutes `{{PACKAGE_NAME}}`, `{{APP_CLASS}}`, `{{APP_NAME}}`, `{{ANDROID_DIR}}` and `{{SDK_DIR}}` across the tree. Binary files (the Gradle wrapper jar, a `--with-font` `.ttf`) are never text-substituted. With `--with-font`, each font is copied into the JS project (`src/assets/fonts/`) *and* seeded into the Android host's `assets/fonts/`, wired up with a `FONTS` loop + `lynx.addFont()` in `src/background.ts` plus a `text { font-family: ... }` rule in `src/style.css` for the first font. `scripts/android.mjs` keeps `assets/fonts/` in sync on every `npm run android` / `android:sync`.

**Not carried over from v1 (yet)**: the JavaScript variant. The old tool generated either TypeScript or JavaScript for every template; this rewrite ships TypeScript only for now — doubling every template for a parallel JS copy wasn't part of this pass.

## Testing

All three templates are verified end to end: scaffolded non-interactively, `npm install`ed against the real published `mithril-lynx`/`mithril-runtime` packages, and type-checked with `tsc -b` — not just copied and assumed correct.

## License

MIT

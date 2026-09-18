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
| `--with-font <file.ttf>` | Copy the font into the host's assets, generate `AssetFontFaceLoader.kt`, and wire the cold-start `prefetchFont()` hack (Part D of the guide). |
| `--font-family <name>` | Override the family name derived from the font's file name. Only meaningful with `--with-font`. |

Anything not listed — in particular the four Android flags — requires `--android`
(or one of its aliases); `--with-font` implies it on its own.

### What the generated Android host gives you

The sibling `<name>-android/` project is a complete, no-Android-Studio Gradle CLI project, including:

- the Gradle wrapper (`gradlew`, `gradlew.bat`, `gradle-wrapper.jar`), so nothing needs to be installed besides a JDK and the Android SDK;
- `local.properties` with `sdk.dir` auto-detected from `ANDROID_HOME`/`ANDROID_SDK_ROOT` (with a written warning if it can't be found);
- the Kotlin host: the `Application`, `MainActivity` (async `AssetTemplateProvider`, splash screen), and the font loader when `--with-font` is used;
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
  src/index.js              the CLI itself
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
      font/AssetFontFaceLoader.kt   copied only when --with-font is used
      app-scripts/android.mjs       the bridge -> <name>/scripts/android.mjs
```

`src/index.js` copies, in order, `templates/_shared/common` → `templates/_shared/ts` → `templates/<template>/common` → `templates/<template>/ts` into the target directory — later copies overwrite same-named files from earlier ones, which is exactly how **Basic Activity**'s own routing-based `src/background.ts` replaces `_shared/ts`'s generic single-view one (Hello World and Blank don't ship their own, so they keep the shared file). It then renames `gitignore` to `.gitignore` (npm doesn't publish dotfiles reliably otherwise) and replaces `{{PROJECT_NAME}}`/`{{MITHRIL_LYNX_VERSION}}` placeholders in `package.json` and `README.md`.

With `--android` it then copies `templates/android/host` into a sibling `<name>-android/` (renaming `package-path` to the real package directory and `App.kt` to the Application class), substitutes `{{PACKAGE_NAME}}`, `{{APP_CLASS}}`, `{{APP_NAME}}`, `{{ANDROID_DIR}}` and `{{SDK_DIR}}` across the tree, and fills in the four font-hack hooks (`{{FONT_LOADER_IMPORT}}`, `{{FONT_LOADER_REGISTRATION}}`, `{{FONT_IMPORT}}`, `{{FONT_PREFETCH}}`) with either the real code or nothing at all. Binary files (the Gradle wrapper jar, the `.ttf`) are never text-substituted.

**Not carried over from v1 (yet)**: the JavaScript variant. The old tool generated either TypeScript or JavaScript for every template; this rewrite ships TypeScript only for now — doubling every template for a parallel JS copy wasn't part of this pass.

## Testing

All three templates are verified end to end: scaffolded non-interactively, `npm install`ed against the real published `mithril-lynx`/`mithril-runtime` packages, and type-checked with `tsc -b` — not just copied and assumed correct.

## License

MIT

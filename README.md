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

### With Android connectors

Android projects can opt into the published
[`lynx-android-plugins`](https://github.com/carlos-sweb/lynx-android-plugins)
artifacts at scaffold time. The generator adds the selected Maven libraries,
their JavaScript facade packages, manifest contributions, native-module
registrations, and the Activity callbacks required for camera and geolocation.

```bash
npx create-mithril-lynx my-app --blank --android \
  --android-plugins battery,geolocation,network
```

Available connector names are `battery`, `camera`, `device`, `geolocation`,
`network`, `vibration`, `maps`, and `all`. The interactive Android flow offers the
same selection. `all` deliberately includes every manifest contribution;
prefer individual names for production apps.

The generated project receives the `lynx-android-plugins` JavaScript package
with a small typed API for each selected feature. For example,
`import { gps } from "lynx-android-plugins/geolocation"`
followed by `await gps.get({ highAccuracy: true })` returns one location.
See the [JavaScript facades](https://github.com/carlos-sweb/lynx-android-plugins#javascript-facades)
for the complete API.

For offline maps, select `--android-plugins maps` (or add `maps` after
scaffolding). This creates `android/maps.json`. Supply the HTTPS URL, SHA-256,
and version of a Chile PMTiles archive there. Every build runs
`android:prepare` first and copies that config into the Android host. Import
`Maps` from `lynx-android-plugins/maps` and render it inside a sized parent:

```ts
import { Maps } from "lynx-android-plugins/maps";
m(Maps, { latitude: -33.532290, longitude: -71.584904, variant: "full" });
```

The map is downloaded only when the user taps the native download button.
Afterward it renders offline. The archive must be hosted by the app developer;
this project does not offer a public map-tile service. The Maps module is
prepared for Maven/npm version `0.2.0` and is not usable from the published
`0.1.0` artifacts.

### Add connectors after scaffolding

Projects generated with this version can update their selected connectors
without recreating the app:

```bash
cd my-app
npx create-mithril-lynx add-android-plugin battery,geolocation
npx create-mithril-lynx remove-android-plugin battery
npx create-mithril-lynx list-android-plugins
```

The generator stores its selection in `android/connectors.json`, rewrites its
own Gradle dependency block and `LynxAndroidConnectorRegistry.kt`, adds or
removes the `lynx-android-plugins` dependency in `package.json`, and runs the detected
package manager's install command when they change. A custom facade version,
a modified native block, or an Android host predating this workflow causes
the command to stop without replacing those edits.
Use `--no-install` after an add/remove command to update configuration without
running the package manager immediately.

The interactive prompt offers it too, and the literal `target=android` form works as well:

```bash
npm create mithril-lynx@latest my-app target=android
```

### CLI reference

These are the project-creation flags. Run `npx create-mithril-lynx --help` to
see them together with the post-scaffold commands below.

| Flag | Effect |
|---|---|
| `<name>` (positional) | Project name, and the directory to create. Omit it and you're prompted. |
| `--hello-world` / `--blank` / `--basic-activity` | Template to scaffold. Omit it and you're prompted. |
| `--no-install` | Skip dependency installation after scaffolding; also skips the install prompt. For connector commands, prevents the package manager from running. |
| `-h`, `--help` | Print usage and exit. |
| `--with-ui` | Add `mithril-lynx-ui` and import its stylesheet. Offered during interactive setup; works independently of `--android`. |
| `--android` / `--target android` / `--target=android` / `target=android` | Also scaffold the sibling `<name>-android/` Gradle project. |
| `--android-id <id>` | `applicationId` / `namespace` (default `com.example.<name>`). |
| `--app-name <name>` | Launcher label (default: the project name). |
| `--android-plugins <list>` | Android connectors to include: comma-separated `battery`, `camera`, `device`, `geolocation`, `network`, `vibration`, `maps`, or `all`. Implies `--android`. |
| `--with-font <file.ttf>` | Bundle the font into `src/assets/fonts/` and register it with `lynx.addFont()` in a loop. **DEV** (`npm run dev` / Lynx Go): `require()` inlines a `data:` URI so the font shows up in Explorer. **PROD** (`npm run build` / APK): `asset:///fonts/<file>` resolved by `AssetFontFaceLoader` on the host (keeps the bundle small — embedding `data:` URIs in the APK re-introduces the cold-start cost tracked in [lynx#9431](https://github.com/lynx-family/lynx/issues/9431)). Comma-separate for more than one file. |
| `--find-font <term>` | Search [Fontsource](https://fontsource.org)'s catalog for `<term>`, prompt you to pick a family and one or more weights/styles, download each `.ttf`, and bundle them exactly like `--with-font`. Needs a real terminal (the picking is inherently interactive — use `--with-font <file.ttf>` in scripts/CI). Mutually exclusive with `--with-font`. Comma-separate terms for more than one — quote the whole thing if any term has a space. |
| `--font-family <name>` | Override the family name derived from the font's file name (or from Fontsource, with `--find-font`). Only valid with exactly one font. |

`--android-id` and `--app-name` configure the host when one is generated.
`--android-plugins` and the font flags imply `--android`; `--with-ui` works
with or without the Android host.

### Commands for an existing project

Run these from the generated app directory. Connector commands require an
Android host created by this tool and manage only the generated connector
configuration.

| Command | Arguments and options | Effect |
|---|---|---|
| `add-font` | `--with-font <file.ttf>` or `--find-font <term>`; optional `--font-family <name>` | Add fonts to the existing app and wire up the generated font registration and CSS. Font options are the same as during scaffolding. |
| `add-android-plugin` | `<list>`; optional `--no-install` | Add comma-separated Android connectors (the same names as `--android-plugins`) and update dependencies. `--no-install` leaves dependency installation to you. |
| `remove-android-plugin` | `<list>`; optional `--no-install` | Remove managed connectors and update dependencies. If `all` is enabled, remove `all` as a whole. |
| `list-android-plugins` | — | Show the connectors currently enabled for the Android host. |

### UI components

Add `mithril-lynx-ui` to a new app and import its stylesheet with:

```bash
npx create-mithril-lynx my-app --blank --with-ui
```

For component APIs and styling, see the [`mithril-lynx-ui` documentation](https://github.com/carlos-sweb/mithril-lynx-ui#readme).

### More than one font

Both flags take a comma-separated list — useful for a body font plus a
monospace one for code, for example:

```bash
npx create-mithril-lynx my-app --blank --android --find-font "Inter,JetBrains Mono"
```

Each font is one entry in a `FONTS` array in `src/background.ts`, registered
with a single `for…of` + `lynx.addFont()` loop (DEV `require` / PROD
`asset:///` — see the `--with-font` row above).

The CSS side lives in a separate, **generated** file, `src/fonts.css`, which
`src/style.css` pulls in with a single `@import "fonts.css";` line at the top.
`fonts.css` holds `text { font-family: ...; }` for the **first** font and, when
there is more than one font, one class per family/variant:

```css
.Ubuntu_Regular { font-family: "Ubuntu Regular", sans-serif; }
.Ubuntu_Bold    { font-family: "Ubuntu Bold", sans-serif; }
.Inter_Regular  { font-family: "Inter Regular", sans-serif; }
```

`fonts.css` is owned by the tooling and rewritten from the full font list on
every run (scaffold or `add-font`) — don't edit it by hand; put your own rules
in `style.css`. (Unused classes can be pruned by a later PostCSS pass.)

### Adding fonts after the project exists

```bash
cd my-app
npx create-mithril-lynx add-font --with-font ./Another.ttf
npx create-mithril-lynx add-font --find-font "Roboto Mono"
```

Copying the `.ttf` into `src/assets/fonts/` (and the Android host's
`assets/fonts/` when present) is always safe. `src/fonts.css` is always
regenerated, and `style.css` only ever gets the one `@import "fonts.css";`
line (added if missing). Wiring `background.ts` is automatic **only while it
still matches the stock template** (including a previously generated `FONTS`
block on top of it); if you've edited it, the command prints the exact block
to paste by hand and leaves your file untouched.

### `--find-font`, in more detail

Fontsource's own API (`api.fontsource.org`) has no free-text search — only
exact `id`/`family` filters — so `--find-font` downloads the whole font list
once (~2100 fonts, ~540KB as of 2026-09), caches it for 24h in the OS temp
directory, and filters client-side on `family`/`id` substrings. Picking a
family fetches that font's own detail (its real weight/style/subset `.ttf`
URLs), lets you pick one or more variants (space to toggle; defaulting to 400/normal if available),
downloads each to a temp file, and hands them to the same code path
`--with-font <file>` uses — there's no separate font-loading mechanism to
maintain.

Every picked variant is registered as `<Family> <Variant>` (`Inter Regular`, `Inter Bold`, `Inter Light Italic`…), with a matching class in `src/fonts.css` (`.Inter_Bold`). The first one (400/normal if picked) is the default `text` font.

```bash
npx create-mithril-lynx my-app --blank --android --find-font Inter
```

### What the generated Android host gives you

The sibling `<name>-android/` project is a complete, no-Android-Studio Gradle CLI project, including:

- the Gradle wrapper (`gradlew`, `gradlew.bat`, `gradle-wrapper.jar`), so nothing needs to be installed besides a JDK and the Android SDK;
- `local.properties` with `sdk.dir` auto-detected from `ANDROID_HOME`/`ANDROID_SDK_ROOT` (with a written warning if it can't be found);
- the Kotlin host: the `Application` (registers `AssetFontFaceLoader`), `MainActivity` (async `AssetTemplateProvider`, splash screen, `NoopGenericResourceFetcher` for the fast `data:` font path — [lynx#9431](https://github.com/lynx-family/lynx/issues/9431)), and a predefined native bridge for `mithril-lynx/route`'s Android system Back support;
- a project-local `android/` folder with editable `AndroidManifest.xml`, `strings.xml`, `styles.xml`, `config.xml`, `network_security_config.xml`, and `file_paths.xml`, plus `bun run android:prepare` to copy them into the Gradle host;
- opt-in Maven Central connectors for battery, camera, device, geolocation, network, vibration, and maps, each registered only when selected with `--android-plugins`;
- an opt-in release signing setup driven by a gitignored `keystore.properties`.

And in the JS project, a `scripts/android.mjs` bridge plus npm scripts:

```bash
npm run android            # build + sync + installDebug + launch, printing TotalTime
npm run android:apk        # build + sync + assembleDebug
npm run android:release    # build + sync + assembleRelease (signed if keystore.properties exists)
npm run android:sync       # build + sync bundle into app/src/main/assets/, no Gradle
bun run android:prepare    # manually sync android/*.xml and maps.json -> sibling Android host
npm run android:keystore   # generate release.keystore + keystore.properties (KEYSTORE_PASSWORD=...)
```

The packaging path still wraps whatever bundle `rspeedy build` produces. Its one framework-aware convenience is the predefined, otherwise dormant system Back bridge used by `mithril-lynx/route`; the Basic Activity template connects it automatically.

## Templates

| Template | What it is |
|---|---|
| **Hello World** (recommended) | The Mithril.js analog of Lynx's official React hello-world ([`lynx-examples/examples/hello-world`](https://github.com/lynx-family/lynx-examples/tree/main/examples/hello-world)) — same layout, same "tap the logo" interaction, running through Mithril hyperscript instead of JSX. |
| **Blank** | A single centered line of text. Nothing else — the starting point when you don't want any of Hello World's styling/assets in your way. |
| **Basic Activity** | Two screens (Main → Details) wired with [`mithril-lynx/route`](https://github.com/carlos-sweb/mithril-lynx/blob/main/ROUTE.md) — an in-memory router (`m.route`, reimplemented for an environment with no URL bar). Includes a reusable app-bar back affordance and, with `--android`, predefined system Back/predictive Back integration through `route.listenBackButton()`. |

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
                             (includes AssetFontFaceLoader,
                             NoopGenericResourceFetcher for lynx#9431, and the
                             MithrilLynxNavigationModule system-Back bridge)
      app-scripts/{android,android-prepare}.mjs
                             bridges in <name>/scripts/ (syncs bundle/fonts;
                             prepares <name>/android/*.xml into the host)
```

`src/index.js` copies, in order, `templates/_shared/common` → `templates/_shared/ts` → `templates/<template>/common` → `templates/<template>/ts` into the target directory — later copies overwrite same-named files from earlier ones, which is exactly how **Basic Activity**'s own routing-based `src/background.ts` replaces `_shared/ts`'s generic single-view one (Hello World and Blank don't ship their own, so they keep the shared file). It then renames `gitignore` to `.gitignore` (npm doesn't publish dotfiles reliably otherwise) and replaces `{{PROJECT_NAME}}`/`{{MITHRIL_LYNX_VERSION}}` placeholders in `package.json` and `README.md`.

Scaffolding handles the Android host and fonts as follows:

1. **Android host (`--android`)**
   - Copies `templates/android/host` into a sibling `<name>-android/` project.
   - Renames `package-path` to the generated package directory and `App.kt` to the application class.
   - Replaces `{{PACKAGE_NAME}}`, `{{APP_CLASS}}`, `{{APP_NAME}}`, `{{ANDROID_DIR}}` and `{{SDK_DIR}}` placeholders.
   - Seeds the app's editable `android/` folder with `AndroidManifest.xml`, `strings.xml`, `styles.xml`, `config.xml`, `network_security_config.xml` and `file_paths.xml`.

2. **Android preparation**
   - `bun run build` and Android build commands run `android:prepare` before building, copying the editable config files into the Gradle host.
   - To copy the files without building, run `bun run android:prepare` (or `npm run android:prepare`).

3. **Fonts (`--with-font`)**
   - Copies each `.ttf` into `src/assets/fonts/` and registers it from `src/background.ts` with a generated `FONTS` loop and `lynx.addFont()`.
   - Generates `src/fonts.css`, imported by `src/style.css`; it sets the first font as the default `text` font and creates a class for each font variant.
   - When an Android host exists, also copies fonts into its `assets/fonts/`. `scripts/android.mjs` syncs that folder during `npm run android` and `npm run android:sync`.

4. **Binary files**
   - The Gradle wrapper JAR and font `.ttf` files are copied as binary assets; placeholder substitution does not modify them.

**Not carried over from v1 (yet)**: the JavaScript variant. The old tool generated either TypeScript or JavaScript for every template; this rewrite ships TypeScript only for now — doubling every template for a parallel JS copy wasn't part of this pass.

## Testing

All three templates are verified end to end: scaffolded non-interactively, `npm install`ed against the real published `mithril-lynx`/`mithril-runtime` packages, and type-checked with `tsc -b` — not just copied and assumed correct.

## License

MIT

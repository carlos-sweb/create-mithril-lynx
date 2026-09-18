#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

import { cancel, confirm, intro, isCancel, outro, select, text } from "@clack/prompts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(scriptDir, "..");
const cwd = process.cwd();

// The mithril-lynx version pinned in the generated package.json — tracks
// the current release, same policy as this tool's own v1.
const MITHRIL_LYNX_VERSION = "latest";

const TEMPLATES = [
	{ value: "hello-world", label: "Hello World", hint: "recommended" },
	{ value: "blank", label: "Blank" },
	{ value: "basic-activity", label: "Basic Activity", hint: "multi-screen routing" },
];
const TEMPLATE_VALUES = TEMPLATES.map((t) => t.value);

const ANDROID_TEMPLATE_ROOT = path.join(packageRoot, "templates", "android");

// Files that text substitution must never touch (binaries).
const BINARY_EXTENSIONS = new Set([".jar", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ttf", ".otf", ".ttc", ".keystore", ".jks", ".so"]);

function isValidPackageName(name) {
	return /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name);
}

function copyDir(from, to) {
	fs.mkdirSync(to, { recursive: true });
	for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
		const src = path.join(from, entry.name);
		const dest = path.join(to, entry.name);
		if (entry.isDirectory()) copyDir(src, dest);
		else fs.copyFileSync(src, dest);
	}
}

/** copyDir, but able to rename entries (files or directories) on the way. */
function copyTree(from, to, rename = (name) => name) {
	fs.mkdirSync(to, { recursive: true });
	for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
		const src = path.join(from, entry.name);
		const dest = path.join(to, rename(entry.name));
		if (entry.isDirectory()) copyTree(src, dest, rename);
		else fs.copyFileSync(src, dest);
	}
}

function walkFiles(dir) {
	const out = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walkFiles(full));
		else out.push(full);
	}
	return out;
}

function replaceInFile(filePath, replacements) {
	if (!fs.existsSync(filePath)) return;
	let content = fs.readFileSync(filePath, "utf8");
	for (const [from, to] of replacements) content = content.split(from).join(to);
	fs.writeFileSync(filePath, content);
}

/** Applies substitutions across a whole tree, skipping binaries. */
function replaceInTree(dir, replacements) {
	for (const file of walkFiles(dir)) {
		const ext = path.extname(file).toLowerCase();
		if (BINARY_EXTENSIONS.has(ext)) continue;
		replaceInFile(file, replacements);
	}
}

function targetDirHasConflict(value) {
	const targetDir = path.join(cwd, value);
	return fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0;
}

// ---------------------------------------------------------------------------
// Android host derivations
// ---------------------------------------------------------------------------

function pascalCase(value) {
	const joined = value
		.split(/[^a-zA-Z0-9]+/)
		.filter(Boolean)
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join("")
		.replace(/[^a-zA-Z0-9]/g, "");
	if (joined === "") return "MithrilApp";
	return /^[0-9]/.test(joined) ? `App${joined}` : joined;
}

function deriveAndroidId(projectName) {
	const base = projectName.replace(/^@[^/]+\//, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "app";
	const segment = /^[0-9]/.test(base) ? `app${base}` : base;
	return `com.example.${segment}`;
}

function isValidAndroidId(id) {
	if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(id)) return false;
	const javaKeywords = new Set([
		"abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const",
		"continue", "default", "do", "double", "else", "enum", "extends", "final", "finally", "float",
		"for", "goto", "if", "implements", "import", "instanceof", "int", "interface", "long", "native",
		"new", "package", "private", "protected", "public", "return", "short", "static", "strictfp",
		"super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "void",
		"volatile", "while",
	]);
	return id.split(".").every((segment) => !javaKeywords.has(segment));
}

function appClassNameFor(rawName) {
	const base = path.basename(rawName.replace(/^@[^/]+\//, ""));
	const name = pascalCase(base);
	// Must not collide with the template's fixed file names.
	return name === "MainActivity" ? `${name}App` : name;
}

function fontFamilyFor(filePath) {
	return path
		.basename(filePath, path.extname(filePath))
		.split(/[_\-.]+/)
		.filter(Boolean)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join(" ");
}

function xmlEscape(value) {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function findAndroidSdk() {
	for (const candidate of [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT]) {
		if (candidate && fs.existsSync(candidate)) return candidate;
	}
	for (const candidate of [
		path.join(process.env.HOME ?? "", "android-sdk"),
		path.join(process.env.HOME ?? "", "Android/Sdk"),
		"/usr/lib/android-sdk",
	]) {
		if (candidate && fs.existsSync(path.join(candidate, "platform-tools"))) return candidate;
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function readOption(args, name) {
	const withEquals = args.find((a) => a.startsWith(`--${name}=`));
	if (withEquals) return withEquals.slice(name.length + 3);
	const index = args.indexOf(`--${name}`);
	if (index !== -1 && args[index + 1] != null && !args[index + 1].startsWith("-")) return args[index + 1];
	return undefined;
}

function parseAndroidArgs(args) {
	// Accepts `--android`, `--target android`, `--target=android` and the
	// literal `target=android`, which is how the README documents it.
	const target = readOption(args, "target");
	const requested = args.includes("--android") || target === "android" || args.includes("target=android");
	return {
		requested,
		id: readOption(args, "android-id"),
		appName: readOption(args, "app-name"),
		fontPath: readOption(args, "with-font"),
		fontFamily: readOption(args, "font-family"),
	};
}

// Options that consume the following argument, so that value is never mistaken
// for the project name (e.g. `--with-font ./UbuntuMono.ttf`).
const OPTIONS_WITH_VALUE = new Set(["--target", "--android-id", "--app-name", "--with-font", "--font-family"]);

function findPositional(args) {
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg.startsWith("-")) {
			if (OPTIONS_WITH_VALUE.has(arg)) i += 1;
			continue;
		}
		if (arg === "target=android") continue;
		if (/^(?:target|android-id|app-name|with-font|font-family)=/.test(arg)) continue;
		return arg;
	}
	return undefined;
}

/** Indents every non-empty line of a generated block. */
function indent(block, spaces) {
	const pad = " ".repeat(spaces);
	return block
		.split("\n")
		.map((line) => (line === "" ? line : pad + line))
		.join("\n");
}

// ---------------------------------------------------------------------------
// Android host scaffolding
// ---------------------------------------------------------------------------

async function resolveAndroidOptions(android, { rawName, projectName, canPrompt }) {
	let androidId = android.id;
	if (androidId == null && canPrompt) {
		androidId = await text({
			message: "Android application ID (applicationId / namespace)",
			placeholder: deriveAndroidId(projectName),
			defaultValue: deriveAndroidId(projectName),
			validate(value) {
				// clack validates the raw input and only applies defaultValue
				// afterwards (in its "finalize" handler), so an empty Enter has
				// to count as valid or the default is never used.
				if (value == null || value === "") return;
				if (!isValidAndroidId(value)) return "Must be a valid Java package, e.g. com.example.myapp";
			},
		});
		if (isCancel(androidId)) return null;
	}
	androidId = androidId ?? deriveAndroidId(projectName);
	if (!isValidAndroidId(androidId)) {
		cancel(`"${androidId}" is not a valid Android application ID (e.g. com.example.myapp).`);
		process.exit(1);
	}

	let appName = android.appName;
	if (appName == null && canPrompt) {
		appName = await text({
			message: "App display name (the one shown in the launcher)",
			placeholder: path.basename(rawName),
			defaultValue: path.basename(rawName),
			validate(value) {
				// See the note on the applicationId prompt: empty means "use the default".
				if (value == null || value === "") return;
				if (value.trim() === "") return "Enter a name.";
			},
		});
		if (isCancel(appName)) return null;
	}
	appName = appName ?? path.basename(rawName);

	let font = null;
	if (android.fontPath != null) {
		const resolved = path.resolve(cwd, android.fontPath);
		if (!fs.existsSync(resolved)) {
			cancel(`Font file not found: ${android.fontPath}`);
			process.exit(1);
		}
		if (![".ttf", ".otf", ".ttc"].includes(path.extname(resolved).toLowerCase())) {
			cancel(`"${android.fontPath}" does not look like a font (.ttf/.otf/.ttc).`);
			process.exit(1);
		}
		font = {
			sourcePath: resolved,
			file: path.basename(resolved),
			family: android.fontFamily ?? fontFamilyFor(resolved),
		};
	} else if (android.fontFamily != null) {
		cancel("--font-family only makes sense together with --with-font.");
		process.exit(1);
	}

	return { androidId, appName, font };
}

function scaffoldAndroid({ targetDir, rawName, options }) {
	const { androidId, appName, font } = options;

	const androidDirName = `${path.basename(rawName.replace(/^@[^/]+\//, ""))}-android`;
	const androidDir = path.join(path.dirname(targetDir), androidDirName);
	const appClass = appClassNameFor(rawName);
	const packagePath = androidId.split(".").join(path.sep);
	const packageDir = path.join(androidDir, "app", "src", "main", "java", packagePath);

	// 1. Copy the Gradle skeleton and the Kotlin app. `package-path` expands to
	//    the real package path, and App.kt is renamed after its class.
	copyTree(path.join(ANDROID_TEMPLATE_ROOT, "host"), androidDir, (name) => {
		if (name === "package-path") return packagePath;
		if (name === "App.kt") return `${appClass}.kt`;
		if (name === "gitignore") return ".gitignore";
		return name;
	});

	fs.mkdirSync(path.join(androidDir, "app", "src", "main", "assets"), { recursive: true });
	// On Windows chmod only handles the write bit; if it fails, the wrapper is
	// still invoked through gradlew.bat.
	try {
		fs.chmodSync(path.join(androidDir, "gradlew"), 0o755);
	} catch {
		// best-effort
	}

	// 2. The .ttf is opt-in: without it neither the loader nor the prefetch is
	//    generated, so no dead code is left behind.
	if (font != null) {
		const fontsDir = path.join(androidDir, "app", "src", "main", "assets", "fonts");
		fs.mkdirSync(fontsDir, { recursive: true });
		fs.copyFileSync(font.sourcePath, path.join(fontsDir, font.file));

		fs.copyFileSync(
			path.join(ANDROID_TEMPLATE_ROOT, "font", "AssetFontFaceLoader.kt"),
			path.join(packageDir, "AssetFontFaceLoader.kt"),
		);
	}

	const sdkDir = findAndroidSdk();

	// 3. Text substitutions across the whole Android host (skipping the
	//    gradle-wrapper.jar, the .ttf and any other binary).
	replaceInTree(androidDir, [
		["{{PACKAGE_NAME}}", androidId],
		["{{APP_CLASS}}", appClass],
		["{{APP_NAME}}", xmlEscape(appName)],
		["{{ANDROID_DIR}}", androidDirName],
		[
			"{{SDK_DIR}}",
			sdkDir != null
				? `sdk.dir=${sdkDir}`
				: "# Android SDK not found: export ANDROID_HOME (or ANDROID_SDK_ROOT) and\n# replace the line below, or set sdk.dir by hand.\n# sdk.dir=/path/to/your/android-sdk",
		],
	]);

	// 4. The four font-hack hooks: either the real code, or nothing at all.
	const sourceUri = font != null ? `asset:///fonts/${font.file}` : undefined;
	const fontLoaderImport = font != null ? "import com.lynx.tasm.loader.LynxFontFaceLoader\n" : "";
	const fontLoaderRegistration =
		font != null
			? `${indent(
					[
						"// Must run BEFORE LynxEnv.inst().init(): this is what makes",
						'// "asset:///" resolvable, both for prefetchFont() and for the',
						"// real @font-face resolution during the first layout.",
						"LynxFontFaceLoader.setLoader(AssetFontFaceLoader)",
					].join("\n"),
					8,
				)}\n\n`
			: "";
	const fontImport = font != null ? "import com.lynx.tasm.fontface.FontFaceManager\n" : "";
	const fontPrefetch =
		font != null
			? `${indent(
					[
						"// Warms the Typeface on Lynx's own IO thread pool, before",
						"// renderTemplateUrl() gives the bundle's CSS a chance to resolve",
						"// @font-face during the first layout. FontFaceManager caches by the",
						"// exact src string, so this URI has to be identical to the",
						'// url("...") of the @font-face in src/style.css.',
						"FontFaceManager.getInstance().prefetchFont(",
						"    lynxView.lynxContext,",
						`    "${sourceUri}",`,
						"    null,",
						"    object : FontFaceManager.FontFacePrefetchListener {",
						"        override fun onComplete(code: Int, msg: String) {}",
						"    },",
						")",
					].join("\n"),
					8,
				)}\n\n`
			: "";

	for (const kt of walkFiles(packageDir)) {
		replaceInFile(kt, [
			["// {{FONT_LOADER_IMPORT}}\n", fontLoaderImport],
			["        // {{FONT_LOADER_REGISTRATION}}\n", fontLoaderRegistration],
			["// {{FONT_IMPORT}}\n", fontImport],
			["        // {{FONT_PREFETCH}}\n", fontPrefetch],
		]);
	}

	// 5. The script that joins the two halves, inside the JS project.
	const scriptsDir = path.join(targetDir, "scripts");
	fs.mkdirSync(scriptsDir, { recursive: true });
	fs.copyFileSync(path.join(ANDROID_TEMPLATE_ROOT, "app-scripts", "android.mjs"), path.join(scriptsDir, "android.mjs"));

	const androidRelDir = path.relative(targetDir, androidDir).split(path.sep).join("/");
	replaceInFile(path.join(scriptsDir, "android.mjs"), [
		["{{ANDROID_REL_DIR}}", androidRelDir],
		["{{ANDROID_DIR}}", androidDirName],
		["{{PACKAGE_NAME}}", androidId],
		// A name with quotes would break keytool's -dname=CN=...
		["{{APP_NAME}}", appName.replace(/["\\]/g, "")],
	]);

	return { androidDir, androidDirName, androidRelDir, androidId, appName, appClass, font, sdkDir };
}

function patchJsProject({ targetDir, android }) {
	// package.json: the Android scripts.
	const pkgPath = path.join(targetDir, "package.json");
	const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
	pkg.scripts = {
		...pkg.scripts,
		android: "node scripts/android.mjs",
		"android:apk": "node scripts/android.mjs --apk",
		"android:release": "node scripts/android.mjs --release",
		"android:sync": "node scripts/android.mjs --sync-only",
		"android:keystore": "node scripts/android.mjs --keystore",
	};
	fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

	// style.css: the @font-face that has to match the Android host's
	// prefetchFont() byte for byte.
	if (android.font != null) {
		const cssPath = path.join(targetDir, "src", "style.css");
		const block = [
			"/* The font lives in the Android host's assets",
			"   (app/src/main/assets/fonts/), not in the bundle. The asset:///",
			"   string has to be identical to the one in MainActivity.kt's prefetchFont()",
			"   or Lynx won't find the warmed Typeface. */",
			"@font-face {",
			`  font-family: "${android.font.family}";`,
			`  src: url("asset:///fonts/${android.font.file}");`,
			"}",
			"",
		].join("\n");
		const existing = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf8") : "";
		fs.writeFileSync(cssPath, `${block}\n${existing}`);
	}

	// README: how the two halves are used together.
	const readmePath = path.join(targetDir, "README.md");
	if (fs.existsSync(readmePath)) {
		const section = [
			"",
			"## Android (native APK)",
			"",
			`The Android host lives in \`../${android.androidDirName}/\` and packages the bundle this project produces.`,
			"",
			"```bash",
			"npm run android          # build the bundle, copy it to assets, install and launch on the device",
			"npm run android:apk      # build the debug APK only",
			"npm run android:sync     # bundle -> assets only, no Gradle",
			"",
			"# Signed release APK (generate the keystore once):",
			"KEYSTORE_PASSWORD='...' npm run android:keystore",
			"npm run android:release",
			"```",
			"",
			`- Application ID: \`${android.androidId}\``,
			`- Application class: \`${android.appClass}\` · Activity: \`MainActivity\``,
			...(android.font != null
				? [`- Font \`${android.font.family}\` prefetched from \`asset:///fonts/${android.font.file}\` (the cold-start hack).`]
				: []),
			"",
		].join("\n");
		fs.appendFileSync(readmePath, section);
	}
}

// ---------------------------------------------------------------------------

const USAGE = `
create-mithril-lynx — scaffold a mithril-lynx app (and, optionally, its Android host)

Usage:
  npm create mithril-lynx@latest [name] [options]
  npx create-mithril-lynx <name> --blank --android

Template (prompted for if omitted):
  --hello-world | --blank | --basic-activity

Android host:
  --android, --target android, target=android
                            scaffold the sibling Gradle project <name>-android/
  --android-id <id>         applicationId / namespace (default com.example.<name>)
  --app-name <name>         launcher label (default: the project name)
  --with-font <file.ttf>    copy the font into the host's assets, generate
                            AssetFontFaceLoader.kt, and wire up the prefetchFont()
                            call that avoids the slow cold start
  --font-family <name>      override the family name derived from the file name

Other:
  --no-install              don't install dependencies
  -h, --help                print this
`.trim();

async function main() {
	// Non-interactive escape hatch for scripting/CI:
	//   create-mithril-lynx my-app --hello-world
	//   create-mithril-lynx my-app --basic-activity --no-install
	//   create-mithril-lynx my-app --blank --android --android-id com.acme.miapp
	//   create-mithril-lynx my-app --blank --with-font ./UbuntuMono-Regular.ttf
	const args = process.argv.slice(2);

	if (args.includes("--help") || args.includes("-h")) {
		console.log(USAGE);
		return;
	}

	const positional = findPositional(args);
	const templateFlag = TEMPLATE_VALUES.find((t) => args.includes(`--${t}`));
	const noInstall = args.includes("--no-install");
	const nonInteractive = positional != null && templateFlag != null;
	const android = parseAndroidArgs(args);

	// --with-font/--font-family only make sense with an Android host: imply it
	// rather than ignoring them silently.
	if (android.fontPath != null || android.fontFamily != null) {
		android.requested = true;
	}

	intro("create-mithril-lynx");

	let rawName;
	if (positional != null) {
		rawName = positional;
		if (targetDirHasConflict(rawName)) {
			cancel(`Directory "${rawName}" already exists and is not empty.`);
			process.exit(1);
		}
	} else {
		rawName = await text({
			message: "Project name",
			placeholder: "my-mithril-app",
			validate(value) {
				if (!value) return "Please enter a project name.";
				if (targetDirHasConflict(value)) return "Directory already exists and is not empty.";
			},
		});
		if (isCancel(rawName)) return bail();
	}

	const projectName = isValidPackageName(rawName)
		? rawName
		: rawName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-~]/g, "-");

	let template = templateFlag;
	if (template == null) {
		template = await select({
			message: "Select a template",
			options: TEMPLATES,
		});
		if (isCancel(template)) return bail();
	}

	let withAndroid = android.requested;
	if (!withAndroid && !nonInteractive) {
		withAndroid = await confirm({
			message: "Also generate the Android host (Gradle APK)?",
			initialValue: false,
		});
		if (isCancel(withAndroid)) return bail();
	}

	let androidOptions = null;
	if (withAndroid) {
		androidOptions = await resolveAndroidOptions(android, { rawName, projectName, canPrompt: !nonInteractive });
		if (androidOptions == null) return bail();
	}

	const targetDir = path.join(cwd, rawName);
	fs.mkdirSync(targetDir, { recursive: true });

	// Layered copy: shared build plumbing (gitignore/README, then
	// lynx.config/tsconfig/main-thread/background), then the chosen
	// template's own app content (style.css/assets, then src). A template's
	// own src/background.ts (basic-activity's — routing-based) overwrites
	// the shared single-view one; hello-world/blank don't ship one, so the
	// shared file is what they get.
	copyDir(path.join(packageRoot, "templates/_shared/common"), targetDir);
	copyDir(path.join(packageRoot, "templates/_shared/ts"), targetDir);
	copyDir(path.join(packageRoot, "templates", template, "common"), targetDir);
	copyDir(path.join(packageRoot, "templates", template, "ts"), targetDir);

	const gitignorePath = path.join(targetDir, "gitignore");
	if (fs.existsSync(gitignorePath)) {
		fs.renameSync(gitignorePath, path.join(targetDir, ".gitignore"));
	}

	replaceInFile(path.join(targetDir, "package.json"), [
		["{{PROJECT_NAME}}", projectName],
		["{{MITHRIL_LYNX_VERSION}}", MITHRIL_LYNX_VERSION],
	]);
	replaceInFile(path.join(targetDir, "README.md"), [["{{PROJECT_NAME}}", projectName]]);

	let androidResult = null;
	if (withAndroid) {
		androidResult = scaffoldAndroid({ targetDir, rawName, options: androidOptions });
		patchJsProject({ targetDir, android: androidResult });
	}

	let shouldInstall = !noInstall;
	if (!nonInteractive && !noInstall) {
		shouldInstall = await confirm({
			message: "Install dependencies now?",
			initialValue: true,
		});
		if (isCancel(shouldInstall)) return bail();
	}

	if (shouldInstall) {
		const manager = detectPackageManager();
		try {
			execSync(`${manager} install`, { cwd: targetDir, stdio: "inherit" });
		} catch {
			outro(`Dependency install failed — run "${manager} install" yourself inside ${rawName}/.`);
			return;
		}
	}

	const relativeDir = path.relative(cwd, targetDir) || ".";
	const steps = [
		`cd ${relativeDir}`,
		...(shouldInstall ? [] : ["npm install"]),
		"npm run dev",
	];

	if (androidResult != null) {
		const { androidDirName, sdkDir, font } = androidResult;
		const notes = [
			`Android host generated in ${androidDirName}/ (Application ID ${androidOptions.androidId}).`,
			"",
			"To build/install the APK on the connected device:",
			"",
			`  cd ${relativeDir} && npm run android`,
			"",
			sdkDir == null
				? "⚠ Android SDK not found: export ANDROID_HOME and edit " +
					`${androidDirName}/local.properties (sdk.dir=...).`
				: `Android SDK found at ${sdkDir}.`,
			font != null
				? `Font "${font.family}" prefetched from asset:///fonts/${font.file} (the cold-start hack).`
				: "No custom font — pass --with-font <file.ttf> to include the prefetch hack.",
		];
		outro(`Done! Next steps:\n\n  ${steps.join("\n  ")}\n\n${notes.join("\n")}`);
		return;
	}

	outro(`Done! Next steps:\n\n  ${steps.join("\n  ")}\n\nThen scan the printed QR code with LynxExplorer.`);
}

function detectPackageManager() {
	const userAgent = process.env.npm_config_user_agent ?? "";
	if (userAgent.startsWith("bun")) return "bun";
	if (userAgent.startsWith("pnpm")) return "pnpm";
	if (userAgent.startsWith("yarn")) return "yarn";
	return "npm";
}

function bail() {
	cancel("Cancelled.");
	process.exit(0);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});

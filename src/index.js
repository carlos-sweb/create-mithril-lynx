#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

import { cancel, confirm, intro, isCancel, outro, select, spinner, text } from "@clack/prompts";

import { fetchFontDetail, fetchFontList, listVariants, searchFonts } from "./fontsource.js";
import {
	applyBackgroundFonts,
	applyCssDefaultFont,
	buildCssFontBlock,
	buildFontBlock,
	copyFontFiles,
	findAndroidDir,
	findProjectRoot,
	mergeFontLists,
	stripFontBlock,
} from "./fonts-wire.js";

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

/** `--with-font`/`--find-font` accept a comma-separated list, for bundling
 * more than one font (e.g. a body font and a monospace one for code). */
function splitList(value) {
	return value
		.split(",")
		.map((v) => v.trim())
		.filter(Boolean);
}

/** Renames `file` on any font past the first with the same basename, so
 * e.g. two different "Inter" downloads (different weights) don't collide
 * once copied into src/assets/fonts/. */
function dedupeFontFiles(fonts) {
	const seen = new Set();
	for (const font of fonts) {
		let file = font.file;
		let n = 2;
		while (seen.has(file)) {
			const ext = path.extname(font.file);
			file = `${path.basename(font.file, ext)}-${n}${ext}`;
			n += 1;
		}
		seen.add(file);
		font.file = file;
	}
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
		findFontTerm: readOption(args, "find-font"),
	};
}

// Options that consume the following argument, so that value is never mistaken
// for the project name (e.g. `--with-font ./UbuntuMono.ttf`).
const OPTIONS_WITH_VALUE = new Set([
	"--target",
	"--android-id",
	"--app-name",
	"--with-font",
	"--font-family",
	"--find-font",
]);

function findPositional(args) {
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg.startsWith("-")) {
			if (OPTIONS_WITH_VALUE.has(arg)) i += 1;
			continue;
		}
		if (arg === "target=android") continue;
		if (/^(?:target|android-id|app-name|with-font|font-family|find-font)=/.test(arg)) continue;
		return arg;
	}
	return undefined;
}

const WEIGHT_NAMES = {
	100: "Thin",
	200: "Extra Light",
	300: "Light",
	400: "Regular",
	500: "Medium",
	600: "Semi Bold",
	700: "Bold",
	800: "Extra Bold",
	900: "Black",
};

function variantLabel(variant) {
	const weightName = WEIGHT_NAMES[variant.weight] ?? String(variant.weight);
	const style = variant.style === "italic" ? " Italic" : "";
	return `${weightName}${style} (${variant.weight} ${variant.style})`;
}

/**
 * Interactive search-download flow for `--find-font <term>`: queries
 * Fontsource's catalog locally (see src/fontsource.js — the API itself has
 * no free-text search), lets the user pick a family and one weight/style,
 * downloads that .ttf to a temp file, and returns it in the same shape
 * `--with-font <file>` expects, so the rest of the pipeline (entirely
 * JS-side — see patchJsProject()) doesn't need to know which path was used.
 */
async function findFontInteractively(term) {
	// Unlike the other prompts in this file, this one isn't skippable by
	// supplying enough flags up front — picking a family and a variant out
	// of a search result is inherently interactive. Gate on the terminal
	// itself, not on whether name/template were also given.
	if (!process.stdin.isTTY) {
		cancel("--find-font needs an interactive terminal to pick a family and variant — use --with-font <file.ttf> in scripts/CI.");
		process.exit(1);
	}

	const s = spinner();
	s.start(`Searching Fontsource for "${term}"…`);
	let list;
	try {
		list = await fetchFontList();
	} catch (error) {
		s.stop("Search failed.");
		cancel(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
	const matches = searchFonts(list, term);
	s.stop(`${matches.length} match(es) for "${term}".`);

	if (matches.length === 0) {
		cancel(`No Fontsource font matches "${term}". Try a different search, or use --with-font <file.ttf> for a font you already have.`);
		process.exit(1);
	}

	const chosenId = await select({
		message: "Which font?",
		options: matches.map((f) => ({
			value: f.id,
			label: f.family,
			hint: `${f.category}${f.variable ? ", variable" : ""} · ${f.license}`,
		})),
	});
	if (isCancel(chosenId)) return null;

	const s2 = spinner();
	s2.start("Fetching variants…");
	let detail;
	try {
		detail = await fetchFontDetail(chosenId);
	} catch (error) {
		s2.stop("Failed.");
		cancel(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
	const allVariants = listVariants(detail);
	const variants = allVariants.filter((v) => v.subset === "latin");
	s2.stop(`${variants.length || allVariants.length} variant(s) available.`);

	const pickFrom = variants.length > 0 ? variants : allVariants;
	const chosenVariant = await select({
		message: "Which weight/style?",
		initialValue: pickFrom.find((v) => v.weight === 400 && v.style === "normal") ?? pickFrom[0],
		options: pickFrom.map((v) => ({ value: v, label: variantLabel(v) })),
	});
	if (isCancel(chosenVariant)) return null;

	const s3 = spinner();
	s3.start(`Downloading ${detail.family} ${variantLabel(chosenVariant)}…`);
	let bytes;
	try {
		const response = await fetch(chosenVariant.url);
		if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
		bytes = Buffer.from(await response.arrayBuffer());
	} catch (error) {
		s3.stop("Download failed.");
		cancel(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
	const tempFile = path.join(
		os.tmpdir(),
		`${chosenId}-${chosenVariant.weight}-${chosenVariant.style}-${chosenVariant.subset}.ttf`,
	);
	fs.writeFileSync(tempFile, bytes);
	s3.stop(`Downloaded ${(bytes.length / 1024).toFixed(1)} kB.`);

	return { sourcePath: tempFile, family: detail.family };
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

	const fonts = await resolveFontsFromFlags(android, { baseDir: cwd, requireFonts: false });
	if (fonts == null) return null;

	return { androidId, appName, fonts };
}

/**
 * Shared by scaffold and `add-font`: resolve --with-font / --find-font /
 * --font-family into `{ sourcePath, file, family }[]`. Returns null if the
 * interactive --find-font flow was cancelled; exits on hard errors.
 * When `requireFonts` is false (scaffold without --with-font), returns [].
 */
async function resolveFontsFromFlags(android, { baseDir, requireFonts }) {
	if (android.fontPath != null && android.findFontTerm != null) {
		cancel("--with-font and --find-font are mutually exclusive — pick one.");
		process.exit(1);
	}

	const fontPaths = android.fontPath != null ? splitList(android.fontPath) : [];
	const findFontTerms = android.findFontTerm != null ? splitList(android.findFontTerm) : [];
	const fontCount = fontPaths.length + findFontTerms.length;

	if (android.fontFamily != null && fontCount > 1) {
		cancel(
			"--font-family only makes sense with exactly one font — omit it when bundling more than one, or edit src/style.css/background.ts by hand afterwards.",
		);
		process.exit(1);
	}
	if (android.fontFamily != null && fontCount === 0) {
		cancel("--font-family only makes sense together with --with-font or --find-font.");
		process.exit(1);
	}
	if (fontCount === 0) {
		if (requireFonts) {
			cancel("Pass --with-font <file.ttf> or --find-font <term> (comma-separate for more than one).");
			process.exit(1);
		}
		return [];
	}

	const fonts = [];
	for (const term of findFontTerms) {
		const found = await findFontInteractively(term);
		if (found == null) return null;
		fonts.push({
			sourcePath: found.sourcePath,
			file: path.basename(found.sourcePath),
			family: android.fontFamily ?? found.family,
		});
	}
	for (const rawPath of fontPaths) {
		const resolved = path.resolve(baseDir, rawPath);
		if (!fs.existsSync(resolved)) {
			cancel(`Font file not found: ${rawPath}`);
			process.exit(1);
		}
		if (![".ttf", ".otf", ".ttc"].includes(path.extname(resolved).toLowerCase())) {
			cancel(`"${rawPath}" does not look like a font (.ttf/.otf/.ttc).`);
			process.exit(1);
		}
		fonts.push({
			sourcePath: resolved,
			file: path.basename(resolved),
			family: android.fontFamily ?? fontFamilyFor(resolved),
		});
	}
	dedupeFontFiles(fonts);
	return fonts;
}

function printManualBlock(title, block) {
	console.log("");
	console.log(`  ${title}`);
	console.log("  ────────────────────────────────────────");
	for (const line of block.replace(/\n$/, "").split("\n")) {
		console.log(`  ${line}`);
	}
	console.log("  ────────────────────────────────────────");
	console.log("");
}

/**
 * Post-init: add one or more fonts to an existing mithril-lynx project.
 * Always copies the files; patches background.ts / style.css only when they
 * still match the stock template (optionally with our FONTS block on top).
 */
async function runAddFont(args) {
	intro("create-mithril-lynx add-font");

	const android = parseAndroidArgs(args);
	if (android.fontPath == null && android.findFontTerm == null) {
		cancel("Pass --with-font <file.ttf> or --find-font <term>.");
		process.exit(1);
	}

	const projectRoot = findProjectRoot(cwd);
	if (projectRoot == null) {
		cancel(
			"No mithril-lynx project found here (need lynx.config.ts + src/background.ts).\n" +
				"    cd into the app directory and try again.",
		);
		process.exit(1);
	}

	const incoming = await resolveFontsFromFlags(android, { baseDir: cwd, requireFonts: true });
	if (incoming == null) return;

	const bgPath = path.join(projectRoot, "src", "background.ts");
	const { fonts: existingInBg } = stripFontBlock(
		fs.existsSync(bgPath) ? fs.readFileSync(bgPath, "utf8") : "",
	);
	const hadExistingFonts = existingInBg.length > 0;
	const merged = mergeFontLists(existingInBg, incoming, dedupeFontFiles);

	const androidDir = findAndroidDir(projectRoot);
	const copied = copyFontFiles({
		projectRoot,
		fonts: incoming,
		androidDir,
	});

	for (const item of copied) {
		const rel = path.relative(cwd, item.path);
		console.log(`  → ${rel}${item.role === "android" ? " (android host)" : ""}`);
	}
	if (androidDir == null) {
		console.log(
			"  ℹ No Android host found next to this app — fonts were only copied into src/assets/fonts/.\n" +
				"    (PROD asset:/// registration needs the host's AssetFontFaceLoader.)",
		);
	}

	const bgResult = applyBackgroundFonts(projectRoot, merged);
	if (bgResult.ok) {
		console.log("  ✔ Updated src/background.ts");
	} else {
		console.log(`  ✖ Could not auto-edit src/background.ts (${bgResult.reason}).`);
		console.log("    Paste this block at the top of src/background.ts:");
		printManualBlock("src/background.ts", bgResult.manualBlock);
	}

	const cssResult = applyCssDefaultFont(projectRoot, merged[0].family, { hadExistingFonts });
	if (cssResult.ok && cssResult.skipped) {
		console.log(
			`  · src/style.css already has text { font-family: … } — assign extra fonts in your own classes.`,
		);
	} else if (cssResult.ok) {
		console.log("  ✔ Updated src/style.css");
	} else {
		console.log(`  ✖ Could not auto-edit src/style.css (${cssResult.reason}).`);
		console.log("    Paste this at the top of src/style.css (or assign the family on your own classes):");
		printManualBlock("src/style.css", cssResult.manualBlock);
	}

	const extras = merged.slice(hadExistingFonts ? existingInBg.length : 1).map((f) => f.family);
	// When we had no prior fonts, slice(1) are extras beyond the CSS default.
	// When we had prior fonts, newly added ones after existingInBg.length need a note.
	const newlyAddedFamilies = incoming.map((f) => f.family);
	if (hadExistingFonts && newlyAddedFamilies.length > 0) {
		console.log(
			`  · New font${newlyAddedFamilies.length > 1 ? "s" : ""} ${newlyAddedFamilies.map((f) => `"${f}"`).join(", ")} — set font-family on your own CSS classes.`,
		);
	} else if (!hadExistingFonts && extras.length > 0) {
		console.log(
			`  · Extra font${extras.length > 1 ? "s" : ""} ${extras.map((f) => `"${f}"`).join(", ")} — set font-family on your own CSS classes.`,
		);
	}

	outro(
		`Done. Font${merged.length > 1 ? "s" : ""} ${merged.map((f) => `"${f.family}"`).join(", ")} ` +
			(bgResult.ok ? "registered." : "copied — finish registration with the lines above."),
	);
}

function scaffoldAndroid({ targetDir, rawName, options }) {
	const { androidId, appName, fonts } = options;

	const androidDirName = `${path.basename(rawName.replace(/^@[^/]+\//, ""))}-android`;
	const androidDir = path.join(path.dirname(targetDir), androidDirName);
	const appClass = appClassNameFor(rawName);
	const packagePath = androidId.split(".").join(path.sep);

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

	// 2. Fonts: the host always ships AssetFontFaceLoader +
	//    NoopGenericResourceFetcher (lynx#9431 workaround). Production
	//    bundles register fonts as asset:///fonts/<file>; Lynx Go / dev
	//    uses inlined data: URIs. See patchJsProject() for the JS wiring
	//    and templates/android/host/.../NoopGenericResourceFetcher.kt.
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

	// 4. Seed assets/fonts/ so the first APK build works even before
	//    scripts/android.mjs syncs (it also keeps them in sync later).
	if (fonts.length > 0) {
		const androidFontsDir = path.join(androidDir, "app", "src", "main", "assets", "fonts");
		fs.mkdirSync(androidFontsDir, { recursive: true });
		for (const { sourcePath, file } of fonts) {
			fs.copyFileSync(sourcePath, path.join(androidFontsDir, file));
		}
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

	return { androidDir, androidDirName, androidRelDir, androidId, appName, appClass, fonts, sdkDir };
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

	// Fonts: copy + register via lynx.addFont() loop (DEV data: / PROD
	// asset:///) — see src/fonts-wire.js and the Android host's
	// AssetFontFaceLoader / NoopGenericResourceFetcher (lynx#9431).
	if (android.fonts.length > 0) {
		copyFontFiles({
			projectRoot: targetDir,
			fonts: android.fonts,
			androidDir: android.androidDir,
		});
		const bgPath = path.join(targetDir, "src", "background.ts");
		const existingBg = fs.existsSync(bgPath) ? fs.readFileSync(bgPath, "utf8") : "";
		fs.writeFileSync(bgPath, `${buildFontBlock(android.fonts)}${existingBg}`);

		const cssPath = path.join(targetDir, "src", "style.css");
		const existingCss = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf8") : "";
		fs.writeFileSync(cssPath, `${buildCssFontBlock(android.fonts[0].family)}${existingCss}`);
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
			...android.fonts.map(
				(f) =>
					`- Font \`${f.family}\` (\`src/assets/fonts/${f.file}\`): \`lynx.addFont()\` — DEV inlines a \`data:\` URI for Lynx Go; PROD uses \`asset:///fonts/${f.file}\` via \`AssetFontFaceLoader\` ([lynx#9431](https://github.com/lynx-family/lynx/issues/9431)).`,
			),
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
  npx create-mithril-lynx add-font --with-font ./Foo.ttf
  npx create-mithril-lynx add-font --find-font Inter

Template (prompted for if omitted):
  --hello-world | --blank | --basic-activity

Android host:
  --android, --target android, target=android
                            scaffold the sibling Gradle project <name>-android/
  --android-id <id>         applicationId / namespace (default com.example.<name>)
  --app-name <name>         launcher label (default: the project name)
  --with-font <file.ttf>    bundle the font into the JS project and register it
                            with lynx.addFont() (DEV: data: URI for Lynx Go;
                            PROD: asset:/// + AssetFontFaceLoader — see README).
                            Comma-separate for more than one,
                            e.g. --with-font a.ttf,b.ttf
  --find-font <term>        search Fontsource (fontsource.org) for a font,
                            pick a family and a weight/style interactively,
                            and bundle it the same way as --with-font.
                            Comma-separate terms for more than one — quote
                            the whole thing if any term has a space, e.g.
                            --find-font "Inter,JetBrains Mono"
  --font-family <name>      override the family name derived from the file
                            name (only valid with exactly one font)

Post-init (run inside an existing app directory):
  add-font                  copy font file(s) into src/assets/fonts/ (and the
                            Android host's assets/fonts/ when present). If
                            background.ts / style.css still match the stock
                            template, wire them up automatically; otherwise
                            print the lines to paste by hand.
                            Same --with-font / --find-font / --font-family
                            flags as above.

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
	//   create-mithril-lynx add-font --with-font ./Extra.ttf
	const args = process.argv.slice(2);

	if (args.includes("--help") || args.includes("-h")) {
		console.log(USAGE);
		return;
	}

	if (args[0] === "add-font") {
		await runAddFont(args.slice(1));
		return;
	}

	const positional = findPositional(args);
	const templateFlag = TEMPLATE_VALUES.find((t) => args.includes(`--${t}`));
	const noInstall = args.includes("--no-install");
	const nonInteractive = positional != null && templateFlag != null;
	const android = parseAndroidArgs(args);

	// --with-font/--find-font/--font-family only make sense with an Android
	// host: imply it rather than ignoring them silently.
	if (android.fontPath != null || android.findFontTerm != null || android.fontFamily != null) {
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
		const { androidDirName, sdkDir, fonts } = androidResult;
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
			fonts.length > 0
				? `Font${fonts.length > 1 ? "s" : ""} ${fonts.map((f) => `"${f.family}"`).join(", ")} registered via lynx.addFont() — Lynx Go (data:) and the APK (asset:///) both covered.`
				: "No custom font — pass --with-font <file.ttf> (or --find-font <term>) to bundle one.",
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

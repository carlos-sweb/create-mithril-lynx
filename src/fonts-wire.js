/**
 * Font registration wiring shared by scaffold (`--with-font` / `--find-font`)
 * and the post-init `add-font` subcommand.
 *
 * Strategy for patching an existing project (add-font):
 *   1. Always copy .ttf/.otf/.ttc into src/assets/fonts/ (and the Android
 *      host's assets/fonts/ when present) — that part is always safe.
 *   2. If src/background.ts still matches a stock template (optionally with
 *      our generated FONTS block on top), rewrite the font block in place.
 *   3. Same idea for src/style.css's automatic `text { font-family }` rule.
 *   4. Otherwise print the exact lines the user must paste by hand.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(scriptDir, "..");

const FONT_EXT = /\.(ttf|otf|ttc)$/i;

/** Normalize for equality checks (EOL + trailing whitespace per line). */
export function normalizeSource(text) {
	return (
		text
			.replace(/\r\n/g, "\n")
			.split("\n")
			.map((line) => line.replace(/\s+$/u, ""))
			.join("\n")
			.replace(/\n+$/u, "") + "\n"
	);
}

export function buildFontBlock(fonts) {
	const defaultFamily = fonts[0].family;
	const extraFamilies = fonts.slice(1).map((f) => f.family);
	const requireEntries = fonts
		.map(
			({ family, file }) =>
				`\t\t{ family: "${family}", file: "${file}", url: require("./assets/fonts/${file}") },`,
		)
		.join("\n");
	const assetEntries = fonts
		.map(
			({ family, file }) =>
				`\t\t{ family: "${family}", file: "${file}", url: "asset:///fonts/${file}" },`,
		)
		.join("\n");

	return [
		fonts.length === 1
			? `// Font: "${defaultFamily}", from src/assets/fonts/${fonts[0].file}.`
			: `// Fonts: ${fonts.map((f) => `"${f.family}"`).join(", ")}, from src/assets/fonts/.`,
		"// Registered in a loop via lynx.addFont(). Split by build mode:",
		"//   • DEV  (Lynx Go / `npm run dev`): require() → data: URI inline",
		"//   • PROD (Android APK / `npm run build`): asset:///fonts/<file>",
		"//     resolved by AssetFontFaceLoader (lynx#9431 workaround).",
		...(extraFamilies.length > 0
			? [
					`// Only "${defaultFamily}" got the automatic text { font-family: ... }`,
					`// rule below — assign ${extraFamilies.map((f) => `"${f}"`).join(" / ")} to your own`,
					'// classes in src/style.css, e.g. `.code { font-family: "' + extraFamilies[0] + '"; }`.',
				]
			: []),
		"type FontEntry = { family: string; file: string; url: string };",
		"const FONTS: FontEntry[] = import.meta.env.DEV",
		"\t? [",
		requireEntries,
		"\t  ]",
		"\t: [",
		assetEntries,
		"\t  ];",
		"for (const { family, url } of FONTS) {",
		'\tlynx.addFont({ "font-family": family, src: `url("${url}")` }, () => {});',
		"}",
		"",
		"",
	].join("\n");
}

export function buildCssFontBlock(family) {
	return [`text {`, `  font-family: "${family}", sans-serif;`, `}`, "", ""].join("\n");
}

/** Match our generated font block at the top of background.ts (if any). */
const FONT_BLOCK_RE =
	/^(?:\/\/ Font[^\n]*\n)(?:\/\/[^\n]*\n)*type FontEntry = \{ family: string; file: string; url: string \};\nconst FONTS: FontEntry\[\] = import\.meta\.env\.DEV\n\t\? \[[\s\S]*?\t  \]\n\t: \[[\s\S]*?\t  \];\nfor \(const \{ family, url \} of FONTS\) \{\n\tlynx\.addFont\(\{ "font-family": family, src: `url\("\$\{url\}"\)` \}, \(\) => \{\}\);\n\}\n\n/;

const CSS_FONT_RE = /^text \{\n  font-family: "[^"]+", sans-serif;\n\}\n\n?/;

export function stripFontBlock(backgroundSource) {
	const normalized = normalizeSource(backgroundSource);
	const match = normalized.match(FONT_BLOCK_RE);
	if (!match) return { block: null, rest: normalized, fonts: [] };
	return {
		block: match[0],
		rest: normalized.slice(match[0].length),
		fonts: parseFontsFromBlock(match[0]),
	};
}

export function parseFontsFromBlock(block) {
	const fonts = [];
	const seen = new Set();
	for (const match of block.matchAll(/\{\s*family:\s*"([^"]+)",\s*file:\s*"([^"]+)"/g)) {
		const [, family, file] = match;
		if (seen.has(file)) continue;
		seen.add(file);
		fonts.push({ family, file });
	}
	return fonts;
}

export function stripCssFontBlock(cssSource) {
	const normalized = normalizeSource(cssSource);
	const match = normalized.match(CSS_FONT_RE);
	if (!match) return { block: null, rest: normalized, family: null };
	const familyMatch = match[0].match(/font-family: "([^"]+)"/);
	return {
		block: match[0],
		rest: normalized.slice(match[0].length),
		family: familyMatch ? familyMatch[1] : null,
	};
}

function loadBaseBackgrounds() {
	return [
		normalizeSource(fs.readFileSync(path.join(packageRoot, "templates/_shared/ts/src/background.ts"), "utf8")),
		normalizeSource(
			fs.readFileSync(path.join(packageRoot, "templates/basic-activity/ts/src/background.ts"), "utf8"),
		),
	];
}

function loadBaseStyles() {
	const out = [];
	for (const rel of [
		"templates/blank/common/src/style.css",
		"templates/hello-world/common/src/style.css",
		"templates/basic-activity/common/src/style.css",
	]) {
		out.push(normalizeSource(fs.readFileSync(path.join(packageRoot, rel), "utf8")));
	}
	return out;
}

export function isStockBackground(restSource) {
	const normalized = normalizeSource(restSource);
	return loadBaseBackgrounds().some((base) => base === normalized);
}

export function isStockCss(restSource) {
	const normalized = normalizeSource(restSource);
	return loadBaseStyles().some((base) => base === normalized);
}

/**
 * Copy font files into the JS project (and Android host assets when found).
 * Always safe — does not touch background.ts / style.css.
 */
export function copyFontFiles({ projectRoot, fonts, androidDir = null }) {
	const jsFontsDir = path.join(projectRoot, "src", "assets", "fonts");
	fs.mkdirSync(jsFontsDir, { recursive: true });
	const copied = [];

	for (const font of fonts) {
		const dest = path.join(jsFontsDir, font.file);
		fs.copyFileSync(font.sourcePath, dest);
		copied.push({ role: "js", path: dest });
	}

	if (androidDir != null) {
		const androidFontsDir = path.join(androidDir, "app", "src", "main", "assets", "fonts");
		fs.mkdirSync(androidFontsDir, { recursive: true });
		for (const font of fonts) {
			const dest = path.join(androidFontsDir, font.file);
			fs.copyFileSync(font.sourcePath, dest);
			copied.push({ role: "android", path: dest });
		}
	}

	return copied;
}

/**
 * Merge newly requested fonts with ones already registered in background.ts
 * (or already sitting in src/assets/fonts/). `dedupeFontFiles` mutates `.file`.
 */
export function mergeFontLists(existing, incoming, dedupeFontFiles) {
	const merged = [];
	const byFile = new Set();
	for (const font of existing) {
		if (byFile.has(font.file)) continue;
		byFile.add(font.file);
		merged.push({ ...font });
	}
	for (const font of incoming) {
		merged.push({
			sourcePath: font.sourcePath,
			file: font.file,
			family: font.family,
		});
	}
	dedupeFontFiles(merged);
	return merged;
}

/**
 * Try to rewrite background.ts. Returns { ok, reason?, manualBlock? }.
 */
export function applyBackgroundFonts(projectRoot, fonts) {
	const bgPath = path.join(projectRoot, "src", "background.ts");
	if (!fs.existsSync(bgPath)) {
		return {
			ok: false,
			reason: "src/background.ts not found",
			manualBlock: buildFontBlock(fonts),
		};
	}
	const raw = fs.readFileSync(bgPath, "utf8");
	const { rest } = stripFontBlock(raw);
	if (!isStockBackground(rest)) {
		return {
			ok: false,
			reason: "src/background.ts no longer matches the stock template",
			manualBlock: buildFontBlock(fonts),
		};
	}
	fs.writeFileSync(bgPath, `${buildFontBlock(fonts)}${rest}`);
	return { ok: true };
}

/**
 * Try to ensure the automatic text { font-family } rule for `defaultFamily`.
 * Extra fonts are never written into CSS (same policy as scaffold).
 * Returns { ok, skipped?, reason?, manualBlock? }.
 */
export function applyCssDefaultFont(projectRoot, defaultFamily, { hadExistingFonts }) {
	const cssPath = path.join(projectRoot, "src", "style.css");
	if (!fs.existsSync(cssPath)) {
		return {
			ok: false,
			reason: "src/style.css not found",
			manualBlock: buildCssFontBlock(defaultFamily),
		};
	}
	const raw = fs.readFileSync(cssPath, "utf8");
	const { rest, family: existingFamily } = stripCssFontBlock(raw);

	// Already has our rule and we were only appending more fonts — leave it.
	if (hadExistingFonts && existingFamily != null) {
		return { ok: true, skipped: true };
	}

	if (!isStockCss(rest)) {
		return {
			ok: false,
			reason: "src/style.css no longer matches the stock template",
			manualBlock: buildCssFontBlock(defaultFamily),
		};
	}

	fs.writeFileSync(cssPath, `${buildCssFontBlock(defaultFamily)}${rest}`);
	return { ok: true };
}

/** Resolve sibling Android host: scripts/android.mjs ANDROID_DIR, or <name>-android/. */
export function findAndroidDir(projectRoot) {
	const scriptPath = path.join(projectRoot, "scripts", "android.mjs");
	if (fs.existsSync(scriptPath)) {
		const src = fs.readFileSync(scriptPath, "utf8");
		const match = src.match(/path\.resolve\(projectRoot,\s*"([^"]+)"\)/);
		if (match) {
			const resolved = path.resolve(projectRoot, match[1]);
			if (fs.existsSync(path.join(resolved, "settings.gradle.kts"))) return resolved;
		}
	}
	const parent = path.dirname(projectRoot);
	const guess = path.join(parent, `${path.basename(projectRoot)}-android`);
	if (fs.existsSync(path.join(guess, "settings.gradle.kts"))) return guess;
	return null;
}

/** Walk up from cwd looking for a mithril-lynx app (lynx.config.ts + src/). */
export function findProjectRoot(startDir) {
	let dir = path.resolve(startDir);
	for (;;) {
		if (
			fs.existsSync(path.join(dir, "lynx.config.ts")) &&
			fs.existsSync(path.join(dir, "src", "background.ts"))
		) {
			return dir;
		}
		const parent = path.dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

export function listFontsOnDisk(projectRoot) {
	const fontsDir = path.join(projectRoot, "src", "assets", "fonts");
	if (!fs.existsSync(fontsDir)) return [];
	return fs
		.readdirSync(fontsDir)
		.filter((name) => FONT_EXT.test(name))
		.map((file) => ({
			file,
			family: file
				.replace(FONT_EXT, "")
				.split(/[_\-.]+/)
				.filter(Boolean)
				.map((word) => word[0].toUpperCase() + word.slice(1))
				.join(" "),
			sourcePath: path.join(fontsDir, file),
		}));
}

export { FONT_EXT };

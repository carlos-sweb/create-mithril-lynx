#!/usr/bin/env node
// create-mithril-lynx-v2
//
// Minimal scaffold CLI (F6 of mithril-lynx-v2's plan). Deliberately smaller
// than v1's create-mithril-lynx: one template (TypeScript, the "renderer
// mode" shape v2 always uses — there is no other mode to choose between,
// see the plan's §2 non-goals), no interactive prompts. Copies
// templates/ts/ to the target directory and fills in two placeholders:
// the app's own name, and where its "mithril-lynx-v2" dependency actually
// lives on disk (this whole toolchain is unpublished local dev tooling —
// see the note on `resolveMithrilLynxV2Dependency` below).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.join(__dirname, "..", "templates", "ts");

function printUsageAndExit(message) {
	if (message) console.error(`create-mithril-lynx-v2: ${message}\n`);
	console.error("Usage: create-mithril-lynx-v2 <directory>");
	console.error("  Scaffolds a new mithril-lynx-v2 app at <directory>.");
	process.exit(message ? 1 : 0);
}

function toPackageName(dirName) {
	const sanitized = dirName
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return sanitized || "mithril-lynx-v2-app";
}

function copyRecursive(from, to) {
	const stat = fs.statSync(from);
	if (stat.isDirectory()) {
		fs.mkdirSync(to, { recursive: true });
		for (const entry of fs.readdirSync(from)) {
			copyRecursive(path.join(from, entry), path.join(to, entry));
		}
	} else {
		fs.copyFileSync(from, to);
		// Preserve the template's executable bit (scripts/adb-log.sh).
		fs.chmodSync(to, stat.mode);
	}
}

function replaceInFile(filePath, replacements) {
	let content = fs.readFileSync(filePath, "utf8");
	for (const [placeholder, value] of replacements) {
		content = content.replaceAll(placeholder, value);
	}
	fs.writeFileSync(filePath, content);
}

/**
 * `mithril-lynx-v2` is not published to a registry — this whole toolchain
 * (mithril-lynx-v2, mithril-lynx-v2-app, create-mithril-lynx-v2) is local
 * dev tooling living as sibling directories. Resolve where mithril-lynx-v2
 * actually is (a sibling of THIS package) and compute a relative `file:`
 * dependency from the NEW app's directory to it, so the generated
 * package.json works regardless of where under the same parent the new
 * app gets created. If mithril-lynx-v2 isn't a sibling (this CLI got
 * copied somewhere else), fall back to a bare version range and let the
 * user point it at a real registry themselves.
 */
function resolveMithrilLynxV2Dependency(targetDir) {
	const candidate = path.join(__dirname, "..", "..", "mithril-lynx-v2");
	if (!fs.existsSync(path.join(candidate, "package.json"))) {
		return "*";
	}
	let relative = path.relative(targetDir, candidate);
	if (!relative.startsWith(".")) relative = `./${relative}`;
	return `file:${relative}`;
}

function main() {
	const arg = process.argv[2];
	if (!arg || arg === "-h" || arg === "--help") printUsageAndExit();

	const targetDir = path.resolve(process.cwd(), arg);
	if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
		printUsageAndExit(`"${arg}" already exists and is not empty.`);
	}

	const appName = toPackageName(path.basename(targetDir));
	const mithrilLynxV2Dep = resolveMithrilLynxV2Dependency(targetDir);

	copyRecursive(templateDir, targetDir);
	replaceInFile(path.join(targetDir, "package.json"), [
		["__APP_NAME__", appName],
		["__MITHRIL_LYNX_V2_DEP__", mithrilLynxV2Dep],
	]);
	replaceInFile(path.join(targetDir, "README.md"), [["__APP_NAME__", appName]]);

	console.log(`Created ${appName} at ${targetDir}`);
	if (mithrilLynxV2Dep === "*") {
		console.warn(
			"  Warning: could not find a sibling mithril-lynx-v2/ directory — " +
				'package.json\'s "mithril-lynx-v2" dependency was left as "*". ' +
				"Point it at your build of mithril-lynx-v2 before running npm install.",
		);
	}
	console.log("\nNext steps:");
	console.log(`  cd ${path.relative(process.cwd(), targetDir) || "."}`);
	console.log("  npm install");
	console.log("  npm run dev");
}

main();

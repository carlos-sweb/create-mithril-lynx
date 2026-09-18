#!/usr/bin/env node
// create-mithril-lynx
//
// Minimal scaffold CLI: one template (TypeScript, the only rendering mode
// mithril-lynx has — a real background-thread Mithril render, patches
// replayed onto the main thread), no interactive prompts. Copies
// templates/ts/ to the target directory and fills in the app's own name.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templateDir = path.join(__dirname, "..", "templates", "ts");

function printUsageAndExit(message) {
	if (message) console.error(`create-mithril-lynx: ${message}\n`);
	console.error("Usage: create-mithril-lynx <directory>");
	console.error("  Scaffolds a new mithril-lynx app at <directory>.");
	process.exit(message ? 1 : 0);
}

function toPackageName(dirName) {
	const sanitized = dirName
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return sanitized || "mithril-lynx-app";
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

function main() {
	const arg = process.argv[2];
	if (!arg || arg === "-h" || arg === "--help") printUsageAndExit();

	const targetDir = path.resolve(process.cwd(), arg);
	if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
		printUsageAndExit(`"${arg}" already exists and is not empty.`);
	}

	const appName = toPackageName(path.basename(targetDir));

	copyRecursive(templateDir, targetDir);
	replaceInFile(path.join(targetDir, "package.json"), [["__APP_NAME__", appName]]);
	replaceInFile(path.join(targetDir, "README.md"), [["__APP_NAME__", appName]]);

	console.log(`Created ${appName} at ${targetDir}`);
	console.log("\nNext steps:");
	console.log(`  cd ${path.relative(process.cwd(), targetDir) || "."}`);
	console.log("  npm install");
	console.log("  npm run dev");
}

main();

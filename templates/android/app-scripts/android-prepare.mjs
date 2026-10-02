#!/usr/bin/env node
/**
 * Copies the Android resources kept beside the JS source into the sibling
 * Gradle host. Edit <project>/android/*.xml, then run:
 *
 *   bun run android:prepare
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(projectRoot, "android");
const androidDir = path.resolve(projectRoot, "{{ANDROID_REL_DIR}}");

const files = [
	["AndroidManifest.xml", ["app", "src", "main", "AndroidManifest.xml"]],
	["strings.xml", ["app", "src", "main", "res", "values", "strings.xml"]],
	["styles.xml", ["app", "src", "main", "res", "values", "styles.xml"]],
	["config.xml", ["app", "src", "main", "res", "xml", "config.xml"]],
	["network_security_config.xml", ["app", "src", "main", "res", "xml", "network_security_config.xml"]],
	["file_paths.xml", ["app", "src", "main", "res", "xml", "file_paths.xml"]],
];

function fail(message) {
	console.error(`\n  ✖ ${message}\n`);
	process.exit(1);
}

if (!fs.existsSync(path.join(androidDir, "settings.gradle.kts"))) {
	fail(`Can't find the Android host at ${androidDir}.`);
}

for (const [name, destination] of files) {
	const source = path.join(sourceDir, name);
	if (!fs.existsSync(source)) {
		fail(`Missing ${path.relative(projectRoot, source)}. Restore it before preparing the Android host.`);
	}
	const target = path.join(androidDir, ...destination);
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.copyFileSync(source, target);
	console.log(`  → ${path.relative(projectRoot, target)}`);
}

const mapsConfig = path.join(sourceDir, "maps.json");
if (fs.existsSync(mapsConfig)) {
	const mapsTarget = path.join(androidDir, "app", "src", "main", "assets", "lynx_maps", "config.json");
	fs.mkdirSync(path.dirname(mapsTarget), { recursive: true });
	fs.copyFileSync(mapsConfig, mapsTarget);
	console.log(`  → ${path.relative(projectRoot, mapsTarget)}`);
}

console.log("\n  ✔ Android resources prepared.\n");

#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, execSync } from "node:child_process";

import { cancel, confirm, intro, isCancel, multiselect, outro, select, spinner, text } from "@clack/prompts";

import { fetchFontDetail, fetchFontList, listVariants, searchFonts } from "./fontsource.js";
import {
	applyBackgroundFonts,
	applyFontsCss,
	buildFontBlock,
	cssClassName,
	copyFontFiles,
	findAndroidDir,
	findProjectRoot,
	mergeFontLists,
	normalizeSource,
	stripFontBlock,
} from "./fonts-wire.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(scriptDir, "..");
const cwd = process.cwd();

// Resolve the newest compatible framework packages when a project is scaffolded.
const MITHRIL_LYNX_VERSION = "latest";
const MITHRIL_LYNX_UI_VERSION = "latest";
const MITHRIL_LYNX_UI_STYLES_IMPORT = '@import "mithril-lynx-ui/styles.css";';

const TEMPLATES = [
	{ value: "hello-world", label: "Hello World", hint: "recommended" },
	{ value: "blank", label: "Blank" },
	{ value: "basic-activity", label: "Basic Activity", hint: "multi-screen routing" },
];
const TEMPLATE_VALUES = TEMPLATES.map((t) => t.value);

const ANDROID_TEMPLATE_ROOT = path.join(packageRoot, "templates", "android");
const LYNX_ANDROID_PLUGINS_VERSION = "0.2.0";
const LYNX_ANDROID_JS_VERSION = "latest";
const LYNX_ANDROID_JS_LEGACY_VERSIONS = new Set(["^0.2.0"]);

const ANDROID_PLUGINS = [
	{
		id: "battery",
		label: "Battery",
		hint: "level and charging state · no permission",
		artifact: "lynx-android-battery",
		kotlinImport: "dev.lynx.android.plugins.battery.LynxBatteryPlugin",
		registry: "LynxBatteryPlugin",
	},
	{
		id: "camera",
		label: "Camera",
		hint: "external photo capture · FileProvider",
		artifact: "lynx-android-camera",
		kotlinImport: "dev.lynx.android.plugins.camera.LynxCameraPlugin",
		registry: "LynxCameraPlugin",
		activityResult: true,
	},
	{
		id: "device",
		label: "Device",
		hint: "non-identifying device information · no permission",
		artifact: "lynx-android-device",
		kotlinImport: "dev.lynx.android.plugins.device.LynxDevicePlugin",
		registry: "LynxDevicePlugin",
	},
	{
		id: "geolocation",
		label: "Geolocation",
		hint: "one-shot foreground location · runtime permission",
		artifact: "lynx-android-geolocation",
		kotlinImport: "dev.lynx.android.plugins.geolocation.LynxGeolocationPlugin",
		registry: "LynxGeolocationPlugin",
		permissionResult: true,
	},
	{
		id: "network",
		label: "Network",
		hint: "network snapshot · no permission",
		artifact: "lynx-android-network",
		kotlinImport: "dev.lynx.android.plugins.network.LynxNetworkPlugin",
		registry: "LynxNetworkPlugin",
	},
	{
		id: "vibration",
		label: "Vibration",
		hint: "bounded vibration · VIBRATE permission",
		artifact: "lynx-android-vibration",
		kotlinImport: "dev.lynx.android.plugins.vibration.LynxVibrationPlugin",
		registry: "LynxVibrationPlugin",
	},
	{
		id: "maps",
		label: "Maps",
		hint: "native maps · offline packages · optional foreground location",
		artifact: "lynx-android-maps",
		kotlinImport: "dev.lynx.android.plugins.maps.LynxMapsPlugin",
		registry: "LynxMapsPlugin",
		permissionResult: true,
	},
];
const ANDROID_PLUGIN_BY_ID = new Map(ANDROID_PLUGINS.map((plugin) => [plugin.id, plugin]));
const CONNECTOR_CONFIG_RELATIVE_PATH = path.join("android", "connectors.json");
const CONNECTOR_DEPENDENCY_START = "    // <create-mithril-lynx:android-connectors>";
const CONNECTOR_DEPENDENCY_END = "    // </create-mithril-lynx:android-connectors>";
const MAIN_ACTIVITY_CONNECTOR_MARKERS = {
	imports: {
		start: "// <create-mithril-lynx:connector-imports>",
		end: "// </create-mithril-lynx:connector-imports>",
	},
	registration: {
		start: "        // <create-mithril-lynx:connector-registration>",
		end: "        // </create-mithril-lynx:connector-registration>",
	},
	callbacks: {
		start: "    // <create-mithril-lynx:connector-callbacks>",
		end: "    // </create-mithril-lynx:connector-callbacks>",
	},
};

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

/** Android files users edit from the JS project, before syncing them into the
 * sibling Gradle host with `bun run android:prepare`. */
const ANDROID_DEVELOPMENT_FILES = [
	["AndroidManifest.xml", ["AndroidManifest.xml"]],
	["strings.xml", ["res", "values", "strings.xml"]],
	["styles.xml", ["res", "values", "styles.xml"]],
	["config.xml", ["res", "xml", "config.xml"]],
	["network_security_config.xml", ["res", "xml", "network_security_config.xml"]],
	["file_paths.xml", ["res", "xml", "file_paths.xml"]],
];

function seedAndroidDevelopmentFiles(targetDir, androidDir) {
	const sourceRoot = path.join(androidDir, "app", "src", "main");
	const destinationRoot = path.join(targetDir, "android");
	fs.mkdirSync(destinationRoot, { recursive: true });
	for (const [name, sourceParts] of ANDROID_DEVELOPMENT_FILES) {
		fs.copyFileSync(path.join(sourceRoot, ...sourceParts), path.join(destinationRoot, name));
	}
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

function normalizeAndroidPlugins(ids) {
	const selected = [...new Set(ids)];
	const unknown = selected.filter((id) => id !== "all" && !ANDROID_PLUGIN_BY_ID.has(id));
	if (unknown.length > 0) {
		cancel(`Unknown Android plugin${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}. ` +
			`Choose from ${ANDROID_PLUGINS.map((plugin) => plugin.id).join(", ")}, or all.`);
		process.exit(1);
	}
	if (selected.includes("all") && selected.length > 1) {
		cancel('"all" cannot be combined with individual Android plugins.');
		process.exit(1);
	}
	return selected;
}

function connectorNpmPackages(pluginIds) {
	return pluginIds.length === 0 ? [] : ["lynx-android-plugins"];
}

function mapsConfigurationUpdate(projectRoot, pluginIds) {
	if (!pluginIds.includes("maps") && !pluginIds.includes("all")) return [];
	const configPath = path.join(projectRoot, "android", "maps.json");
	if (fs.existsSync(configPath)) return [];
	return [{ path: configPath, previous: null, next: `${JSON.stringify({ url: "", sha256: "", version: "" }, null, 2)}\n` }];
}

function updatedConnectorPackageJson(projectRoot, currentIds, nextIds) {
	const packagePath = path.join(projectRoot, "package.json");
	const originalSource = fs.readFileSync(packagePath, "utf8");
	const pkg = JSON.parse(originalSource);
	if (pkg.dependencies == null || typeof pkg.dependencies !== "object" || Array.isArray(pkg.dependencies)) {
		throw new Error("package.json dependencies cannot be managed. No files were changed.");
	}
	const current = new Set(connectorNpmPackages(currentIds));
	const next = new Set(connectorNpmPackages(nextIds));
	let changed = false;
	for (const name of new Set([...current, ...next])) {
		if (name in (pkg.devDependencies ?? {})) {
			throw new Error(`${name} is in devDependencies. Move it to dependencies before managing connectors.`);
		}
		const version = pkg.dependencies[name];
		const isManagedVersion = version === LYNX_ANDROID_JS_VERSION || LYNX_ANDROID_JS_LEGACY_VERSIONS.has(version);
		if (version != null && !isManagedVersion) {
			throw new Error(`${name} has a custom version. No files were changed.`);
		}
		if (next.has(name) && version !== LYNX_ANDROID_JS_VERSION) {
			pkg.dependencies[name] = LYNX_ANDROID_JS_VERSION;
			changed = true;
		} else if (!next.has(name) && isManagedVersion) {
			delete pkg.dependencies[name];
			changed = true;
		}
	}
	return { packagePath, source: changed ? `${JSON.stringify(pkg, null, 2)}\n` : originalSource };
}

function projectPackageManager(projectRoot) {
	for (const [lock, manager] of [
		["bun.lock", "bun"], ["bun.lockb", "bun"], ["pnpm-lock.yaml", "pnpm"],
		["yarn.lock", "yarn"], ["package-lock.json", "npm"],
	]) {
		if (fs.existsSync(path.join(projectRoot, lock))) return manager;
	}
	return detectPackageManager();
}

function androidPluginHostConfiguration(pluginIds) {
	const useAggregate = pluginIds.includes("all");
	const plugins = useAggregate ? ANDROID_PLUGINS : pluginIds.map((id) => ANDROID_PLUGIN_BY_ID.get(id));
	const gradleDependencies = useAggregate
		? `    implementation("io.github.carlos-sweb:lynx-android-plugins:${LYNX_ANDROID_PLUGINS_VERSION}")`
		: plugins.map((plugin) =>
			`    implementation("io.github.carlos-sweb:${plugin.artifact}:${LYNX_ANDROID_PLUGINS_VERSION}")`,
		).join("\n");
	const imports = useAggregate
		? ["import dev.lynx.android.plugins.LynxAndroidPlugins"]
		: plugins.map((plugin) => `import ${plugin.kotlinImport}`);
	const registrations = useAggregate
		? "        LynxAndroidPlugins.register(builder)"
		: plugins.map((plugin) => `        ${plugin.registry}.register(builder)`).join("\n");
	const handlesPermission = useAggregate || plugins.some((plugin) => plugin.permissionResult);
	const handlesActivity = useAggregate || plugins.some((plugin) => plugin.activityResult);
	const permissionHandler = useAggregate
		? "LynxAndroidPlugins.onRequestPermissionsResult(requestCode, permissions, grantResults)"
		: plugins.filter((plugin) => plugin.permissionResult).map((plugin) =>
			`${plugin.registry}.onRequestPermissionsResult(requestCode, permissions, grantResults)`,
		).join(" || ");
	const activityRegistry = useAggregate ? "LynxAndroidPlugins" : "LynxCameraPlugin";

	return {
		pluginIds,
		handlesPermission,
		handlesActivity,
		gradleDependencies: gradleDependencies || "    // No Lynx Android connector selected.",
		imports: imports.join("\n"),
		registrations: registrations || "        // No Lynx Android connector selected.",
		permissionHandler: handlesPermission
			? permissionHandler
			: "false",
		activityHandler: handlesActivity
			? `${activityRegistry}.onActivityResult(requestCode, resultCode, data)`
			: "false",
	};
}

function buildAndroidConnectorRegistry(packageName, pluginIds) {
	if (pluginIds.length === 0) return null;
	const configuration = androidPluginHostConfiguration(pluginIds);
	return [
		"// GENERATED by create-mithril-lynx. Manage with add-android-plugin/remove-android-plugin.",
		`package ${packageName}`,
		"",
		...(configuration.handlesActivity ? ["import android.content.Intent"] : []),
		"import com.lynx.tasm.LynxViewBuilder",
		configuration.imports,
		"",
		"object LynxAndroidConnectorRegistry {",
		"    fun register(builder: LynxViewBuilder) {",
		configuration.registrations,
		"    }",
		...(configuration.handlesPermission ? [
			"",
			"    fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray): Boolean =",
			`        ${configuration.permissionHandler}`,
		] : []),
		...(configuration.handlesActivity ? [
			"",
			"    fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean =",
			`        ${configuration.activityHandler}`,
		] : []),
		"}",
		"",
	].join("\n");
}

// The previous generated format is accepted only for a one-time, exact migration.
function buildLegacyAndroidConnectorRegistry(packageName, pluginIds) {
	const configuration = androidPluginHostConfiguration(pluginIds);
	return [
		"// GENERATED by create-mithril-lynx. Manage with add-android-plugin/remove-android-plugin.",
		`package ${packageName}`,
		"",
		"import android.content.Intent",
		"import com.lynx.tasm.LynxViewBuilder",
		configuration.imports,
		"",
		"object LynxAndroidConnectorRegistry {",
		"    fun register(builder: LynxViewBuilder) {",
		configuration.registrations,
		"    }",
		"",
		"    fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray): Boolean =",
		`        ${configuration.permissionHandler}`,
		"",
		"    fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean =",
		`        ${configuration.activityHandler}`,
		"}",
		"",
	].filter((line, index, lines) => line !== "" || lines[index - 1] !== "").join("\n");
}

function mainActivityConnectorSections(pluginIds) {
	const configuration = androidPluginHostConfiguration(pluginIds);
	const callbacks = [];
	if (configuration.handlesPermission) {
		callbacks.push([
			"    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {",
			"        if (LynxAndroidConnectorRegistry.onRequestPermissionsResult(requestCode, permissions, grantResults)) return",
			"        super.onRequestPermissionsResult(requestCode, permissions, grantResults)",
			"    }",
		].join("\n"));
	}
	if (configuration.handlesActivity) {
		callbacks.push([
			'    @Deprecated("Needed for the external camera intent result")',
			"    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {",
			"        if (LynxAndroidConnectorRegistry.onActivityResult(requestCode, resultCode, data)) return",
			"        super.onActivityResult(requestCode, resultCode, data)",
			"    }",
		].join("\n"));
	}
	return {
		imports: configuration.handlesActivity ? "import android.content.Intent\n" : "",
		registration: pluginIds.length > 0 ? "        LynxAndroidConnectorRegistry.register(builder)\n" : "",
		callbacks: callbacks.length > 0 ? `${callbacks.join("\n\n")}\n` : "",
	};
}

function managedMainActivityBlock(source, name) {
	const { start, end } = MAIN_ACTIVITY_CONNECTOR_MARKERS[name];
	const startIndex = source.indexOf(start);
	const endIndex = source.indexOf(end);
	if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex ||
		source.indexOf(start, startIndex + start.length) !== -1 || source.indexOf(end, endIndex + end.length) !== -1) {
		throw new Error(`MainActivity.kt has missing or duplicate connector ${name} markers. No files were changed.`);
	}
	const startLineBegin = source.lastIndexOf("\n", startIndex - 1) + 1;
	const startLineEnd = source.indexOf("\n", startIndex);
	const endLineBegin = source.lastIndexOf("\n", endIndex - 1) + 1;
	const endLineEnd = source.indexOf("\n", endIndex);
	if (startLineEnd === -1 || endLineEnd === -1 || endLineBegin <= startLineEnd ||
		source.slice(startLineBegin, startLineEnd) !== start || source.slice(endLineBegin, endLineEnd) !== end) {
		throw new Error(`MainActivity.kt has modified connector ${name} markers. No files were changed.`);
	}
	return { from: startLineEnd + 1, to: endLineBegin, body: source.slice(startLineEnd + 1, endLineBegin) };
}

function replaceManagedMainActivitySections(source, sections) {
	let result = source;
	for (const name of Object.keys(MAIN_ACTIVITY_CONNECTOR_MARKERS)) {
		const block = managedMainActivityBlock(result, name);
		result = `${result.slice(0, block.from)}${sections[name]}${result.slice(block.to)}`;
	}
	return result;
}

function replaceLegacyMainActivityFragment(source, fragment, replacement) {
	if (source.split(fragment).length !== 2) {
		throw new Error("MainActivity.kt has customized legacy connector code. No files were changed.");
	}
	return source.replace(fragment, replacement);
}

function markLegacyMainActivity(source) {
	let result = source.replace(/\r\n/g, "\n");
	const old = mainActivityConnectorSections(["all"]);
	for (const name of Object.keys(MAIN_ACTIVITY_CONNECTOR_MARKERS)) {
		const { start, end } = MAIN_ACTIVITY_CONNECTOR_MARKERS[name];
		result = replaceLegacyMainActivityFragment(result, old[name], `${start}\n${old[name]}${end}\n`);
	}
	return result;
}

function prepareMainActivity(source, currentPluginIds) {
	const hasMarkers = Object.values(MAIN_ACTIVITY_CONNECTOR_MARKERS)
		.some(({ start, end }) => source.includes(start) || source.includes(end));
	if (!hasMarkers) {
		if (currentPluginIds == null) {
			throw new Error("MainActivity.kt is missing managed connector markers. No files were changed.");
		}
		return { source: markLegacyMainActivity(source), legacy: true };
	}
	const expected = mainActivityConnectorSections(currentPluginIds ?? []);
	for (const name of Object.keys(MAIN_ACTIVITY_CONNECTOR_MARKERS)) {
		if (normalizeSource(managedMainActivityBlock(source, name).body) !== normalizeSource(expected[name])) {
			throw new Error(`MainActivity.kt connector ${name} block was customized. No files were changed.`);
		}
	}
	return { source, legacy: false };
}

function mainActivityOutsideConnectorBlocks(source) {
	return replaceManagedMainActivitySections(source, { imports: "", registration: "", callbacks: "" });
}

function connectorConfigPath(projectRoot) {
	return path.join(projectRoot, CONNECTOR_CONFIG_RELATIVE_PATH);
}

function connectorRegistryPath(androidDir, androidId) {
	return path.join(androidDir, "app", "src", "main", "java", ...androidId.split("."), "LynxAndroidConnectorRegistry.kt");
}

function connectorDependencyBlock(pluginIds) {
	return [
		CONNECTOR_DEPENDENCY_START,
		androidPluginHostConfiguration(pluginIds).gradleDependencies,
		CONNECTOR_DEPENDENCY_END,
	].join("\n");
}

function atomicWrite(filePath, contents) {
	const temporaryPath = `${filePath}.tmp-${process.pid}`;
	fs.writeFileSync(temporaryPath, contents);
	fs.renameSync(temporaryPath, filePath);
}

function connectorStateUpdates({ projectRoot, androidDir, androidId, pluginIds }) {
	const configPath = connectorConfigPath(projectRoot);
	const registryPath = connectorRegistryPath(androidDir, androidId);
	const mainActivityPath = path.join(path.dirname(registryPath), "MainActivity.kt");
	const gradlePath = path.join(androidDir, "app", "build.gradle.kts");
	const gradleSource = fs.readFileSync(gradlePath, "utf8");
	const start = gradleSource.indexOf(CONNECTOR_DEPENDENCY_START);
	const end = gradleSource.indexOf(CONNECTOR_DEPENDENCY_END);
	if (start === -1 || end === -1 || end < start || gradleSource.indexOf(CONNECTOR_DEPENDENCY_START, start + 1) !== -1) {
		throw new Error("The Android connector dependency block is missing or was modified. No files were changed.");
	}
	const currentRegistry = fs.existsSync(registryPath) ? fs.readFileSync(registryPath, "utf8") : null;
	const currentConfig = fs.existsSync(configPath) ? readConnectorConfig(configPath) : null;
	const currentConfigSource = currentConfig == null ? null : fs.readFileSync(configPath, "utf8");
	const mainActivitySource = fs.readFileSync(mainActivityPath, "utf8");
	const mainActivityEol = mainActivitySource.includes("\r\n") ? "\r\n" : "\n";
	const preparedMainActivity = prepareMainActivity(mainActivitySource.replace(/\r\n/g, "\n"), currentConfig?.plugins ?? null);
	const currentDependencyBlock = gradleSource.slice(start, end + CONNECTOR_DEPENDENCY_END.length);
	if (currentConfig != null && normalizeSource(currentDependencyBlock) !== normalizeSource(connectorDependencyBlock(currentConfig.plugins))) {
		throw new Error("The Android connector dependency block was modified outside the generator. No files were changed.");
	}
	const expectedRegistry = currentConfig == null ? null : preparedMainActivity.legacy
		? buildLegacyAndroidConnectorRegistry(androidId, currentConfig.plugins)
		: buildAndroidConnectorRegistry(androidId, currentConfig.plugins);
	if ((currentRegistry == null) !== (expectedRegistry == null) ||
		(currentRegistry != null && normalizeSource(currentRegistry) !== normalizeSource(expectedRegistry))) {
		throw new Error("LynxAndroidConnectorRegistry.kt was modified outside the generator. No files were changed.");
	}

	const nextConfiguration = androidPluginHostConfiguration(pluginIds);
	const outsideMainActivity = mainActivityOutsideConnectorBlocks(preparedMainActivity.source);
	const externalIntentImport = /^import android\.content\.Intent\s*$/m.test(outsideMainActivity);
	const outsideWithoutIntentImport = outsideMainActivity.replace(/^import android\.content\.Intent\s*$/gm, "");
	if (nextConfiguration.handlesActivity && externalIntentImport) {
		throw new Error("MainActivity.kt already imports Intent outside the managed connector block. No files were changed.");
	}
	if (!nextConfiguration.handlesActivity &&
		managedMainActivityBlock(preparedMainActivity.source, "imports").body.includes("import android.content.Intent") &&
		/\bIntent\b/.test(outsideWithoutIntentImport) && !externalIntentImport) {
		throw new Error("MainActivity.kt uses the managed Intent import outside connector callbacks. No files were changed.");
	}
	const nextRegistry = buildAndroidConnectorRegistry(androidId, pluginIds);
	if (nextRegistry == null) {
		if (/\bLynxAndroidConnectorRegistry\b/.test(outsideMainActivity)) {
			throw new Error("MainActivity.kt references the connector registry outside the managed block. No files were changed.");
		}
		const javaRoot = path.join(androidDir, "app", "src", "main", "java");
		for (const file of walkFiles(javaRoot)) {
			if (file === registryPath || file === mainActivityPath || !/\.(kt|java)$/.test(file)) continue;
			if (fs.readFileSync(file, "utf8").includes("LynxAndroidConnectorRegistry")) {
				throw new Error(`${path.basename(file)} references the connector registry. No files were changed.`);
			}
		}
	}
	const nextMainActivity = replaceManagedMainActivitySections(
		preparedMainActivity.source,
		mainActivityConnectorSections(pluginIds),
	).replace(/\n/g, mainActivityEol);
	const updatedGradle = `${gradleSource.slice(0, start)}${connectorDependencyBlock(pluginIds)}${gradleSource.slice(end + CONNECTOR_DEPENDENCY_END.length)}`;
	return [
		{ path: gradlePath, previous: gradleSource, next: updatedGradle },
		{ path: mainActivityPath, previous: mainActivitySource, next: nextMainActivity },
		{ path: registryPath, previous: currentRegistry, next: nextRegistry },
		{ path: configPath, previous: currentConfigSource, next: `${JSON.stringify({ version: 1, plugins: pluginIds }, null, 2)}\n` },
	];
}

function applyManagedUpdates(updates) {
	const changed = updates.filter(({ previous, next }) => previous !== next);
	for (const update of changed) {
		const present = fs.existsSync(update.path);
		if ((update.previous == null) !== !present ||
			(present && fs.readFileSync(update.path, "utf8") !== update.previous)) {
			throw new Error(`${path.basename(update.path)} changed during connector preparation. No files were changed.`);
		}
	}
	const applied = [];
	try {
		for (const update of changed) {
			if (update.next == null) {
				fs.unlinkSync(update.path);
			} else {
				fs.mkdirSync(path.dirname(update.path), { recursive: true });
				atomicWrite(update.path, update.next);
			}
			applied.push(update);
		}
	} catch (error) {
		const rollbackErrors = [];
		for (const update of applied.reverse()) {
			try {
				if (update.previous == null) fs.unlinkSync(update.path);
				else atomicWrite(update.path, update.previous);
			} catch (rollbackError) {
				rollbackErrors.push(`${path.basename(update.path)}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
			}
		}
		if (rollbackErrors.length > 0) {
			throw new Error(`${error instanceof Error ? error.message : String(error)}. Rollback failed for ${rollbackErrors.join(", ")}.`);
		}
		throw error;
	}
}

function readConnectorConfig(configPath) {
	let config;
	try {
		config = JSON.parse(fs.readFileSync(configPath, "utf8"));
	} catch {
		throw new Error("android/connectors.json is not valid JSON. No files were changed.");
	}
	if (config?.version !== 1 || !Array.isArray(config.plugins) || config.plugins.some((id) => typeof id !== "string")) {
		throw new Error("android/connectors.json has an unsupported shape. No files were changed.");
	}
	return { plugins: normalizeAndroidPlugins(config.plugins) };
}

function requireManagedConnectorProject() {
	const projectRoot = findProjectRoot(cwd);
	if (projectRoot == null) throw new Error("No mithril-lynx project found here.");
	const androidDir = findAndroidDir(projectRoot);
	if (androidDir == null) throw new Error("No sibling Android host found for this project.");
	const configPath = connectorConfigPath(projectRoot);
	if (!fs.existsSync(configPath)) {
		throw new Error(
			"This Android host predates managed connectors or was customized. " +
				"It is intentionally not patched automatically.",
		);
	}
	const namespaceMatch = fs.readFileSync(path.join(androidDir, "app", "build.gradle.kts"), "utf8").match(/namespace\s*=\s*"([^"]+)"/);
	if (namespaceMatch == null) throw new Error("Could not determine the Android namespace. No files were changed.");
	return { projectRoot, androidDir, androidId: namespaceMatch[1], config: readConnectorConfig(configPath) };
}

async function runAndroidPluginCommand(command, args) {
	intro(`create-mithril-lynx ${command}`);
	let managed;
	try {
		managed = requireManagedConnectorProject();
	} catch (error) {
		cancel(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}

	if (command === "list-android-plugins") {
		outro(
			managed.config.plugins.length === 0
				? "No Android connectors are enabled."
				: `Enabled Android connectors: ${managed.config.plugins.join(", ")}`,
		);
		return;
	}

	const rawPlugins = args[0];
	if (rawPlugins == null) {
		cancel(`Pass a comma-separated connector list, e.g. ${command} battery,geolocation.`);
		process.exit(1);
	}
	const requested = normalizeAndroidPlugins(splitList(rawPlugins));
	const skipInstall = args.includes("--no-install");
	let next;
	if (command === "add-android-plugin") {
		next = managed.config.plugins.includes("all") || requested.includes("all")
			? ["all"]
			: normalizeAndroidPlugins([...managed.config.plugins, ...requested]);
	} else {
		if (managed.config.plugins.includes("all") && !requested.includes("all")) {
			cancel('The aggregate "all" connector must be removed as a whole.');
			process.exit(1);
		}
		next = managed.config.plugins.filter((plugin) => !requested.includes(plugin));
	}

	let dependenciesChanged = false;
	try {
		const npm = updatedConnectorPackageJson(managed.projectRoot, managed.config.plugins, next);
		const previousPackageSource = fs.readFileSync(npm.packagePath, "utf8");
		dependenciesChanged = npm.source !== previousPackageSource;
		applyManagedUpdates([
			...connectorStateUpdates({ ...managed, pluginIds: next }),
			...mapsConfigurationUpdate(managed.projectRoot, next),
			{ path: npm.packagePath, previous: previousPackageSource, next: npm.source },
		]);
		if (dependenciesChanged) {
			if (!skipInstall) {
				const manager = projectPackageManager(managed.projectRoot);
				try {
					execFileSync(manager, ["install"], { cwd: managed.projectRoot, stdio: "inherit" });
				} catch {
					throw new Error(`Connector configuration was updated, but ${manager} install failed. Run it in the project to finish installation.`);
				}
			}
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		cancel(message);
		process.exitCode = 1;
		return;
	}
	outro((next.length === 0 ? "No Android connectors are enabled." : `Enabled Android connectors: ${next.join(", ")}.`) +
		(skipInstall && dependenciesChanged ? `\nRun ${projectPackageManager(managed.projectRoot)} install to update dependencies.` : ""));
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
		plugins: readOption(args, "android-plugins"),
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
	"--android-plugins",
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

/** "Bold", "Light Italic" — the part appended to the family name. */
function variantName(variant) {
	const weightName = WEIGHT_NAMES[variant.weight] ?? String(variant.weight);
	return `${weightName}${variant.style === "italic" ? " Italic" : ""}`;
}

function variantLabel(variant) {
	const weightName = WEIGHT_NAMES[variant.weight] ?? String(variant.weight);
	const style = variant.style === "italic" ? " Italic" : "";
	return `${weightName}${style} (${variant.weight} ${variant.style})`;
}

/**
 * Interactive search-download flow for `--find-font <term>`: queries
 * Fontsource's catalog locally (see src/fontsource.js — the API itself has
 * no free-text search), lets the user pick a family and one or more weights/styles,
 * downloads each .ttf to a temp file, and returns them in the same shape
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
	const defaultVariant = pickFrom.find((v) => v.weight === 400 && v.style === "normal") ?? pickFrom[0];
	const chosenVariants = await multiselect({
		message: "Which weights/styles? (space to toggle, enter to confirm)",
		initialValues: [defaultVariant],
		required: true,
		options: pickFrom.map((v) => ({ value: v, label: variantLabel(v) })),
	});
	if (isCancel(chosenVariants)) return null;
	// Regular first (it becomes the family's plain name), then by weight/style.
	chosenVariants.sort(
		(a, b) =>
			(b === defaultVariant) - (a === defaultVariant) || a.weight - b.weight || a.style.localeCompare(b.style),
	);

	const results = [];
	for (const [index, variant] of chosenVariants.entries()) {
		const s3 = spinner();
		s3.start(`Downloading ${detail.family} ${variantLabel(variant)}…`);
		let bytes;
		try {
			const response = await fetch(variant.url);
			if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
			bytes = Buffer.from(await response.arrayBuffer());
		} catch (error) {
			s3.stop("Download failed.");
			cancel(error instanceof Error ? error.message : String(error));
			process.exit(1);
		}
		const tempFile = path.join(
			os.tmpdir(),
			`${chosenId}-${variant.weight}-${variant.style}-${variant.subset}.ttf`,
		);
		fs.writeFileSync(tempFile, bytes);
		s3.stop(`Downloaded ${(bytes.length / 1024).toFixed(1)} kB.`);
		// Each file is registered under its own family name (addFont has no
		// weight/style axis here): "Ubuntu Regular", "Ubuntu Bold Italic"…
		results.push({ sourcePath: tempFile, base: detail.family, family: `${detail.family} ${variantName(variant)}` });
	}
	return results;
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

	let plugins = android.plugins == null ? [] : normalizeAndroidPlugins(splitList(android.plugins));
	if (android.plugins == null && canPrompt) {
		plugins = await multiselect({
			message: "Which Lynx Android connectors should the host include?",
			initialValues: [],
			options: [
				...ANDROID_PLUGINS.map((plugin) => ({ value: plugin.id, label: plugin.label, hint: plugin.hint })),
				{ value: "all", label: "All connectors", hint: "convenience aggregate; includes every manifest contribution" },
			],
		});
		if (isCancel(plugins)) return null;
		plugins = normalizeAndroidPlugins(plugins);
	}

	const fonts = await resolveFontsFromFlags(android, { baseDir: cwd, requireFonts: false });
	if (fonts == null) return null;

	return { androidId, appName, fonts, plugins };
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
			"--font-family only makes sense with exactly one font — omit it when bundling more than one, or use the classes in src/fonts.css.",
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
		for (const variant of found) {
			fonts.push({
				sourcePath: variant.sourcePath,
				file: path.basename(variant.sourcePath),
				// --font-family replaces the family part; the variant suffix stays
				// unless there is only one variant.
				family:
					android.fontFamily == null
						? variant.family
						: found.length === 1
							? android.fontFamily
							: variant.family.replace(variant.base, android.fontFamily),
			});
		}
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

	const cssResult = applyFontsCss(projectRoot, merged);
	console.log("  ✔ Regenerated src/fonts.css (generated — don't edit it by hand)");
	if (cssResult.ok && !cssResult.skipped) {
		console.log('  ✔ Added @import "fonts.css"; to src/style.css');
	} else if (!cssResult.ok) {
		console.log(`  ✖ Could not add the import to src/style.css (${cssResult.reason}).`);
		console.log("    Add this line at the very top of your stylesheet:");
		printManualBlock("src/style.css", cssResult.manualBlock);
	}

	if (merged.length > 1) {
		console.log(
			`  · Use the classes in src/fonts.css: ${merged.map((f) => "." + cssClassName(f.family)).join(", ")}`,
		);
	}

	outro(
		`Done. Font${merged.length > 1 ? "s" : ""} ${merged.map((f) => `"${f.family}"`).join(", ")} ` +
			(bgResult.ok ? "registered." : "copied — finish registration with the lines above."),
	);
}

function scaffoldAndroid({ targetDir, rawName, options }) {
	const { androidId, appName, fonts, plugins } = options;

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

	const pluginHost = androidPluginHostConfiguration(plugins);

	// 3. Text substitutions across the whole Android host (skipping the
	//    gradle-wrapper.jar, the .ttf and any other binary).
	replaceInTree(androidDir, [
		["{{PACKAGE_NAME}}", androidId],
		["{{APP_CLASS}}", appClass],
		["{{APP_NAME}}", xmlEscape(appName)],
		["{{ANDROID_DIR}}", androidDirName],
		["{{ANDROID_PLUGIN_DEPENDENCIES}}", pluginHost.gradleDependencies],
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

	// 5. Give app developers editable Android XML in their project, instead of
	// making them traverse into the sibling Gradle host. android:prepare copies
	// these exact files back into their Android resource locations.
	seedAndroidDevelopmentFiles(targetDir, androidDir);

	// 6. The managed MainActivity sections, registry, and Gradle dependency block
	// are rendered together so post-install connector changes stay consistent.
	applyManagedUpdates([
		...connectorStateUpdates({ projectRoot: targetDir, androidDir, androidId, pluginIds: plugins }),
		...mapsConfigurationUpdate(targetDir, plugins),
	]);

	// 7. The scripts that join the two halves, inside the JS project.
	const scriptsDir = path.join(targetDir, "scripts");
	fs.mkdirSync(scriptsDir, { recursive: true });
	fs.copyFileSync(path.join(ANDROID_TEMPLATE_ROOT, "app-scripts", "android.mjs"), path.join(scriptsDir, "android.mjs"));
	fs.copyFileSync(path.join(ANDROID_TEMPLATE_ROOT, "app-scripts", "android-prepare.mjs"), path.join(scriptsDir, "android-prepare.mjs"));

	const androidRelDir = path.relative(targetDir, androidDir).split(path.sep).join("/");
	replaceInFile(path.join(scriptsDir, "android.mjs"), [
		["{{ANDROID_REL_DIR}}", androidRelDir],
		["{{ANDROID_DIR}}", androidDirName],
		["{{PACKAGE_NAME}}", androidId],
		// A name with quotes would break keytool's -dname=CN=...
		["{{APP_NAME}}", appName.replace(/["\\]/g, "")],
	]);
	replaceInFile(path.join(scriptsDir, "android-prepare.mjs"), [["{{ANDROID_REL_DIR}}", androidRelDir]]);

	return { androidDir, androidDirName, androidRelDir, androidId, appName, appClass, fonts, plugins: pluginHost.pluginIds, sdkDir };
}

function patchJsProject({ targetDir, android }) {
	// package.json: the Android scripts.
	const pkgPath = path.join(targetDir, "package.json");
	const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
	for (const name of connectorNpmPackages(android.plugins)) pkg.dependencies[name] = LYNX_ANDROID_JS_VERSION;
	const buildCommand = pkg.scripts.build;
	pkg.scripts = {
		...pkg.scripts,
		// Keep project-owned Android XML authoritative for every build path:
		// `bun run build`, `npm run build`, and android.mjs's package-manager
		// invocation all execute this command before rspeedy starts.
		build: "node scripts/android-prepare.mjs && " + buildCommand,
		android: "node scripts/android.mjs",
		"android:apk": "node scripts/android.mjs --apk",
		"android:release": "node scripts/android.mjs --release",
		"android:sync": "node scripts/android.mjs --sync-only",
		"android:prepare": "node scripts/android-prepare.mjs",
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

		applyFontsCss(targetDir, android.fonts);
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
			"bun run android:prepare  # android/*.xml -> sibling Android host",
			"",
			"# Signed release APK (generate the keystore once):",
			"KEYSTORE_PASSWORD='...' npm run android:keystore",
			"npm run android:release",
			"```",
			"",
			`- Application ID: \`${android.androidId}\``,
			`- Application class: \`${android.appClass}\` · Activity: \`MainActivity\``,
			"- Android XML: edit `android/*.xml`; every `bun run build` synchronizes those files to the sibling host before bundling. Run `bun run android:prepare` when you only need the synchronization.",
			"- Android system Back bridge: the host pre-registers `MithrilLynxNavigationModule`; connect a `mithril-lynx/route` app with `route.listenBackButton({ onCanGoBackChange: (value) => NativeModules.MithrilLynxNavigationModule?.setCanGoBack(value) })`. The Basic Activity template is already connected.",
			android.plugins.length > 0
				? `- Android connectors: ${android.plugins.join(", ")}. The host registers the native modules and package.json includes their typed JavaScript facades. See [lynx-android-plugins](https://github.com/carlos-sweb/lynx-android-plugins#javascript-facades).`
				: "- Android connectors: none selected. Run `npx create-mithril-lynx add-android-plugin <name>` from this app directory to opt into one.",
			...android.fonts.map(
				(f) =>
					`- Font \`${f.family}\` (\`src/assets/fonts/${f.file}\`): \`lynx.addFont()\` — DEV inlines a \`data:\` URI for Lynx Go; PROD uses \`asset:///fonts/${f.file}\` via \`AssetFontFaceLoader\` ([lynx#9431](https://github.com/lynx-family/lynx/issues/9431)).`,
			),
			"",
		].join("\n");
		fs.appendFileSync(readmePath, section);
	}
}

function addUiThemeClass(source, rootClass, themeClass, sourcePath) {
	const themedClass = `class: "${rootClass} ${themeClass}"`;
	if (source.includes(themedClass)) return source;

	const currentClass = `class: "${rootClass}"`;
	const index = source.indexOf(currentClass);
	if (index === -1) {
		throw new Error(`Cannot configure mithril-lynx-ui: expected root class ${JSON.stringify(rootClass)} in ${sourcePath}.`);
	}
	return `${source.slice(0, index)}${themedClass}${source.slice(index + currentClass.length)}`;
}

function patchUiProject({ targetDir, template }) {
	const templateUi = {
		"hello-world": {
			themeClass: "luna-dark",
			roots: [{ file: "src/index.ts", className: "App" }],
		},
		blank: {
			themeClass: "luna-light",
			roots: [{ file: "src/index.ts", className: "Page" }],
		},
		"basic-activity": {
			themeClass: "luna-light",
			roots: ["home", "detail"].map((screen) => ({
				file: `src/screens/${screen}.ts`,
				className: "Page",
			})),
		},
	}[template];
	if (templateUi == null) throw new Error(`Cannot configure mithril-lynx-ui for unknown template "${template}".`);

	const packagePath = path.join(targetDir, "package.json");
	const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
	packageJson.dependencies ??= {};
	packageJson.dependencies["mithril-lynx-ui"] = MITHRIL_LYNX_UI_VERSION;

	const stylesheetPath = path.join(targetDir, "src", "style.css");
	const stylesheet = fs.readFileSync(stylesheetPath, "utf8");
	const updatedStylesheet = stylesheet.includes(MITHRIL_LYNX_UI_STYLES_IMPORT)
		? stylesheet
		: `${MITHRIL_LYNX_UI_STYLES_IMPORT}\n\n${stylesheet}`;

	const themedSources = templateUi.roots.map(({ file, className }) => {
		const sourcePath = path.join(targetDir, file);
		const source = fs.readFileSync(sourcePath, "utf8");
		return [sourcePath, addUiThemeClass(source, className, templateUi.themeClass, file)];
	});

	fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
	if (updatedStylesheet !== stylesheet) fs.writeFileSync(stylesheetPath, updatedStylesheet);
	for (const [sourcePath, source] of themedSources) fs.writeFileSync(sourcePath, source);

	const readmePath = path.join(targetDir, "README.md");
	if (fs.existsSync(readmePath)) {
		const readme = fs.readFileSync(readmePath, "utf8");
		if (!readme.includes("## UI components")) {
			const section = [
				"",
				"## UI components",
				"",
				`This project was scaffolded with \`mithril-lynx-ui\`. Its stylesheet is imported from \`src/style.css\`, and the app root uses the \`${templateUi.themeClass}\` Luna theme.`,
				"",
				"Import components from their package entry points, for example `import { Button } from \"mithril-lynx-ui/button\";`. Components are headless by default; add their documented `ui-*` classes to opt into the supplied styles.",
				"",
				"See the [mithril-lynx-ui documentation](https://github.com/carlos-sweb/mithril-lynx-ui#readme) for component APIs and styling details.",
				"",
			].join("\n");
			fs.appendFileSync(readmePath, section);
		}
	}
}

// ---------------------------------------------------------------------------

const USAGE = `
create-mithril-lynx — scaffold a mithril-lynx app (and, optionally, its Android host)

Usage:
  npm create mithril-lynx@latest [name] [options]
  npx create-mithril-lynx <name> --blank --android
  npx create-mithril-lynx <name> --blank --with-ui
  npx create-mithril-lynx add-font --with-font ./Foo.ttf
  npx create-mithril-lynx add-font --find-font Inter
  npx create-mithril-lynx add-android-plugin battery,geolocation

Template (prompted for if omitted):
  --hello-world | --blank | --basic-activity

UI components:
  --with-ui                 add mithril-lynx-ui and import its stylesheet;
                            offered during interactive setup

Android host:
  --android, --target android, --target=android, target=android
                            scaffold the sibling Gradle project <name>-android/
  --android-id <id>         applicationId / namespace (default com.example.<name>)
  --app-name <name>         launcher label (default: the project name)
  --android-plugins <list>  native connectors to include: battery, camera,
                            device, geolocation, network, vibration, maps, or all.
                            Comma-separate individual connectors.
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
  add-android-plugin <list> add managed Android connector(s)
  remove-android-plugin <list>
                            remove managed Android connector(s)
  list-android-plugins      show managed Android connectors

Other:
  --no-install              don't install dependencies during scaffold or
                            post-init connector changes
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
	if (["add-android-plugin", "remove-android-plugin", "list-android-plugins"].includes(args[0])) {
		await runAndroidPluginCommand(args[0], args.slice(1));
		return;
	}

	const positional = findPositional(args);
	const templateFlag = TEMPLATE_VALUES.find((t) => args.includes(`--${t}`));
	const noInstall = args.includes("--no-install");
	let withUi = args.includes("--with-ui");
	const nonInteractive = positional != null && templateFlag != null;
	const android = parseAndroidArgs(args);

	// Android-only options imply the host rather than being silently ignored.
	if (android.fontPath != null || android.findFontTerm != null || android.fontFamily != null || android.plugins != null) {
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

	if (!withUi && !nonInteractive) {
		withUi = await confirm({
			message: "Include mithril-lynx-ui components?",
			initialValue: false,
		});
		if (isCancel(withUi)) return bail();
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

	if (withUi) patchUiProject({ targetDir, template });

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

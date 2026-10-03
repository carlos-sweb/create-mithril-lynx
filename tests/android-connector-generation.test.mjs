import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const cli = resolve(import.meta.dirname, "../src/index.js");
const read = (file) => readFileSync(file, "utf8");

function run(args, cwd, expectedStatus = 0) {
	const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8", timeout: 30000 });
	assert.equal(result.status, expectedStatus, result.stdout + result.stderr);
	return result;
}

function scaffold(plugins = []) {
	const root = mkdtempSync(join(tmpdir(), "connector-generator-test-"));
	const args = ["app", "--blank", "--android", "--no-install"];
	if (plugins.length > 0) args.push("--android-plugins", plugins.join(","));
	run(args, root);
	const app = join(root, "app");
	const android = join(root, "app-android");
	const java = join(android, "app/src/main/java/com/example/app");
	return {
		app,
		android,
		main: join(java, "MainActivity.kt"),
		registry: join(java, "LynxAndroidConnectorRegistry.kt"),
		gradle: join(android, "app/build.gradle.kts"),
		config: join(app, "android/connectors.json"),
		packageJson: join(app, "package.json"),
	};
}

function assertCallbacks(project, { registered, permission, activity }) {
	const main = read(project.main);
	assert.equal(main.includes("LynxAndroidConnectorRegistry.register(builder)"), registered);
	assert.equal(main.includes("override fun onRequestPermissionsResult("), permission);
	assert.equal(main.includes("override fun onActivityResult("), activity);
	assert.equal(/^import android\.content\.Intent$/m.test(main), activity);
	assert.equal(existsSync(project.registry), registered);
	if (registered) {
		const registry = read(project.registry);
		assert.equal(registry.includes("fun onRequestPermissionsResult("), permission);
		assert.equal(registry.includes("fun onActivityResult("), activity);
		assert.equal(/^import android\.content\.Intent$/m.test(registry), activity);
		assert.doesNotMatch(registry, /\n\s*false\s*\n/);
	}
}

test("scaffolding emits only the connector callbacks in use", () => {
	for (const [plugins, callbacks] of [
		[[], { registered: false, permission: false, activity: false }],
		[["battery"], { registered: true, permission: false, activity: false }],
		[["device", "network", "vibration"], { registered: true, permission: false, activity: false }],
		[["camera"], { registered: true, permission: false, activity: true }],
		[["geolocation"], { registered: true, permission: true, activity: false }],
		[["maps"], { registered: true, permission: true, activity: false }],
		[["sqlite"], { registered: true, permission: false, activity: false }],
		[["camera", "geolocation", "maps"], { registered: true, permission: true, activity: true }],
		[["all"], { registered: true, permission: true, activity: true }],
	]) {
		const project = scaffold(plugins);
		assertCallbacks(project, callbacks);
		const dependencies = read(project.gradle).match(/implementation\("io\.github\.carlos-sweb:lynx-android-[^"]+"\)/g) ?? [];
		assert.equal(dependencies.length, plugins.includes("all") ? 1 : plugins.length);
		for (const dependency of dependencies) assert.match(dependency, /:0\.4\.0"\)/);
	}
});

test("SQLite uses its own Maven artifact without Activity callbacks", () => {
	const project = scaffold(["sqlite"]);
	assert.match(read(project.gradle), /lynx-android-sqlite:0\.4\.0/);
	assert.match(read(project.registry), /LynxSqlitePlugin\.register\(builder\)/);
	assertCallbacks(project, { registered: true, permission: false, activity: false });
});

test("SQLite can be added and removed after scaffolding", () => {
	const project = scaffold(["battery"]);
	run(["add-android-plugin", "sqlite", "--no-install"], project.app);
	assert.match(read(project.gradle), /lynx-android-battery:0\.4\.0/);
	assert.match(read(project.gradle), /lynx-android-sqlite:0\.4\.0/);
	assert.match(read(project.registry), /LynxSqlitePlugin\.register\(builder\)/);
	run(["remove-android-plugin", "sqlite", "--no-install"], project.app);
	assert.doesNotMatch(read(project.gradle), /lynx-android-sqlite/);
	assert.doesNotMatch(read(project.registry), /LynxSqlitePlugin/);
	assertCallbacks(project, { registered: true, permission: false, activity: false });
});

test("refreshing an existing aggregate host upgrades its Maven coordinate", () => {
	for (const version of ["0.2.0", "0.3.0"]) {
		const project = scaffold(["all"]);
		writeFileSync(project.gradle, read(project.gradle).replace("lynx-android-plugins:0.4.0", `lynx-android-plugins:${version}`));
		run(["add-android-plugin", "all", "--no-install"], project.app);
		assert.match(read(project.gradle), /lynx-android-plugins:0\.4\.0/);
		assertCallbacks(project, { registered: true, permission: true, activity: true });
	}
});

test("refreshing individual connectors upgrades their historical Maven versions", () => {
	const project = scaffold(["battery", "sqlite"]);
	writeFileSync(project.gradle, read(project.gradle)
		.replace("lynx-android-battery:0.4.0", "lynx-android-battery:0.2.0")
		.replace("lynx-android-sqlite:0.4.0", "lynx-android-sqlite:0.3.0"));
	run(["add-android-plugin", "camera", "--no-install"], project.app);
	for (const name of ["battery", "sqlite", "camera"]) {
		assert.ok(read(project.gradle).includes(`lynx-android-${name}:0.4.0`));
	}
});

test("a custom Maven version blocks upgrades before any file changes", () => {
	const project = scaffold(["battery"]);
	writeFileSync(project.gradle, read(project.gradle).replace("lynx-android-battery:0.4.0", "lynx-android-battery:9.0.0"));
	const files = [project.main, project.registry, project.gradle, project.config, project.packageJson];
	const before = files.map(read);
	run(["add-android-plugin", "camera", "--no-install"], project.app, 1);
	assert.deepEqual(files.map(read), before);
});

test("add and remove update both Kotlin files, including the last connector", () => {
	const project = scaffold();
	run(["add-android-plugin", "battery", "--no-install"], project.app);
	assertCallbacks(project, { registered: true, permission: false, activity: false });
	run(["add-android-plugin", "camera,geolocation", "--no-install"], project.app);
	assertCallbacks(project, { registered: true, permission: true, activity: true });
	run(["remove-android-plugin", "camera", "--no-install"], project.app);
	assertCallbacks(project, { registered: true, permission: true, activity: false });
	run(["remove-android-plugin", "geolocation,battery", "--no-install"], project.app);
	assertCallbacks(project, { registered: false, permission: false, activity: false });
	assert.deepEqual(JSON.parse(read(project.config)).plugins, []);
});

const legacyCallbacks = [
	"    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {",
	"        if (LynxAndroidConnectorRegistry.onRequestPermissionsResult(requestCode, permissions, grantResults)) return",
	"        super.onRequestPermissionsResult(requestCode, permissions, grantResults)",
	"    }",
	"",
	'    @Deprecated("Needed for the external camera intent result")',
	"    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {",
	"        if (LynxAndroidConnectorRegistry.onActivityResult(requestCode, resultCode, data)) return",
	"        super.onActivityResult(requestCode, resultCode, data)",
	"    }",
	"",
].join("\n");

function replaceMarkedBlock(source, indentation, name, oldBody) {
	const start = `${indentation}// <create-mithril-lynx:connector-${name}>`;
	const end = `${indentation}// </create-mithril-lynx:connector-${name}>`;
	const from = source.indexOf(start);
	const endLine = source.indexOf("\n", source.indexOf(end, from)) + 1;
	assert.ok(from >= 0 && endLine > from);
	return `${source.slice(0, from)}${oldBody}${source.slice(endLine)}`;
}

function makeLegacyMainActivity(project) {
	let main = read(project.main);
	main = replaceMarkedBlock(main, "", "imports", "import android.content.Intent\n");
	main = replaceMarkedBlock(main, "        ", "registration", "        LynxAndroidConnectorRegistry.register(builder)\n");
	main = replaceMarkedBlock(main, "    ", "callbacks", legacyCallbacks);
	main = main.replace("    fun setCanGoBack", "    // User code outside generated connector sections.\n    fun setCanGoBack");
	writeFileSync(project.main, main);
}

function makeLegacyBatteryHost(project) {
	makeLegacyMainActivity(project);
	writeFileSync(project.registry, [
		"// GENERATED by create-mithril-lynx. Manage with add-android-plugin/remove-android-plugin.",
		"package com.example.app",
		"",
		"import android.content.Intent",
		"import com.lynx.tasm.LynxViewBuilder",
		"import dev.lynx.android.plugins.battery.LynxBatteryPlugin",
		"",
		"object LynxAndroidConnectorRegistry {",
		"    fun register(builder: LynxViewBuilder) {",
		"        LynxBatteryPlugin.register(builder)",
		"    }",
		"",
		"    fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray): Boolean =",
		"        false",
		"",
		"    fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean =",
		"        false",
		"}",
		"",
	].join("\n"));
}

function makeLegacyEmptyHost(project) {
	makeLegacyMainActivity(project);
	writeFileSync(project.registry, [
		"// GENERATED by create-mithril-lynx. Manage with add-android-plugin/remove-android-plugin.",
		"package com.example.app",
		"",
		"import android.content.Intent",
		"import com.lynx.tasm.LynxViewBuilder",
		"",
		"object LynxAndroidConnectorRegistry {",
		"    fun register(builder: LynxViewBuilder) {",
		"        // No Lynx Android connector selected.",
		"    }",
		"",
		"    fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray): Boolean =",
		"        false",
		"",
		"    fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean =",
		"        false",
		"}",
		"",
	].join("\n"));
}

test("an unchanged legacy host migrates without removing user code", () => {
	const project = scaffold(["battery"]);
	makeLegacyBatteryHost(project);
	run(["add-android-plugin", "battery", "--no-install"], project.app);
	assertCallbacks(project, { registered: true, permission: false, activity: false });
	assert.match(read(project.main), /User code outside generated connector sections/);
	assert.match(read(project.main), /<create-mithril-lynx:connector-callbacks>/);
});

test("an empty legacy host drops its unused registry", () => {
	const project = scaffold();
	makeLegacyEmptyHost(project);
	run(["remove-android-plugin", "all", "--no-install"], project.app);
	assertCallbacks(project, { registered: false, permission: false, activity: false });
	assert.match(read(project.main), /User code outside generated connector sections/);
});

test("removing the aggregate connector drops all generated hooks", () => {
	const project = scaffold(["all"]);
	run(["remove-android-plugin", "all", "--no-install"], project.app);
	assertCallbacks(project, { registered: false, permission: false, activity: false });
});

test("a customized legacy callback blocks migration before any file changes", () => {
	const project = scaffold(["battery"]);
	makeLegacyBatteryHost(project);
	writeFileSync(project.main, read(project.main).replace(
		"if (LynxAndroidConnectorRegistry.onRequestPermissionsResult(requestCode, permissions, grantResults)) return",
		"if (requestCode == 42) return",
	));
	const files = [project.main, project.registry, project.gradle, project.config, project.packageJson];
	const before = files.map(read);
	run(["add-android-plugin", "camera", "--no-install"], project.app, 1);
	assert.deepEqual(files.map(read), before);
});

test("a customized managed block blocks removal before any file changes", () => {
	const project = scaffold(["camera"]);
	writeFileSync(project.main, read(project.main).replace(
		"        super.onActivityResult(requestCode, resultCode, data)",
		"        super.onActivityResult(requestCode, resultCode, data) // custom",
	));
	const files = [project.main, project.registry, project.gradle, project.config, project.packageJson];
	const before = files.map(read);
	run(["remove-android-plugin", "camera", "--no-install"], project.app, 1);
	assert.deepEqual(files.map(read), before);
});

test("a user reference to the registry blocks removal of the last connector", () => {
	const project = scaffold(["battery"]);
	writeFileSync(project.main, read(project.main).replace(
		"    fun setCanGoBack",
		"    private val customRegistry = LynxAndroidConnectorRegistry::class.java\n    fun setCanGoBack",
	));
	const files = [project.main, project.registry, project.gradle, project.config, project.packageJson];
	const before = files.map(read);
	run(["remove-android-plugin", "battery", "--no-install"], project.app, 1);
	assert.deepEqual(files.map(read), before);
});

test("a user reference to the managed Intent import blocks callback removal", () => {
	const project = scaffold(["camera"]);
	writeFileSync(project.main, read(project.main).replace(
		"    fun setCanGoBack",
		"    private val customIntent = Intent()\n    fun setCanGoBack",
	));
	const files = [project.main, project.registry, project.gradle, project.config, project.packageJson];
	const before = files.map(read);
	run(["remove-android-plugin", "camera", "--no-install"], project.app, 1);
	assert.deepEqual(files.map(read), before);
});

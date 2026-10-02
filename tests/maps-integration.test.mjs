import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const cli = resolve(import.meta.dirname, "../src/index.js");
const read = (file) => readFileSync(file, "utf8");
function run(args, cwd) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
}
function registry(root, name) {
  return join(root, `${name}-android/app/src/main/java/com/example/${name}/LynxAndroidConnectorRegistry.kt`);
}
test("maps-only scaffolding forwards its own permission result and prepare syncs configuration", () => {
  const root = mkdtempSync(join(tmpdir(), "maps-generator-test-"));
  run(["mapsapp", "--blank", "--android-plugins", "maps", "--no-install"], root);
  const native = read(registry(root, "mapsapp"));
  assert.match(native, /LynxMapsPlugin\.onRequestPermissionsResult/);
  assert.doesNotMatch(native, /LynxGeolocationPlugin/);
  const app = join(root, "mapsapp");
  assert.ok(existsSync(join(app, "android/maps.json")));
  const result = spawnSync(process.execPath, [join(app, "scripts/android-prepare.mjs")], { cwd: app, encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(read(join(root, "mapsapp-android/app/src/main/assets/lynx_maps/config.json")), read(join(app, "android/maps.json")));
  const scripts = JSON.parse(read(join(app, "package.json"))).scripts;
  for (const [name, command] of Object.entries(scripts)) if (name === "build" || name.startsWith("build:")) assert.match(command, /^(?:bun run android:prepare|node scripts\/android-prepare\.mjs) &&/);
});
test("post-install add/remove preserves maps configuration and forwards both permission handlers", () => {
  const root = mkdtempSync(join(tmpdir(), "maps-generator-test-"));
  run(["mapsapp", "--blank", "--android-plugins", "geolocation", "--no-install"], root);
  const app = join(root, "mapsapp");
  writeFileSync(join(app, "android/maps.json"), JSON.stringify({ packages: [{ id: "custom", version: "keep-me" }] }));
  run(["add-android-plugin", "maps", "--no-install"], app);
  const native = read(registry(root, "mapsapp"));
  assert.match(native, /LynxGeolocationPlugin\.onRequestPermissionsResult.*\|\|.*LynxMapsPlugin\.onRequestPermissionsResult/s);
  const config = read(join(app, "android/maps.json"));
  run(["remove-android-plugin", "maps", "--no-install"], app);
  assert.equal(read(join(app, "android/maps.json")), config);
  assert.doesNotMatch(read(registry(root, "mapsapp")), /LynxMapsPlugin/);
});

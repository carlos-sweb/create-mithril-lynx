#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

import { cancel, confirm, intro, isCancel, outro, select, text } from "@clack/prompts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(scriptDir, "..");
const cwd = process.cwd();

const MITHRIL_LYNX_VERSION = "0.0.1";

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

function replaceInFile(filePath, replacements) {
	if (!fs.existsSync(filePath)) return;
	let content = fs.readFileSync(filePath, "utf8");
	for (const [from, to] of replacements) content = content.split(from).join(to);
	fs.writeFileSync(filePath, content);
}

function targetDirHasConflict(value) {
	const targetDir = path.join(cwd, value);
	return fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0;
}

async function main() {
	// Non-interactive escape hatch for scripting/CI:
	//   create-mithril-lynx my-app --ts
	//   create-mithril-lynx my-app --js --no-install
	const args = process.argv.slice(2);
	const positional = args.find((a) => !a.startsWith("-"));
	const variantFlag = args.includes("--ts") ? "ts" : args.includes("--js") ? "js" : undefined;
	const noInstall = args.includes("--no-install");
	const nonInteractive = positional != null && variantFlag != null;

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

	let variant = variantFlag;
	if (variant == null) {
		variant = await select({
			message: "Select a variant",
			options: [
				{ value: "ts", label: "TypeScript", hint: "recommended" },
				{ value: "js", label: "JavaScript" },
			],
		});
		if (isCancel(variant)) return bail();
	}

	const targetDir = path.join(cwd, rawName);
	fs.mkdirSync(targetDir, { recursive: true });

	copyDir(path.join(packageRoot, "template-common"), targetDir);
	copyDir(path.join(packageRoot, `template-${variant}`), targetDir);

	const gitignorePath = path.join(targetDir, "gitignore");
	if (fs.existsSync(gitignorePath)) {
		fs.renameSync(gitignorePath, path.join(targetDir, ".gitignore"));
	}

	replaceInFile(path.join(targetDir, "package.json"), [
		["{{PROJECT_NAME}}", projectName],
		["{{MITHRIL_LYNX_VERSION}}", MITHRIL_LYNX_VERSION],
	]);
	replaceInFile(path.join(targetDir, "README.md"), [["{{PROJECT_NAME}}", projectName]]);

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

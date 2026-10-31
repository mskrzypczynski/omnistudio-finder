// Build the Chrome Web Store zip: exactly the files the extension needs to run,
// plus the licence. Nothing else — no tests, no config, no node_modules, no
// store assets, no workflow files. An explicit allowlist, so a stray file
// can't quietly end up in a public upload.
//
//   npm run package                 -> dist/omnistudio-finder-<version>.zip
//   npm run package -- --out <dir>  (write into another directory)
//
// Run `npm run lint` and `npm test` first; CI and the Release workflow do.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Everything here ships. `zip -r` pulls in the whole tree of a directory.
const INCLUDE = [
  "manifest.json",
  "popup.html",
  "popup.css",
  "options.html",
  "options.css",
  "src",
  "icons",
  "LICENSE",
];

// Even inside an included directory, never zip these.
const EXCLUDE = ["*.DS_Store"];

function fail(message) {
  console.error(`package: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const outFlag = args.indexOf("--out");
const outDir = resolve(root, outFlag !== -1 ? (args[outFlag + 1] ?? "dist") : "dist");

/* ---- version must agree between manifest.json and package.json ---- */

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

if (manifest.version !== pkg.version) {
  fail(
    `version mismatch — manifest.json is ${manifest.version}, package.json is ${pkg.version}. ` +
      `Bump both together before packaging.`
  );
}

/* ---- every declared path must exist ---- */

for (const entry of INCLUDE) {
  if (!existsSync(join(root, entry))) fail(`missing required file: ${entry}`);
}

/* ---- build the zip ---- */

mkdirSync(outDir, { recursive: true });

const outPath = join(outDir, `omnistudio-finder-${manifest.version}.zip`);
rmSync(outPath, { force: true });

execFileSync("zip", ["-r", "-X", "-9", outPath, ...INCLUDE, "-x", ...EXCLUDE], {
  cwd: root,
  stdio: ["ignore", "ignore", "inherit"],
});

/* ---- report ---- */

const listing = execFileSync("unzip", ["-l", outPath], { encoding: "utf8" });
const sizeKb = (statSync(outPath).size / 1024).toFixed(1);

console.log(listing.trimEnd());
console.log(`\npackage: wrote ${outPath} (${sizeKb} KB)`);

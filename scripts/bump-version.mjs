#!/usr/bin/env node
// Bumps the version in manifest.json, package.json and package-lock.json
// together, so the two fields scripts/package.mjs insists on can't drift.
//
//   npm run bump -- patch|minor|major|1.4.2
//
// Only edits files; committing and tagging stay a deliberate human step (see
// the printed next steps and CONTRIBUTING.md's Releasing section).

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USAGE = "Usage: npm run bump -- patch|minor|major|<x.y.z>";

function edit(relativePath, change) {
  const file = path.join(ROOT, relativePath);
  const json = JSON.parse(readFileSync(file, "utf8"));
  change(json);
  writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
}

export function nextVersion(current, request) {
  if (/^\d+\.\d+\.\d+$/.test(request)) return request;
  const [major, minor, patch] = current.split(".").map(Number);
  if (request === "major") return `${major + 1}.0.0`;
  if (request === "minor") return `${major}.${minor + 1}.0`;
  if (request === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(USAGE);
}

function main() {
  const request = process.argv[2];
  if (!request) throw new Error(USAGE);

  const current = JSON.parse(readFileSync(path.join(ROOT, "manifest.json"), "utf8")).version;
  const version = nextVersion(current, request);

  edit("manifest.json", (json) => {
    json.version = version;
  });
  edit("package.json", (json) => {
    json.version = version;
  });
  edit("package-lock.json", (json) => {
    json.version = version;
    if (json.packages && json.packages[""]) json.packages[""].version = version;
  });

  console.log(
    `Bumped ${current} -> ${version}.\n\nNext:\n` +
      `  git commit -am "${version}"\n  git tag v${version}\n  git push --follow-tags`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

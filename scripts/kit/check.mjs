#!/usr/bin/env node
/* Checks that an extension's src/kit/ is exactly the copy recorded in its
 * src/kit/kit.json: no file edited, added or removed by hand. sync.mjs copies
 * this file into the extension as scripts/kit/check.mjs, so it must stay
 * self-contained (Node built-ins only) and is run there as
 *   node scripts/kit/check.mjs
 * from the extension's root, usually from its release check. */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MANIFEST = 'kit.json';

/* Every file under dir, as forward-slash paths relative to it, sorted, the
 * manifest itself and .gitkeep placeholders left out. */
export function listFiles(dir) {
  const files = [];
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name !== '.gitkeep' && entry.name !== '.DS_Store') files.push(relative(dir, path).split(sep).join('/'));
    }
  };
  walk(dir);
  return files.filter((file) => file !== MANIFEST).sort();
}

export function hashFiles(dir) {
  return Object.fromEntries(listFiles(dir).map((file) => [
    file,
    createHash('sha256').update(readFileSync(join(dir, file))).digest('hex')
  ]));
}

/* What differs between the recorded hashes and the ones on disk. */
export function diffHashes(expected, actual) {
  const names = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  const diff = { changed: [], missing: [], extra: [] };
  [...names].sort().forEach((name) => {
    if (!(name in actual)) diff.missing.push(name);
    else if (!(name in expected)) diff.extra.push(name);
    else if (expected[name] !== actual[name]) diff.changed.push(name);
  });
  return diff;
}

export function checkKit(kitDir) {
  const manifestPath = join(kitDir, MANIFEST);
  if (!existsSync(manifestPath)) return { ok: false, problem: `${manifestPath} not found: run the kit's sync first.` };
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const diff = diffHashes(manifest.files, hashFiles(kitDir));
  const ok = !diff.changed.length && !diff.missing.length && !diff.extra.length;
  return { ok, version: manifest.version, commit: manifest.commit, diff };
}

function main() {
  const kitDir = process.argv[2] || 'src/kit';
  const result = checkKit(kitDir);
  if (result.problem) {
    console.error(result.problem);
    process.exit(1);
  }
  if (result.ok) {
    console.log(`${kitDir} matches the shared kit ${result.version} (${result.commit}).`);
    return;
  }
  console.error(`${kitDir} differs from the shared kit ${result.version}. Change the kit and sync again instead of editing the copy.`);
  for (const [kind, files] of Object.entries(result.diff)) files.forEach((file) => console.error(`  ${kind}: ${file}`));
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

'use strict';

/* JSON tree domain model: deciding what a collapsible JSON tree view should
 * show, with no DOM in sight. src/ui/json-tree-view.js does the actual
 * drawing and imports these decisions rather than recomputing them.
 *
 * Paths are SEP-joined key chains; the root is the empty string.
 */

export const SEP = '';

/* The path of a child. `depth` is the parent's (0 = the root, whose path is
 * ''): a key called '' under the root has the path '', and what lies below it
 * must still get its separator or it would share a path with a sibling.
 * Known limit, left as it is: that key's own row has the root's path '', so
 * the tree cannot tell it from the root (a pin, a fold or a jump on it acts on
 * the root). OmniScript data never has an unnamed key, and a path that is
 * empty is the root everywhere else, so no other path scheme is worth the risk. */
export function joinPath(parentPath, key, depth) {
  return depth === 0 ? key : parentPath + SEP + key;
}

/* A tree with more rows than this is drawn a window at a time. */
export const MAX_ROWS = 1500;

export function isContainer(value) {
  return value !== null && typeof value === 'object';
}

export function entriesOf(value) {
  return Array.isArray(value)
    ? value.map((item, i) => [String(i), item])
    : Object.keys(value).map((key) => [key, value[key]]);
}

/* Is the branch at path open? Without a filter it is the plain expanded set.
 * While filtering, matches start open so the results are visible, and the
 * filterOpen map (path -> open) holds the user's own toggles, which win. */
export function isBranchOpen({ filtering, expanded, filterOpen }, path) {
  if (!filtering) return expanded.has(path);
  if (filterOpen && filterOpen.has(path)) return filterOpen.get(path);
  return true;
}

/* A short " [3 items]" / " {2 keys}" summary for a collapsed container, with a
 * trailing dot when a change is hiding inside it. */
export function summarise(value, path, changedBranch, changed) {
  const count = Array.isArray(value) ? value.length : Object.keys(value).length;
  const body = Array.isArray(value)
    ? ` [${count}${count === 1 ? ' item]' : ' items]'}`
    : ` {${count}${count === 1 ? ' key}' : ' keys}'}`;
  const hasHiddenChange = changedBranch && changedBranch.has(path) && changed && changed.size;
  return hasHiddenChange ? `${body} •` : body;
}

/* Every path whose key or value contains the query, plus every ancestor path
 * needed to reveal it, and every descendant path when the match is on a
 * container's own key (the whole subtree becomes visible). The position of an
 * item in a list is not a key, so it is never matched. */
export function collectMatches(value, path, keyText, query, out, depth = 0, inArray = false) {
  const selfHit = !inArray && String(keyText).toLowerCase().includes(query);
  let hit = selfHit;

  if (selfHit && isContainer(value)) addAllPaths(value, path, out, 0, depth);

  if (isContainer(value)) {
    entriesOf(value).forEach(([childKey, childValue]) => {
      if (collectMatches(childValue, joinPath(path, childKey, depth), childKey, query, out, depth + 1, Array.isArray(value))) hit = true;
    });
  } else if (String(value).toLowerCase().includes(query)) {
    hit = true;
  }

  if (hit) out.add(path);
  return hit;
}

export function addAllPaths(value, path, out, depth, base = 0) {
  if (out.size > 20000 || depth > 40) return;
  out.add(path);
  if (!isContainer(value)) return;
  Object.keys(value).forEach((key) => {
    addAllPaths(value[key], joinPath(path, key, path === '' && base + depth === 0 ? 0 : 1), out, depth + 1, base);
  });
}

/* The paths of a branch and of every non-empty container beneath it: what
 * "expand (or collapse) everything inside" toggles. Leaves are left out, they
 * have nothing to open. Bounded like addAllPaths so a huge payload cannot
 * stall the panel; the rows beyond the cap just keep their own state. */
const SUBTREE_MAX = 20000;
const SUBTREE_DEPTH = 40;

export function subtreePaths(value, path) {
  return subtreeBranches(value, path).paths;
}

/* The same, saying whether the bounds cut the list short. */
export function subtreeBranches(value, path) {
  const paths = [];
  let capped = false;
  const walk = (node, nodePath, depth) => {
    if (!isContainer(node)) return;
    const entries = entriesOf(node);
    if (!entries.length) return;
    if (paths.length >= SUBTREE_MAX || depth > SUBTREE_DEPTH) { capped = true; return; }
    paths.push(nodePath);
    entries.forEach(([key, child]) => walk(child, joinPath(nodePath, key, nodePath === '' && depth === 0 ? 0 : 1), depth + 1));
  };
  walk(value, path, 0);
  return { paths, capped };
}

/* Open or close a whole branch in the state a tree reads (see isBranchOpen):
 * the filterOpen overrides while filtering, the expanded set otherwise. */
export function setSubtreeOpen({ filtering, expanded, filterOpen }, value, path, open) {
  const paths = subtreePaths(value, path);
  if (filtering) {
    if (!filterOpen) return false;
    paths.forEach((p) => filterOpen.set(p, open));
  } else {
    paths.forEach((p) => (open ? expanded.add(p) : expanded.delete(p)));
  }
  return true;
}

/* ---------------------------------------------------------------- lines
 * Line numbers match the Raw view: JSON.stringify(value, null, 2) puts a
 * scalar, an empty {} / [] on one line, and a container on two lines (opening
 * and closing) plus the lines of its children. A row's number is the line its
 * text has in that output, so folding a branch skips numbers instead of
 * renumbering the rows that are left. */
const sizeCache = new WeakMap();

/* How many lines the value takes in the pretty-printed text. */
export function lineSize(value) {
  if (!isContainer(value)) return 1;
  if (sizeCache.has(value)) return sizeCache.get(value);
  const entries = entriesOf(value);
  let size = 1;
  if (entries.length) {
    size = 2;
    entries.forEach(([, child]) => { size += lineSize(child); });
  }
  sizeCache.set(value, size);
  return size;
}

/* The first line of each child (in entriesOf order) of a container that starts
 * on line `start`. */
export function childLines(value, start) {
  let next = start + 1;
  return entriesOf(value).map(([, child]) => {
    const line = next;
    next += lineSize(child);
    return line;
  });
}

/* The line of a container's closing brace. */
export function closingLine(value, start) {
  return start + lineSize(value) - 1;
}

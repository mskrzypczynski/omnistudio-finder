'use strict';

/* Comparing two JSON values: a flat list of what differs, by path, with the
 * rows of arrays lined up first. One walk (walkDiff) feeds every view of a
 * comparison (the flat list of diffValues, marks on a tree, side-by-side
 * panes), so they always agree about what differs.
 *
 * Arrays are the hard part. Comparing them position by position turns one
 * removed row into a change in every row after it, so rows are lined up first:
 *   1. by identity, when every row is an object with the same unique
 *      Id / id / Name / name / key / Key;
 *   2. otherwise by content: rows the two arrays share at the start and the
 *      end are matched, and the rows in between by a longest common
 *      subsequence when both stretches are small (up to 200 rows);
 *   3. whatever is left over in a stretch is paired by position.
 * A row with no partner is reported whole, as 'row-added' or 'row-removed'.
 *
 * Paths are written the way OmniScript writes them (formatPath): keys joined
 * by colons, a position in a list as |N counting from 1 (StepA:Rows|3:Code).
 *
 * Pure: no DOM, no chrome.*. */

const isContainer = (value) => value !== null && typeof value === 'object';

/* In the order they are preferred. */
const IDENTITY_KEYS = ['Id', 'id', 'Name', 'name', 'key', 'Key'];

/* Longest stretch of unmatched rows the content match will try to align. */
export const LCS_MAX_ROWS = 200;

const MAX_DEPTH = 60;

function usableId(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

/* Does every row of the array carry `key` with an id that no other row has? */
function uniqueIdsBy(rows, key) {
  const seen = new Set();
  for (const row of rows) {
    if (!isContainer(row) || Array.isArray(row)) return false;
    const id = usableId(row[key]);
    if (id === null || seen.has(id)) return false;
    seen.add(id);
  }
  return rows.length > 0;
}

/* The identity key of a list of rows, or null. */
export function identityKey(rows) {
  return IDENTITY_KEYS.find((key) => uniqueIdsBy(rows, key)) || null;
}

/* The key both arrays can be lined up by, or null. */
function sharedIdentityKey(a, b) {
  return IDENTITY_KEYS.find((key) => uniqueIdsBy(a, key) && uniqueIdsBy(b, key)) || null;
}

const hashOf = (row) => String(JSON.stringify(row));

/* Longest common subsequence of two lists of strings; returns the matched
 * pairs [indexInA, indexInB] in order. */
function lcsPairs(x, y) {
  const n = x.length;
  const m = y.length;
  const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = x[i] === y[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const pairs = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { pairs.push([i, j]); i++; j++; } else if (table[i + 1][j] >= table[i][j + 1]) i++; else j++;
  }
  return pairs;
}

/* Rows that appear in both arrays, as ordered [indexInA, indexInB] pairs. The
 * positions left out are the rows with no partner (before the by-position
 * pairing of `alignRows`). `how` says which rule lined them up. */
function matchRows(a, b) {
  const key = sharedIdentityKey(a, b);
  if (key) {
    const where = new Map(b.map((row, j) => [String(row[key]), j]));
    const pairs = [];
    a.forEach((row, i) => {
      const j = where.get(String(row[key]));
      if (j !== undefined) pairs.push([i, j]);
    });
    return { pairs, key, positional: false };
  }

  const x = a.map(hashOf);
  const y = b.map(hashOf);
  let start = 0;
  while (start < x.length && start < y.length && x[start] === y[start]) start++;
  let endA = x.length;
  let endB = y.length;
  while (endA > start && endB > start && x[endA - 1] === y[endB - 1]) { endA--; endB--; }

  const pairs = [];
  for (let i = 0; i < start; i++) pairs.push([i, i]);
  if (endA - start <= LCS_MAX_ROWS && endB - start <= LCS_MAX_ROWS) {
    lcsPairs(x.slice(start, endA), y.slice(start, endB)).forEach(([i, j]) => pairs.push([start + i, start + j]));
  }
  for (let k = 0; k < x.length - endA; k++) pairs.push([endA + k, endB + k]);
  return { pairs, key: null, positional: true };
}

/* The rows of two arrays lined up, in reading order, as a list of
 *   { a: i, b: j }   the same row (or a changed version of it)
 *   { a: i }         only in the first array
 *   { b: j }         only in the second
 * `key` is the identity key used, if any. */
export function alignRows(a, b) {
  const { pairs, key, positional } = matchRows(a, b);
  const partnerOf = new Array(a.length).fill(-1);
  const bMatched = new Set();
  pairs.forEach(([i, j]) => { partnerOf[i] = j; bMatched.add(j); });

  const ops = [];
  let removed = []; // rows of a with no partner since the last match
  let cursor = 0; // rows of b before this are done

  /* Between two matches. With no identity to go by, unmatched rows facing each
   * other are taken to be the same row edited, so they are paired by position. */
  const flush = (upToB) => {
    const added = [];
    for (; cursor < upToB; cursor++) if (!bMatched.has(cursor)) added.push(cursor);
    const paired = positional ? Math.min(removed.length, added.length) : 0;
    for (let k = 0; k < paired; k++) ops.push({ a: removed[k], b: added[k] });
    removed.slice(paired).forEach((index) => ops.push({ a: index }));
    added.slice(paired).forEach((index) => ops.push({ b: index }));
    removed = [];
  };

  a.forEach((row, i) => {
    if (partnerOf[i] === -1) { removed.push(i); return; }
    flush(partnerOf[i]);
    ops.push({ a: i, b: partnerOf[i] });
    cursor = Math.max(cursor, partnerOf[i] + 1);
  });
  flush(b.length);
  return { ops, key };
}

/* Walk a and b. `emit` is called for each difference with
 *   { parts, kind, before, after, index?, identity? }
 * where parts are the keys from the root (array positions as numbers) and
 * kind is 'changed', 'added', 'removed', 'row-added' or 'row-removed'. A
 * matched row is reported at its position in b; a removed row at its position
 * in a. Return true from `emit` to stop the walk. */
export function walkDiff(a, b, emit) {
  let stopped = false;
  const report = (entry) => {
    if (stopped) return;
    if (emit(entry) === true) stopped = true;
  };

  const isRecord = (value) => value !== null && typeof value === 'object';

  function walkArrays(x, y, parts, depth) {
    const { ops, key } = alignRows(x, y);
    ops.forEach((op) => {
      if (stopped) return;
      if (op.a !== undefined && op.b !== undefined) { walk(x[op.a], y[op.b], parts.concat(op.b), depth + 1); return; }
      /* "row" is for a record that came or went; a scalar in a list of tags or
       * ids reads better as a plain added or removed value. */
      if (op.a !== undefined) {
        report({ parts: parts.concat(op.a), kind: isRecord(x[op.a]) ? 'row-removed' : 'removed', before: x[op.a], after: undefined, index: op.a,
          identity: key ? `${key}=${x[op.a][key]}` : undefined });
      } else {
        report({ parts: parts.concat(op.b), kind: isRecord(y[op.b]) ? 'row-added' : 'added', before: undefined, after: y[op.b], index: op.b,
          identity: key ? `${key}=${y[op.b][key]}` : undefined });
      }
    });
  }

  function walk(x, y, parts, depth) {
    if (stopped) return;
    if (!isContainer(x) || !isContainer(y) || Array.isArray(x) !== Array.isArray(y) || depth > MAX_DEPTH) {
      if (!isContainer(x) && !isContainer(y) && x === y) return;
      if (isContainer(x) && isContainer(y) && depth > MAX_DEPTH) return;
      report({ parts, kind: 'changed', before: x, after: y });
      return;
    }
    if (Array.isArray(x)) { walkArrays(x, y, parts, depth); return; }

    new Set([...Object.keys(x), ...Object.keys(y)]).forEach((key) => {
      const inX = Object.prototype.hasOwnProperty.call(x, key);
      const inY = Object.prototype.hasOwnProperty.call(y, key);
      if (inX && !inY) report({ parts: parts.concat(key), kind: 'removed', before: x[key], after: undefined });
      else if (!inX && inY) report({ parts: parts.concat(key), kind: 'added', before: undefined, after: y[key] });
      else walk(x[key], y[key], parts.concat(key), depth + 1);
    });
  }

  walk(a, b, [], 0);
}

/* A path the way OmniScript writes it: keys joined by colons, a repeat's
 * position after its key as |N counting from 1 (the tree and the JSON itself
 * count from 0; the OmniScript does not).
 * ['StepA', 'Rows', 1, 'Code'] -> StepA:Rows|2:Code. A position with no key
 * before it (the payload is an array) is written on its own: |2. */
export function formatPath(parts) {
  if (!parts.length) return '(root)';
  return parts.reduce((text, part, at) => {
    if (typeof part === 'number') return `${text}|${part + 1}`;
    return at ? `${text}:${part}` : String(part);
  }, '');
}

/* Differences between a and b as { path, kind, before, after }, kind being
 * 'added', 'removed' or 'changed' for values and keys, and 'row-added' or
 * 'row-removed' for a whole row of an array (rows are lined up first, see
 * alignRows, so removing one row of three hundred is one entry). A row
 * entry also carries `index` and, when the rows were matched by an Id/Name
 * style key, `identity` such as "Id=7". A branch present on one side only is
 * one entry, not one per leaf. Stops at `limit` entries; `truncated` says so. */
export function diffValues(a, b, limit = 500) {
  const changes = [];
  let truncated = false;

  walkDiff(a, b, (entry) => {
    if (changes.length >= limit) { truncated = true; return true; }
    const change = { path: formatPath(entry.parts), kind: entry.kind, before: entry.before, after: entry.after };
    if (entry.index !== undefined) change.index = entry.index;
    if (entry.identity !== undefined) change.identity = entry.identity;
    changes.push(change);
    return false;
  });

  return { changes, truncated };
}

/* An identity such as "Id=7" holds a value of the payload: through `mask` it
 * becomes "Id=<string>" (or <number>) like any other value that leaves the
 * view. */
export function maskIdentity(identity, mask = (value) => value) {
  if (identity === undefined) return undefined;
  const at = identity.indexOf('=');
  if (at < 0) return identity;
  const masked = mask(identity.slice(at + 1));
  return `${identity.slice(0, at + 1)}${typeof masked === 'string' ? masked : identity.slice(at + 1)}`;
}

/* A change with every value in it passed through `mask`: before, after and the
 * row identity. Paths hold keys only and are left as they are. */
export function maskChange(change, mask = (value) => value) {
  const out = { ...change, before: mask(change.before), after: mask(change.after) };
  if (change.identity !== undefined) out.identity = maskIdentity(change.identity, mask);
  return out;
}

/* How much two texts share at both ends: { prefix, suffix } counted in
 * characters, never overlapping, and never splitting a surrogate pair. What is
 * left in the middle of each is what differs. Used to highlight the changed
 * part of a long value. */
export function commonAffix(a, b) {
  const max = Math.min(a.length, b.length);
  let prefix = 0;
  while (prefix < max && a[prefix] === b[prefix]) prefix++;
  if (prefix > 0 && isHighSurrogate(a.charCodeAt(prefix - 1))) prefix--;
  let suffix = 0;
  while (suffix < max - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  if (suffix > 0 && isLowSurrogate(a.charCodeAt(a.length - suffix))) suffix--;
  return { prefix, suffix };
}

const isHighSurrogate = (code) => code >= 0xD800 && code <= 0xDBFF;
const isLowSurrogate = (code) => code >= 0xDC00 && code <= 0xDFFF;

/* The part of a long text to show while it is folded: at most `limit`
 * characters from the start, moved along when the differing span
 * [start, end) would otherwise be cut off, so the highlight is always in
 * view. { from, to } are offsets into the text. */
export function excerpt(length, start, end, limit = 160, lead = 30) {
  if (length <= limit) return { from: 0, to: length };
  if (end <= limit - 10) return { from: 0, to: limit };
  const from = Math.max(0, Math.min(start - lead, length - limit));
  return { from, to: Math.min(length, from + limit) };
}

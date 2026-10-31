'use strict';

/* The payload as the page holds it, laid out for reading and copying.
 *
 * Parsing a payload and printing it again is not faithful: JavaScript puts
 * integer-like keys first and turns a number above 2^53 into a nearby one. The
 * formatter here works on the text itself and only moves whitespace, so key
 * order and every digit stay as the page wrote them.
 *
 * Pure: no DOM, no chrome.*. */

import { lineSize } from './json-tree-model.js';
import { countLines } from './text-search.js';

const QUOTE = 34;
const BACKSLASH = 92;

/* Characters that end a bare token (number, true, false, null). */
function endsToken(code) {
  return code <= 32 || code === QUOTE || code === 123 || code === 125 || code === 91 || code === 93 || code === 44 || code === 58;
}

function nextNonSpace(text, from) {
  let at = from;
  while (at < text.length && text.charCodeAt(at) <= 32) at++;
  return at;
}

const MAX_SAFE = 9007199254740991n;

/* An integer written with more digits than a double keeps exactly. */
function isUnsafeInteger(token) {
  if (!/^-?\d{16,}$/.test(token)) return false;
  const value = BigInt(token);
  return value > MAX_SAFE || value < -MAX_SAFE;
}

/* The text laid out the way JSON.stringify(value, null, 2) would: one entry
 * per line, two spaces per level, "key": value, empty {} and [] on one line.
 * Tolerant: text that is not quite JSON is laid out as far as it goes and
 * never throws. `unsafe` says whether it holds an integer above 2^53 outside
 * a string. */
export function formatRaw(text) {
  const source = typeof text === 'string' ? text : '';
  const out = [];
  let depth = 0;
  let unsafe = false;
  let at = 0;

  const newline = () => out.push('\n' + '  '.repeat(depth));

  while (at < source.length) {
    const code = source.charCodeAt(at);

    if (code <= 32) { at++; continue; }

    if (code === QUOTE) {
      let end = at + 1;
      while (end < source.length && source.charCodeAt(end) !== QUOTE) end += source.charCodeAt(end) === BACKSLASH ? 2 : 1;
      out.push(source.slice(at, end + 1));
      at = end + 1;
      continue;
    }

    if (code === 123 || code === 91) { // { [
      const close = code === 123 ? 125 : 93;
      const peek = nextNonSpace(source, at + 1);
      if (source.charCodeAt(peek) === close) {
        out.push(source[at] + source[peek]);
        at = peek + 1;
      } else {
        out.push(source[at]);
        depth++;
        newline();
        at++;
      }
      continue;
    }

    if (code === 125 || code === 93) { // } ]
      depth = Math.max(0, depth - 1);
      newline();
      out.push(source[at]);
      at++;
      continue;
    }

    if (code === 44) { out.push(','); newline(); at++; continue; }
    if (code === 58) { out.push(': '); at++; continue; }

    let end = at;
    while (end < source.length && !endsToken(source.charCodeAt(end))) end++;
    if (end === at) end++; // never stall on a character that is neither
    const token = source.slice(at, end);
    if (!unsafe && isUnsafeInteger(token)) unsafe = true;
    out.push(token);
    at = end;
  }

  return { text: out.join(''), unsafe };
}

/* A parse lists integer-like keys first, so the Tree walks {"b":{..},"1":2} as
 * "1" then "b", where the page wrote "b" first. The Raw view must show the
 * Tree's order or the same line number holds different JSON in the two.
 * reorderKeys moves the text's own entries into that order and touches nothing
 * else, so digits stay the page's. null when the text is not plain JSON. */
const INTEGER_KEY_LINE = /^\s*"(?:0|[1-9]\d{0,9})"\s*:/m;
/* A key written with a \u escape may be an integer in disguise ("\u0031"), so
 * its line is looked at too. */
const ESCAPED_KEY_LINE = /^\s*"(?:[^"\\]|\\.)*\\u[0-9a-fA-F]{4}(?:[^"\\]|\\.)*"\s*:/m;
const KEY_OF_LINE = /^\s*("(?:[^"\\]|\\.)*")\s*:/;
const MAX_NESTING = 400;
const MAX_INDEX = 4294967294;

/* What a quoted key says, escapes resolved ('"\\u0031"' is 1). */
function keyName(keyText) {
  if (keyText.indexOf('\\') < 0) return keyText.slice(1, -1);
  try { return JSON.parse(keyText); } catch { return keyText.slice(1, -1); }
}

function isIndexKey(keyText) {
  const inner = keyName(keyText);
  return /^(?:0|[1-9]\d*)$/.test(inner) && Number(inner) <= MAX_INDEX;
}

export function reorderKeys(text) {
  const source = String(text);
  let at = 0;

  const skip = () => { at = nextNonSpace(source, at); };
  const string = () => {
    let end = at + 1;
    while (end < source.length && source.charCodeAt(end) !== QUOTE) end += source.charCodeAt(end) === BACKSLASH ? 2 : 1;
    if (end >= source.length) return null;
    const out = source.slice(at, end + 1);
    at = end + 1;
    return out;
  };

  function value(depth) {
    skip();
    if (at >= source.length || depth > MAX_NESTING) return null;
    const code = source.charCodeAt(at);
    if (code === QUOTE) return string();
    if (code === 123) return object(depth);
    if (code === 91) return array(depth);
    const start = at;
    while (at < source.length && !endsToken(source.charCodeAt(at))) at++;
    return at === start ? null : source.slice(start, at);
  }

  function array(depth) {
    const items = [];
    at++;
    skip();
    if (source.charCodeAt(at) === 93) { at++; return '[]'; }
    for (;;) {
      const item = value(depth + 1);
      if (item === null) return null;
      items.push(item);
      skip();
      const code = source.charCodeAt(at++);
      if (code === 93) return `[${items.join(',')}]`;
      if (code !== 44) return null;
    }
  }

  function object(depth) {
    const entries = [];
    at++;
    skip();
    if (source.charCodeAt(at) === 125) { at++; return '{}'; }
    for (;;) {
      skip();
      if (source.charCodeAt(at) !== QUOTE) return null;
      const key = string();
      if (key === null) return null;
      skip();
      if (source.charCodeAt(at++) !== 58) return null;
      const child = value(depth + 1);
      if (child === null) return null;
      entries.push({ key, text: `${key}:${child}` });
      skip();
      const code = source.charCodeAt(at++);
      if (code === 125) break;
      if (code !== 44) return null;
    }
    const indexed = entries.filter((entry) => isIndexKey(entry.key)).sort((x, y) => Number(keyName(x.key)) - Number(keyName(y.key)));
    const named = entries.filter((entry) => !isIndexKey(entry.key));
    return `{${indexed.concat(named).map((entry) => entry.text).join(',')}}`;
  }

  const out = value(0);
  skip();
  return out === null || at < source.length ? null : out;
}

/* Whether every line of `text` holds the key the parse prints on that line. */
function keysFollowTheParse(text, data) {
  let printed;
  try { printed = JSON.stringify(data, null, 2); } catch { return false; }
  if (typeof printed !== 'string') return false;
  const mine = text.split('\n');
  const theirs = printed.split('\n');
  if (mine.length !== theirs.length) return false;
  for (let i = 0; i < mine.length; i++) {
    const a = KEY_OF_LINE.exec(mine[i]);
    const b = KEY_OF_LINE.exec(theirs[i]);
    if ((a ? keyName(a[1]) : null) !== (b ? keyName(b[1]) : null)) return false;
  }
  return true;
}

/* The laid-out text in the Tree's key order, or null when that cannot be had
 * (then the caller prints the parse). A payload with no integer-like key is
 * already in that order and is not looked at again (an escaped key is read as
 * what it says first). */
function inTreeOrder(laid, data) {
  if (!INTEGER_KEY_LINE.test(laid.text) && !ESCAPED_KEY_LINE.test(laid.text)) return laid;
  const reordered = reorderKeys(laid.text);
  const again = reordered === null ? null : formatRaw(reordered);
  return again && keysFollowTheParse(again.text, data) ? again : null;
}

/* Whether the text holds an integer above 2^53 outside a string: what the
 * status bar notes in every view. Answered without laying the text out unless a
 * run of 16 digits makes it possible, so a payload without one costs one scan,
 * not the Raw view's work. */
let lastUnsafe = { raw: null, answer: false };

export function hasUnsafeNumbers(raw) {
  if (typeof raw !== 'string' || !/\d{16}/.test(raw)) return false;
  if (lastUnsafe.raw !== raw) lastUnsafe = { raw, answer: formatRaw(raw).unsafe };
  return lastUnsafe.answer;
}

/* What the Raw view shows, what Copy JSON and Save file write, and whether the
 * payload holds numbers a parse would have altered.
 *   raw   the string the page holds
 *   data  that string parsed
 * text is for reading: it must have the lines the Tree numbers (lineSize of the
 * parsed value), each holding the same key, in the Tree's order; when that
 * cannot be had (a repeated key collapses in a parse) the parsed value is
 * printed instead, so Tree and Raw line numbers stay equal and `exact` says the
 * text is no longer the page's own. copyText is the page's text as it wrote
 * it, in its own key order, for Copy JSON and Save file. */
let last = { raw: null, data: null, view: null };

export function rawView(raw, data) {
  if (last.raw === raw && last.data === data && last.view) return last.view;

  const laid = typeof raw === 'string' && raw ? formatRaw(raw) : null;
  const sameLines = !!laid && data !== undefined && countLines(laid.text) === lineSize(data);
  const shown = sameLines ? inTreeOrder(laid, data) : laid;
  let view;
  if (shown && (data === undefined || countLines(shown.text) === lineSize(data))) {
    view = { text: shown.text, copyText: laid.text, unsafe: laid.unsafe, exact: true };
  } else {
    let printed;
    try { printed = JSON.stringify(data, null, 2) || ''; } catch { printed = typeof raw === 'string' ? raw : ''; }
    view = { text: printed, copyText: sameLines ? laid.text : printed, unsafe: !!laid && laid.unsafe, exact: false };
  }
  last = { raw, data, view };
  return view;
}

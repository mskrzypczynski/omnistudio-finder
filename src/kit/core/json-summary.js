'use strict';

/* The one line at the top of every JSON viewer of an object or a list:
 * "12 keys · 3.4 KB", "8 items · 1.1 KB". The size is the value written as
 * compact JSON, in UTF-8 bytes, which is what travels and what is stored.
 *
 * Pure: no DOM, no chrome.*. */

/* Length of a text as UTF-8. */
export function utf8Length(text) {
  let bytes = 0;
  for (let at = 0; at < text.length; at++) {
    const code = text.charCodeAt(at);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && at + 1 < text.length) { bytes += 4; at++; }
    else bytes += 3;
  }
  return bytes;
}

/* The compact JSON size of a value; what JSON cannot write (undefined, a
 * cycle) counts as nothing. */
export function jsonBytes(value) {
  if (value === undefined) return 0;
  try {
    const text = JSON.stringify(value);
    return text === undefined ? 0 : utf8Length(text);
  } catch {
    return 0;
  }
}

const UNITS = ['KB', 'MB', 'GB'];

/* 0 B, 95 B, 3.4 KB, 12 KB, 1.2 MB: one decimal below 10, none above. */
export function formatBytes(bytes) {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes / 1024;
  let unit = 0;
  while (unit < UNITS.length - 1 && Math.round(value * 10) / 10 >= 1024) { value /= 1024; unit++; }
  const rounded = Math.round(value * 10) / 10;
  return `${rounded < 10 ? rounded.toFixed(1) : Math.round(value)} ${UNITS[unit]}`;
}

/* What a value is and how big: { kind, count, bytes }.
 *   kind  'object', 'list', or 'value' for anything else (a text, a number,
 *         true, false, null), 'none' for undefined
 *   count keys of an object, items of a list, 0 otherwise */
export function summarizeJson(value) {
  if (value === undefined) return { kind: 'none', count: 0, bytes: 0 };
  if (Array.isArray(value)) return { kind: 'list', count: value.length, bytes: jsonBytes(value) };
  if (value !== null && typeof value === 'object') return { kind: 'object', count: Object.keys(value).length, bytes: jsonBytes(value) };
  return { kind: 'value', count: 0, bytes: jsonBytes(value) };
}

export const SUMMARY_WORDS = Object.freeze({ key: 'key', keys: 'keys', item: 'item', items: 'items' });

/* The line itself, '' for a single value or nothing: a single value shows its
 * own type hint instead. `words` lets an extension use its glossary. */
export function summaryText(summary, words = SUMMARY_WORDS) {
  if (!summary || (summary.kind !== 'object' && summary.kind !== 'list')) return '';
  const one = summary.kind === 'object' ? words.key : words.item;
  const many = summary.kind === 'object' ? words.keys : words.items;
  return `${summary.count} ${summary.count === 1 ? one : many} · ${formatBytes(summary.bytes)}`;
}

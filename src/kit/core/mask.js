'use strict';

/* Redaction for anything that leaves an extension as text: strings and
 * numbers are replaced by placeholders, structure and keys are kept. Empty
 * strings, booleans and null stay as they are — "this field is blank" is
 * useful to a reader and says nothing about a person.
 *
 * Pure: no DOM, no chrome.*. */

export const MASK_STRING = '<string>';
export const MASK_NUMBER = '<number>';

export function maskValues(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value === '' ? '' : MASK_STRING;
  if (typeof value === 'number' || typeof value === 'bigint') return MASK_NUMBER;
  if (typeof value !== 'object') return value;
  if (depth > 200) return MASK_STRING;

  if (Array.isArray(value)) return value.map((item) => maskValues(item, depth + 1));

  const out = {};
  /* defineProperty, not assignment: a "__proto__" key from JSON.parse is an own
   * key, and assigning it would set the prototype and drop the entry. */
  Object.keys(value).forEach((key) => {
    Object.defineProperty(out, key, { value: maskValues(value[key], depth + 1), enumerable: true, writable: true, configurable: true });
  });
  return out;
}

/* Masks the values in text that is pretty-printed JSON, line by line, for a
 * selection copied out of a raw view where there is no parsed structure to
 * walk. A line is "key": value or a bare array item, value being a string or a
 * number; booleans, null, empty strings, braces and keys are left alone.
 *
 * A drag selection usually starts and ends part-way through a line, so a line
 * that is not one of the recognised whole shapes (structure only, a key
 * opening a branch, a bare true/false/null) is treated as a fragment of a
 * value and replaced outright: losing a key is better than leaking a value. */
const VALUE_LINE = /^(\s*(?:"(?:[^"\\]|\\.)*"\s*:\s*)?)("(?:[^"\\]|\\.)*"|-?\d[\d.eE+-]*)(,?\s*)$/;
const STRUCTURE_LINE = /^[\s{}[\],]*$/;
/* "key": {  /  "key": [  /  "key": {}  /  "key": [],  — an empty branch is
 * structure, not a value to hide. */
const KEY_OPENS_LINE = /^\s*"(?:[^"\\]|\\.)*"\s*:\s*(?:[{[]|\{\s*\}|\[\s*\])?\s*,?\s*$/;
const LITERAL_LINE = /^\s*(?:"(?:[^"\\]|\\.)*"\s*:\s*)?(?:true|false|null)\s*,?\s*$/;

export function maskJsonText(text) {
  return String(text).split('\n').map((line) => {
    const match = VALUE_LINE.exec(line);
    if (match) {
      const [, head, value, tail] = match;
      if (value === '""') return line;
      return `${head}${JSON.stringify(value[0] === '"' ? MASK_STRING : MASK_NUMBER)}${tail}`;
    }
    if (STRUCTURE_LINE.test(line) || KEY_OPENS_LINE.test(line) || LITERAL_LINE.test(line)) return line;
    const indent = /^\s*/.exec(line)[0];
    return `${indent}${JSON.stringify(MASK_STRING)}${/,\s*$/.test(line) ? ',' : ''}`;
  }).join('\n');
}

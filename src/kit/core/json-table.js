'use strict';

/* A list of objects as a table: one row per item, one column per key, the
 * columns in the order they first appear. A repeat block's rows and a Data
 * Mapper's extract result are exactly this, and they read far better as a
 * grid than as a tree.
 *
 * Pure: no DOM, no chrome.*. A caller that masks values masks the list before
 * it builds the table, so nothing here sees what it must not. */

export const MAX_ROWS = 500;
export const MAX_COLUMNS = 30;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/* True when the value can be shown as a table: a non-empty list whose items
 * are all objects. */
export function isTabular(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isPlainObject);
}

/* One cell: what it holds and how a grid shows it.
 *   kind   'value' (a text, number, true, false, null), 'object', 'list' or
 *          'missing' (the item has no such key)
 *   value  the value itself (undefined when missing)
 *   count  keys or items, for an object or a list */
function cellOf(item, key) {
  if (!Object.prototype.hasOwnProperty.call(item, key)) return { kind: 'missing', value: undefined, count: 0 };
  const value = item[key];
  if (Array.isArray(value)) return { kind: 'list', value, count: value.length };
  if (isPlainObject(value)) return { kind: 'object', value, count: Object.keys(value).length };
  return { kind: 'value', value, count: 0 };
}

/* The table of a list, or null when it is not tabular.
 *   columns     the keys shown, first appearance first
 *   rows        [{ index, cells: [cell per column] }], index counting from 0
 *   totalRows / totalColumns  before the limits
 *   rowsCut / columnsCut      whether a limit hid some */
export function tableOf(value, { maxRows = MAX_ROWS, maxColumns = MAX_COLUMNS } = {}) {
  if (!isTabular(value)) return null;
  const keys = [];
  const seen = new Set();
  value.forEach((item) => Object.keys(item).forEach((key) => {
    if (!seen.has(key)) { seen.add(key); keys.push(key); }
  }));
  const columns = keys.slice(0, maxColumns);
  const rows = value.slice(0, maxRows).map((item, index) => ({ index, cells: columns.map((key) => cellOf(item, key)) }));
  return {
    columns,
    rows,
    totalRows: value.length,
    totalColumns: keys.length,
    rowsCut: value.length > maxRows,
    columnsCut: keys.length > maxColumns
  };
}

/* A cell as one line of text: values as JSON would write them (texts without
 * quotes), an object or list as compact JSON, a missing key as nothing. Tabs
 * and line breaks become spaces so a pasted table keeps its shape. */
export function cellText(cell) {
  if (cell.kind === 'missing') return '';
  const text = cell.kind === 'value' && typeof cell.value === 'string' ? cell.value : JSON.stringify(cell.value);
  return String(text === undefined ? '' : text).replace(/[\t\r\n]+/g, ' ');
}

/* The table as tab-separated text, header first: it pastes into a
 * spreadsheet as columns. */
export function tableText(table) {
  if (!table) return '';
  const lines = [table.columns.map((key) => key.replace(/[\t\r\n]+/g, ' ')).join('\t')];
  table.rows.forEach((row) => lines.push(row.cells.map(cellText).join('\t')));
  return lines.join('\n');
}

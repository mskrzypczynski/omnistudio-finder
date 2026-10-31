'use strict';

/* The shape of a JSON document without its values: every key with its type,
 * and in a list of objects, which keys only some items have. For designing a
 * Data Mapper, or for seeing what a call returns, without reading the data.
 * Since there are no values, a shape never needs masking.
 *
 * Pure: no DOM, no chrome.*. */

export const MAX_DEPTH = 40;

const typeOf = (value) => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'list';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'string') return 'text';
  if (typeof value === 'number' || typeof value === 'bigint') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'other';
};

const isObject = (value) => typeOf(value) === 'object';

/* The shape of one place in the document, from every value found there (one
 * for a key of an object, all the items for the items of a list):
 *   types  the types found, in the order first met
 *   keys   for objects: [{ key, shape, present, of }], present of the `of`
 *          objects found here having that key
 *   count / item  for lists: how many items in all, and their shape */
function shapeOfValues(values, depth) {
  const types = [];
  values.forEach((value) => { const type = typeOf(value); if (!types.includes(type)) types.push(type); });
  const shape = { types };
  if (depth >= MAX_DEPTH) return shape;

  const objects = values.filter(isObject);
  if (objects.length) {
    const order = [];
    const seen = new Set();
    objects.forEach((object) => Object.keys(object).forEach((key) => {
      if (!seen.has(key)) { seen.add(key); order.push(key); }
    }));
    shape.keys = order.map((key) => {
      const holders = objects.filter((object) => Object.prototype.hasOwnProperty.call(object, key));
      return { key, shape: shapeOfValues(holders.map((object) => object[key]), depth + 1), present: holders.length, of: objects.length };
    });
  }

  const lists = values.filter(Array.isArray);
  if (lists.length) {
    const items = lists.flat();
    shape.count = items.length;
    shape.item = items.length ? shapeOfValues(items, depth + 1) : null;
  }
  return shape;
}

export function shapeOf(value) {
  return shapeOfValues([value], 0);
}

export const TYPE_WORDS = Object.freeze({
  object: 'object', list: 'list', text: 'text', number: 'number', boolean: 'true/false', null: 'null', other: 'other'
});

/* A shape in words: "text or null", "list of 3 × object". */
export function describeShape(shape, words = TYPE_WORDS) {
  return shape.types.map((type) => {
    if (type !== 'list') return words[type] || type;
    return `${words.list} of ${shape.count} × ${shape.item ? describeShape(shape.item, words) : 'nothing'}`;
  }).join(' or ');
}

/* The shape as lines, one per key: { depth, key, text, optional, present, of }.
 * The keys of a list's items are one level deeper than the list. */
export function shapeLines(shape, words = TYPE_WORDS) {
  const lines = [];
  const walk = (node, depth) => {
    (node.keys || []).forEach((entry) => {
      lines.push({
        depth, key: entry.key, text: describeShape(entry.shape, words),
        optional: entry.present < entry.of, present: entry.present, of: entry.of
      });
      walk(entry.shape, depth + 1);
    });
    /* The items' keys sit under the list's own line, at the level its keys
     * would have. */
    if (node.item) walk(node.item, depth);
  };
  walk(shape, 0);
  return lines;
}

/* The shape as text, two spaces per level; a key that only some items have
 * says in how many: "Note: text (in 2 of 3)". */
export function shapeText(shape, words = TYPE_WORDS) {
  return shapeLines(shape, words)
    .map((line) => `${'  '.repeat(line.depth)}${line.key}: ${line.text}${line.optional ? ` (in ${line.present} of ${line.of})` : ''}`)
    .join('\n');
}

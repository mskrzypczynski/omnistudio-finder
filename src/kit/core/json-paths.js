'use strict';

/* Every value of a JSON document on its own line, with its place written the
 * way OmniScript writes a path: keys joined by colons, a position in a list
 * as |N on the list's key, counting from 1.
 *   { Step: { Rows: [{ Code: 'A' }, { Code: 'B' }] } }
 *   Step:Rows|1:Code = "A"
 *   Step:Rows|2:Code = "B"
 * Easy to search and copy, and the place of a value is the text of its
 * %merge% field.
 *
 * Pure: no DOM, no chrome.*. A caller that masks values masks the document
 * first. */

export const MAX_LINES = 5000;

/* Keys and positions from the root as an OmniScript path. A position right
 * under the root, or under another position, is written |N on its own. */
export function omniscriptPath(segments) {
  let text = '';
  segments.forEach((segment) => {
    if (typeof segment === 'number') text += `|${segment + 1}`;
    else text += (text ? ':' : '') + segment;
  });
  return text;
}

const isContainer = (value) => value !== null && typeof value === 'object';

/* The lines of a document, depth first in the order the keys are written.
 * A leaf is a single value or an empty object or list ({} and [] are shown,
 * so nothing disappears). { lines: [{ path, segments, value }], cut } */
export function pathsOf(value, { maxLines = MAX_LINES } = {}) {
  const lines = [];
  let cut = false;
  const walk = (node, segments) => {
    if (lines.length >= maxLines) { cut = true; return; }
    const entries = Array.isArray(node)
      ? node.map((item, at) => [at, item])
      : isContainer(node) ? Object.keys(node).map((key) => [key, node[key]]) : null;
    if (!entries || entries.length === 0) {
      lines.push({ path: omniscriptPath(segments), segments, value: node });
      return;
    }
    entries.forEach(([segment, child]) => walk(child, segments.concat([segment])));
  };
  walk(value, []);
  return { lines, cut };
}

/* One line as text: "Step:Rows|1:Code = "A"". A value at the root has no
 * path and is written alone. */
export function pathLine(line) {
  const written = line.value === undefined ? 'undefined' : JSON.stringify(line.value);
  return line.path ? `${line.path} = ${written}` : written;
}

export function pathsText(result) {
  return result.lines.map(pathLine).join('\n');
}

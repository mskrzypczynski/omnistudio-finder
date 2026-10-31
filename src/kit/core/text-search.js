'use strict';

/* Finding a query in a block of text, for the raw view.
 *
 * Pure: no DOM, no chrome.*. */

/* A global, case-insensitive matcher for a literal query. */
export function caseInsensitive(query) {
  return new RegExp(String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
}

export function countLines(text) {
  if (!text) return 0;
  let lines = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lines++;
  return lines;
}

/* The text cut into { text, match } pieces, case-insensitively, for
 * highlighting. At most `max` matches are marked; `total` counts them all. */
export function splitByQuery(text, query, max = 2000) {
  if (!query) return { pieces: [{ text, match: false }], total: 0 };

  /* A case-insensitive RegExp over the original text: lowercasing the text
   * first can change its length (İ becomes two units), which would shift every
   * offset after it. */
  const finder = caseInsensitive(query);
  const pieces = [];
  let from = 0;
  let total = 0;
  let found = finder.exec(text);

  while (found) {
    total++;
    if (total <= max) {
      if (found.index > from) pieces.push({ text: text.slice(from, found.index), match: false });
      pieces.push({ text: found[0], match: true });
      from = found.index + found[0].length;
    }
    found = finder.exec(text);
  }
  if (from < text.length) pieces.push({ text: text.slice(from), match: false });
  return { pieces, total };
}

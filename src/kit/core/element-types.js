'use strict';

/* What the OmniScript designers know about each element type, looked up by
 * the stored type name (OmniProcessElement.Type, and `type` in a definition
 * JSON), which is the same in core OmniStudio and the Vlocity packages. Core
 * relabels some types in its palette only, so match on the stored name:
 * Decision Matrix is "Matrix Action", HTTP is "Rest Action", Messaging is
 * "Validation".
 *
 * A type the table does not know (a managed package can register types at
 * runtime) gets a generic "other" entry, never a throw.
 *
 * Pure: no DOM, no chrome.*. */

import { ELEMENT_TYPE_ROWS } from './element-type-table.js';

/* The designer's palette groups, as lowercase keys, plus "other" for a type
 * the designer puts in no group or the table does not know. */
export const ELEMENT_CATEGORIES = Object.freeze(['groups', 'inputs', 'display', 'functions', 'actions', 'omniscripts', 'other']);

function freezeEntry(row, known) {
  const category = typeof row.category === 'string' ? row.category.toLowerCase() : '';
  return Object.freeze({
    type: row.type,
    known,
    category: ELEMENT_CATEGORIES.includes(category) ? category : 'other',
    /* null in the table means the designers were not read for it (Integration
     * Procedure types); that is kept, so a caller can tell "no" from "unknown". */
    container: typeof row.container === 'boolean' ? row.container : null,
    coreDesigner: row.coreDesigner === true,
    managedDesigner: row.managedDesigner === true,
    coreOnly: row.coreDesigner === true && row.managedDesigner !== true,
    corePalette: typeof row.corePalette === 'string' ? row.corePalette : null,
    corePicklist: row.corePicklist === true,
    allowedChildren: Object.freeze(Array.isArray(row.allowedChildren) ? row.allowedChildren.slice() : []),
    allowedChildrenOnlyInCore: Object.freeze(Array.isArray(row.allowedChildrenOnlyInCore) ? row.allowedChildrenOnlyInCore.slice() : []),
    rejectedConditions: Array.isArray(row.rejectedConditions) ? Object.freeze(row.rejectedConditions.slice()) : null
  });
}

export const ELEMENT_TYPES = Object.freeze(ELEMENT_TYPE_ROWS.map((row) => freezeEntry(row, true)));

const BY_NAME = new Map(ELEMENT_TYPES.map((entry) => [entry.type, entry]));
/* A second index ignoring case, for a hand-typed name or an older export
 * that capitalised differently; the exact name always wins. */
const BY_LOWER_NAME = new Map(ELEMENT_TYPES.map((entry) => [entry.type.toLowerCase(), entry]));

function unknownEntry(type) {
  return freezeEntry({ type, category: null, container: false }, false);
}

/* The table's entry for a stored type name, or a generic "other" entry. */
export function elementType(type) {
  const name = typeof type === 'string' ? type.trim() : '';
  return BY_NAME.get(name) || BY_LOWER_NAME.get(name.toLowerCase()) || unknownEntry(name);
}

export function isKnownType(type) {
  return elementType(type).known;
}

export function categoryOf(type) {
  return elementType(type).category;
}

/* True only when the designer says the type holds child elements. */
export function isContainer(type) {
  return elementType(type).container === true;
}

/* The types the core designer lets you put inside this one; empty for a type
 * that holds none or that the table does not know. */
export function allowedChildren(type) {
  return elementType(type).allowedChildren;
}

/* In the core designer's registry and not in the managed package's. */
export function isCoreOnly(type) {
  return elementType(type).coreOnly;
}

/* The label the core palette shows, or null when the palette doesn't show the
 * type (hidden behind a feature, or unknown). */
export function paletteLabel(type) {
  return elementType(type).corePalette;
}

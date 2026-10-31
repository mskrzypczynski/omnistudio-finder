'use strict';

/* Telling a failed OmniStudio answer from a successful one when the HTTP
 * status says 200. OmniStudio payloads often carry an `error` key that is not
 * an error: Data Mapper and Integration Procedure responses routinely come
 * back with error: "OK" or error: false, and errorCode holds the status even
 * when the call worked ("INVOKE-200"). Flagging those would mark almost every
 * successful call as broken, so only a meaningful value counts.
 *
 * Pure: no DOM, no chrome.*. */

const BENIGN_ERROR_VALUES = ['ok', 'false', 'no', 'none', 'null', 'success', '0', ''];

/* A success code spelled as an error code: "INVOKE-200", "200", "OK-201".
 * OmniStudio fills errorCode with the status even when the call worked. */
const SUCCESS_CODE = /(^|-)2\d\d$/;

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

/* Does this value (the content of an error, errors or errorCode key) mean
 * something went wrong? null, false, 0, an empty list, a 2xx number or code,
 * "OK" and friends, and an object whose every value is itself empty do not. */
export function isRealError(value, depth = 0) {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    return !BENIGN_ERROR_VALUES.includes(text) && !SUCCESS_CODE.test(text);
  }
  if (typeof value === 'number') return value !== 0 && !(value >= 200 && value < 300);
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') {
    // { code: null, message: null } is an empty error slot, not an error.
    if (depth > 3) return true;
    return Object.keys(value).some((key) => isRealError(value[key], depth + 1));
  }
  return !!value;
}

/* A value as one short line, for a reason or a status: strings as they are,
 * anything else as JSON, cut at `max` characters. */
export function brief(value, max = 120) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

/* Why an object says, by its own flags, that it went wrong, or null: the
 * flags every answer can carry at its root (hasErrors, success: false, an
 * errorCode, an IPResult that signals failure, error, errors), in that order.
 * `say` turns a value into the text quoted in the reason (brief by default;
 * pass one that masks values where they must not be shown). Anything that is
 * not a plain object has no flags, so a list or a string gives null. */
export function payloadFailure(root, say = brief) {
  if (!isPlainObject(root)) return null;
  if (root.hasErrors === true) return 'Response sets hasErrors: true';
  if (root.success === false) {
    return `Response sets success: false${isRealError(root.error) ? ` — ${say(root.error)}` : ''}`;
  }
  if (isRealError(root.errorCode)) return `Response errorCode — ${say(root.errorCode)}`;

  // An Integration Procedure may nest an IPResult node that signals failure
  // explicitly. Match the key case-insensitively and treat success: false or
  // a meaningful error as a failure marker.
  try {
    const ipResultKey = Object.keys(root).find((key) => key.toLowerCase() === 'ipresult');
    if (ipResultKey) {
      const ipResult = root[ipResultKey];
      if (ipResult && typeof ipResult === 'object') {
        if (ipResult.success === false) return `IPResult indicates failure — ${say(ipResult.error || ipResult)}`;
        if (isRealError(ipResult.error)) return `IPResult indicates failure — ${say(ipResult.error)}`;
      }
    }
  } catch {
    /* defensive: root may not be enumerable */
  }

  if (isRealError(root.error)) return `Response error — ${say(root.error)}`;
  if (isRealError(root.errors)) return `Response errors — ${say(root.errors)}`;
  return null;
}

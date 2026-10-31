'use strict';

/* The inspected page, as a DevTools panel reaches it, behind one interface
 * for every browser: run an expression in it, reload it, list its frames'
 * documents, and hear about its requests and navigations. A panel calls only
 * this module, never chrome.devtools directly, so the browser differences
 * live here and nowhere else.
 *
 * Chromium (Chrome, Edge, Brave, Opera…) and Firefox share chrome.devtools,
 * but Firefox runs every expression in the top document only (no frameURL)
 * and has no getResources. What a browser can do is in `can`, which the panel
 * asks the way it asks for any other capability:
 *   can.frames     an expression can be run in a chosen frame;
 *   can.resources  the documents of the page's frames can be listed.
 * Errors come back in one shape, { isException, isError, value, code,
 * description }, whichever browser produced them. */

export const CHROMIUM = 'chromium';
export const FIREFOX = 'firefox';

/* Firefox alone has runtime.getBrowserInfo; Chromium has no `browser` global
 * at all. Feature detection, not the user agent, which a user can change. */
export function detectBrowser(globals = globalThis) {
  const runtime = globals.browser && globals.browser.runtime;
  return runtime && typeof runtime.getBrowserInfo === 'function' ? FIREFOX : CHROMIUM;
}

/* One shape for an evaluation error: Chromium sets isException/value or
 * isError/code/description/details, Firefox isException/value or
 * isError/code. undefined when there is no error. */
export function normalizeException(info) {
  if (!info) return undefined;
  return {
    isException: info.isException === true,
    isError: info.isError === true,
    value: info.value,
    code: info.code,
    description: info.description || (typeof info.value === 'string' ? info.value : info.code)
  };
}

const NO_FRAMES = Object.freeze({
  isException: false,
  isError: true,
  value: undefined,
  code: 'E_NO_FRAMES',
  description: 'This browser can only read the top document of the page, not a frame inside it.'
});

/* `api` is the chrome object, or a function that returns it; by default
 * chrome is looked up on every call, so a panel (or a test) that replaces it
 * after the page was created is still heard. */
export function createPage({ api = () => globalThis.chrome, browser = detectBrowser() } = {}) {
  const devtools = () => {
    const chrome = typeof api === 'function' ? api() : api;
    return (chrome && chrome.devtools) || {};
  };
  const inspected = () => devtools().inspectedWindow;
  const network = () => devtools().network;
  const chromium = browser === CHROMIUM;

  const can = Object.freeze({
    frames: chromium,
    get resources() {
      const window = inspected();
      return chromium && !!window && typeof window.getResources === 'function';
    }
  });

  /* callback(result, exception): exception is undefined on success. A frame
   * asked for where frames are not supported is an error, not a silent run in
   * the top document, which would read the wrong script. */
  function evaluate(expression, options, callback) {
    const done = typeof options === 'function' ? options : callback;
    const { frame } = typeof options === 'function' ? {} : (options || {});
    const reply = (result, info) => { if (done) done(result, normalizeException(info)); };
    if (frame && !can.frames) { reply(undefined, NO_FRAMES); return; }
    if (frame) inspected().eval(expression, { frameURL: frame }, reply);
    else inspected().eval(expression, reply);
  }

  /* The URLs of the page's documents (top and frames), [] where the browser
   * cannot list them. */
  function documentUrls(callback) {
    if (!can.resources) { callback([]); return; }
    inspected().getResources((resources) => {
      callback((resources || []).filter((resource) => resource && resource.type === 'document').map((resource) => resource.url));
    });
  }

  return Object.freeze({
    browser,
    can,
    eval: evaluate,
    documentUrls,
    reload: (options) => (options ? inspected().reload(options) : inspected().reload()),
    onRequestFinished: (listener) => network().onRequestFinished.addListener(listener),
    onNavigated: (listener) => network().onNavigated.addListener(listener),
    /* 'default' or 'dark' in Chromium, 'light' or 'dark' in Firefox; null
     * outside DevTools. */
    themeName: () => (devtools().panels ? devtools().panels.themeName || null : null)
  });
}

import js from "@eslint/js";
import globals from "globals";

// The one rule with teeth here is `no-restricted-globals` under src/core/**:
// core modules are pure by contract, and reaching for the DOM, `chrome` or the
// network there is the mistake the split exists to prevent. See CONTRIBUTING.md.
const CORE_BANNED = [
  "document",
  "window",
  "chrome",
  "navigator",
  "fetch",
  "XMLHttpRequest",
  "localStorage",
  "sessionStorage",
];

export default [
  { ignores: ["node_modules/**"] },
  js.configs.recommended,

  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.webextensions },
    },
    rules: {
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },

  {
    files: ["src/core/**/*.js", "src/kit/core/**/*.js"],
    languageOptions: {
      globals: {}, // no browser, no webextensions — core is pure
    },
    rules: {
      "no-restricted-globals": [
        "error",
        ...CORE_BANNED.map((name) => ({
          name,
          message:
            "src/core/ is pure — no DOM, chrome.* or network here. Put the effect in src/ui/ and pass the value in. See CONTRIBUTING.md.",
        })),
      ],
    },
  },

  {
    files: ["test/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node, ...globals.jest, ...globals.browser },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },

  {
    files: ["jest.config.js", "eslint.config.js", "scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-var": "error",
      "prefer-const": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },

  {
    // The store-asset scripts hand some functions to the browser to run in the
    // page (installStub, page.evaluate callbacks), so those see browser globals.
    files: ["scripts/screenshots.mjs", "scripts/marketing.mjs"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
];

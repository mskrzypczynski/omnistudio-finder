// Jest runs the real ES modules under src/ with no Babel — Node's own ESM
// loader via `--experimental-vm-modules` (set in the npm scripts). Three
// projects, matching the layers described in CONTRIBUTING.md.

export default {
  projects: [
    {
      displayName: "core",
      testEnvironment: "node",
      testMatch: ["<rootDir>/test/core/**/*.test.js"],
    },
    {
      displayName: "ui",
      testEnvironment: "jsdom",
      testMatch: ["<rootDir>/test/ui/**/*.test.js"],
    },
    {
      displayName: "wiring",
      testEnvironment: "jsdom",
      testMatch: ["<rootDir>/test/wiring.test.js"],
    },
  ],
};

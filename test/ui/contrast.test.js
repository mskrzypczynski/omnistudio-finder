import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// jsdom does no layout or colour maths, so the WCAG AA contrast of the colour
// tokens is checked on the stylesheets themselves: every text colour against
// every surface it is drawn on, in both themes.

const read = (name) => readFileSync(fileURLToPath(new URL(`../../${name}`, import.meta.url)), "utf8");

/** Dark tokens are the :root defaults; light overrides them in the media query. */
function themes(css) {
  const blocks = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const tokens = (block) =>
    Object.fromEntries(
      [...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]])
    );
  const dark = tokens(blocks[0]);
  return { dark, light: { ...dark, ...tokens(blocks[1]) } };
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** [text token, surface tokens it sits on] */
const POPUP_PAIRS = [
  ["fg", ["bg", "raised", "hover"]],
  ["dim", ["bg", "raised", "hover", "chip-bg", "btn", "btn-hover"]],
  ["faint", ["bg", "raised", "hover", "chip-bg"]],
  ["attention", ["bg", "hover"]],
  ["seg-on-fg", ["seg-on-bg"]],
  ["open-hot-fg", ["open-hot-bg"]],
];

const OPTIONS_PAIRS = [
  ["fg", ["bg", "raised"]],
  ["dim", ["bg", "raised"]],
  ["faint", ["bg", "raised", "input-bg"]],
];

for (const [file, pairs] of [
  ["popup.css", POPUP_PAIRS],
  ["options.css", OPTIONS_PAIRS],
]) {
  describe(`${file} colour tokens`, () => {
    const all = themes(read(file));
    for (const theme of ["light", "dark"]) {
      test.each(pairs.flatMap(([fg, bgs]) => bgs.map((bg) => [fg, bg])))(
        `${theme}: %s on %s is at least 4.5:1`,
        (fg, bg) => {
          expect(all[theme][fg]).toBeDefined();
          expect(all[theme][bg]).toBeDefined();
          expect(ratio(all[theme][fg], all[theme][bg])).toBeGreaterThanOrEqual(4.5);
        }
      );
    }
  });
}

test("the pressed filter button has its own fill, not the hover colour", () => {
  const css = read("popup.css");
  const on = css.match(/\.seg\.on\s*\{([^}]*)\}/)[1];
  expect(on).toContain("var(--seg-on-bg)");
  expect(on).toContain("var(--seg-on-fg)");
});

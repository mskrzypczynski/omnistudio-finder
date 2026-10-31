#!/usr/bin/env node
'use strict';

/* Renders the Chrome Web Store marketing images from the real popup
 * screenshots.
 *
 *   npm run screenshots   # first: the raw popup screenshots
 *   npm run marketing
 *
 * Writes store/marketing/*.png, each exactly the size the dashboard asks for,
 * 24-bit RGB (no alpha):
 *   marketing-1..5-*.png      1280x800  headline + chips + popup screenshot
 *   promo-small-440x280.png   small promo tile
 *   promo-marquee-1400x560.png marquee promo tile
 *
 * Each image is an HTML template rendered by headless Chromium at device
 * scale factor 1. Playwright and Chromium are found exactly as in
 * screenshots.mjs (shared in lib/store-assets.mjs); nothing is downloaded at
 * run time, and no web fonts are used: the font stack below resolves to a
 * font installed with the system (Arial maps to Liberation Sans on Linux).
 *
 * Every claim in the copy comes from store/description.txt. Keep it that way.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flattenPng, launch, loadPlaywright } from './lib/store-assets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS_DIR = path.join(ROOT, 'store', 'screenshots');
const OUT_DIR = path.join(ROOT, 'store', 'marketing');
const ICON = path.join(ROOT, 'icons', 'icon128.png');

/* Brand colours, sampled from icons/icon128.png: the dark tile and its
 * cyan bar. (Named ACCENT rather than by hue so the CSS below reads the same
 * whichever bar it is taken from.) */
const CHARCOAL = '#15171c';
const ACCENT = '#3fbfd6';

/* ----------------------------------------------------------------- copy */

const SCREENSHOTS = [
  {
    file: 'marketing-1-find.png', source: '1-all-assets.png',
    headline: 'Every OmniStudio asset, one keystroke away',
    subline: 'OmniScripts, Integration Procedures, DataRaptors and FlexCards in the org you are on.',
    chips: ['Alt+O', 'Live from the org', 'Both OmniStudio flavours']
  },
  {
    file: 'marketing-2-key.png', source: '2-key-search.png',
    headline: 'Paste a Type_SubType_Language',
    subline: 'Search by name, type, subtype, language, author or the script key.',
    chips: ['Type_SubType_Language', 'Any word order']
  },
  {
    file: 'marketing-3-versions.png', source: '3-version-history.png',
    headline: 'Every version at once',
    subline: 'The active one marked, any version one click away.',
    chips: ['Active version first', 'Full history']
  },
  {
    file: 'marketing-4-help.png', source: '4-help-light.png',
    headline: 'Light or dark, keyboard first',
    subline: 'Arrow keys to move, Enter to open the active version.',
    chips: ['Keyboard', 'Follows your theme']
  },
  {
    file: 'marketing-5-settings.png', source: '5-settings.png',
    headline: 'The right designer, detected',
    subline: 'Core builders or the managed-package designers, chosen for you.',
    chips: ['No server', 'No analytics', 'Free']
  }
];

const PRODUCT = 'OmniStudio Finder';
const TAGLINE = 'Find any OmniStudio asset. Open the right version.';
const DISCLAIMER = 'Unofficial tool · not affiliated with Salesforce';

/* ---------------------------------------------------------------- html */

const FONT = '"Segoe UI", "Helvetica Neue", Arial, "Liberation Sans", sans-serif';

const dataUri = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
const escapeHtml = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 100%; height: 100%; overflow: hidden; }
  body {
    position: relative; font-family: ${FONT}; color: #f2f5f9;
    -webkit-font-smoothing: antialiased;
    background:
      radial-gradient(900px 520px at 6% -12%, rgba(63, 191, 214, 0.17), transparent 62%),
      radial-gradient(760px 520px at 104% 112%, rgba(63, 191, 214, 0.11), transparent 62%),
      radial-gradient(rgba(255, 255, 255, 0.045) 1px, transparent 1.4px) 0 0 / 26px 26px,
      linear-gradient(160deg, #101a27, ${CHARCOAL} 55%, #0a1019);
  }
  .abs { position: absolute; }
  .chip {
    display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 15px 0 12px;
    border-radius: 16px; font-size: 15px; font-weight: 600; color: #a9e9f4;
    background: rgba(63, 191, 214, 0.12); border: 1px solid rgba(63, 191, 214, 0.38);
  }
  .chip::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: ${ACCENT}; }
  .frame {
    position: absolute; overflow: hidden; border-radius: 12px; background: #fff;
    border: 1px solid rgba(255, 255, 255, 0.16);
    box-shadow: 0 34px 70px rgba(0, 0, 0, 0.55), 0 10px 24px rgba(0, 0, 0, 0.4), 0 0 90px rgba(63, 191, 214, 0.09);
  }
  .bar {
    position: relative; height: 30px; background: #1a2331; border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 600; letter-spacing: 0.02em; color: #8f9bad;
  }
  .bar .dots { position: absolute; left: 13px; top: 10px; display: flex; gap: 7px; }
  .bar .dots i { width: 10px; height: 10px; border-radius: 50%; background: #3a4558; }
  .bar b { color: ${ACCENT}; font-weight: 700; margin-right: 6px; }
  .shot { position: relative; overflow: hidden; }
  .shot img { position: absolute; left: 0; top: 0; display: block; transform-origin: 0 0; }
  .footer { color: rgba(176, 190, 210, 0.42); font-size: 12.5px; }
`;

/* The screenshot is shown at width `frameWidth`, scaled by `scale`
 * (frameWidth / 1280 by default, i.e. the whole width), starting `offsetX`
 * source pixels from the left and cropped to `shotHeight` rows from the top. */
function frameHtml({ src, left, top, frameWidth, shotHeight, scale = frameWidth / 1280, offsetX = 0, extraStyle = '' }) {
  return `<div class="frame" style="left:${left}px;top:${top}px;width:${frameWidth}px;${extraStyle}">
    <div class="shot" style="height:${shotHeight}px">
      <img src="${src}" width="1280" height="800" style="left:${-offsetX * scale}px;transform:scale(${scale})" alt="">
    </div>
  </div>`;
}

function screenshotPage(item, iconSrc) {
  const margin = 48;
  const frameWidth = 1280 - 2 * margin;
  const top = 200;
  const bottom = 758;
  const shotHeight = bottom - top;
  return `<!doctype html><meta charset="utf-8"><style>${BASE_CSS}
    h1 { position: absolute; left: ${margin}px; top: 34px; width: 1020px; font-size: 52px; line-height: 60px; font-weight: 800; letter-spacing: -0.015em; white-space: nowrap; }
    h1 em { font-style: normal; color: ${ACCENT}; }
    .sub { left: ${margin}px; top: 100px; font-size: 23px; line-height: 30px; color: #b9c5d6; white-space: nowrap; }
    .chips { left: ${margin}px; top: 147px; display: flex; gap: 10px; }
    .mark { right: ${margin}px; top: 36px; width: 56px; height: 56px; }
    .foot { left: ${margin}px; right: ${margin}px; top: 770px; height: 20px; display: flex; align-items: center; justify-content: space-between; }
    .foot .brand { display: flex; align-items: center; gap: 8px; }
    .foot img { width: 18px; height: 18px; display: block; }
  </style>
  <h1>${escapeHtml(item.headline)}</h1>
  <p class="abs sub">${escapeHtml(item.subline)}</p>
  <div class="abs chips">${item.chips.map((c) => `<span class="chip">${escapeHtml(c)}</span>`).join('')}</div>
  <img class="abs mark" src="${iconSrc}" alt="">
  ${frameHtml({ src: dataUri(path.join(SHOTS_DIR, item.source)), left: margin, top, frameWidth, shotHeight })}
  <div class="abs foot footer"><span class="brand"><img src="${iconSrc}" alt="">${PRODUCT}</span><span>${DISCLAIMER}</span></div>`;
}

function smallTilePage(iconSrc) {
  return `<!doctype html><meta charset="utf-8"><style>${BASE_CSS}
    body { background:
      radial-gradient(360px 240px at 50% -10%, rgba(63, 191, 214, 0.2), transparent 65%),
      radial-gradient(rgba(255, 255, 255, 0.045) 1px, transparent 1.4px) 0 0 / 22px 22px,
      linear-gradient(160deg, #101a27, ${CHARCOAL} 60%, #0a1019); }
    .col { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 0 28px; }
    .col img { width: 84px; height: 84px; display: block; margin-bottom: 14px; filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.5)); }
    .name { font-size: 27px; line-height: 30px; font-weight: 800; letter-spacing: -0.01em; }
    .name span { color: ${ACCENT}; }
    .rule { width: 44px; height: 3px; border-radius: 2px; background: ${ACCENT}; margin: 13px 0 12px; }
    .tag { font-size: 16px; line-height: 21px; color: #c3cedd; }
  </style>
  <div class="col"><img src="${iconSrc}" alt="">
    <div class="name">OmniStudio <span>Finder</span></div>
    <div class="rule"></div>
    <div class="tag">${TAGLINE}</div></div>`;
}

function marqueePage(iconSrc) {
  // The popup sits at the right of the screenshot: show that side, larger.
  const frameWidth = 620;
  const scale = 0.9;
  return `<!doctype html><meta charset="utf-8"><style>${BASE_CSS}
    .copy { left: 64px; top: 0; bottom: 0; width: 640px; display: flex; flex-direction: column; justify-content: center; padding-bottom: 14px; }
    .brand { display: flex; align-items: center; gap: 16px; margin-bottom: 26px; }
    .brand img { width: 72px; height: 72px; display: block; filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.5)); }
    .brand span { font-size: 26px; font-weight: 800; letter-spacing: -0.01em; }
    .brand span i { font-style: normal; color: ${ACCENT}; }
    h1 { font-size: 56px; line-height: 64px; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 26px; }
    .chips { display: flex; gap: 10px; }
    .foot { left: 64px; bottom: 26px; }
  </style>
  <div class="abs copy">
    <div class="brand"><img src="${iconSrc}" alt=""><span>OmniStudio <i>Finder</i></span></div>
    <h1>Find it.<br>Open the right<br>version.</h1>
    <div class="chips">${['Search', 'Every version', 'Right designer'].map((c) => `<span class="chip">${c}</span>`).join('')}</div>
  </div>
  ${frameHtml({
    src: dataUri(path.join(SHOTS_DIR, '1-all-assets.png')), left: 720, top: 70, frameWidth, shotHeight: 430,
    scale, offsetX: 1280 - frameWidth / scale,
    extraStyle: 'transform: rotate(-3deg); transform-origin: 50% 50%;'
  })}
  <div class="abs foot footer">${DISCLAIMER}</div>`;
}

/* --------------------------------------------------------------- render */

const IMAGES = (iconSrc) => [
  ...SCREENSHOTS.map((item) => ({ file: item.file, width: 1280, height: 800, html: screenshotPage(item, iconSrc) })),
  { file: 'promo-small-440x280.png', width: 440, height: 280, html: smallTilePage(iconSrc) },
  { file: 'promo-marquee-1400x560.png', width: 1400, height: 560, html: marqueePage(iconSrc) }
];

/* Reads the PNG header back from disk so a wrong size or an alpha channel
 * fails the run instead of failing the store upload. */
function verify(file, width, height) {
  const buffer = readFileSync(file);
  const w = buffer.readUInt32BE(16);
  const h = buffer.readUInt32BE(20);
  const depth = buffer[24];
  const colorType = buffer[25];
  if (w !== width || h !== height || depth !== 8 || colorType !== 2) {
    throw new Error(`${path.basename(file)}: expected ${width}x${height} 24-bit RGB, got ${w}x${h}, depth ${depth}, colour type ${colorType}`);
  }
}

async function main() {
  const only = process.argv.slice(2);
  const missing = SCREENSHOTS.map((item) => item.source).filter((name) => !existsSync(path.join(SHOTS_DIR, name)));
  if (missing.length) throw new Error(`Missing store/screenshots/${missing.join(', ')}. Run npm run screenshots first.`);

  const { chromium } = loadPlaywright();
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await launch(chromium);
  try {
    for (const image of IMAGES(dataUri(ICON))) {
      if (only.length && !only.some((name) => image.file.includes(name))) continue;
      console.log(image.file);
      const page = await browser.newPage({ viewport: { width: image.width, height: image.height }, deviceScaleFactor: 1 });
      await page.setContent(image.html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const png = await page.screenshot({ type: 'png' });
      await page.close();
      const file = path.join(OUT_DIR, image.file);
      writeFileSync(file, flattenPng(png, [14, 22, 33]));
      verify(file, image.width, image.height);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

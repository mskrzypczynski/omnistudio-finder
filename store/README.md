# Chrome Web Store assets

`screenshots/` holds the listing screenshots of the real popup and Settings page, rendered
against a fictional org (demo data in `scripts/screenshots.mjs`). Regenerate them after any
visible UI change with `npm run screenshots` (needs Playwright and Chromium installed globally;
nothing is added to package.json). The store wants 1280x800 (or 640x400) 24-bit PNGs, at most 5;
the script writes exactly 1280x800 without alpha.

`marketing/` holds the store marketing images, built from those screenshots by
`npm run marketing` (run `npm run screenshots` first; same Playwright requirement, no font downloads).
Each is an HTML template rendered at exactly its size as a 24-bit RGB PNG, and the script checks the
size and colour type of every file it writes. All copy is taken from `description.txt`; edit it in
`scripts/marketing.mjs`. Where each file goes in the dashboard:

| File | Size | Dashboard slot |
| --- | --- | --- |
| `marketing-1-find.png` ... `marketing-5-settings.png` | 1280x800 | Screenshots (up to 5, in this order) |
| `promo-small-440x280.png` | 440x280 | Small promo tile |
| `promo-marquee-1400x560.png` | 1400x560 | Marquee promo tile |

The raw screenshots in `screenshots/` stay available as plain alternatives.
The marketing screenshots and the marquee carry the line "Unofficial tool · not affiliated with Salesforce"; the small tile
omits it to stay legible.

`description.txt` is the Chrome Web Store listing text; paste it into the
dashboard when releasing and keep it in step with the popup.

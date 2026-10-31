# OmniStudio Finder

Unofficial developer tool. A Chrome toolbar popup that lists the **OmniScripts,
Integration Procedures, DataRaptors / Data Mappers and FlexCards** in the
Salesforce org you're logged into — every version — and opens the right one in
the correct designer.

Shortcut: `Alt+O` (`Cmd+Shift+O` on macOS).

Search on name, type, subtype, language or author, or paste an OmniScript or
Integration Procedure key (`Type_SubType_Language`, or `Type_SubType`) as it
appears in logs and element names. Every version is listed, the active one
marked; one click opens it in the core builder or the managed-package designer.

## Install

From the [Chrome Web Store](https://chromewebstore.google.com/), or load unpacked:

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick
   this folder.
2. Open a Salesforce tab, then click the toolbar icon.

## What it accesses — and what it does not

To list your metadata the extension needs to call your org's REST API as you:

- **Session cookie** (`cookies` permission): it reads the `sid` cookie for the
  Salesforce host of the tab you're on and uses it as a bearer token for
  `GET /services/data/...` calls **to that same org only**. When that host has
  no session cookie (for example on a Visualforce or Setup page), it looks
  through the browser's Salesforce `sid` cookies for the one that belongs to
  the same org, by the org id at the start of its value, and uses only that
  one; the others are not kept. The session ID is never written to storage
  and never sent anywhere else.
- **Host access** (`https://*.salesforce.com/*`, `*.force.com`,
  `*.salesforce-setup.com`, `*.cloudforce.com`): required so those API calls and
  the "open in designer" links work across My Domain, Lightning, Setup and
  Visualforce hosts.
- **Storage** (`storage` permission):
  - `storage.sync` — your settings (designer preference, namespace override,
    custom designer URL patterns). Synced by Chrome across your own devices; not
    sent to the author.
  - `storage.local` — a "last detection" note (the org host, designer flavour,
    package namespace, `OmniProcess` object name, and the OmniStudio-named app
    list) so the Settings page can label its controls. No records, no field
    values, no credentials. Also purges asset-list caches left by older builds.
  - `storage.session` — a short-lived tab-navigation hand-off between the popup
    and the service worker (the destination URL and a timestamp, keyed by tab).
    It is used to switch to a pinned Lightning app before a managed designer
    opens, and to check that a managed Integration Procedure or DataRaptor
    designer link kept its route through Salesforce's session hand-off, opening
    it once more if not. Cleared when the navigation completes, and gone when
    the browser session ends.

Asset lists are **not** cached — every open queries the org afresh.

There is **no external server, no analytics, and no telemetry**. The only
network requests are to your own Salesforce org.

The Settings page has a link to [buycoffee.to](https://buycoffee.to/mskrz),
which opens in a new tab only if you click it. That site is run by someone
else and has its own privacy policy; the extension passes nothing to it.

## Development

The shipped code is plain ES modules — no build step. `src/core/` is pure logic
(host mapping, schema detection, URL building, filtering), unit-tested;
`src/ui/` is the DOM, `chrome.*` and network layer. The entry points are
`popup.html` → `src/ui/popup-entry.js`, `options.html` → `src/ui/options.js`,
and the `src/ui/background.js` service worker.

```
npm install
npm test              # Jest — core / ui / wiring projects
npm run lint          # ESLint
npm run package       # build dist/omnistudio-finder-<version>.zip
npm run screenshots   # store screenshots (needs Playwright installed globally)
npm run marketing     # store marketing images, from the screenshots
npm run bump -- patch # bump manifest.json, package.json and the lockfile together
```

The Web Store zip contains only `manifest.json`, the HTML/CSS, `icons/`, `src/`
and `LICENSE` — nothing under `node_modules/`, `test/`, `scripts/` or `store/`.
CI runs lint, tests and the package step on every pull request; pushing a
`vX.Y.Z` tag builds a GitHub Release with the zip, the store screenshots and
marketing images, and the store description.

## Not affiliated with Salesforce

This is an independent, unofficial tool. It is not affiliated with, endorsed by,
or sponsored by Salesforce, Inc. "Salesforce", "OmniStudio", "OmniScript",
"DataRaptor" and "FlexCard" are trademarks of Salesforce, Inc., used here only to
describe what the tool works with.

## Licence

Copyright (c) 2026 Mikołaj Skrzypczyński.

From version 1.3.0 the extension is licensed under the
[GNU General Public License v3.0](LICENSE) (GPL-3.0-only): you may use it
freely, and if you redistribute it, modified or not, you must keep this
copyright notice and make your full source available under the same licence.
Versions up to 1.2.0 were released under the MIT licence and remain so.

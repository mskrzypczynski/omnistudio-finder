# Contributing

OmniStudio Finder is a Chrome toolbar popup (Manifest V3) that lists the
OmniScripts, Integration Procedures, DataRaptors / Data Mappers and FlexCards
in the Salesforce org of the current tab, with every version, and opens the one
you pick in the right designer. It has a popup, a Settings page and a
background service worker. README.md covers what it does for users.

This file holds the engineering rules of the project: what the architecture
is, what every change needs, how it is checked and how a release is made.

## Branches

- Name every branch `feature/<name-of-feature>`: lowercase words joined by
  hyphens that say what the change does, e.g. `feature/flexcard-search`.
- One branch per feature, started from an up-to-date `main`. The matching
  branch in the website repository uses the same name.

## Commits

- Commit messages: a short imperative subject. In the body, use bullets grouped
  by area (Popup / Settings / Opening / Code) that say what changed for the
  user.
- Don't commit generated zips, `dist/`, `node_modules/` or coverage output.

## Architecture (the rules that matter)

- **No build step and no runtime dependencies.** Every file under `src/` is a
  native ES module. `popup.html` loads `src/ui/popup-entry.js`, `options.html`
  loads `src/ui/options.js`, and the manifest runs `src/ui/background.js` as a
  module service worker. Don't add a bundler, transpiler, framework or npm
  runtime package.
- **Two layers, one direction:**
  - `src/core/` holds pure domain logic: plain functions on plain data. It has
    no DOM, no `chrome.*`, no `fetch` and no `window`/storage; ESLint enforces
    this. Anything that makes a decision belongs here and gets unit tests in
    `test/core/`: schema detection (`schema-model.js`), turning rows into
    assets and groups (`assets-model.js`), search, ranking and labels
    (`filter-model.js`), designer URLs (`designer-urls.js`), how to navigate
    (`nav-model.js`) and the Settings sentences (`options-model.js`).
  - `src/kit/` is a copy of the shared OmniStudio kit, which the OmniStudio
    tools of this line share; it is synced in and never edited here: host
    mapping (`core/org-hosts.js`) and the designer routes
    (`core/designer-routes.js`) live there. `npm run kit:check` fails when
    the copy was changed by hand.
  - `src/ui/` holds DOM rendering, `chrome.*` wiring and network calls. It may
    import from `src/core/`. `src/core/` never imports from `src/ui/`.
- `src/ui/sf-client.js` is the only module that talks to the org: it reads the
  `sid` cookie, makes REST calls and runs describes and queries. It only does
  round trips; what the answers mean is decided in `src/core/`.
- `src/ui/popup.js` owns the popup's `state`, event wiring and rendering. It
  exports `state`, `render` and `wireEvents` for the UI tests only.
- The popup closes as soon as it starts a navigation, so anything that has to
  happen after a page load (the app switch, the landing check for designer
  links that route by URL fragment) is done by `background.js`. State between
  hops lives in `chrome.storage.session` keyed by tab id, never in a worker
  variable, because the worker can be torn down between page loads. The popup
  awaits the worker's answer before it closes. The shape of a pending entry
  and every decision about it are in `src/core/nav-model.js`.
- The extension declares `cookies` and `storage` plus host access to the
  Salesforce domains. Don't add permissions or hosts, and don't send data
  anywhere but the org of the current tab. The session cookie is never written
  to storage. If what the extension reads, stores or sends changes, update the
  privacy section of README.md and the privacy policy.
- Asset lists are not cached: every open queries the org afresh.

## Code style

- Small, named functions. Follow the existing style of short block comments
  that explain *why*, not *what*.
- Best effort over failure: an unexpected record shape gives empty fields, not
  a throw; an optional object or query (DataRaptors, FlexCards,
  `AppDefinition`) that isn't there degrades to nothing. Errors the user
  should see are `SfError`s with a message and a hint for the next step.
- Keep the help text in `popup.html` (the `?` panel), the search placeholder,
  the `title` tooltips and the Settings page hints in sync with behaviour and
  defaults.
- Accessibility: interactive things are buttons, or have `role`, `tabindex` and
  keyboard handlers. Toggles expose `aria-expanded` / `aria-pressed`.
- `BUILD` in `src/ui/options.js` is a date stamp shown on the Settings page;
  bump it whenever you change shipped code, so a reloaded unpacked build is
  recognisable.

## Usability principles

- Defaults should suit someone who wants to get into a designer fast: focus in
  the search box, the active version first, Enter opens it.
- Opening is always a deliberate click on an open button or version chip, or
  Enter. Clicking a row only selects it.
- Every word of the search has to match, in any order. Names, types,
  subtypes, languages, authors and the `Type_SubType_Language` key are all
  searchable; an exact name or key ranks first.
- Never imply something that isn't known: an object without an active flag
  doesn't show "no active version"; a truncated query says the list is
  incomplete.
- The popup says which designer suite it is about to use, and Settings can
  force either.

## Keep the website and privacy policy aligned

After every update that users can see, also update the product site in the
`mskrzypczynski/mskrzypczynski.github.io` repository, on the same branch name:

- `omnistudio-finder/index.html`: the feature descriptions, defaults and
  shortcuts must match the current popup.
- `omnistudio-finder/privacy.html`: must still describe exactly what the
  extension reads, stores and sends (only to the user's own org). Update its
  "last updated" date whenever its content changes.
- The privacy section of README.md must say the same as privacy.html.
- `store/description.txt` is the Chrome Web Store description: keep its
  features, labels and privacy claims true. After a UI change, regenerate the
  store screenshots with `npm run screenshots` and the marketing images with
  `npm run marketing`, and check them.

## Checks before every commit

```sh
npm test       # Jest: core (node), ui (jsdom), wiring (boot test)
npm run lint   # ESLint, including the core purity rule
```

Both must pass, and CI runs the same checks plus `npm run package`. A bug fix
comes with a test that fails without the fix. UI tests use
`test/ui/support/popup-fixture.js` (the real `popup.html` markup and a
`chrome` stub that records calls and listeners).

## Releasing

1. `npm run bump -- patch|minor|major` (keeps `manifest.json`, `package.json`
   and the lockfile in step), commit, merge to `main`, then tag the merge
   commit: `git tag vX.Y.Z`, `git push --follow-tags`.
2. The Release workflow (`.github/workflows/release.yml`) checks the tag
   against the manifest, lints, tests, and attaches to a GitHub Release (also
   kept as a workflow artifact):
   - `omnistudio-finder-X.Y.Z.zip`: the extension as uploaded to the store
     (`npm run package`: only the shipped files plus `LICENSE`);
   - `...-screenshots.zip` and the five PNGs (`npm run screenshots`, rendered
     in CI with Playwright installed for that job only);
   - `...-marketing.zip` and its seven PNGs (`npm run marketing`, built from
     the screenshots: five 1280x800 annotated screenshots, the 440x280 small
     promo tile and the 1400x560 marquee tile);
   - `...-store-description.txt` (a copy of `store/description.txt`);
   - `...-SHA256SUMS.txt`.
   Running the workflow by hand on a tag rebuilds that tag's assets.
3. With the secrets `CWS_EXTENSION_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`
   and `CWS_REFRESH_TOKEN` set, it also uploads the zip to the Chrome Web Store
   as a draft; submit it in the dashboard, or run the workflow manually with
   *publish* ticked.
4. In the store dashboard, paste the description, replace the screenshots
   with the marketing screenshots, and upload the small and marquee promo tiles
   from the release assets. Privacy practices only change if what the
   extension reads, stores or sends changed.
5. Before submitting, check the website and privacy policy match (see above),
   and merge the website branch so they go live with the release.
6. PRs are merged with **Squash and merge** (the branch may contain merge
   commits, which GitHub cannot rebase). Write the squash message by hand:
   a short title and the per-area bullets, no list of intermediate commits.

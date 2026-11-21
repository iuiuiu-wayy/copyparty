# The Drive-style look is plain JS laid over upstream's file browser

The file browser gets a Google-Drive-like look and interactions: top bar, left nav, selection bar, row menus, phone bottom sheets. We build it as fork scripts and a fork stylesheet that hide upstream's chrome and draw our own, calling upstream's `browser.js` and `up2k.js` underneath. It is plain JavaScript and CSS with no framework and no build step, sharing one helper script. Upstream's code keeps doing the work (listing, selection, uploads, moves), so every existing feature survives, resumable uploads included, and upstream merges stay clean because no upstream file is edited.

There is no "classic view" and no URL flag to get upstream's look back. Every upstream feature must be reachable from the new look (a "More tools" panel holds the ones without a place of their own).

## Considered Options

- **A new page built from scratch on the HTTP API**: rejected. Uploads would lose up2k (resumable, deduplicated) or need it re-driven by hand, and every upstream feature would need rebuilding to be kept.
- **React / Preact**: rejected. React needs a build step copyparty doesn't have, and a framework that keeps its own model of the page fights `browser.js`, which redraws the same elements on every listing, sort and search.
- **Lit (web components)**: second choice, if hand-written markup gets unwieldy. It brings no help with upstream's redraws.
- **htmx**: rejected. It has the server render HTML for every click, moving work onto the Pi Zero, needs new rendering code next to `httpcli.py`, and doesn't help with multi-select, drag to move or uploads, which run in the browser.

## Consequences

- An upstream release that renames or restructures something in `browser.js` can break the look with nothing to fall back to. The per-script upstream-names tests and a hand check after each merge are the only guard.
- The fork's toolbar buttons (`linkbtn.js`, `grantbtn.js`) and control-panel link (`acclink.js`) are retired once the Share dialog and account menu replace them.

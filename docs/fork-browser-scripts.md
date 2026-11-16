# Writing a fork file-browser script

Fork scripts change upstream's file browser without editing `browser.js`, `browser.css`,
`browser.html` or `up2k.js`. Each one is a file in `copyparty/web/`, loaded by `fork-browser.js`.
Examples: `rowsel.js` (row checkboxes), `dragmove.js` (drag to move), `acclink.js` (control-panel
link), `grantbtn.js` (grant button).

## Checklist for a new script

- One line in `fork-browser.js`'s `SCRIPTS`, one in `RES` (`copyparty/fork_grants.py`), one in
  `scripts/sfx.ls`. `test_every_loaded_browser_script_is_registered_and_served` and
  `test_fork_sfx` fail if one is missing.
- A test that reads `browser.js` (or `up2k.js`) for every upstream name the script uses, in the
  style of `test_browser_names_drag_move_relies_on`, and a `### upstream edit: <name>` section
  under FORK.md's `## upstream edits` (plus its index line) naming them with that test.
- Its own `<style>` built in the script (`mknod('style', '', css)`); English strings, no `tl/`.
- `"use strict"`, one IIFE, and a guard on the upstream globals it needs, so a page without them
  (a share link, the control panel) runs nothing.

## The pattern: wrap, then re-sync

Upstream redraws freely, and anything a fork script adds to a redrawn element is lost. Keep
upstream's state as the source of truth and re-derive the fork's additions after each redraw:

```js
function after(obj, name, fn) {
    var orig = obj[name];
    obj[name] = function () {
        var ret = orig.apply(this, arguments);
        fn();
        return ret;
    };
}
after(msel, 'selui', sync);
```

Wrapping a method of an upstream module object also catches upstream's own internal calls when
the module calls through the same object (`msel`'s `r` is `msel`, so `r.selui()` hits the wrap).
Make `sync` idempotent: add what's missing, then set state from upstream's.

## Upstream traps

Each cost a manual-check round or a review finding.

- **`ev(e)` cancels the real event.** It calls `preventDefault`, `stopPropagation` and
  `stopImmediatePropagation`. Given `null` it falls back to `window.event`, which is the click
  being handled. On a checkbox a cancelled click is undone by the browser *after* the handler,
  so your re-sync is reverted. Call upstream helpers that take an event (`msel.seltgl`,
  `msel.evsel`) with a stand-in object (`{}`, or `{ "shiftKey": e.shiftKey }`), never `null`
  or the real event. It also stops other listeners on the same element, which hides them in a
  debugging check.
- **`filecols.set_style` rewrites every header cell.** Its `add_btns` sets each `th`'s
  `innerHTML`, dropping anything you put in a `<th>`. It runs on every listing, after
  `msel.render` for search results, and when a column is hidden or shown. Wrap it too.
- **`msel.getsel()` lists each selected item twice right after a sort.** The sort callback
  calls `msel.load(true)`, which fills `r.sel` from the old `r.all` and again from the new one,
  until the next `selui`. Count selected rows from the `sel` class on `#files tbody tr` instead
  of `getsel().length`, or dedupe by `vp`.
- **`apply_perms(res)` rebuilds `#acc_info`** on every folder load. Re-add after each call.
- **The right-click menu reads the lead cell's first node** (`file.firstChild.firstChild`) to
  offer "play" and "open as text". Append to the lead cell; never prepend.
- **The lead cell and other `td`s get `className` overwritten** by `filecols.set_style`
  (`tds[b].className = cls`). Put your classes on your own child elements.
- **Search results**: `ebi('unsearch')` exists, the first row is `tr.srch_hdr`, and
  `msel.render` binds no row-click selection. Skip `.srch_hdr` rows.
- **Grid view** (`thegrid.en`) hides `#files`; upstream's grid drag-select (`dsel_init`)
  cancels `dragstart` while its box is active.
- **up2k owns body-level drag events** for uploads (overlay, "drop a link" toast). A drag of
  your own needs a private data type, and window-level capture listeners that keep only
  those drags away from up2k (see `dragmove.js`).
- **CSP** (`--csp-ui`): inline `on...=` attributes and nonce-less `<script>` tags are blocked;
  assign handlers from JS. Injected `<style>` is allowed (no `style-src` in the default policy).

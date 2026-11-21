# Writing a fork file-browser script

Fork scripts change upstream's file browser without editing `browser.js`, `browser.css`,
`browser.html` or `up2k.js`. Each one is a file in `copyparty/web/`, loaded by `fork-browser.js`.
Examples: `rowsel.js` (row checkboxes), `dragmove.js` (drag to move), `forkacct.js` (account
menu), `grantbtn.js` (grant button).

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

## Drive-ux scripts: the shared helper

The drive-ux look (`.scratch/drive-ux/spec.md`, ADR 0003) is built from scripts that all use
`window.forkui` (`web/forkui.js`, first in `SCRIPTS`; its API is the comment at its top). Return
early when `!window.forkui || !forkui.ok`: older browsers then keep upstream's plain page. Use its
`menu` (popover, arrow keys, bottom sheet below 800 px) and `dialog` (modal, Esc / tap outside /
optional back gesture, focus back to the opener) instead of building your own, so the
browser-rule fallbacks live in one place. Traps found while building the frame (`web/forkshell.js`):

- **Never put upstream's tree inside an `<li>`.** `reload_tree` walks up from the current folder
  with `closest('li')` until it runs out, and an `<li>` of ours around `#tree` makes that loop
  forever (the page hangs).
- **`window.onpopstate` is `treectl.onpopfun`** and reloads the folder. A capture listener for
  `popstate` on `window` does not run before it in Chromium; `forkui` wraps whatever
  `onpopstate` holds instead (once one of its dialogs uses the back gesture).
- **A page wider than a phone grows the layout viewport**, and fixed bars and bottom sheets then
  sit off screen. Keep wide content scrolling inside its own box (the frame makes `#wrap` scroll
  sideways on a phone). Upstream's meta viewport starts phones at scale 0.8; the frame sets 1.
- **A guest page stays inside the share link and `/.cpr/`**: Outside, the proxy passes nothing
  else. Make no other request when `acct == '*'` or on a share link, and let a failed one fail
  quietly. `specs/shell.spec.js` checks a guest page load.

## Drive-ux scripts: the list and selection bar

`web/forklist.js` owns clicks on `#files` rows (capture listeners, ahead of upstream's own) and
exposes `forkui.list` (`open(tr)`, `rows(onlysel)`, `selbar`; see its top comment). A script
adding something to a row (a ⋮ button, a menu) must stop its own clicks from reaching the row,
or they select it. Traps found while building it:

- **A click selects, so a script's test can't click a name to open it.** Use the harness's
  `open` fixture (double-click on a desktop, tap on a phone).
- **Chromium cancels a touch pointer when its own long-press starts** (`pointercancel`, then
  `contextmenu`), so a long-press timer cleared on cancel never fires there; `forklist.js`
  treats a touch `contextmenu` on a row as the long-press.
- **Showing the selection bar moves the rows**, so the click that ends a long-press can land
  on another row; swallow the next click after a long-press wherever it lands.
- **Upstream's `msel.getsel()` duplicates after a sort** is fixed for everyone by
  `forklist.js` (it wraps `msel.load`); counting the `sel` class still works.

## Drive-ux scripts: search

`web/forksearch.js` takes over the top bar's search box (`forkui.shell`, from `forkshell.js`):
it writes the whole query into upstream's raw field `#q_raw` and runs it with that field's Enter
handler, so upstream's search posts it and renders the hits. Traps found while building it:

- **Upstream searches every readable volume**, not the folder you're in. "Under this folder"
  is a `path` term, and the form's path field only says "starts with" (`^home/a/trip` also
  matches `home/a/trip2/`); use `( path like p or path like p/* )` in the raw query.
- **Typing in upstream's form fields searches on a timer** (and a second time 2 s later when
  a search was already running). Setting a field and firing its `oninput` to get the query
  encoded can send duplicate searches; `#q_raw`'s Enter runs exactly one.
- **Closing a search leaves `#` in the URL** (`sethash('')`), and **opening a hit that isn't
  media goes to its folder**, ending the search, so `#unsearch` disappears without the close
  link; `forksearch.js` notices from `reload_browser` and also calls `treectl.show()` (the
  results hid the breadcrumb through `treectl.hide()`).
- **The server rate-limits searches** (429 when the last one took over 0.7 s and came less
  than 0.7 s ago); upstream writes the refusal in `#srch_q` (class `err`).

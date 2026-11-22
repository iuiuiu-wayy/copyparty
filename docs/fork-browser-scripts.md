# Writing a fork file-browser script

Fork scripts change upstream's file browser without editing `browser.js`, `browser.css`,
`browser.html` or `up2k.js`. Each one is a file in `copyparty/web/`, loaded by `fork-browser.js`.
Examples: `rowsel.js` (row checkboxes), `dragmove.js` (drag to move), `forkacct.js` (account
menu), `forkshare.js` (Share dialog).

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

## Drive-ux scripts: the row menu

`web/forkrowmenu.js` owns right-click on `#wrap` and the ⋮ on each row; it exposes
`forkui.rowmenu` (`open(tr, src, fromKeyboard)`, `menu`). What its entries and the selection
bar do for Share, Move to…, Rename, Details, Download and Delete lives in `forkui.actions`
(set up by `forklist.js`): to change one, replace it (`forkui.actions.move = function (rows) {
... }`) rather than adding a button of your own. An action is called with the rows it acts on,
which are then also exactly the selection; read it right away, since on a touch screen the row
menu gives the old selection back once it closes. A control of yours inside a row gets class
`fk-own`, so `forklist.js` doesn't take its clicks as selecting. Traps found while building it:

- **A menu opened by `contextmenu` is light-dismissed by the button's release.** On Linux and
  macOS `contextmenu` comes on the press, and a `popover="auto"` closes on the pointerup that
  follows outside it. Open it after that pointerup (`forkrowmenu.js` does).
- **Firefox gives Shift+right-click to its own menu without a `contextmenu` event**, so a test
  can't see it there.
- **Several popover hide/show calls in one task fire one `toggle` event** (old state open, new
  state open), and a late `toggle` "closed" can arrive after the menu was opened again:
  `forkui.menu`'s `onclose` checks it is still closed.

## Drive-ux scripts: uploads (forknew.js)

`forkui.create` (`web/forknew.js`) is how another script offers New folder, File upload,
Folder upload and New text file: `items(opener)` is a ready list for `forkui.menu`, empty
where the folder can't be written to. Traps found while building + New and the upload card:

- **up2k may not exist yet.** `up2k` is `null` until its hasher check settles and `false`
  when init failed; check `window.up2k`, else push a function onto `up2k_hooks`.
- **Every pick or drop opens up2k's panel**: `gotfile` calls `goto('up2k')`, by bare name,
  so wrapping `window.goto` catches it. Keep `up2k.init_deps()` (what `goto_up2k` does), or
  the hasher never loads.
- **The card must read `up2k.ui.tab`, not `#u2tab`**: only the active card's rows of
  upstream's table exist in the DOM. `ui.addfile` runs before `st.files.push`, so read the
  new file a tick later.
- **Upstream's toasts come up bottom right**, over anything fixed there (and they catch the
  clicks); `forknew.js` moves `#toast` up above the card.
- **The file inputs are `tabindex=-1` and inside the hidden panel**; `.click()` on them still
  opens the picker, but only inside the user's gesture (call it from the menu pick itself).
- **In e2e tests, give each upload its own bytes**: the server links a copy it already has
  instead of receiving the file again (dedup), so parallel projects uploading the same bytes
  see no chunk requests.

## Drive-ux scripts: views that aren't folders

`web/forkviews.js` fills the nav's Shared with me and Recent uploads through
`forkui.shell.views[id](section)` (`forkshell.js` makes the section, its `h2` and the focus) and
exposes their data as `forkui.views.shared(done)` / `.recent(done)` (see its top comment), for a
folder picker or anything else that wants the same roots. Traps found while building it:

- **The root's `?ls` has no `cfg`** when `/` is no volume, and lists `home/` with the caller's
  perms on their own home folder, so perms can't tell a folder with no path on disk from a
  volume; `forkviews.js` descends only into a root folder that holds the home folder.
- **Upstream's `*:focus` ring (`ui.css`)** draws on a heading focused by script and on every
  link; turn it off inside your own markup and draw your own on `:focus-visible`.
- **`?ru` needs `j` in the query** for JSON, and hides `at` and `un` from non-admins (0 and
  `(?)`) unless `--ups-when`; nothing in the reply says whether `ups_who` hid a volume.
- **A harness grant that must be suspended** needs the owner to lose the rights: the harness
  rewrites its config and calls `?reload=cfg` at setup (see `server.js`).

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

## Drive-ux scripts: the Share dialog

`web/forkshare.js` is the one Share dialog (`forkui.share`, see its top comment): `open(item,
opener)`, `item(rows)` (one folder, files of one folder, or the current folder), `section({id,
order, render(item, box)})` to add a part (General access is order 20; Add people goes before
it), `links(item, done)` for the item's share links (from `GET /?shares&j`, `fork_shares.py`)
and `say(text)` for its status line. It replaces `forkui.actions.share`, `fileman.share` and
`#fshr`'s `onclick`. Traps found while building it:

- **A modal `<dialog>` makes the rest of the page inert**, so upstream's `cliptxt` fallback (a
  textarea appended to `body`) can't be selected while the dialog is open; copy from a field
  inside the dialog.
- **`127.0.0.1` is a secure context, a LAN address over http is not**: the e2e harness gets the
  Clipboard API, the Pi's users don't. `specs/share.spec.js` turns `isSecureContext` off to
  cover the fallback.
- **Upstream's error replies are HTML-escaped text** (often inside `<pre>`, ending in a `URL:`
  line); `unpre` escapes again for `innerHTML`. For `textContent`, strip the line and decode
  (`forkshare.js` `reason`).
- **A grant mount takes no share links** but its listing says `shr_who: auth`, so Share shows
  there and the server refuses; the refusal is shown, as for any other.

## Drive-ux scripts: Move to… (forkmove.js)

`web/forkmove.js` replaces `forkui.actions.move` with a folder-picker dialog and exposes
`forkui.move.open(rows)`. It moves with paste's request (as `dragmove.js` does) and restyles
`dragmove.js`'s `fmv-hl` / `fmv-img` from its own `<style>`. Traps found while building it:

- **A folder's perms come from its own `?ls`** (`perms`), not from the parent's listing; a
  folder with no path on disk (`/`, `/home/`) answers with empty `perms`, so it is never
  pickable, which is right (nothing can be written there).
- **`dirs[].href` in `?ls` is relative and URL-quoted** (and may carry `?k=` with dirkeys):
  join it to the folder's encoded path, drop the query, and compare decoded paths when
  checking "inside a folder being moved".
- **In e2e tests, wait half a second after a long-press before the next tap**: `forklist.js`
  swallows clicks for 400 ms after a long-press, so a tap right after it selects nothing.

## Drive-ux scripts: rename (forkrename.js)

`web/forkrename.js` wraps `fileman.rename`, so every caller (the selection bar, the row menu,
F2, upstream's button and right-click menu) gets the small dialog for one item and upstream's
batch panel for several. Another script renames something that isn't a selected row (the
current folder, ticket 12) with `forkui.rename({ vp, fn, isd }, opener, done)`; `done(newvp)`
replaces the list reload. Traps found while building it:

- **F2 reaches upstream's hotkey only from outside an input**, and upstream calls
  `fileman.rename()` without an event; `ev(undefined)` then cancels the keydown itself. Call
  the wrap with `{}` from a menu pick, never `null`.
- **A rename reloads the list** (`treectl.goto`), so the opener (the row's ⋮, or the row) is
  gone when the dialog closes; focus the new row from a `msel.render` wrap instead.
- **Don't add an Enter handler to the field**: the form's implicit submission skips an IME's
  confirming Enter, a keydown handler doesn't.

## Drive-ux scripts: viewers and the audio player (forkview.js)

`web/forkview.js` puts a top bar on upstream's lightbox and text viewer and restyles the audio
player as a bottom bar; it only moves, hides and clicks upstream's controls. Traps found while
building it:

- **The lightbox overlay is rebuilt on every opening**: `thegrid.bagit` calls
  `baguetteBox.destroy()` (which removes `#bbox-overlay`) before `run`. Add to it after each
  `run`, which also hands you the options (`onChange` tells which item shows; in list view the
  item's link has no `ref`, so upstream's `#g…` hash says `gnull`).
- **The lightbox traps focus and takes every key at `document`**: a `<dialog>` opened over it
  (Share) loses focus to the lightbox's Close and its arrows / letters drive the lightbox.
  `forkview.js` stops the focus event at `window` (capture) and the keydown at `<html>`
  (bubble) when they come from a `.fk-dlg` or `.fk-menu` outside the overlay.
- **Its touch handlers are on the overlay**: a drag on anything inside it (our bar, a bottom
  sheet inserted after its trigger) swipes images or closes the lightbox; stop the touch
  events in your own element.
- **Upstream opens the audio bar only when it creates the first `Audio`** (`play()`); once
  closed, nothing opens it again. `forkview.js` wraps the global `play` (called by bare name,
  so reassigning `window.play` catches it) to open it.
- **Playwright counts an element pushed off screen as visible**: upstream hides the closed
  player with `bottom: -6em`; the new look adds `visibility: hidden` after the slide.
- **A source checkout has no `deps/`** (`prism.js`, `marked.js`): the harness shows markdown
  unrendered (nothing at all, after a "failed to load" toast) and text without highlighting.

## Drive-ux scripts: the grid view (forkgrid.js)

`web/forkgrid.js` draws the grid as its own cards (`#fk-grid` inside upstream's `#gfiles`), built
from upstream's hidden tiles after each `thegrid.loadsel`. A card carries its row's link id in
`data-fk-ref`; `forklist.js` and `forkrowmenu.js` map it to the row, so a script that acts on
rows works on cards too. A control of yours on a card gets class `fk-own`, as in a row. Traps
found while building it:

- **`thegrid.loadsel` overwrites every tile's `className`** with its row's, so anything kept
  on upstream's tiles is lost; that is why the cards are elements of our own.
- **A button inside a link is invalid and reads badly in a screen reader**, and upstream's
  tiles are links; the card is an `li` whose one link (the name) is stretched over it, with the
  checkbox and the ⋮ beside it.
- **`.fk-card` is taken** by the upload card (`forknew.js`); grid classes start `fk-g`.
- **Upstream lists 250 rows, then the rest once you scroll to the end** (its `#lazy`); on
  Firefox for Android it asks first ("show all", the `bd_ask` setting). A grid test with
  hundreds of files scrolls to the end, and taps `#bd_all` when it shows.
- **The lightbox gives focus back to upstream's hidden tile** (`thegrid.onhide`); the wrap
  moves it to the card.

## Drive-ux scripts: the Details panel (forkdetails.js)

`web/forkdetails.js` sets `forkui.actions.details` and adds ⓘ to the top bar; it follows the
selection by wrapping `fileman.render`, as the selection bar does. Traps found while building it:

- **`forklist.js`'s keys run first, at `window` capture**, so a panel of yours never sees Esc
  while rows are selected (the list clears the selection and stops the event). Put
  `data-fk-keys` on an element that handles its own keys: `forklist.js` leaves keys alone while
  focus is inside it.
- **Read what the rows say when the action is called**: on a touch screen the row menu gives
  the old selection back once it closes, and that runs `fileman.render` again; the phone sheet
  keeps what it was opened with.

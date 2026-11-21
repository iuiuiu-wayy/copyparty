# Manual browser check of a fork script

Behaviour goes into the end-to-end harness first; this doc is for what it can't judge (how it
looks, one pass on a real phone) and for debugging by hand.

## The end-to-end harness

```sh
./scripts/fork-e2e.sh --install      # once: npm ci (Playwright, pinned) + its Chromium
./scripts/fork-e2e.sh --install-all  # the same, plus Firefox and WebKit
./scripts/fork-e2e.sh                # all scenarios, all sizes, every installed browser
./scripts/fork-e2e.sh --project chromium-phone specs/select.spec.js   # one size, one file
E2E_KEEP=1 ./scripts/fork-e2e.sh     # keep the temp dir (config, log, files) afterwards
```

It starts copyparty from source on 127.0.0.1 and a free port with the fork's tested config
(admin, alice, bob, carol; `@family`; home folders, `/family`, `/common`), grants on, seeded
files, alice's `proj/` granted to bob and a share link of alice's `trip/` (`server.js` has the
passwords and seed), and stops it at the end; it exits non-zero on any failure. Scenarios are in
`tests/e2e/specs/`, one file per behaviour, and get from `fixtures.js`: `loginAs(user)`, `press`
(a tap on the phone sizes, a click on desktop), `row(page, name)` (a folder's name ends in `/`),
`ls(user, vp)` and `put(user, vp, body)` for server state. Assert on what a person sees (roles,
labels, text) and on `?ls`, never on our function or class names. Scenarios run in parallel
against one server: one that changes files makes its own folder, named after
`test.info().project.name`. Each scenario runs as `<browser>-desktop` (1440x900),
`<browser>-phone` (412x915, touch) and `<browser>-small-phone` (360x800, touch); Firefox and WebKit
are skipped with a note when not installed. A failure leaves a trace in
`tests/e2e/test-results/` (`npx playwright show-trace <zip>` from `tests/e2e`).

## Hand check in Chrome

This is the setup that works; each step stops a trap that cost a session time.

### Steps

1. **Config in the scratchpad**, one file per server: `[global]` with the ticket's options
   (`js-browser: /.cpr/w/fork-browser.js`, `js-other: …`, `grants: /shared`, `harden`,
   `no-html`, `usernames`), test accounts in `[accounts]`, volumes on scratch folders. Copy the
   shape from the `## Comments` of `.scratch/grants/issues/11-*.md` or
   `.scratch/browser-ux/issues/05-*.md`. Two lines every config needs:
   - **every db in the scratchpad**: `hist`, `shr-db`, `grants-db`, `ses-db`, `chpw-db`. The
     last two default to `~/.config/copyparty/`, the user's own copyparty state.
   - **`wram`** when the scratchpad is tmpfs (`/tmp` usually is). Without it copyparty drops
     write and move on every volume, with one `CRIT` line in the log, and upload, cut and drag
     then fail as "no permission".
2. **Behind a reverse proxy** is a second server with `rp-loc: /cpp` and every script path
   prefixed (`js-browser: /cpp/.cpr/w/fork-browser.js`). No proxy is needed: copyparty answers
   under `/cpp/` directly.
3. **Run without `-q`**, log to a file: `.venv/bin/python -m copyparty -c <conf> > <log> 2>&1`
   in the background. `-q` leaves the log empty, which hides every refused request.
4. **Log in with a multipart POST** from a page on that server, in the browser's JS console:
   `var f = new FormData(); f.append('act','login'); f.append('uname','alice'); f.append('cppwd','<pw>'); await fetch('/?h', {method:'POST', body:f})`
   (`/cpp/?h` behind `rp-loc`). A form-encoded body logs in for that one reply but sets no cookie.
   The `uname` field is only for a config with `usernames`; without it the server answers 422
   (`expected field "cppwd"`), so leave that `append` out and send only `act` and `cppwd`.
5. **One logged-in server per host name at a time.** Cookies ignore the port, and a plain
   server's `cppwd` (`Path=/`) is sent to the `rp-loc` server too and wins over its
   `Path=/cpp` cookie. Log out of the first server (`act=logout`) before logging in to the
   second, or bind the two to different loopback addresses (`i: 127.0.0.2`, `i: 127.0.0.3`;
   Linux answers on all of `127/8`). `localhost` may carry an old `cppwd` cookie from an earlier
   session and refuse a fresh login; another address is cleaner.
6. **Check in the page**, not only by eye: `[...document.scripts].map(s => s.src)` shows what
   loaded and with which `?_=`; `ebi('<id>')` shows whether an element the script adds exists.
7. **Record** what was checked under the ticket's `## Comments`, then stop the servers and close
   the tab.

### Several agents at once

Agents share one Chrome. Give each its own loopback address (`127.0.0.2`, `.3`, `.4`, …) and its
own ports, so cookies never mix, and have each create its own tab with `tabs_create_mcp` and act
only in that tab. Each agent stops only its own servers, by its config path.

### What the Chrome extension can't do

Say so in the ticket rather than claim the check; list it for the user's own check.

- **Resize the window**: `resize_window` leaves `innerWidth` unchanged when the window is
  maximised or shared. For a phone width, load the page in a fixed-width iframe from a page on
  the same server: `var f = document.createElement('iframe'); f.style.cssText = 'width:390px;height:800px'; f.src = location.href; document.body.prepend(f)`.
- **Touch input or devtools device emulation**: not available; touch behaviour is for the user.
- **Drag a real file in from the desktop**, or drop a link into another tab or the address bar.
- **Drag reliably onto small targets**: `left_click_drag` works between list rows but missed tree
  entries. Synthetic drag events test the page's handlers instead (it is the handlers being
  checked, not the mouse):

  ```js
  window.sim = function (src, tgt, drop) {
    var dt = new DataTransfer();
    var s = new DragEvent('dragstart', {bubbles: true, cancelable: true, dataTransfer: dt});
    src.dispatchEvent(s);
    var o = new DragEvent('dragover', {bubbles: true, cancelable: true, dataTransfer: dt});
    tgt.dispatchEvent(o);
    var res = {types: [...dt.types], accepted: o.defaultPrevented, effect: dt.dropEffect};
    if (drop) tgt.dispatchEvent(new DragEvent('drop', {bubbles: true, cancelable: true, dataTransfer: dt}));
    src.dispatchEvent(new DragEvent('dragend', {bubbles: true, dataTransfer: dt}));
    return res;
  };
  window.row = n => [...QSA('#files tbody tr')].find(t => (msel.getall().find(x => x.id == tr2id(t)) || {}).fn == n);
  window.tree = n => [...QSA('#treeul li>a+a')].filter(a => a.textContent == n).pop();
  sim(row('file1.bin'), tree('dest'), true)
  ```

- **Click links that download**: don't; capture what would be sent instead (for zip, override
  `HTMLFormElement.prototype.submit` to read the form's fields).

A curl request without a browser `User-Agent` gets copyparty's plain-text listing, not the page.
Use `-A 'Mozilla/5.0'` when checking html with curl.

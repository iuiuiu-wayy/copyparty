# Manual browser check of a fork script

Fork scripts in `copyparty/web/` have no JS test harness, so tickets record a check in Chrome.
This is the setup that works; each step stops a trap that cost a session time.

## Steps

1. **Config in the scratchpad**, one file per server: `[global]` with the ticket's options
   (`js-browser: /.cpr/w/fork-browser.js`, `js-other: …`, `grants: /shared`, `harden`,
   `no-html`, `usernames`), `hist`, `grants-db` and `shr-db` pointing into the scratchpad, test
   accounts in `[accounts]`, volumes on scratch folders. Copy the shape from the `## Comments` of
   `.scratch/grants/issues/11-*.md` or `.scratch/browser-ux/issues/05-*.md`.
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
   second, or use `127.0.0.1` for one and `localhost` for the other.
6. **Check in the page**, not only by eye: `[...document.scripts].map(s => s.src)` shows what
   loaded and with which `?_=`; `ebi('<id>')` shows whether an element the script adds exists.
7. **Record** what was checked under the ticket's `## Comments`, then stop the servers and close
   the tab.

A curl request without a browser `User-Agent` gets copyparty's plain-text listing, not the page.
Use `-A 'Mozilla/5.0'` when checking html with curl.

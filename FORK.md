# about this fork

Personal fork of [9001/copyparty](https://github.com/9001/copyparty) (forked at v1.20.26).
Goal: replace Nextcloud with copyparty on a **Raspberry Pi Zero 2W**, and add the missing
piece: **managing users, groups and folder permissions from the browser**.

Research behind these notes was done in Oct–Nov 2026; numbers and issue states are from then.


## the rule that shapes everything

upstream's [CONTRIBUTING.md](./CONTRIBUTING.md) says **"do not use AI / LLM when writing code"**.
This fork is written with AI help, so:

* nothing from this fork can be offered upstream as a PR
* keep fork changes in **new files** where possible and touch upstream files at as few
  places as possible, so merging upstream releases stays cheap
* the licence is fine with this: copyparty is MIT, and every bundled dependency is
  MIT / BSD / ISC / Apache-or-MPL / OFL (see `copyparty/res/COPYING.txt`); keep `LICENSE`
  and `COPYING.txt` intact


## target: what we need from it

the Nextcloud features we want to keep:

| want | copyparty today |
|---|---|
| upload | ✅ up2k: chunked, resumable, no size limit even behind Cloudflare's 100 MB request cap |
| login | ✅ accounts in config; `--usernames` for user+password login |
| manage users | ❌ **config file only** -- edit, then reload (`kill -USR1` / `[reload cfg]` button) |
| own folder per user | ✅ `[/home/${u}]` volume, one block covers all users |
| shared folders | ✅ admin-defined volume + `[groups]` |
| **user shares a folder with another user** | ✅ grants (`grants: /shared` + `js-browser: /.cpr/w/fork-browser.js`), fork-only; the file browser's Share dialog, "Add people and groups", gives a folder to an account or a config group, read-only or read + upload, optional expiry; owners revoke and extend them on `?grants`, linked from the control panel |
| share links | ✅ `shr: /share`; password, expiry, optional upload; owner manages them in the control panel |
| stream video | ✅ served as-is with range requests; no video transcoding (fine for the Pi) |
| edit text | ✅ text viewer + two markdown editors |
| edit docs | ⚠️ `--wopi` can hand off to a Collabora server running elsewhere; untested |
| pick several files like Nextcloud | ✅ `web/rowsel.js` through `js-browser: /.cpr/w/fork-browser.js`, fork-only; a checkbox on every row of the list view and a select-all box in the header, mirroring upstream's selection, so cut / copy / paste, zip, dl, share and grant act on what is ticked. Row click, `space`, shift-click and the bottom bar work as upstream; grid view keeps its own multiselect |
| move files by dragging, like Nextcloud | ✅ `web/dragmove.js` through `js-browser: /.cpr/w/fork-browser.js`, fork-only; drag rows of the list view onto a folder row, a folder in the sidebar tree or a breadcrumb, and they move there with paste's `?move` request. A selected row carries the whole selection, an unselected one only itself. A progress toast with abort, then one toast naming each item the server refused and why (its reason, minus the URL line). A drop moves without asking. Checked by hand in Chrome, no automated check (ticket 02's Comments; [its upstream edit](#upstream-edit-drag-to-move-dragmovejs)): in grid view and search results no move-drag starts; a pointer reported as touch makes rows non-draggable; a file drag (a `File` in the `DataTransfer`) still gets up2k's upload overlay and uploads; a move-drag carries the items' URLs as `text/uri-list` and `text/plain`. Not checked there: a real file from the desktop, devtools touch emulation, and dropping a name into another tab or the address bar. Rows are draggable wherever you may move, so text in a row can't be selected by dragging there |
| reach the control panel from the file browser | ✅ `web/forkacct.js`, fork-only; the account menu on the top bar's avatar (the account's initial): Change password (the control panel's form, focused), My share links, My grants, Control panel, Log out, at the `--rp-loc` prefix. Hidden for guests and with `ui_noacci`; Control panel left out with `ui_nocpla` (both unless `?fullui`), as upstream hides its own account box and link. [Its upstream edit](#upstream-edit-account-menu-forkacctjs) |
| search like Drive | ✅ `web/forksearch.js`, fork-only; the top bar's search box searches names under the current folder (upstream's search, results in the list), with Type and Modified chips, Advanced (upstream's full form), `/` to focus, Esc or ✕ to get the folder back. Only where upstream shows its search (indexed volumes, not on share links). [Its upstream edit](#upstream-edit-drive-ux-search-forksearchjs) |
| move without dragging, like Drive | ✅ `web/forkmove.js`, fork-only; **Move to…** in the selection bar and the row menu opens a folder picker at the current folder, with My files and Shared with me as roots, a breadcrumb and New folder; only a folder you can write to can be picked, never a folder being moved or anything in it. Paste's `?move` request per item; refusals are listed in the dialog by item with the server's reason. Also restyles drag to move's drop targets. [Its upstream edit](#upstream-edit-drive-ux-move-to-forkmovejs) |
| a grid view like Drive | ✅ `web/forkgrid.js`, fork-only; a List / Grid toggle beside the breadcrumb switches to upstream's grid drawn as Drive's: a Folders section of compact tiles, then file cards with upstream's lazy thumbnails and a ⋮ each. Selecting, the selection bar, the row menu and opening work as in the list; the choice is upstream's `griden` setting, so it stays with the browser. [Its upstream edit](#upstream-edit-drive-ux-grid-view-forkgridjs) |
| see who has access to a file, like Drive's details | ✅ `web/forkdetails.js`, fork-only; ⓘ in the top bar (and Details in the row menu and the selection bar's More) opens a Details panel that follows the selection: type, size, modified, location, and Who has access (your own grants and share links on the item, from the two json lists, each opening the Share dialog). A full-screen sheet on a phone; guests get no Who has access. [Its upstream edit](#upstream-edit-drive-ux-details-panel-forkdetailsjs) |
| a breadcrumb with folder actions, like Drive | ✅ `web/forkcrumbs.js`, fork-only; the breadcrumb starts at My files (or Shared with me, or a share link's name for a guest), and its last part, the current folder, opens a menu: New folder, Upload files, Upload folder, Share, Rename, Download (zip), each only where allowed. Earlier parts navigate and stay drag-to-move drop targets; on a phone the parts between the first and the current folder sit in a "…" menu so the trail fits on one line beside the Layout toggle. [Its upstream edit](#upstream-edit-drive-ux-breadcrumb-and-folder-menu-forkcrumbsjs) |
| a control panel that makes sense to users | ✅ `js-other: /.cpr/w/ctlpanel.js` + `nb`, fork-only; "other stuff:" becomes "more:" with "your share links", "your grants", "disk space", recently added files, logout everywhere (in that order); "reset client settings", the `π` link and "powered by" are hidden; the share links page gets an intro line ("Links anyone can open without an account. Revoke one to stop it working."). With `chpw`, a "change password:" form of its own (new password, repeat, button) sits under "welcome back"; upstream's small "change password" link next to the login button is hidden |
| space on every disk, per account | ✅ config only: one nested `[/home/${u}/hdd1]` volume per extra disk gives every account a folder on it inside My files, created automatically, private, shareable with grants and share links ([tested config](#tested-config-users-groups-home-folders-shares), "more disks") |
| see how full the disks are, like Drive's storage bar | ✅ fork-only, disk-space tickets 02-05: the nav's **Storage** section (`web/forkdisks.js`), one row per disk the account can upload to with a bar and "X free of Y"; a **disk space** page (`?disks`, `fork_disks.py`) from the control panel, every disk of the folders you administer and any whose folder is missing; an **email** when a disk is nearly full or missing (`contrib/fork-disk-alert/`, a systemd timer outside copyparty); upstream's metrics (`stats`), with `harden` only for `stats-u` accounts. [Its upstream edits](#upstream-edit-disk-space-page-and-storage-bar-fork_diskspy-forkdisksjs) |
| pull a disk out while it runs | ✅ fork-only, config + systemd: copyparty keeps running and leaves that disk's folders out; a disk plugged back in comes back with one restart (`contrib/fork-disk-watch/`, [tested config](#tested-config-users-groups-home-folders-shares) "more disks", `docs/adr/0004`) |


## hardware limits (Pi Zero 2W)

* 512 MB RAM, 4× Cortex-A53 @ 1 GHz, **one USB 2.0 port** (~30–35 MB/s, shared with any
  USB ethernet), 2.4 GHz wifi only
* the bottleneck is disk + network, not copyparty
* use a **powered** disk/hub: upstream #1507 (Pi 5) died silently with a bus-powered disk


## memory: what we measured and what others report

own benchmark (x86 docker, 50k files + 20 × 12-megapixel jpegs, 4 thumbnails at a time):

| | copyparty | FileBrowser Quantum v2.0.1 |
|---|---|---|
| idle, 50k files indexed | 38 MiB | 38 MiB |
| peak while thumbnailing | 111 MiB | 209 MiB |
| held afterwards | 36 MiB | 189 MiB |

copyparty stays small because thumbnails run in a **separate ffmpeg/pillow process** and the
index lives in **sqlite on disk**. Quantum decodes images in-process and Go keeps the freed heap.

upstream reports: ~30 MiB idle / ~50 MB RSS after a 1.5 GB upload (discussion #1310);
a Pi Zero 2W user with 3 accounts and no memory complaints (#1035).

the real risk is the image libraries copyparty calls: one animated AVIF took **~7 GB** through
libvips → imagemagick (#1556). Recommended `[global]` for the Zero 2W, from the maintainer's
own replies in #1332 / #746 / #1556:

```
  th-mt: 1                 # one core for thumbnails
  mtag-mt: 1               # one core for media tags
  hash-mt: 1               # one core for hashing
  th-dec: pil,ff,raw       # leave vips out (the 7 GB AVIF case)
```

do **not** enable mimalloc (`LD_PRELOAD`) in the arm64 docker image; it crashes on start (#213).


## security notes

* copyparty 2026 advisories: 10, all Low/Moderate (XSS, FTP path traversal, share-key mixups,
  sftp edge cases, windows/mac shadowing). Most are in protocols we don't need:
  **keep FTP/SFTP/SMB off**, HTTP(S) only.
* FileBrowser Quantum (the alternative we rejected) had 31 advisories in 2026, 4 Critical / 14 High,
  mostly in its core auth and share code.
* default password storage is **plain text** in the config (`ah-alg: none`). Turn on hashing
  (`ah-alg`, generate with `--ah-cli` / `--ah-gen`). Check argon2's memory cost on the Pi before
  choosing it over scrypt -- not measured yet.
* HTTPS from the internet: nginx in front, the site file `contrib/nginx/fork-https-outside.conf`,
  checked locally by `scripts/fork-https-check.sh`; putting it on the Pi and checking it by hand:
  [docs/fork-https-outside-pi.md](docs/fork-https-outside-pi.md). Inside is the home's static IP
  only; Outside is everything else.
  * 2026-11-21 (https-outside): Outside opened only share links.
  * 2026-11-23 (login-outside) reverses part of that: Outside also gets copyparty's login page at
    `/`, so account holders reach their own files away from home. Guests still reach only share
    links, where account passwords and cookies count for nothing. Without a login cookie, what
    reaches copyparty from Outside is: GET, HEAD and POST of `/` (with any query: the login page
    and its form), the share area, and GET/HEAD of the static files (`/.cpr/`); nginx answers
    everything else itself (GET/HEAD elsewhere: 302 to `/`; any other method, PROPFIND, PUT or
    OPTIONS of `/` included: a bare 404, after the rate limits). HSTS tells browsers to use only
    HTTPS.
  * only browser logins work Outside: the gate passes a request on the `cppws` cookie only, so a
    client that logs in with basic auth or a `PW` header (WebDAV, rclone, u2c, phone apps) gets
    the 302 or the 404 beyond `/` and share links, whatever its password. Those work Inside only.
  * the admin account logs in only Inside or through an SSH tunnel to the Pi (`ipr`); from
    Outside its login is refused like a wrong password and counts toward the ban (`ban-pw`).
    Logins end after a week unused in the browser (`logout: 168`; a copied session stays valid
    until that account's password changes), new passwords need 12 characters (`chpw-len: 12`;
    passwords set in the config are not checked, so keep them long and random by hand).
  * 2026-11-26: the login cookie is `SameSite=Lax` (`cookie-lax`), not copyparty's default
    `Strict`. A `Strict` cookie stays behind when a visit starts on another site or app (a link
    tapped in WhatsApp or an email), so nginx's gate answered an account holder who was logged
    in with the 302 to `/` and the login page. `cookie-lax` changes only the SameSite of the
    login cookies (`gencookie` in `util.py`); they stay `Secure; HttpOnly`.
  * accepted risks:
    * `cookie-lax` gives up some CSRF protection. The cookie still stays off cross-site POSTs,
      iframes and subresources (images, scripts, fetch), but a top-level GET from another site
      carries it, so a link can make copyparty run its GET actions as whoever is logged in.
      Those that change something: `/?reload=cfg` (re-reads the config and re-indexes every
      volume) and `?scan` (re-indexes that volume), for an account with `a` on some volume (on
      that volume, for `?scan`); in the tested config every account has `A` on her home folder,
      so that is every account holder, not just the admin. And `/?reset` clears copyparty's
      cookies, the login among them: a link logs you out (`?setck` sets a UI cookie only). None
      of them touches a file; on the Pi the cost is a re-index's disk and CPU. The worse ones
      are off by default and must stay off: `getmod` (`?delete`, `?move`, `?copy` as GET) and
      `smsg: GET` (runs `xm` hooks); `/?idp&rm=` (forgets an IdP user) works only for accounts
      in `idp-adm`.
    * the whole copyparty app, the fork's code included, is reachable by anyone: nginx can't
      check the `cppws` cookie, so any made-up value passes the gate and copyparty answers it as
      a guest. So nothing outside share links may be open to guests: no volume may give `*` any
      permission (the Pi checklist's step 0 checks it). With a real login, the weakest everyday
      password is the way in.
    * `ipr` allows the admin account's login from the home IP, and everything at home is that IP
      (guest Wi-Fi, ESP boards; NAT loopback), so anyone at home can try the admin password; and
      more than 9 wrong tries in an hour (`ban-pw`) ban that one IP, so the whole household, for
      a day (a copyparty restart lifts it).
    * there is no deadline yet for getting copyparty's security releases onto the Pi.
* get copyparty only from official sources (github releases, PyPI, `copyparty/*` on docker hub,
  copyparty.eu). A "maintained fork… security patches… pip install" repo showed up in the fork
  list in Nov 2026 and was deleted soon after.


## tested config (users, groups, home folders, shares)

tested on v1.20.26 in docker; every row in the table under it was checked with curl.

```
[global]
  e2dsa            # index files (needed for search and share cleanup)
  shr: /share      # share links
  chpw             # users may change their own password (button is in the control panel)
  usernames        # log in with username + password

[groups]
  family: alice, bob

[accounts]
  admin: adminpw1
  alice: alicepw1
  bob: bobpw111
  carol: carolpw1

[/home/${u}]       # private folder per user, created automatically
  /srv/home/${u}
  accs:
    A: ${u}
    a: admin

[/family]          # shared by a group
  /srv/family
  accs:
    rwmd: @family
    A: admin

[/common]          # everyone logged in can read, admin writes
  /srv/common
  accs:
    r: @acct
    A: admin
```

| check | result |
|---|---|
| alice/bob see | `common/ family/ home/`; in `home/` only their own folder |
| carol sees | `common/ home/` |
| bob reads alice's file | 403 |
| carol reads `/family` | 403 |
| alice shares a file with password + 60 min expiry | link works only with the password |
| bob shares alice's file | refused: "you dont have all the perms you tried to grant" |
| add a user to the file + `kill -USR1` | works without restart; home folder appears |

gotchas found while testing:

* the `copyparty/ac` docker image already loads every `*.conf` in `/cfg`; also passing
  `-c /cfg/x.conf` loads it twice and fails with "multiple filesystem-paths mounted" (#1083)
* volumes on tmpfs lose write access unless `wram` is set (safety check; irrelevant on a real disk)

more disks: every home folder holds one folder per extra disk, a nested per-account volume with
the home folder's rights (disk-space ticket 01; config only, held by `tests/test_fork_disk_homes.py`):

```
[/home/${u}/hdd1]  # My files/hdd1, on the second disk; one block per disk
  /mnt/hdd1/copyparty/home/${u}
  accs:
    A: ${u}
    ra: admin
```

* each account's folder on each disk is created at startup like the home folder; grants and
  share links work from it as from the home folder; moving files between disks is a copy + delete
* no `nospawn` on these: a disk that isn't there (its folder's parent can't be written, as in the
  Pi service's read-only private view) leaves that folder out of My files and refuses uploads to
  it, and nothing is created; `nospawn` would also stop new accounts' folders from appearing
* a disk pulled out while copyparty runs: copyparty keeps running, with no restart. Upstream
  already leaves a folder it can't read out of listings once its cache expires, refuses it, and
  writes nothing in its place. A disk plugged back in, or removed safely, restarts copyparty
  once, since the Pi service's private view of the disks is fixed at start
  (`contrib/fork-disk-watch/`: a systemd unit per disk and a udev rule that mounts a disk when
  it is plugged in; `docs/adr/0004`). Checked by `scripts/fork-unplug-check.sh` (a real
  copyparty, a FUSE disk killed under it) and `tests/test_fork_disk_watch.py`; a kernel file
  system (`ntfs3`) on a vanished USB device only by the README's hands-on check


## `harden`: fork-only hardening switch

`harden` (`--harden`, or `harden` under `[global]`) is off by default; with it off, behaviour is
exactly upstream's. Our config turns it on. With it on (see `docs/adr/0002`):

* any path with a part starting with `.` **inside** a volume is 404 for an account without the `.`
  permission on that volume -- direct GET, WebDAV, `?zip`/`?tar`, thumbnails, and the
  `VFS.get` lookup that FTP/SFTP/SMB/TFTP use. Accounts with `.` (e.g. `A`, or `rwmd.`) keep full access
* a volume mounted at a dot-named path (e.g. `/.b`) stays reachable; the rule applies below its root
* `GET`/`HEAD` of `/.cpr/...` is exempt: copyparty always answers it with its own web resources
* creating a dot name without `.` is 404 as well, so nobody can plant `.prologue.html` /
  `.epilogue.html`: every other request method on a dot path (PUT, MKCOL, DELETE, OPTIONS, ...), a
  move/copy/rename *to* a dot path, mkdir, a basic (bup) upload, and an up2k upload whose name (sent
  in the handshake body) starts with a dot. Copyparty's own temporary names (`--dotpart`) still work
* moving/copying a folder that holds dotfiles the account can't see at the source or the destination
  is refused (403) up front, so it never stops half-way
* `/.cpr/metrics` (`--stats`) answers only accounts in `--stats-u`: upstream also lets in any
  account with `a` on some volume, and with `A: ${u}` on home folders that is every account, who
  could then read every volume's name, size and file count ([its upstream
  edit](#upstream-edit-harden-metrics-only-for---stats-u))
* not covered: SMB with `--smba` (upstream maps every SMB user to its internal superuser, which
  bypasses all permissions anyway); keep SMB off

share links, always (not only with `harden`): under the share link area (`/share`,
`/share/<key>/...`) only share link passwords count. An account password (login form, `?pw=`,
`PW` header, basic auth), an account's login cookie, or an IdP / `--ipu` login is answered as a
guest's there, so a leaked password or stolen cookie gives no control panel data, no password
change and no new share link through a share link URL (https-outside spec, stories 39-42). An
account password typed or sent there is refused like a wrong one and counts toward the password
ban, logged only as "account login refused under a share link" (no password or hash, whatever
`log-badpwd` says); a login cookie is ignored there (no ban, still logged in elsewhere). An
account password in basic auth or the `PW` header next to a share link's cookie (a browser that
keeps sending it) is ignored instead: the cookie counts, no ban. An account holder sees her own
link as a guest does. copyparty's static files (`/.cpr/...`, open to Outside like the share
links) take no login at all: everyone is a guest there and no password is looked at, logged or
counted toward a ban, so no login, cookie or `POST /.cpr/?share` works through them;
`/.cpr/metrics` (`--stats`) is left as upstream has it. A share-link password login still sets
the one site-wide login cookie, replacing an account's in that browser (upstream does that too;
scoping it to the share link needs upstream edits to cookie parsing). Code: `copyparty/fork_shr_auth.py`, tests:
`tests/test_fork_shr_auth.py`; see
[its upstream edit](#upstream-edit-share-links-take-only-their-own-passwords)

share links (`/share/<key>/...`, used by guests), with `harden` on:

* dotfiles inside a share link are 404, even if the owner gave the link `.` (allowed upstream when
  the owner has `.`, e.g. `A`), and even with `--ed` or the `dots` volflag; links already in the
  database lose `.` at the next reload. Upstream's link archives (`?zip`/`?tar`) already leave
  dotfiles out
* writes through a share link refuse `README.md`, `PREADME.md` and `descript.ion` in any letter
  case (403), since copyparty renders them inside the owner's folder listings: PUT (also WebDAV),
  bput, up2k, new markdown file, the markdown editor's save, and copying a file to that name
  (`?copy=`, WebDAV `COPY`). Dot names are refused like everywhere else. The owner can still
  upload them in their own volume
* creating a share link with a key shorter than 12 characters is refused (400); the web UI's
  random keys are 12 characters
* at reload, share links whose owner is no longer an account are deleted from the share link
  database (`sh` and `sf` rows), so a new account with the same name doesn't get them back. An
  owner who still exists but lost access keeps the row (upstream only hides the link until access
  returns). Skipped with IdP headers (`--idp-h-usr`), since IdP accounts aren't in the config
* code: `copyparty/fork_harden.py`, tests: `tests/test_fork_harden.py`,
  `tests/test_fork_harden_shr.py`

recommended `[global]` for the deployment, on top of the tested config below (not yet tried in
docker):

```
  harden           # the rules above
  no-html          # uploaded .html/.htm/.xhtml/.svg/.md and the markdown viewer (?v) are served
                   # as text/plain with script-src 'none'; copyparty's own UI keeps working
  grants: /shared  # grants, see below
  js-browser: /.cpr/w/fork-browser.js  # loads the fork's file-browser scripts (grant and share link buttons, row checkboxes, control panel link, drag to move)
  js-other: /.cpr/w/ctlpanel.js        # tidies the control panel, hides the π link
  nb                                   # hides "powered by copyparty"
```

`harden` makes `/family` dotfiles 404 for members, since `rwmd` has no `.`. Give `@family`
`rwmd.` if members should keep access to dotfiles they upload there.


## upstream edits

every place this fork changes an upstream file, one section each below. On a merge conflict, resolve each one as its "on conflict" says.

| entry | upstream files touched |
|---|---|
| [fork modules in the sfx build](#upstream-edit-fork-modules-in-the-sfx-build) | `scripts/sfx.ls` |
| [grants](#upstream-edit-grants) | `authsrv.py`, `httpcli.py`, `svchub.py`, `__main__.py`, `cfg.py`, `web/splash.html`, `scripts/sfx.ls` |
| [control panel tidy-up (ctlpanel.js)](#upstream-edit-control-panel-tidy-up-ctlpaneljs) | `scripts/sfx.ls` only |
| [file-browser script loader (fork-browser.js)](#upstream-edit-file-browser-script-loader-fork-browserjs) | `scripts/sfx.ls` only |
| [row checkboxes (rowsel.js)](#upstream-edit-row-checkboxes-rowseljs) | `scripts/sfx.ls` only |
| [drag to move (dragmove.js)](#upstream-edit-drag-to-move-dragmovejs) | `scripts/sfx.ls` only |
| [`--shr-adm` as a real list](#upstream-edit---shr-adm-as-a-real-list) | `svchub.py`, `httpcli.py`, `authsrv.py` |
| [`harden`: dotfiles](#upstream-edit-harden-dotfiles) | `authsrv.py`, `httpcli.py`, `up2k.py`, `__main__.py` |
| [share links take only their own passwords](#upstream-edit-share-links-take-only-their-own-passwords) | `authsrv.py`, `httpcli.py`, `scripts/sfx.ls` |
| [text listing of a folder with no path on disk](#upstream-edit-text-listing-of-a-folder-with-no-path-on-disk) | `httpcli.py` |
| [`nospawn` with per-user volumes](#upstream-edit-nospawn-with-per-user-volumes) | `authsrv.py` |
| [sidebar tree of a folder with no path on disk](#upstream-edit-sidebar-tree-of-a-folder-with-no-path-on-disk) | `httpcli.py`, `scripts/sfx.ls` |
| [end-to-end harness (tests/e2e)](#upstream-edit-end-to-end-harness-testse2e) | none |
| [drive-ux frame (forkui.js, forkshell.js)](#upstream-edit-drive-ux-frame-forkuijs-forkshelljs) | `scripts/sfx.ls` only |
| [drive-ux list and selection bar (forklist.js)](#upstream-edit-drive-ux-list-and-selection-bar-forklistjs) | `scripts/sfx.ls` only |
| [drive-ux + New and upload card (forknew.js)](#upstream-edit-drive-ux--new-and-upload-card-forknewjs) | `scripts/sfx.ls` only |
| [account menu (forkacct.js)](#upstream-edit-account-menu-forkacctjs) | `scripts/sfx.ls` only |
| [row menu (forkrowmenu.js)](#upstream-edit-row-menu-forkrowmenujs) | `scripts/sfx.ls` only |
| [drive-ux views that aren't folders (forkviews.js)](#upstream-edit-drive-ux-views-that-arent-folders-forkviewsjs) | `scripts/sfx.ls` only |
| [drive-ux search (forksearch.js)](#upstream-edit-drive-ux-search-forksearchjs) | `scripts/sfx.ls` only |
| [Share dialog: share links (forkshare.js, fork_shares.py)](#upstream-edit-share-dialog-share-links-forksharejs-fork_sharespy) | `httpcli.py`, `scripts/sfx.ls` |
| [share link revoked during a reload](#upstream-edit-share-link-revoked-during-a-reload) | `authsrv.py` |
| [reload publishes the volumes only when final](#upstream-edit-reload-publishes-the-volumes-only-when-final) | `authsrv.py` |
| [drive-ux Move to… (forkmove.js)](#upstream-edit-drive-ux-move-to-forkmovejs) | `scripts/sfx.ls` only |
| [drive-ux rename dialog (forkrename.js)](#upstream-edit-drive-ux-rename-dialog-forkrenamejs) | `scripts/sfx.ls` only |
| [drive-ux viewers and audio player (forkview.js)](#upstream-edit-drive-ux-viewers-and-audio-player-forkviewjs) | `scripts/sfx.ls` only |
| [Share dialog: add people (forkpeople.js, ?grants&j)](#upstream-edit-share-dialog-add-people-forkpeoplejs-grantsj) | `scripts/sfx.ls` only |
| [drive-ux grid view (forkgrid.js)](#upstream-edit-drive-ux-grid-view-forkgridjs) | `scripts/sfx.ls` only |
| [drive-ux Details panel (forkdetails.js)](#upstream-edit-drive-ux-details-panel-forkdetailsjs) | `scripts/sfx.ls` only |
| [drive-ux breadcrumb and folder menu (forkcrumbs.js)](#upstream-edit-drive-ux-breadcrumb-and-folder-menu-forkcrumbsjs) | `scripts/sfx.ls` only |
| [disk space page and storage bar (fork_disks.py, forkdisks.js)](#upstream-edit-disk-space-page-and-storage-bar-fork_diskspy-forkdisksjs) | `httpcli.py`, `scripts/sfx.ls` |
| [`harden`: metrics only for `--stats-u`](#upstream-edit-harden-metrics-only-for---stats-u) | `metrics.py` |

### upstream edit: fork modules in the sfx build

- **what it is:** fork modules ship in the sfx build
- **upstream lines touched:** `scripts/sfx.ls`: one line per new `copyparty/fork_*.py` (and per
  fork file in `copyparty/web/`)
- **fork files:** `tests/test_fork_sfx.py` (fails on a fork module or `RES` file missing from
  `sfx.ls`), `scripts/fork-sfx.sh` (full build from a clean temp copy)
- **on conflict:** keep both sides

### upstream edit: grants

- **what it is:** grants (`--grants`, `--grants-db`)
- **upstream lines touched:** `authsrv.py`: one import + `mount_grants(self, vfs, acct)` as the
  last line of `_reload` (marked `# fork`; it needs every volume's final flags, js and share
  links); `httpcli.py` `handle_post_json`: one import + `if "grant" in self.uparam: return
  handle_grant(self, body)` right after the `share` dispatch (marked `# fork`); `httpcli.py`
  `handle_get`: `if "grants" in self.uparam: return tx_grants(self)` right after the `shares`
  dispatch, and `handle_post`: `if "egrant" in self.uparam: return handle_egrant(self)` right
  after the `eshare` dispatch (both marked `# fork`, sharing the import); `web/splash.html`: an
  "edit grants" link (`id="yg"`) right after "edit shares" (reads `(this.args.grants or '')`, so
  upstream's test `Cfg`, which has no `grants`, still renders it); `scripts/sfx.ls`:
  `web/grants.html` and `web/grants.js`; `httpcli.py` `run`: the `http_request`
  line (see `harden`); `__main__.py` `add_share`: the `--grants` and `--grants-db` options;
  `cfg.py` `flagcats["others"]`: one `grant_who=auth` line after `shr_who=auth` (registers the
  volflag, so copyparty doesn't warn that it's unrecognized); `svchub.py` `run`: one import +
  `start_expiry_timer(self)` right after `self.tcpsrv.run()` (marked `# fork`; the timer reloads
  through `SvcHub.reload` and checks under `AuthSrv.mutex`)
- **fork files:** `copyparty/fork_grants.py`, `copyparty/fork_harden.py` (dot rule and upload-name
  rule also on grant volumes, `harden_nodes`), `copyparty/fork_util.py` (`grants_top`),
  `copyparty/web/grants.html`, `copyparty/web/grants.js` (the page
  loads its own template through `httpsrv.load_jinja2_resource` and adds it to `hsrv.j2` as
  `fork_grants` on first use, so it renders through `HttpCli.j2s` while httpsrv's template list is
  untouched; `fork_grants.py` also adds those files to upstream's `RES` set at import, which
  is what lets `.cpr/w/grants.js` be served), `tests/test_fork_grants.py`
- **on conflict:** keep both sides; grant volumes mirror how `_reload` maps a share link
  (`shr_src`, `_get_share_src`, `shr_all_aps`, hidden `.hist` and subvolumes), so if upstream
  changes that block, port the change to `_grant_vol` and rerun `tests/test_fork_grants.py`.
  `_no_dot_walk` passes `VFS.walk`'s arguments by position up to `wantdots` (6th), forcing it to
  0; recheck it if that signature changes (`test_no_dotfiles_in_archives` catches it). `_route`
  replaces `get`, `_get` and `can_access` on the root volume instance; if upstream adds another
  root-level lookup that walks `nodes` itself (`_find`), route it too, or it sees the root's
  listing-only copy (no path on disk, so no files leak, but wrong rights). The listing workaround
  in `http_request` relies on `tx_ls_vols` reading `self.rvol` and on `run` setting `can_*` before
  the hook. `share_pw_accounts` copies how the share loader in `_reload` names the made-up `s_...`
  account of a share link password (`"s_%s" % ub64enc(sha512(pw))[4:16]`); if upstream changes
  that, change it too, or grants could go to anyone holding a share link password
  (`test_refused_to_a_share_link_password` catches it). If upstream renames `hsrv.j2`, `j2s`,
  `load_jinja2_resource` or `RES`, the grants page breaks: `test_page_*` catch the template side;
  `test_every_loaded_browser_script_is_registered_and_served` catches `RES` moving. The file browser's way to
  grant is the Share dialog's Add people (see
  [forkpeople.js](#upstream-edit-share-dialog-add-people-forkpeoplejs-grantsj); the 🤝 people
  button, `web/grantbtn.js`, is retired)

### upstream edit: control panel tidy-up (ctlpanel.js)

- **what it is:** control panel tidy-up (`web/ctlpanel.js`, loaded with `js-other:
  /.cpr/w/ctlpanel.js`; behind `--rp-loc`, prefix that path)
- **upstream lines touched:** none in templates: `splash.html`, `splash.js` and the other pages
  are untouched. `scripts/sfx.ls`: `web/ctlpanel.js`; `fork_grants.py` adds it to upstream's `RES`
  next to the grants page's files
- **fork files:** `copyparty/web/ctlpanel.js`, `tests/test_fork_grants.py`
  (`test_control_panel_script_is_served`, `test_control_panel_has_the_ids_the_script_moves`,
  `test_control_panel_password_form_is_served`,
  `test_control_panel_has_the_ids_the_password_form_uses`,
  `test_share_links_page_has_what_the_intro_line_is_put_before`)
- **on conflict:** nothing to merge, but the script leans on upstream ids by name: `#cc` (the
  heading) followed by `div.agr`, whose entries `#y`, `#yg`, `#af`, `#k`, `#wb`, `#ag` and the
  `<form>` holding `#lo` it reorders, rebuilding the `<br />` between them (`#y` and `#yg` it
  relabels "your share links" / "your grants"), adding its own `#yd` "disk space" (`/?disks`)
  where `#lo` is (logged in); on the share links page (`shares.html`,
  `<html id="ht_shr">`) it puts its intro `<p id="fork_shrintro">` before the first `<span>` in
  `#wrap` (upstream's "axs = perms" note); `#repl` (the `π` link)
  on every page with `{{ js }}`. The change-password form leans on `#x` (upstream's "change
  password" link: its presence means chpw is on, someone is logged in and it's not a share; the
  script hides it), `#lf` (its `action` is where the form posts), `#lu` (present means
  `--usernames`, so the post carries `uname`), `#un` (the logged-in name, whose `<p>` the form
  goes right after), and the request `#x` sends (`act=chpw`, `uname`, `pw`, read by
  `handle_chpw`); `test_control_panel_has_the_ids_the_password_form_uses` renders `splash.html`
  with and without `chpw` and `usernames` and catches a rename. If `#x` is renamed the form just
  doesn't show; if upstream changes the fields `handle_chpw` reads, the form's post fails with the
  server's error page. It runs after `splash.js`, so the English labels win over the translated
  ones. An entry upstream adds to `div.agr` is kept, before logout. If an id is renamed, that
  entry just isn't moved or relabelled: `test_control_panel_has_the_ids_the_script_moves` renders
  `splash.html` and catches it. The script's behaviour itself has no automated check; after an
  upstream merge, open `/?h` logged in and out and check the section, the missing `π`, and change
  a test account's password with the form. `--js-other` also lands on the file browser when
  `--js-browser` is empty (`httpcli.py` `j2s`); the script then only hides the `π` there

### upstream edit: file-browser script loader (fork-browser.js)

- **what it is:** file-browser script loader (`web/fork-browser.js`, loaded with `js-browser:
  /.cpr/w/fork-browser.js`; behind `--rp-loc`, prefix that path)
- **upstream lines touched:** none in templates. `scripts/sfx.ls`: `web/fork-browser.js`;
  `fork_grants.py` adds it to upstream's `RES` next to the grants page's files
- **fork files:** `copyparty/web/fork-browser.js`, `tests/test_fork_grants.py`
  (`test_every_loaded_browser_script_is_registered_and_served`, `test_file_browser_tag_the_loader_relies_on`)
- **on conflict:** nothing to merge. It loads the scripts in its `SCRIPTS` list one after another
  (one line per script; a script that fails to load or throws doesn't stop the rest), each from
  its own url with the file name swapped, so the `--rp-loc` prefix and the `?_=` cache-buster that
  `browser.html` appends (`{{ js }}_={{ ts }}`) carry over. It copies its own `nonce` to each
  script because `--csp-ui` only allows scripts with the page's nonce;
  `test_file_browser_tag_the_loader_relies_on` renders `browser.html` and fails if the nonce or
  the `?_=` query leaves that tag. If upstream changes the csp (say to `'strict-dynamic'`),
  recheck that the drive-ux look still shows. The loading itself has no automated check; after an
  upstream merge, open the file browser and check the Share dialog, the row checkboxes, the
  control panel link and dragging a file onto a folder

### upstream edit: row checkboxes (rowsel.js)

- **what it is:** row checkboxes in the file list (`web/rowsel.js`, loaded by `fork-browser.js`)
- **upstream lines touched:** none: `browser.js`, `browser.css` and `browser.html` are untouched;
  the script injects its own `<style>`. `scripts/sfx.ls`: `web/rowsel.js`; `fork_grants.py` adds
  it to upstream's `RES` next to the grants page's files; one line in `fork-browser.js`'s `SCRIPTS`
- **fork files:** `copyparty/web/rowsel.js`, `tests/test_fork_grants.py`
  (`test_every_loaded_browser_script_is_registered_and_served`, `test_browser_names_the_row_checkboxes_rely_on`)
- **on conflict:** nothing to merge, but the script leans on upstream's browser.js by name: it
  wraps `msel.selui`, `msel.render` and `filecols.set_style` (which rewrites each header cell,
  dropping the select-all box), calls `msel.seltgl` with `this` = the lead `<td>` (its
  `this.parentNode` is the row), `msel.evsel`, `msel.getall`, `msel.getsel`; it reads the `sel`
  class on `#files tbody tr`, puts the select-all box in `th[name=lead]`, and skips `tr.srch_hdr`
  while `#unsearch` exists. It appends to the lead cell instead of prepending because the
  right-click menu reads that cell's first node (`file.firstChild.firstChild`) to offer play /
  open as text. It hands `seltgl` and `evsel` a stand-in event: upstream's `ev()` would
  `preventDefault` the real click (with `null` it falls back to `window.event`), and the browser
  then undoes the box's tick. `test_browser_names_the_row_checkboxes_rely_on` reads `browser.js`
  and fails if one of those names goes. Behaviour has no automated check; after an upstream merge,
  tick two rows, check the bottom bar, the select-all box and a search

### upstream edit: drag to move (dragmove.js)

- **what it is:** drag to move in the file list (`web/dragmove.js`, loaded by `fork-browser.js`)
- **upstream lines touched:** none: `browser.js`, `browser.css`, `browser.html` and `up2k.js` are
  untouched; the script injects its own `<style>`. `scripts/sfx.ls`: `web/dragmove.js`;
  `fork_grants.py` adds it to upstream's `RES` next to the grants page's files; one line in
  `fork-browser.js`'s `SCRIPTS`
- **fork files:** `copyparty/web/dragmove.js`, `tests/test_fork_grants.py`
  (`test_every_loaded_browser_script_is_registered_and_served`, `test_browser_names_drag_move_relies_on`)
- **on conflict:** nothing to merge, but the script leans on upstream by name. `browser.js`:
  `msel.getall` / `msel.getsel` and their items (`id`, `vp`, `fn`, `isd`), `tr2id`, the `sel`
  class on `#files tbody tr`; paste's request shape in `fileman.paste` (`POST
  <src>?move=<dst>&akey=<key>`, 201 = moved, else the reply text is the reason) and
  `/?fs_abrt=<key>` for abort; `fileman.tx` (tells other tabs); `treectl.goto` (refreshes list and
  tree); tree folder links `#treeul li>a+a`, breadcrumbs `#path a[href]` (minus forkcrumbs.js's Shared with me link, `data-fk-view`); the globals `perms`
  (`move`), `have_mv`, `thegrid.en`, `SR`; `#unsearch` (search results). `up2k.js`: its drag
  handlers are `document.body.ondragenter` / `ondragleave` / `ondragover` / `ondrop` and it shows
  the "drop a link" toast for `text/uri-list`; the script keeps a move-drag (private type
  `application/x-copyparty-fork-move`) away from them with capture listeners on `window`, so if
  up2k moves its handlers to `window` capture or `document`, recheck that the upload overlay stays
  hidden during a move-drag. `test_browser_names_drag_move_relies_on` reads `browser.js` and
  `up2k.js` and fails if one of those names goes. Right after a sort `msel.getsel` lists each
  selected item twice; `dragmove.js` drops the repeats itself (`selected()`), as `rowsel.js` does
  on its side, so if upstream fixes that both workarounds can go. Behaviour has no automated
  check; after an upstream merge, drag a file onto a folder row, a tree folder and a breadcrumb,
  and drop a desktop file to check it still uploads

### upstream edit: `--shr-adm` as a real list

- **what it is:** `--shr-adm` takes a real comma-separated list of exact names (upstream compared
  the whole string in `?shares` / `?eshare`, and used a substring test in the active-downloads
  list, so `adm` matched `admin`)
- **upstream lines touched:** `svchub.py`: one import + `args.shr_adm =
  split_names(args.shr_adm)`; `httpcli.py` `tx_shares` / `handle_eshare`: `!=` -> `not in`;
  `authsrv.py` `cgen`: `shr_adm` added to the `csv` set so `--cgen` still prints it
- **fork files:** `copyparty/fork_util.py` (`split_names`), `tests/test_fork_shr_adm.py`
- **on conflict:** **take theirs if upstream fixes it**, then remove all of the fork side: the
  `split_names` line + import in `svchub.py`, `shr_adm` in cgen's `csv` set (unless upstream keeps
  a list too), and `split_names` (and `fork_util.py` + its `sfx.ls` line, if nothing else uses
  them); keep the test if it still passes

### upstream edit: `harden`: dotfiles

- **what it is:** `harden`: dotfiles inside a volume are 404 without `.`
- **upstream lines touched:** `authsrv.py`: one import + `harden_vfs(self.args, vfs)` in `_reload`
  right after the loop that ends with the `dots` volflag adding to `udot` (marked `# fork`; it
  wraps each volume's `get`, so it must come after the `xvd` block, and it clears `udot` on share
  links, so after the `dots` loop); `httpcli.py` `run`: one import + `if http_request(self):
  return self.tx_404() and False` right after `self.rem = rem` (the per-request lookup uses
  `VFS._get`, not `get`; `http_request` lives in `fork_grants.py` and calls
  `fork_harden.http_refused` first); `up2k.py`: one import + a `refuse_dot_tree(...)` walk before
  the folder walk in `handle_mv` and in `handle_cp` (2 lines each, marked `# fork`; it also
  refuses listing names at a share link or grant destination); `httpcli.py` `handle_post_json`:
  `refuse_dot_name(...)` right after `vfs.sanitize_fn(name, rem)` (marked `# fork`, import shared
  with the `fork_harden` one); `httpcli.py` `handle_share`: `refuse_short_key(self.args, skey)`
  right after the illegal-character check (marked `# fork`, same import); `authsrv.py` `_reload`,
  share loader: `purge_ownerless_shares(self.args, db, acct, self.log)` right before the first
  `for row in cur.execute("select * from sh")` loop (marked `# fork`, import shared with
  `harden_vfs`); `__main__.py` `add_safety`: the `--harden` option. Share link dotfiles and upload
  names need no extra edit: `harden_vfs` clears `udot` and wraps `sanitize_fn` on each share link
  volume, and the wrapped `get` refuses the listing names on write lookups into a share link
- **fork files:** `copyparty/fork_harden.py`, `tests/test_fork_harden.py`,
  `tests/test_fork_harden_shr.py`
- **on conflict:** keep both sides; if upstream renames `VFS.get` / the `self.vn, self.rem` lookup
  in `run`, move the hook to the new spot and rerun `tests/test_fork_harden.py` and
  `tests/test_fork_harden_shr.py` (the share link rules set `VFS.sanitize_fn` / `axs.udot` by
  name, so a rename upstream would silently stop them; only the tests notice). `_refuse_dots`
  reads `err` by `VFS._get`'s argument order (6th after `uname`, default 403); recheck it if that
  signature changes. **If upstream adds a real dotfile block, take theirs** and remove the fork
  side

### upstream edit: share links take only their own passwords

- **what it is:** under the share link area, only a share link password logs in; any account
  login is a guest there (see "share links, always" above). It also replaces the earlier fix
  for a share link password equal to an account's password (upstream loaded it as a made-up
  `s_...` account with the same password, which tripped the "same password" check and broke
  every reload): that share link now gets the usual `s_...` user with a random password nobody
  knows, and `fork_shr_auth` maps the share link password to it under the share link area only.
  So the password opens the link, as that link's user, and still logs in as the account
  everywhere else (with `no-ses` the login cookie is the password itself, so it does too)
- **upstream lines touched:** `authsrv.py` `_reload`, share loader:
  `pw2u = share_pw_start(vfs, acct)` before the loop, and in the `if s_pw and s_pw.strip() in
  pw2u:` branch `sun = share_pw_user(vfs, acct, s_pw)` (all marked `# fork`; import after the
  `fork_harden` one); `httpcli.py` `run`: `share_auth(self, cookie_pw)` right before
  `self.rvol = self.asrv.vfs.aread[self.uname]`, after every upstream way of logging in (password,
  cookie, basic auth, IdP, `--ipu`, wopi); `httpcli.py` `get_pwd_cookie`: `opwd = pwd` first, and
  `uname, pwd = share_login(self, uname, pwd, opwd)` right after upstream's session/password
  lookup (all marked `# fork`; import after the `fork_shares` one); `scripts/sfx.ls`:
  `copyparty/fork_shr_auth.py`
- **fork files:** `copyparty/fork_shr_auth.py`, `tests/test_fork_shr_auth.py`,
  `tests/test_fork_shr_pw.py`; the Outside rules in `scripts/fork-https-check.sh`
- **on conflict:** keep both sides. `share_pw_user` names the user as the share loader names
  `s_...` users (`"s_%s" % ub64enc(sha512(pw))[4:16]`) and `share_pw_start` builds `pw2u` the
  same way the old fork line did; if upstream changes either, follow it. If upstream adds a new
  way of logging in after the `rvol` line, or renames `cookie_pw`, `self.pw` or the `ases`
  session map, move the hook so it still runs last. **Take theirs if upstream fixes the equal
  password case**, then drop `share_pw_user` and the branch, keeping `share_pw_start`'s
  bookkeeping

### upstream edit: text listing of a folder with no path on disk

- **what it is:** a fix for an upstream bug (`.scratch/upstream-bugs/issues/01`): `?ls=v`, `?ls=t`
  and `?ls=txt` on a folder that only exists because volumes are mounted below it (`/` and
  `/home/` with only `/home/alice`; with grants also `/shared/` and `/shared/<owner>/`) gave a 500,
  because `tx_ls_vols` set `dt` and `name` to the int `0` and the text formats in `tx_ls` treat
  them as strings. JSON `?ls` was fine (it drops both keys)
- **upstream lines touched:** `httpcli.py` `tx_ls_vols`: the `"dt"` and `"name"` values of each
  entry, now `"1970-01-01 00:00:00"` and the child name `x` (both marked `# fork`); `tx_ls` is
  untouched
- **fork files:** `tests/test_fork_ls_vols.py`
- **on conflict / if upstream fixes it:** take upstream's version and drop ours; keep the test if
  it still passes

### upstream edit: `nospawn` with per-user volumes

- **what it is:** fixes an upstream bug: `nospawn` (global `--vol-nospawn` or the volflag) on a
  `${u}`/`${g}` volume whose folders don't exist crashed `AuthSrv._reload` with `KeyError: 'pop
  from an empty set'`, so the server didn't start (or a reload failed). The nospawn drop removed
  those volumes from the VFS but left them in `idp_vols`; the IdP exposure-warning loop then
  resolved them to a parent node with no sigil. The same crash hit a per-user volume nested under
  a dropped one (`[/home/${u}/pub]` under a dropped `[/home/${u}]`): it stays in `all_vols` but is
  unlinked from the tree, so the lookup lands on `home`. Now the dropped volumes are just left out,
  with upstream's nospawn warning, and the folders are still not created; a nested volume is
  skipped too and is unreachable (every lookup of it is refused). Ticket
  upstream-bugs/02
- **upstream lines touched:** `authsrv.py` `_reload`, the `for idp_vp in self.idp_vols:` loop
  (builds `idp_warn` / `idp_err`): two lines right after its `idp_vn, _ = vfs.get(...)`,
  `if idp_vn.vpath != idp_vp: continue` (marked `# fork`), which skips any IdP vpath the lookup
  didn't land on: dropped, or nested under a dropped one. `idp_vols` itself is left as is:
  nothing else reads it, and it is rebuilt on every reload
- **fork files:** `tests/test_fork_nospawn_idp.py`
- **on conflict / if upstream fixes it:** **take upstream's version and drop ours**; keep the
  test if it still passes

### upstream edit: sidebar tree of a folder with no path on disk

- **what it is:** fixes for upstream bugs (`.scratch/deploy-pi/issues/01`, `04`): `?tree` on a
  folder that only exists because volumes are mounted below it (`/home/` with only `/home/<user>`)
  gave 403, because `handle_get` refuses every request there without read access except `?ls` and
  the root; and `gen_tree`'s fallback for such a folder listed only volumes mounted directly in it,
  so `/` lacked `home` (upstream's own root case) and `/a/` showed nothing with a volume only at
  `/a/b/c/x`. Now `?tree` gets through when the tree would list a readable volume below the folder
  (write-only ones don't count; refused requests still log `@user has no access to ...`), and the
  fallback (`fork_tree.tree_virt`) lists the next path segment of every readable volume below it,
  at any depth, at `/` too. It shows no more than `?ls`: `unlistcr` volumes are left out by
  `fork_tree.listable_vols`, the fork's one copy of `tx_ls_vols`' unlistcr filter (keep the two in
  step; computed once per request and kept on the `HttpCli` as `_fork_tree_vols`). A segment that only leads to deeper volumes goes into `vfs_ls` as a plain folder,
  since the `vfs_virt` check would mark it offline (no read access there). Readable folders with no
  path on disk in `vfs_virt` (the grants folders `/<grants>/<owner>`) are no longer marked offline
  either: the offline check `stat`s only volumes with a path on disk
- **upstream lines touched:** `httpcli.py`: one import line; in `handle_get` two lines right
  after the `if "ls" in self.uparam: return self.tx_ls_vols()` exception,
  `if "tree" in self.uparam and self.vpath and tree_ok(self): return self.tx_tree()` (marked
  `# fork`; a refused `?tree` falls through to upstream's own refusal and log line); in
  `gen_tree`'s `except` fallback, `vfs_ls = []` and the `for v in self.rvol` loop replaced by
  `vfs_ls, zsl = tree_virt(self, top)  # fork` and a loop filling `vfs_virt` from `zsl`; in its
  `vfs_virt` loop, `bos.stat(dvn.canonical(drem, False))` now under `if dvn.realpath:  # fork`;
  `scripts/sfx.ls`: `copyparty/fork_tree.py`
- **fork files:** `copyparty/fork_tree.py`, `tests/test_fork_tree_vols.py`
- **on conflict / if upstream fixes it:** **take upstream's version and drop ours** (and
  `fork_tree.py` with it); keep the tests if they still pass

### upstream edit: end-to-end harness (tests/e2e)

- **what it is:** a dev-only end-to-end harness: `./scripts/fork-e2e.sh` starts copyparty from
  source (`tests/e2e/server.js`) on 127.0.0.1 and a free port, with the [tested
  config](#tested-config-users-groups-home-folders-shares) plus `grants: /shared`,
  `js-browser: /.cpr/w/fork-browser.js` and `wram`, every folder and db in a temp dir, seeded
  files, one grant (alice's `proj/` to bob) and one share link (alice's `trip/`), then drives the
  file browser with Playwright (`tests/e2e/specs/`) at desktop (1440x900), phone (412x915, touch)
  and small phone (360x800, touch), in Chromium and in Firefox / WebKit when installed. It stops
  the server and removes the temp dir when the run ends or is cut short (`E2E_KEEP=1` keeps it).
  Its one dependency is `playwright`, pinned exactly in `tests/e2e/package.json` + lockfile;
  nothing of it is in the server, `scripts/sfx.ls` or the pre-commit hook
- **upstream lines touched:** none
- **fork files:** `scripts/fork-e2e.sh`, `tests/e2e/` (`package.json`, `package-lock.json`,
  `playwright.config.js`, `server.js`, `fixtures.js`, `specs/*.spec.js`), `tests/test_fork_e2e.py`
- **on conflict:** nothing to merge, but the harness leans on upstream's HTTP API by name: the
  login form's multipart `act=login`, `uname`, `cppwd` posted to `/?h` and the `cppwd` cookie;
  `POST ?share` (JSON `k`, `vp`, `pw`, `exp`, `perms` with `get`; 201); `PUT` uploads (201);
  `?ls`'s `dirs` / `files` and their `href`. `test_server_names_the_harness_relies_on` reads
  `httpcli.py` and fails if one of those names goes. The scenarios find rows by role and
  link text (a folder shows as `name/`), and the share-link one expects a click on a file
  that isn't media to download it. Upstream's `run-tests.sh` copies `tests/` into `./unt`,
  `tests/e2e/node_modules` (~18 MB) too, if it is installed; harmless. After an upstream merge,
  run `./scripts/fork-e2e.sh`
- **upstream bugs it works around (seen in v1.20.26 without fork code; 1 is now patched,
  [reload publishes the volumes only when final](#upstream-edit-reload-publishes-the-volumes-only-when-final),
  the serialising stays, it also keeps the runs steady):** both
  leave up2k refusing every upload until a restart (HTTP 503 "server busy with fs-reload"; the
  browser retries for ever and the upload card stays on "Uploading N items"):
  1. *two reloads close together.* `AuthSrv._reload` sets `self.vfs` before it drops the
     share link volumes from `vfs.all_vols`; those have no `dbd` volflag. up2k reinitialising
     after an earlier reload reads `all_vols` in that window, its rescan thread dies with
     `KeyError: 'dbd'` (`init_indexes`) and `reloading` never clears. Every reload that
     reinitialises up2k counts: a share link or grant made or ended, `?reload=cfg`, SIGUSR1 (a
     password change does not). Repro: a server with `--shr` and one link, then 20
     `?reload=cfg` 5 ms apart; about one burst in six
     sticks. The harness lets one reload happen at a time and waits until up2k takes an upload
     again (`server.js` `serialReload`; the page's own requests too, `fixtures.js` `context`)
  2. *a reload as startup indexing begins.* With fast boot (the default) `deferred_init` can
     lose its `gid` to the reload's rescan and return before setting `have_e2d`, so the
     up2k-rescan thread never starts and the next reload's flag is never handled. The harness
     runs with `no-fastboot`, which indexes before listening
- **left-behind folders:** each scenario's folder of alice's (`scratch()` in `fixtures.js`) is
  deleted when it ends; left behind, a run's folders pushed alice's seeded files past
  upstream's first 250 rows and bob's seeded upload off `?ru`'s 1000 newest


### upstream edit: drive-ux frame (forkui.js, forkshell.js)

- **what it is:** the Drive-style frame of the file browser (drive-ux ticket 02, ADR 0003): a top bar (server name, search box, More tools, avatar) and
  a left nav (+ New, My files, Shared with me, Recent uploads, with upstream's folder tree under
  the active entry), a drawer behind a menu button below 800 px. Upstream's toolbar (`#ops`),
  account box and `#srv_info` are hidden; every toolbar tab opens from More tools, listed only
  where upstream shows the tab, with a close button over the open tab. A guest on a share link
  gets the top bar without nav or avatar, and the frame makes no request for them (Outside
  passes only share links and `/.cpr/`). Light theme only (a dark theme is switched to upstream's
  "flat light" and the theme picker hidden); the page's meta viewport is set to scale 1 (upstream
  starts phones at 0.8). Shared with me and Recent uploads are filled by `forkviews.js`, + New
  lists upstream's create tools (ticket 05), the avatar opens the account menu (`forkacct.js`).
  `ctlpanel.js` also sends a bare `/` (the control panel, as `/` is no volume) to
  `/home/<name>/` when the page lists it; `/?h` stays the control panel. `web/forkui.js` is the
  helper every drive-ux script builds on (see the API comment at its top: element builder,
  icons, `menu` = popover menu / phone bottom sheet with arrow keys and JS placement where CSS
  anchor positioning or `showPopover({source})` is missing, `dialog` = modal `<dialog>` with
  `closedby="any"` and its own tap-outside check where that is missing, back gesture through a
  history entry, focus back to the opener; light-theme tokens `--fk-*`)
- **upstream lines touched:** none. `scripts/sfx.ls`: `web/forkui.js`, `web/forkshell.js`;
  `fork_grants.py` adds them to upstream's `RES`
- **fork files:** `copyparty/web/forkui.js`, `copyparty/web/forkshell.js`, the landing in
  `copyparty/web/ctlpanel.js`, `tests/test_fork_drive_shell.py`, `tests/e2e/specs/shell.spec.js`,
  `tests/e2e/specs/landing.spec.js`; the harness config got `name: e2eparty`,
  `js-other: /.cpr/w/ctlpanel.js` and a fifth account `dave` with no home folder
  (`[/home/${u%-nohome}]`, group `nohome`)
- **on conflict:** nothing to merge, but the frame leans on upstream names, each listed in
  `tests/test_fork_drive_shell.py`: the `#ops` tabs (`#opa_x`, the `data-dest` values,
  `opclick`, `goto` and its `op_open` class, the inline `display` `apply_perms` sets), the global
  `goto` / `apply_perms` / `reload_browser` and `treectl.gentab` / `rendertree` / `entree` /
  `detree` / `goto` (wrapped or called), the tree's `#treeul li>a+a` markup, `in_shr`,
  `window.onpopstate = treectl.onpopfun` (forkui wraps whatever `onpopstate` holds; a capture
  listener on window does not run first in Chromium), the name search field (`#srch_namev`),
  `settheme.go` and "flat light" at index 3, `#themes`, the `ui_no*` switches, `s_name` and
  `have_shr` (CGV1), the meta viewport, and on the splash page `#ht_spl`, `#un`, `#f` / `#g` and
  their volume links. Two traps found on the way: the tree must not sit inside an `<li>`
  (`reload_tree` walks up with `closest('li')` and never ends), and a list wider than a phone
  grows the layout viewport, putting fixed bars and sheets off screen, so `#wrap` scrolls
  sideways there (upstream's sticky list header is lost on a phone until ticket 03). After an
  upstream merge, run `./scripts/fork-e2e.sh` (`specs/shell.spec.js`, `specs/landing.spec.js`)

### upstream edit: drive-ux list and selection bar (forklist.js)

- **what it is:** the Drive-style file list (drive-ux ticket 03, ADR 0003). The list shows a checkbox, an icon and the name, Modified and Size
  (flex rows on a desktop; on a phone the name with date and size under it, so the list fits
  and `#wrap` no longer scrolls sideways; the header sticks under the top bar again). Every
  other column (extension, tags) is hidden through upstream's own column hiding the first time
  a browser sees it, so it comes back from Settings' hidden-columns list (More tools). On a
  desktop a click selects (Ctrl / Shift extend), a double-click or Enter opens; on a touch
  screen a tap opens and a long-press (500 ms, or Android's contextmenu) selects, then taps
  toggle; no callout or text selection. Opening does what upstream's links do: a folder
  through its listing, images / video in the lightbox, audio in the player, text in the text
  viewer, else the link. Names stay links (middle-click, open in new tab). While anything is
  selected a selection bar (`role=toolbar`, one tab stop) replaces the breadcrumb, sticky under
  the top bar: count, clear, Share (upstream's share flow until ticket 08), Download (one file,
  else a zip), Move to… (upstream's cut until ticket 07), Delete, and More actions (Open, Rename,
  Copy, Cut, Paste, Download as zip, Copy link, Share with people, Select all, Invert). With
  nothing selected but upstream's clipboard full, it offers Paste here. Copy, cut and move end
  the selection. The delete confirm reads "Delete N items forever?" (upstream's second "last
  chance" ask stays unless quick delete is on). Keys: Enter, Delete (and Backspace on a Mac),
  Ctrl+A, Esc clears the selection; upstream's other hotkeys stay. Upstream's bottom file-op
  buttons (`#wfm`, `#wzip`, `#wfs`) are hidden. `rowsel.js` got accessible names on its boxes
  ("Select <name>", "Select all")
- **upstream lines touched:** none. `scripts/sfx.ls`: `web/forklist.js`; `fork_grants.py` adds
  it to upstream's `RES`; one line in `fork-browser.js`'s `SCRIPTS` (after `rowsel.js`); five
  icons added to `forkui.js`
- **fork files:** `copyparty/web/forklist.js`, `tests/test_fork_drive_list.py`,
  `tests/e2e/specs/list.spec.js`; harness fixtures `open` (double-click / tap), `longPress`,
  `selbar`; `specs/sharelink.spec.js` now opens with `open` (a click only selects)
- **on conflict:** nothing to merge, but the list leans on upstream names, each listed in
  `tests/test_fork_drive_list.py`: msel (`load` wrapped to drop the duplicates `load(true)`
  leaves after a sort, `selui`, `origin_tr` / `so`, `evsel`, the rows' `tabindex`),
  `#files.onclick` and the `td.onclick = seltgl` it pre-empts with capture listeners, the lead
  cell's `a.play` / `a.doc.bri[hl]` (every file has a `-txt-` link; `bri` = a text type), `img_re` and `thegrid.imshow`, fileman (`render` wrapped;
  `delete`, `cut`, `cpy`, `paste`, `rename`; the `.hide` class on `#fren #fdel #fcut #fpst
  #fshr`; `fd_warn1`; the `fman_clip` key), `#seldl` / `#selzip`, `#wfm #wzip #wfs`,
  `document.onkeydown = ahotkeys` (our keys run first, in a window capture listener),
  `filecols.set_style` / `hide`, the `chide_ok` ask and the `min` class, the header names
  (`c`, `File Name`, `Size`, `Date`), `#bbox-overlay.visible`, `#rui` / `#shui`. After an
  upstream merge, run `./scripts/fork-e2e.sh` (`specs/list.spec.js`)

### upstream edit: drive-ux + New and upload card (forknew.js)

- **what it is:** drive-ux ticket 05. **+ New** (the
  nav's button from forkshell.js, and a floating + at the bottom right below 800 px) opens a menu:
  New folder, File upload, Folder upload (not on a touch device, as upstream), New text file
  (needs read too). Hidden where the folder isn't writable, following upstream's `html.write`
  class from `apply_perms`. File / Folder upload click up2k's own newest hidden input in
  `#u2form`, so up2k stays the only uploader (resume by content hash, dedup, its settings,
  `uc.ask_up`'s "upload N files?" confirm, kept). New folder / New text file are small dialogs
  posting `act=mkdir` / `act=new_md` as upstream's tabs do; the name dialogs show the server's
  refusal and "already exists" (405 / 500) inline. The **upload card** (bottom right; full width
  on a phone) reads `up2k.ui.tab` and `up2k.st.files` (a 300 ms poll while anything is busy,
  started by a wrap of `up2k.ui.addfile`): "Uploading N items", per-file progress, Done, Failed
  with the server's reason, collapse, close (the next upload brings it back with only the new
  files), Details = up2k's full panel. Search-mode files (`entry.srch`) are not shown.
  **Behaviour changed in this look only:** picking or dropping files no longer opens up2k's panel
  (`gotfile`'s `goto('up2k')` is turned into `up2k.init_deps()` while our capture listener marks
  a file drop or a change on a `#u2form` input; in search mode the panel still opens); New folder
  stays in the folder (upstream's tab goes into the new one); New text file stays too (upstream's
  tab opens the editor). The + and the card sit above upstream's audio bar (`#widget.open`,
  measured), `#wrap` gets bottom padding so they never cover the last row, and upstream's
  toasts move up above the card. `forkui.create = {items(opener), folder(opener), files(), dir(),
  textfile(opener)}` is the API the folder menu (ticket 12) reuses; forkshell.js now exports
  `forkui.newbtn` and `forkui.opentool` and no longer fills + New itself
- **upstream lines touched:** none. `scripts/sfx.ls`: `web/forknew.js`; `fork_grants.py` adds it
  to upstream's `RES`
- **fork files:** `copyparty/web/forknew.js` (icons added to `forkui.js`),
  `tests/test_fork_drive_new.py`, `tests/e2e/specs/upload.spec.js`
- **on conflict:** nothing to merge, but it leans on upstream names, each listed in
  `tests/test_fork_drive_new.py`: `up2k` / `up2k_hooks`, `up2k.ui` (U2pvis `addfile`, `tab[n]`
  `in` / `bd` / `bt` / `nh` / `hp`), `up2k.st.files[n]` (`name`, `purl`, `srch`, `t_hashing`,
  `t_uploading`), `up2k.uc.fsearch`, `init_deps`, `gotfile`'s `goto('up2k')`, the `#u2form`
  inputs (`file{0}` / `dir{0}[webkitdirectory]`), `MOBILE`, `html.write`, `perms`, `rw_edit` /
  `re_rw_edit`, `#widget.open`, `#toast`, and the server's mkdir 405 / new_md 500 answers. After an
  upstream merge, run `./scripts/fork-e2e.sh specs/upload.spec.js`

### upstream edit: account menu (forkacct.js)

- **what it is:** the account menu of the Drive-style file browser (drive-ux ticket 10). The top bar's avatar (a button with the account's initial,
  put there by `forkshell.js`) opens a `forkui.menu` (a bottom sheet with the account name below
  800 px): Change password (`/?h#chpw`; `ctlpanel.js` focuses its change-password form there, or
  says chpw is off), My share links (`/?shares`, only with `shr`), My grants (`/?grants`, left
  out once `/?grants=rcpts` answers other than 200), Control panel (`/?h`), Log out (posts
  `act=logout` to the page, as upstream's `#flogout` does). Links carry the `--rp-loc` prefix
  (`SR`). No avatar for a guest or with `ui_noacci` / `?noacci`; Control panel left out with
  `ui_nocpla` / `?nocpla`; `?fullui` overrides both, copying upstream's hide tests. The avatar is
  outside `#acc_info`, which `apply_perms` rebuilds on every folder load, so nothing is re-added.
  `forkui.menu` items may now be links (`href`) and separators (`sep`). Retires the fork's old
  control-panel link (`acclink.js`, its registration and its names test)
- **upstream lines touched:** none. `scripts/sfx.ls`: `web/forkacct.js` (and `web/acclink.js`
  removed); `fork_grants.py` adds it to upstream's `RES`
- **fork files:** `copyparty/web/forkacct.js`, the `#chpw` focus in `copyparty/web/ctlpanel.js`,
  `tests/test_fork_drive_account.py`, `tests/e2e/specs/account.spec.js`; the harness got
  accounts `out0` to `out15`, one per worker for the scenario that logs out (a logout ends every
  session of the account: `forget_session`), fixture `logoutUser`
- **on conflict:** nothing to merge, but the menu leans on upstream names, each listed in
  `tests/test_fork_drive_account.py`: the `ui_noacci` / `ui_nocpla` / `fullui` tests, the
  `#flogout` form's `act=logout`, `acct` / `have_shr` / `SR` as globals, `act == "logout"` /
  `"chpw"`, `?shares`, `?grants`, and on the splash page `#x`, `#un`, `#cc`. After an upstream
  merge, run `./scripts/fork-e2e.sh specs/account.spec.js`, and once behind `rp-loc` check that
  each entry keeps the prefix (the harness has no `rp-loc` server)

### upstream edit: row menu (forkrowmenu.js)

- **what it is:** the row menu of the Drive-style file browser (drive-ux ticket 06). Every list row gets a ⋮ ("Actions for <name>"; on hover
  or focus on a desktop, always on a touch screen, 44 px) that opens one shared `forkui.menu`
  "Actions"; a right-click on a row (or Shift+F10 / the context-menu key on a focused row)
  opens the same menu at the pointer instead of upstream's `#rcm`. Entries, each shown where
  upstream's would be: Open, Play, Play as audio, Open as text, Open in markdown viewer, Open
  in office editor; Download, Download as zip, Share, Share with people, Copy link; Move to…,
  Rename, Copy, Cut, Paste, Details (once ticket 13 sets it); + New's entries (`forkui.create`, forknew.js; upstream's `#rnfo` / `#rnfi` without it); Select
  all, Invert selection, Share this folder; Delete. A right-click on the list's empty space
  gives the folder's entries. On a row in the selection it acts on the whole selection; on
  another row on that row alone (a desktop keeps that row selected, as Drive does; a touch
  screen gives the old selection back when the menu closes). Upstream's `rcm_en` (off = the
  browser's menu), `rcm_db`, Shift+right-click and `?doc=` still hold. On a phone the menu is a
  bottom sheet with the item's name and a grab handle; it closes by swipe down, tap outside or
  Esc, focus back on the ⋮. `forkui.menu` got trigger-less (shared) menus opened at an element
  or a point, script placement for those (a tall menu stays inside the viewport in every
  browser), swipe-to-close on every sheet, `dense`, `onclose` and a function `title`.
  `forklist.js` got `forkui.actions` (share, move, rename, details, download, delete: the
  selection bar and the row menu both call them; later tickets replace one entry), more of
  `forkui.list` (`only`, `clip`, `paste`, `act`, `insrch`), and leaves clicks on `.fk-own`
  elements in a row alone
- **upstream lines touched:** none. `scripts/sfx.ls`: `web/forkrowmenu.js`; `fork_grants.py`
  adds it to upstream's `RES`; one line in `fork-browser.js`'s `SCRIPTS` (after `forklist.js`)
- **fork files:** `copyparty/web/forkrowmenu.js`, `tests/test_fork_drive_rowmenu.py`,
  `tests/e2e/specs/rowmenu.spec.js`; harness fixture `swipe`
- **on conflict:** nothing to merge, but the menu leans on upstream names, each listed in
  `tests/test_fork_drive_rowmenu.py`: `#rcm`'s entry ids (the test fails when upstream adds
  one, until the row menu offers it), `rcm`'s `rcm_en` / `rcm_db` settings and its bare
  `{enabled: false}` on MOBILE, `#wrap.oncontextmenu` (pre-empted by a capture listener), how
  `show()` types a row from the lead cell's first node, `play`, `thegrid.imshow`,
  `showfile.show`, `?v`, `?wopi=` / `wopi_set`, `#rnfo` / `#rnfi` (upstream's name box) and
  `goto('mkdir' / 'new_md')`, fileman's hide rules and `share`, a grid tile's `ref`, `perms`.
  After an upstream merge, run `./scripts/fork-e2e.sh specs/rowmenu.spec.js`

### upstream edit: drive-ux views that aren't folders (forkviews.js)

- **what it is:** the nav's *Shared with me* and *Recent uploads* of the Drive-style file browser
  (drive-ux ticket 04), drawn in the section
  `forkshell.js` puts in the list's place (`forkui.shell.views`). *Shared with me*: **From
  people**, one heading per owner with the grants this account receives (`/<top>/?ls` and
  `/<top>/<owner>/?ls`, `top` from `/?grants=rcpts`; only mounted grants are listed there, so
  suspended, broken and expired ones never show), and **Server folders**, the root listing
  (`/?ls`) minus the grants folder and the account's home folder (a root folder holding it,
  `/home/`, is listed in its place without it); "Nothing is shared with you yet" when both are
  empty. *Recent uploads*: upstream's `/?ru&j` as a table of Name (the file), Location (its
  folder, as "My files/..." under the home folder), Uploaded, Size and By; Uploaded and By are
  blank where the server hides them (`at` 0, `un` `(?)`: others' uploads for a non-admin unless
  `--ups-when`); on a phone (the section under 600 px, a container query) each row is the name
  over "by X, when", the folder a 48 px button. Its nav entry is hidden when a small probe
  (`/?ru&j&filter=^//`, which matches no path) answers other than 200 (`--no-ups-page`, no
  index). Folder links open in the list (`treectl.goto`), files as links. No request for a guest
- **not done as the spec words it:** the browser can't tell "`ups_who` shows this account
  nothing" from "nothing uploaded yet" (no flag in any reply), so both show the empty state; and
  with the tested config the admin holds only `a` on other home folders, so the server (and so
  *Shared with me*) lists none of them
- **upstream lines touched:** none. `scripts/sfx.ls`: `web/forkviews.js`; `fork_grants.py` adds
  it to upstream's `RES`
- **fork files:** `copyparty/web/forkviews.js`, the `forkui.shell` hook in
  `copyparty/web/forkshell.js` (replacing the placeholders), icons `folder` / `file` in
  `forkui.js`, `tests/test_fork_drive_views.py`, `tests/e2e/specs/views.spec.js`; the harness got
  a `/lab` volume (`r: dave`, then `A: admin` alone after a config rewrite and `?reload=cfg`),
  grants bob to alice `bike` (active) and `old` (folder removed: broken), dave to alice `kit`
  (suspended), and uploads by bob (`/family/up/`) and carol (her home)
- **on conflict:** nothing to merge, but the views lean on upstream names, each listed in
  `tests/test_fork_drive_views.py`: `?ru` / `&j` / `filter` and the reply's `ups` with `vp sz at
  un`, the `^` prefix filter, the root listing of a server with no volume at `/`
  (`tx_ls_vols`), and `vsplit`, `uricom_dec`, `humansize`, `unix2ui`, `treectl.goto`. After an
  upstream merge, run `./scripts/fork-e2e.sh specs/views.spec.js`

### upstream edit: drive-ux search (forksearch.js)

- **what it is:** the search box of the Drive-style file browser (drive-ux ticket 14). Typing (500 ms after the last key) or Enter in the top
  bar's box runs upstream's search for names under the current folder; the hits are upstream's
  search results in the list. Below the top bar a chip row (`role=toolbar` "Search filters",
  one tab stop, scrolls sideways on a phone): **Type** (Images, Videos, Audio, PDFs, Documents,
  Spreadsheets, Presentations, Archives: extension groups), **Modified** (today, last 7 / 30
  days, this year, last year, a custom range in a small dialog) and **Advanced** (upstream's
  search panel, its name and date fields filled in). A set chip shows its value and is named
  "Type: Images". `/` focuses the box; Esc in it or its ✕ end the search through upstream's
  close-search link, and opening a folder ends it too. A hidden status line says how many
  hits (or the server's refusal). The query is written straight into upstream's raw field
  `#q_raw` and run by that field's Enter handler, in the syntax its form writes: upstream
  searches every volume the account can read, so "under this folder" is the term
  `( path like <folder> or path like <folder>/* )` (the form's path field can only say "starts
  with", which also takes `<folder>2/`), and a type is `( name like *.jpg or ... )`. Name
  words follow the form's name field (each word must be in the name; `-word`, `^`, `$`).
  Dates are local times sent as the UTC text dates the form takes. The box shows only where
  upstream shows its search tab (read + an index; not on a share link): `forkshell.js` hides it
- **upstream lines touched:** none. `scripts/sfx.ls`: `web/forksearch.js`; `fork_grants.py` adds
  it to upstream's `RES`; one line in `fork-browser.js`'s `SCRIPTS` (after `forklist.js`);
  `forkshell.js` exposes `forkui.shell` (box, input, `opentool`) and calls
  `forkui.shell.onsearch` on submit when set; two icons (`check`, `caret`) in `forkui.js`
- **fork files:** `copyparty/web/forksearch.js`, `tests/test_fork_drive_search.py`,
  `tests/e2e/specs/search.spec.js`; the harness seeds carol's `search/`, `search2/` and
  `other/` folders (one file with a 2019 modified time), a volume `/attic` for carol with no
  index (`d2d`), and waits for the startup scan before the tests start
- **on conflict:** nothing to merge, but search leans on upstream names, each listed in
  `tests/test_fork_drive_search.py`: `search_ui.render` (wrapped), `#q_raw` and its
  `onkeydown` Enter handler, the `#srch_<k>v` / `#srch_<k>c` fields (`name`, `dtl`, `dtu`),
  `#unsearch`, `#srch_q` with its `err` class, `reload_browser` (wrapped), `treectl.show` /
  `hidden`, `#opa_srch`'s `data-dep="idx"`, and on the server the query keywords (`(`, `)`,
  `or`), `path` as volume + folder, and that it searches every readable volume. Opening a hit
  is upstream's: a text or other non-media hit opens its folder (the search ends), an image
  the lightbox. After an upstream merge, run `./scripts/fork-e2e.sh specs/search.spec.js`

### upstream edit: Share dialog: share links (forkshare.js, fork_shares.py)

- **what it is:** the Share dialog of the Drive-style file browser, its General access part
  (drive-ux ticket 08). Share in the selection bar,
  the row menu (`forkui.actions.share`), upstream's `#fshr` button and its share hotkey all open
  one dialog on the item: one folder, files of one folder, or the current folder with nothing
  selected. General access is Restricted or Anyone with the link: the latter offers a form
  (Access: Viewer / Viewer and uploader / Uploader, only what the folder's perms allow and only
  Viewer for files; optional password; expiry never / 1 hour / 1 day / 7 days (default) / 30
  days; optional link name) that posts upstream's `?share` request, and lists every share link
  on the item (its url in a read-only field, access, password, time left, who made it if not
  you) with Copy link and Remove (`?eshare=rm`). Back to Restricted removes them all, after an
  inline ask. Server refusals are shown as given (`role=alert`); results are announced in a
  polite status line. Copy uses the Clipboard API in a secure context, else selects the link's
  field and `execCommand('copy')` (plain http on the LAN is no secure context), else leaves it
  selected and says so. It replaces the fork's 🔗 link button (`linkbtn.js`, ticket grants/16,
  retired with its test). Guests never see Share (upstream's `can_shr`) and nothing here makes a
  request before the dialog opens. A dialog part can be added before General access with
  `forkui.share.section` (ticket 09's Add people)
- **the json list:** `GET /?shares&j` (account-wide, so at the root, `SR + '/?shares&j'`):
  `{"now": unixtime, "rows": [{"k", "url", "vp": "/vol/path" (no `--rp-loc`, no trailing
  slash), "files": [names] ([] for a folder link), "pw": bool, "pr": "rwmdg." letters, "un",
  "t0", "t1" (0 = never)}]}`: the rows of the `?shares` page under its checks (403 for a guest
  instead of the page's "you're not logged in"; the caller's own links, everyone's for
  `--shr-adm`). `url` is the link `handle_share` answers with (`shr_site`, else scheme://host;
  `--rp-loc`; the file name for a one-file link). No password hash goes out
- **upstream lines touched:** `httpcli.py`: one import line, and in `handle_get`'s account-wide
  block two lines right before `if "shares" in self.uparam: return self.tx_shares()`:
  `if "shares" in self.uparam and "j" in self.uparam: return tx_shares_json(self)  # fork`.
  `scripts/sfx.ls`: `copyparty/fork_shares.py`, `web/forkshare.js`; `fork_grants.py` adds it to
  upstream's `RES`; one line in `fork-browser.js`'s `SCRIPTS` (replacing `linkbtn.js`'s)
- **fork files:** `copyparty/fork_shares.py`, `copyparty/web/forkshare.js`,
  `tests/test_fork_shares_json.py`, `tests/test_fork_drive_share.py`,
  `tests/e2e/specs/share.spec.js`
- **on conflict:** `httpcli.py`: keep the two lines before upstream's `?shares` dispatch.
  `fork_shares.py` copies `tx_shares`' row query and checks and `handle_share`'s link format
  (keep in step; `test_same_rows_as_the_page` and `test_rows_of_a_folder_and_a_file_link`
  compare them). The dialog leans on upstream names listed in `tests/test_fork_drive_share.py`:
  `fileman.share` and `#fshr`'s `onclick` (replaced), `#fshr`'s `hide` class, `perms`, the
  `?share` body keys and 201 reply, `?eshare=rm&skey=`, util.js's `noq_href`, `uricom_dec`,
  `get_evpath`, `hunpre`, `randstr`, `has`. After an upstream merge, run
  `./scripts/fork-e2e.sh specs/share.spec.js`
- **was a known gap:** a grant mount refuses share links but its listing said `auth`, so Share
  showed there and the server refused; since ticket 09 the listing says `no` and Share is
  hidden (see [Add people](#upstream-edit-share-dialog-add-people-forkpeoplejs-grantsj))

### upstream edit: share link revoked during a reload

- **what it is:** fixes an upstream race found by the Share dialog's end-to-end tests (drive-ux
  ticket 08): `AuthSrv._reload` reads the share table twice (once to make a node per link, once
  to map each to its source), and `?eshare=rm` deletes rows outside the reload mutex. A link
  revoked between the two reads kept a node with no source, and the reload died with
  `TypeError: cannot unpack non-iterable NoneType object` (a 500 to whoever caused the reload,
  e.g. someone else creating a link, and a half-applied reload). Now such nodes are dropped, as
  upstream drops a link whose owner lost access
- **upstream lines touched:** `authsrv.py` `_reload`, right before `# transplant shadowing into
  shares`: two lines (marked `# fork`) popping every `shv.nodes` entry whose `shr_src` is unset
- **fork files:** `tests/test_fork_shr_race.py`
- **on conflict / if upstream fixes it:** **take upstream's version and drop ours**; keep the
  test if it still passes

### upstream edit: reload publishes the volumes only when final

- **what it is:** fixes an upstream bug (`.scratch/upstream-bugs/issues/03`, cause 1): two
  reloads close together could leave up2k refusing every upload until a restart (503 "server
  busy with fs-reload"). `AuthSrv._reload` set `self.vfs` before it dropped the share link
  volumes from `vfs.all_vols` and mapped them; up2k, reinitialising after an earlier reload,
  read `all_vols` in that window, its rescan thread died on the links' missing `dbd` volflag
  (`KeyError: 'dbd'` in `init_indexes`) and `reloading` never cleared. Now `self.vfs` is set
  after the share block, so readers see the old volumes or the finished new ones. Repro (20
  `?reload=cfg` 5 ms apart, one link): 3 of 30 bursts stuck before, 0 of 70 after. Cause 2
  (fast boot's `deferred_init` losing its `gid` to a reload) is not patched: `no-fastboot` on
  the Pi. up2k's reload thread is left as is too: its wait for the dead rescan (`self.pp`
  never cleared) is what hangs, and unsticking that means unwinding `init_indexes` halfway
- **upstream lines touched:** `authsrv.py` `_reload`: the `self.vfs = vfs` line before
  `self.acct = acct` is moved down to just before `zb1 = zb2 = False` (after the `if enshare:`
  block's `db.close()`), marked `# fork`. Mounting grants still happens after it, as before
- **fork files:** `tests/test_fork_reload_vfs.py`
- **on conflict / if upstream fixes it:** **take upstream's version and drop ours**; keep the
  test if it still passes

### upstream edit: drive-ux Move to… (forkmove.js)

- **what it is:** the Move to… dialog of the Drive-style file browser (drive-ux ticket 07). It replaces `forkui.actions.move` (upstream's cut, before),
  so the selection bar's Move to… and the row menu's both open it. A modal `<dialog>` (forkui's:
  Esc, tap outside, the back gesture, focus back to the opener; the whole screen on a phone,
  buttons at the bottom): a heading naming what moves, **My files** / **Shared with me** root
  buttons, a breadcrumb (`nav` "Folder path", the current folder `aria-current`), the folder
  list ("Folders", `?ls` of the folder shown; Shared with me is `forkui.views.shared`: grants
  "from <owner>" and server folders), **New folder** (POST `act=mkdir` to the folder shown, then
  opens the new one) and **Move here**. It starts at the current folder (in search results, My
  files). Move here is off, with the reason in a status line, where the account's `?ls` perms
  have no `write`, inside a folder being moved, or where every item already is; a folder being
  moved is listed but can't be opened. Moving is paste's request
  (`POST <vp>?move=<dst><name>&akey=`) one item after another, then `treectl.goto()` and
  `fileman.tx` for other tabs; all moved closes it with a toast, else an alert in the dialog
  says how many moved and lists each refused item with the server's reason (minus the URL line),
  and the dialog stays on the refused ones. A guest keeps upstream's cut (the picker would ask
  for folders outside the share link). Its CSS also restyles `dragmove.js`'s drop target
  (`fmv-hl`) and drag image (`fmv-img`); dragging itself is unchanged (mouse only)
- **upstream lines touched:** none. `scripts/sfx.ls`: `web/forkmove.js`; `fork_grants.py` adds
  it to upstream's `RES`; one line in `fork-browser.js`'s `SCRIPTS` (last: after `forklist.js`,
  `forkviews.js` and `dragmove.js`)
- **fork files:** `copyparty/web/forkmove.js`, `tests/test_fork_drive_move.py`,
  `tests/e2e/specs/move.spec.js`
- **on conflict:** nothing to merge, but it leans on upstream names, each listed in
  `tests/test_fork_drive_move.py`: `msel.load` / `getall` and its items' `vp fn isd`, `tr2id`,
  paste's `?move=` + `&akey=`, `fileman.tx`, `treectl.goto`, `act=mkdir` and its `X-New-Dir`
  header, and `randstr`, `uricom_enc` / `uricom_dec`, `get_evpath`, `has`, `unpre`. After an
  upstream merge, run `./scripts/fork-e2e.sh specs/move.spec.js specs/dragmove.spec.js`

### upstream edit: drive-ux rename dialog (forkrename.js)

- **what it is:** the rename dialog of the Drive-style file browser (drive-ux ticket 11). Rename on one item (the selection bar's More actions, the
  row menu, F2, and upstream's own callers of `fileman.rename`) opens a small `forkui.dialog`
  "Rename" with a "New name" field, the name selected up to the extension for a file (the
  whole name for a folder); Enter or Save sends upstream's own request (`POST <item>?move=<same
  folder>/<new name>`, 201). A refusal shows the server's reason in the dialog (`role=alert`,
  the field's description) and keeps it open; an empty name, `/`, `.` and `..` are refused
  before asking. After the reload the renamed row has focus, and is selected again if it was.
  Several items (or no move rights) go to upstream's batch rename panel (`#rui`) unchanged.
  F2 with nothing selected renames the focused row. For ticket 12: `forkui.rename(item,
  opener, done)`, `item` = `{ vp, fn, isd }`
- **upstream lines touched:** none. `scripts/sfx.ls`: `web/forkrename.js`; `fork_grants.py` adds
  it to upstream's `RES`; one line in `fork-browser.js`'s `SCRIPTS` (last); it replaces
  `forkui.actions.rename` (forklist.js) and reuses forknew.js's name-dialog styles
- **fork files:** `copyparty/web/forkrename.js`, `tests/test_fork_drive_rename.py`,
  `tests/e2e/specs/rename.spec.js`
- **on conflict:** nothing to merge, but the dialog leans on upstream names, each listed in
  `tests/test_fork_drive_rename.py`: `fileman.rename` (wrapped; F2 and the right-click menu
  call it through `fileman`, `bren.onclick` is re-set), `#fren`'s `hide` class as the
  permission, the batch panel's `#rui` / `#rn_new_<n>` / `#rn_apply`, the `?move=` request and
  its 201, `msel.getsel` / `getall` items and `msel.render` (wrapped, to focus the renamed row),
  `treectl.goto`, `fileman.tx`, `vsplit`, `uricom_enc`, `unpre`. After an upstream merge, run
  `./scripts/fork-e2e.sh specs/rename.spec.js`

### upstream edit: drive-ux grid view (forkgrid.js)

- **what it is:** the grid view of the Drive-style file browser (drive-ux ticket 15). A **Layout** group (List layout / Grid layout,
  `aria-pressed`) floats right of the breadcrumb and clicks upstream's `#griden`, so the choice
  is upstream's `griden` setting in this browser (its `g` hotkey and `?grid` still work).
  Upstream's tiles (`#ggrid`) are still built, hidden, and stay the lightbox's gallery; after
  each `thegrid.loadsel` (the end of every grid load, and every selection or player change)
  `forkgrid.js` builds its own `#fk-grid` from them when they are new, else re-syncs: a
  **Folders** list of compact tiles, then a **Files** list of cards (`li` with a checkbox, the
  name as the one link stretched over the card, a ⋮ of class `fk-own`, and upstream's thumbnail
  url in a lazy `img`; cards past the first screen get `content-visibility:auto`). Each card
  carries its row's link id in `data-fk-ref` and mirrors the row's `sel`, `play` and `fcut`.
  `forklist.js` maps a card to its row (its click, double-click, long-press listeners also sit
  on `#gfiles`) and `forkrowmenu.js` takes right-clicks on it (focus goes back to the card's
  link); the ⋮ calls `forkui.rowmenu.open`. Keys on a card: Enter opens, Space selects, arrows
  move, Shift+F10 / the context-menu key open the row menu. Upstream's grid bar keeps only its
  sort links (zoom, chop, crop, 3x and multiselect are hidden; multiselect is switched off, as
  a click already selects). Upstream's 250-row paging (and its "show all" ask on Firefox for
  Android) is unchanged
- **upstream lines touched:** none. `scripts/sfx.ls`: `web/forkgrid.js`; `fork_grants.py` adds
  it to upstream's `RES`; one line in `fork-browser.js`'s `SCRIPTS` (after `forklist.js` and
  `forkrowmenu.js`)
- **fork files:** `copyparty/web/forkgrid.js`, `tests/test_fork_drive_grid.py`,
  `tests/e2e/specs/grid.spec.js`; small edits in `forklist.js` and `forkrowmenu.js`
  (`data-fk-ref`)
- **on conflict:** nothing to merge, but it leans on upstream names, each listed in
  `tests/test_fork_drive_grid.py`: `thegrid` (`en` / `griden`, `sel` / `gridsel`, `setvis`,
  `loadsel`, `dirty`, `onhide` read by `bagit`, `imshow`), the tile markup
  (`#ggrid > a[ref] > img`), `#ghead`'s last span (sort), `msel.selui` calling
  `thegrid.loadsel` and `msel.origin_tr`. After an upstream merge, run
  `./scripts/fork-e2e.sh specs/grid.spec.js specs/list.spec.js`

### upstream edit: drive-ux Details panel (forkdetails.js)

- **what it is:** the Details panel of the Drive-style file browser (drive-ux ticket 13). ⓘ ("Details", `aria-expanded`) sits in the top bar before
  More tools; `forkui.actions.details` makes Details show in the row menu and the selection
  bar's More. On a desktop it is a side panel (`aside`, "Details") at the right that follows
  the selection: it redraws after every `fileman.render` (which `msel.selui` calls after each
  selection change, listing and search result). On a phone it is a full-screen `forkui.dialog`
  sheet (back gesture closes it) showing what was selected when it opened. Nothing selected: a
  prompt; several: "N items selected"; one: the name, then **Who has access** (the account
  holder's own grants and share links on the item, from `forkui.share.people` /
  `forkui.share.links`, i.e. `?grants&j` and `?shares&j`; each entry and Manage access open the
  Share dialog, and the panel re-reads both lists when that dialog closes; "Not shared by
  you." when empty), then Type (from the extension), Size (the size cell's `sortv`; not for
  folders), Modified (the `th[name=ts]` column) and Location (the item's folder, "My files ›
  …", opened through `treectl.goto`). A guest gets no Who has access and the script makes no
  request. Esc in the panel closes it (`data-fk-keys` keeps `forklist.js`'s Esc from clearing
  the selection there)
- **upstream lines touched:** none. `scripts/sfx.ls`: `web/forkdetails.js`; `fork_grants.py`
  adds it to upstream's `RES`; one line in `fork-browser.js`'s `SCRIPTS` (after `forkgrid.js`);
  one icon in `forkui.js`; `forklist.js`'s `busy()` also skips a `[data-fk-keys]` element
  holding focus
- **fork files:** `copyparty/web/forkdetails.js`, `tests/test_fork_drive_details.py`,
  `tests/e2e/specs/details.spec.js`
- **on conflict:** nothing to merge, but it leans on upstream names, each listed in
  `tests/test_fork_drive_details.py`: `fileman.render` and `msel.selui` calling it, the row
  markup (`sortv` on the size cell, for listings and search hits), the `ts` header, `#fshr`'s
  `hide` class, `treectl.goto`, `noq_href` / `uricom_dec` / `get_evpath` / `clgot`, `SR`. After
  an upstream merge, run `./scripts/fork-e2e.sh specs/details.spec.js`

### upstream edit: drive-ux viewers and audio player (forkview.js)

- **what it is:** upstream's viewers and audio player in the Drive-style file browser (drive-ux
  ticket 16). The lightbox (images, video) gets a
  dark top bar: Close (upstream's own `#bbox-close`, moved into it), the file's name (which
  also names the lightbox dialog), Previous file / Next file at the sides, Download, Share
  (`forkui.share.open`, the Share dialog) and More options holding upstream's other lightbox
  buttons (rotate, zoom, full screen, select, video mode, go to page, animation, reading
  direction, keyboard shortcuts); upstream's button row, side arrows and caption are hidden.
  Arrows, Esc, swipe and the other hotkeys stay upstream's; closing puts focus on the row of
  the file last shown. The text viewer (text, code, markdown) gets the same bar (Close, name,
  ‹ ›, Download, Share, More options: Edit, Select, Beautify JSON, Follow changes, Word wrap)
  over upstream's hidden button row (its follow settings still show while following). The
  audio player is a light bar along the whole bottom: previous / play-pause / next (clicking
  upstream's `#pctl`), the track's name, upstream's seek and volume canvases laid out anew,
  More player options (Download track, upstream's copy / playlist buttons when enabled,
  Player settings) and Close player (pauses and hides; the next track brings it back).
  Upstream's `#wtoggle` tab is hidden (its file buttons were hidden already by forklist.js; its
  grid toggle `#wtgrid` goes with it: forkgrid.js's Layout buttons and hotkey G stay). Player
  settings stay in More tools
- **HEIC in the lightbox** (deploy-pi ticket 06): upstream treats `.heic`/`.heif` as pictures
  only on Apple (`img_re` in `browser.js`, `re_i` in `baguettebox.js`, by user agent, so Chrome
  on a Mac gets the raw file it can't show), and elsewhere tapping one downloads it. Here every
  browser opens it in the lightbox: `img_re` gets HEIC (so the list, the grid, `forklist.js` and
  upstream's autogrid count it as a picture), and the `baguetteBox.run` wrap gives each HEIC
  link an address ending in `.webp` for the length of upstream's run, so upstream builds the
  gallery items itself (order, click handlers, options), then puts the address back. Where the
  browser can't decode HEIC (an 8x8 HEIC in a data URI, checked once at load, as upstream checks
  webp and jxl), each HEIC item gets `href` = the file + `?th=wf3` (the server's webp preview, up
  to 960x768, cached in `.hist/th`), which baguetteBox loads instead of the link, and `fkorig` =
  the file, which the bar's Download uses; the caption's download link is the link, so the file
  too. Needs pillow-heif (or vips / ffmpeg) on the server, as the thumbnails do
- **upstream lines touched:** none. `scripts/sfx.ls`: `web/forkview.js`; `fork_grants.py` adds
  it to upstream's `RES`; one line in `fork-browser.js`'s `SCRIPTS` (after `forkrename.js`); six
  icons in `forkui.js`
- **fork files:** `copyparty/web/forkview.js`, `tests/test_fork_drive_viewers.py`,
  `tests/e2e/specs/viewers.spec.js`, `tests/e2e/specs/heic.spec.js`, `tests/e2e/media/` (seeded
  media for the harness; `tiny.heic` is the same 8x8 HEIC as the check)
- **on conflict:** nothing to merge, but it leans on upstream names, each listed in
  `tests/test_fork_drive_viewers.py`: `baguetteBox.run` (wrapped, for `onChange` /
  `afterHide`), the overlay's button ids and its document-level focus trap and keydown
  listener, `thegrid.bagit`'s `onChange` and tiles' `ref`, `showfile` (`files`, `url`,
  `taildoc`, `wrap`, `updtree` wrapped), `#bdoc` / `#hdoc`'s button ids and `#docname`,
  `widget.open` / `close` / `paused` (wrapped), the global `play` (wrapped: upstream opens the
  bar only for the first track), `playpause`, `dl_song`, `mp.au.osrc`, `#widgeti`, `#pctl`'s
  buttons, the canvases and `pbar` / `vbar.onresize`, `#wtoggle`'s `np` / `m3u` classes,
  `#fshr`'s `hide` class; for HEIC, `img_re`, `re_i` and the filter reading `element.href`
  only while `run` builds the gallery, `run`'s return value, `galleryItem.href` loaded before
  the link's, the caption's download link, util.js `addq`, th_cli's `f` / `3` format letters
  (`test_names_heic_in_the_lightbox_relies_on`). If upstream lists HEIC for every browser
  itself, drop the `img_re` line (the run wrap still points the items at the preview). After an
  upstream merge, run `./scripts/fork-e2e.sh specs/viewers.spec.js specs/heic.spec.js`

### upstream edit: Share dialog: add people (forkpeople.js, ?grants&j)

- **what it is:** the Share dialog's top part, "Add people and groups" (drive-ux ticket 09). For a folder: pick an account or a config group
  (`?grants=rcpts`; groups show as "family (group)"), Role Viewer or Viewer and uploader (only
  where the folder's perms hold write), Time limit never (default) / 1 hour / 1 day / 7 days /
  30 days, and the folder name they see (default: the folder's own); Add posts `?grant`. Below,
  the folder's grants (the owner's own rows of `?grants&j` whose `src` is the folder): who,
  role, time left, and a state that isn't active ("expired", "paused: …"), each with Remove
  (`?egrant=rm&gid=`). For a file the picker is disabled with "People can only be given
  folders, use a link for a file."; with grants off (`?grants=rcpts` answers 400) the part is
  hidden. Refusals are shown as the server words them (`role=alert`), results in the dialog's
  status line. The dialog's first focus skips disabled or hidden fields. It replaces the 🤝
  people button (`grantbtn.js`, retired with its registration, its upstream-names line and its
  "Share with people" entries in the row menu and the selection bar's ⋮). Extending a grant
  stays on the `?grants` page (My grants in the account menu)
- **the json list:** `GET /?grants&j` (account-wide, `SR + '/?grants&j'`), in `fork_grants.py`
  (`tx_grants`, rows from `_grant_rows`, shared with the page): `{"now": unixtime, "top":
  "shared", "rows": [{"gid", "owner", "rcpt" ("bob" or "@family"), "src": "/vol/path/",
  "name", "at": "/shared/<owner>/<name>/", "pr": "r" | "rw", "t1" (0 = never), "state"
  (active / expired / suspended / broken / no members / hidden folder)}]}`; the page's checks
  (401 for a guest, 400 with grants off; the caller's grants, every grant for `--shr-adm`)
- **a grant takes no share links, and now says so:** a grant volume and the `/shared/...`
  folders already had `shr_who: no` in their flags, but their listing config (`js_ls`, and the
  page's `js_htm`) was the source volume's, saying `auth`, so upstream and the Share dialog
  offered Share and the server refused. `_no_links_cfg` (`fork_grants.py`, at the end of
  `mount_grants`) gives them copies with `shr_who: no`, so `can_shr` is false and Share is
  hidden there (`test_grant_folders_say_they_take_no_share_links`)
- **upstream lines touched:** none beyond the grants dispatch (`?grants` already reaches
  `tx_grants`). `scripts/sfx.ls`: `web/forkpeople.js` (and `web/grantbtn.js` removed);
  `fork_grants.py` adds it to upstream's `RES`; one line in `fork-browser.js`'s `SCRIPTS` after
  `forkshare.js`
- **fork files:** `copyparty/web/forkpeople.js`, `copyparty/fork_grants.py`,
  `tests/test_fork_grants.py` (`test_json_list_*`, `test_grant_folders_say_*`),
  `tests/test_fork_drive_people.py`, `tests/e2e/specs/people.spec.js`
- **on conflict:** nothing in upstream files. The names it leans on are in
  `tests/test_fork_drive_people.py`: `apply_perms`' `shr_who` / `can_shr` lines and
  `Object.assign(res, res.cfg)`, util.js copying `CGV1` onto `window`, `browser.html`'s `CGV1`,
  authsrv's `js_ls` / `js_htm` (`shr_who` in both, `json_hesc`), httpcli's `cfg` / `cgv1`; plus
  forkshare.js's `forkui.share` API. After an upstream merge, run
  `./scripts/fork-e2e.sh specs/people.spec.js specs/share.spec.js`
- **known gaps:** a volume that allows grants but not share links (`shr_who: no`, `grant_who:
  auth`) has no Share at all, since the dialog hangs on upstream's `#fshr` (not our config);
  the grant name is checked by the server only (a refusal says to pick another name)

### upstream edit: drive-ux breadcrumb and folder menu (forkcrumbs.js)

- **what it is:** the breadcrumb of the Drive-style file browser (drive-ux ticket 12). After each `reload_browser` (which rebuilds upstream's
  `#path`: `#entree`, then an `<i>` and an `<a href>` per level) `forkcrumbs.js` moves those
  links into its own `<nav aria-label="Breadcrumbs"><ol>` inside `#path`, drops the `<i>`s
  (chevrons are CSS) and the levels above the start: My files (the home folder, relabelled),
  else a "Shared with me" link of its own that opens that view (`data-fk-view`, which
  `dragmove.js` now skips as a drop target), or the share link's name for a guest. The links
  stay upstream's, so `#path`'s onclick navigates and `dragmove.js` takes them as drop targets;
  `#path` stays the box, so upstream's show / hide of it (search, tree) still applies. The last
  level becomes a button (`aria-current=page`, `aria-haspopup=menu`) opening the **folder
  menu** (`forkui.menu`): New folder / Upload files / Upload folder (`forkui.create.items`,
  relabelled, without New text file), Share (`forkui.share.open(forkui.share.item())`, where
  `#fshr` isn't hidden and the folder has perms), Rename (`forkui.rename`, then
  `hist_replace` + `treectl.goto` to the new path; only with `have_mv` and move + write, never
  at My files or a share root, and outside My files only when the parent's own `?ls` perms
  allow writing, which rules out a volume's root), Download (upstream's `#zip1` link, when zip
  is on and the folder readable). With no entry the name is plain text. On a phone (below
  800 px) the levels between the first and the current folder collapse into a "…" button and
  menu ("Folders in between"), and the row doesn't wrap, beside the floated Layout toggle
- **upstream lines touched:** none. `scripts/sfx.ls`: `web/forkcrumbs.js`; `fork_grants.py`
  adds it to upstream's `RES`; one line in `fork-browser.js`'s `SCRIPTS` (last, after
  `forknew.js`, `forkshare.js`, `forkrename.js`, `forkgrid.js`)
- **fork files:** `copyparty/web/forkcrumbs.js`, `tests/test_fork_drive_crumbs.py`,
  `tests/e2e/specs/foldermenu.spec.js`; one selector in `dragmove.js`; a `rename` icon in
  `forkui.js`
- **on conflict:** nothing to merge, but it leans on upstream names, each listed in
  `tests/test_fork_drive_crumbs.py`: `reload_browser`'s `#path` rebuild, `#path`'s onclick,
  treectl's inline `display` on `#path`, `#docname`, `fileman.render` / `#fshr`'s `hide`,
  `#zip1`, the globals `perms`, `have_mv`, `have_zip`, `have_shr`, `in_shr`, `hist_replace`.
  After an upstream merge, run `./scripts/fork-e2e.sh specs/foldermenu.spec.js specs/dragmove.spec.js`
- **known gaps:** the jump-to-path a11y link (`.ayjump`, `#path a:nth-last-child(2)`) finds
  nothing now (it was hidden already); a folder whose parent check is still loading shows no
  Rename until it answers

### upstream edit: disk space page and storage bar (fork_disks.py, forkdisks.js)

- **what it is:** how full each disk is (disk-space tickets 02 and 03, `.scratch/disk-space/`). A
  disk is a filesystem: volumes are grouped by `st_dev` of their folder, and the numbers are the
  whole filesystem's (`get_df`, statvfs, as upstream's "free of" line), not per volume or per
  person; `vmaxb` is not shown. Upstream's `du_who` decides per volume who sees them; guests get
  401; neither reply holds a server path.
  - `GET /?disks&j`: `{"disks": [{"vols": ["/home/wayy/", "/family/"], "free", "total"}]}`, one
    entry per filesystem behind the volumes the caller can write to (`cli.wvol`), sorted
  - `GET /?disks`: a page (`web/disks.html`, styled like the grants page, `<meter>` bars, no
    script of its own) with one row per filesystem behind the volumes the caller has `a` on
    (`cli.avol`), and the volumes whose folder is missing ("is the disk unplugged?"). The
    control panel links it as "disk space" (`ctlpanel.js`)
  - the nav's Storage section (`web/forkdisks.js`): one row per entry of `?disks&j`, labelled
    "My files" (the disk of `/home/<account>/`), else the folder under My files (`hdd1`), else
    the volume's name; My files first, then by label; the other volumes on that disk in the
    row's tooltip. A bar (`role=meter`), red from 90 % used, and "X free of Y" (util.js
    `humansize`). Fetched at load, then with each `reload_browser` at most every 30 s, and at the
    first one after an upload started (up2k reloads the list when uploads end). Hidden when the
    reply is empty or fails; a guest makes no request
- **upstream lines touched:** `httpcli.py`: one import line, and in `handle_get`'s account-wide
  block two lines right after the `?grants` dispatch: `if "disks" in self.uparam: return
  tx_disks(self)  # fork`. `scripts/sfx.ls`: `copyparty/fork_disks.py`, `web/disks.html`,
  `web/forkdisks.js`; `fork_grants.py` adds the last two to upstream's `RES`; one line in
  `fork-browser.js`'s `SCRIPTS`
- **fork files:** `copyparty/fork_disks.py`, `copyparty/web/disks.html`,
  `copyparty/web/forkdisks.js`, `tests/test_fork_disks.py`, `tests/e2e/specs/disks.spec.js`
- **on conflict:** `httpcli.py`: keep the two lines after the `?grants` dispatch. `_du_ok` copies
  `tx_browser`'s `du_iwho` check (keep in step). The bar leans on upstream names listed in
  `tests/test_fork_disks.py` (`test_names_the_storage_bar_relies_on`): `reload_browser`,
  `up2k_hooks`, `up2k.ui.addfile`, `humansize`, and `forkshell.js`'s `.fk-nav` and
  `ui.shell.home`. After an upstream merge, run `./scripts/fork-e2e.sh specs/disks.spec.js`

### upstream edit: `harden`: metrics only for `--stats-u`

- **what it is:** with `harden`, `/.cpr/metrics` (`--stats`) answers only accounts in
  `--stats-u` (disk-space ticket 05). Upstream also lets in any account with `a` on some volume
  (`cli.avol`), and in this fork's config every account has `A` on its home folder, so anyone
  could read every volume's name (so every account name), size and file count. Without `harden`,
  upstream's rule. Outside, nginx strips logins on `/.cpr/` (`fork-https-outside.conf`), so
  metrics only answer Inside
- **upstream lines touched:** `metrics.py`: one import line, and `Metrics.tx`'s first check
  becomes `if (not cli.avol or stats_u_only(args)) and cli.uname.lower() not in
  args.stats_u_set:  # fork` (`stats_u_only` is `fork_harden.py`'s, true with `harden`)
- **fork files:** `copyparty/fork_harden.py` (`stats_u_only`), `tests/test_fork_metrics.py`
- **on conflict:** keep upstream's new check and add `or stats_u_only(args)` to its "no admin
  volume" part; if upstream drops the `avol` rule itself, drop ours

## grants: fork-only folder sharing between accounts

see `docs/adr/0001` and `.scratch/grants/spec.md`. Work in progress: tickets 06 (the tracer
bullet), 07 (rights and refusals), 08 (groups), 09 (lifetime across reloads), 10 (the grants
page), 11 (the button in the file browser), 12 (expiry without a reload), 13 (symlinks),
14 (small gaps in the grant rules), 15 (FTP/SFTP and `grant_who` limits) and 16 (saying who a
share link and a grant are for) are done.

options (`[global]`):

* `grants: /shared` (`--grants`): the virtual folder where recipients find what was granted to
  them, at `/shared/<owner>/<name>`; empty (the default) = grants off. Works with share links
  (`shr`) off
* `grants-db` (`--grants-db`, default `grants.db` next to `shares.db`): the grants database. It
  has its own schema version (`kv` table, `sver`), is created on the first grant, and copyparty
  refuses to start on a newer version

volflag:

* `grant_who` (`no` / `a` / `auth`, default `auth`): who can create grants of folders in this
  volume: nobody, accounts with `a` there, or any account. Independent of `shr_who`, so a volume
  can allow grants and forbid share links, or the other way round. Any other value = nobody.
  Checked only when a grant is created: existing grants stay until revoked on the grants page

what works so far:

* in the file browser, the drive-ux **Share dialog's Add people** part (`web/forkpeople.js`,
  see [its section](#upstream-edit-share-dialog-add-people-forkpeoplejs-grantsj)) creates,
  lists and revokes the grants of a folder; it replaced the 🤝 people button (`web/grantbtn.js`,
  ticket 11, retired in drive-ux ticket 09)
* `GET /?grants&j`: the grants page's rows as json (same rows, same checks), see that section
* an owner creates a grant with `POST /?grant`, JSON body
  `{"vp": "/home/alice/proj/", "rcpt": "bob", "name": "proj", "perms": ["read"], "exp": 60}`;
  a reload follows. `exp` is an optional expiry in minutes, like share links; missing, empty or
  0 = never. `rcpt` is an account, or `@<group>` for a group from `[groups]` /
  `--grp`. `perms` is `["read"]` (read-only) or `["read", "write"]` (read + upload); the
  recipient also gets `g`. Move, delete, admin and `.` are never possible through a grant
  (`test_no_move_or_delete_through_a_grant`): nothing in it can be moved out, renamed or
  deleted by the recipient. Moving the recipient's own files *into* a read + upload grant works,
  as paste, upload and drag to move do; `/shared/` and `/shared/<owner>/` refuse it with a 403
  (`test_move_into_a_read_upload_grant`).
  Refused, each with a 400:
  * grants off; not logged in
  * any other `perms`
  * an `exp` that isn't a whole number of minutes from 0 to 10^9
  * a list of paths in `vp`, or a `files` selection (one folder only); a single file
  * a source under `/shared` or under the share link folder (also through `..`, or any path
    that resolves to a share link or grant volume)
  * a hidden source (any path part starting with a dot; such a row is also never mounted)
  * rights the owner doesn't hold on the source (write included)
  * the volume's `grant_who` doesn't allow the caller
  * the caller themselves; `*` or `@acct` (the `--grp-all` group, whatever it is named); an
    `@<group>` that isn't in the config; anything else that isn't an account from the config,
    including the made-up `s_...` account a share link password logs in as (anyone with that
    password could use it; such a row is also never mounted)
  * a name that isn't one path segment: empty, starting with a dot, a slash or backslash, a
    control character, leading or trailing spaces, over 255 characters
  * the same owner + recipient + name as an existing grant (expired ones too, since they can be
    extended); checked in the same SQL statement as the insert
  * the same owner + name as an existing grant whose recipient reaches any of the same accounts
    today: bob directly and `@family` (with bob in it), or two groups sharing a member other than
    the owner. Pick another name
* a group grant is worked out again at every reload from the group in the config: members
  added there get it, members removed lose it. The owner, if a member, gets no mount of their own
  folder. A group removed from the config gives nobody access, but the row stays (the owner can
  revoke it; a group by that name later gets the grant back). If a group gains a member who
  already has a grant by that name from the same owner, that member keeps one: the grant naming
  them wins over a group grant, otherwise the oldest; the other is skipped for them and logged.
  Only grants that mount compete, so if the winner expires or is suspended or broken, the other
  one shows up at that path instead (a different folder, maybe with different rights)
* groups are only the config's (`[groups]` / `--grp`), and members only config accounts: IdP
  groups and IdP-only users get no group grants. A group whose only members are the owner, or
  names that aren't accounts, is accepted but mounts for nobody (logged)
* at every reload each grant is resolved through the volume tree as its owner with exactly the
  granted rights (like share links), and mounted with the source volume's settings, minus share
  links (`shr_who: no`) and indexing flags. A grant whose owner lost those rights (suspended), or
  whose source folder is gone (broken), is skipped and logged; its row stays, so it comes back
  when the owner regains the rights or a folder appears at that path. An expired grant is skipped
  and logged; its row stays (for the owner to extend on the grants page). Expired grants are
  never deleted by themselves (share links are, after `--shr-rt`); the owner revokes them
* a timer thread in the hub (`ExpiryTimer`, `grant-expiry`) unmounts a grant when it expires: it
  sleeps until the next expiry of a mounted grant, then runs one reload, as up2k's
  `_check_shares` does for share links. Grants that expire together share that reload. It runs
  once per server, also with `-j` (the hub's reload reaches every worker). It reads expiries
  from the database, so extending an active grant (no reload) just moves the wakeup. It also
  wakes every 5 minutes regardless, so a wall clock that jumps ahead (no RTC on the Pi; NTP sets
  it after boot) delays an expiry by at most that
* a grant whose owner, or whose named recipient account, is no longer an account in the config is
  deleted from the database for good at the next reload, so an account created later with the
  same name doesn't inherit it. A group recipient never causes this (a missing group just mounts
  for nobody). With IdP headers on (`have_idp_hdrs`) nothing is deleted, since IdP accounts
  aren't in the config; such grants are only skipped
  * careful: an account dropped from `[accounts]` by mistake loses every grant it owns or
    names, at the first reload; putting it back doesn't restore them
  * with multiprocessing (`-j` above 1) every worker reloads, so the same removal can be logged
    more than once; the delete itself is harmless to repeat
* the log has a line for every create, expiry, suspension, break and permanent removal, naming
  the grant's id, owner, recipient, path, mount name, rights and expiry. The states are worked
  out again at every reload, so an expired, suspended or broken grant is logged at each reload
  for as long as it stays that way, not only when it changes
* the recipient browses and downloads over HTTP and WebDAV; others see nothing under `/shared`
* each recipient has their own `/shared` tree, so alice can grant bob a `proj` and carol a
  different `proj`; both see `/shared/alice/proj`, each their own folder. The root's path lookups
  (`VFS.get`, `VFS._get`, `VFS.can_access`) are replaced on the root volume at reload so that
  `/shared/...` resolves in the asking account's tree. The `/shared` under the root only holds
  folders with no path on disk, used for listings
* dotfiles inside a grant are always 404 for the recipient, even with `harden` off and even when
  the owner holds `.`, or the recipient holds `.` on the source volume; `?zip`/`?tar`, PROPFIND
  and folder copy/move leave them out too (the grant's `VFS.walk` never asks for dotfiles)
* uploads through a grant refuse dot names and `README.md` / `PREADME.md` / `descript.ion` in any
  case, whatever `harden` says (the share link rules, applied by `harden_nodes`); the owner uploading
  through their own volume is unaffected. Copying or moving a folder into a grant that holds such
  a name anywhere inside is refused (403) up front, like a folder with dotfiles
* share links can't be made of a grant, nor of `/shared/` or `/shared/<owner>/` (`shr_who=no` on
  all of them)
* the grants page, `GET /?grants` (template `web/grants.html` + `web/grants.js`, linked from the
  control panel as "your grants" when grants are on), lists the caller's grants, under a line
  saying recipients find them under `/shared/<owner>/` (share admins: "every grant on the server"): owner,
  recipient, source folder, the name it appears as, rights, expiry and state. Accounts in
  `--shr-adm` see every grant. States are worked out when the page loads, with the same check as
  a reload: `active`, `expired`, `suspended`, `broken`, or `no members` (a group grant whose
  group is gone or has nobody but the owner; it comes back with the group); old rows on a
  hidden folder show `hidden folder`. Guests get a 401, and all of it is a 400 with grants off
  * `POST /?egrant=rm&gid=N` revokes (the row is deleted, a reload follows);
    `POST /?egrant=MIN&gid=N` extends the expiry by MIN minutes, counted from now if it already
    expired (a reload follows then, which brings it back). A grant with no expiry can't be
    extended. The owner may do both; a `--shr-adm` account may only revoke (spec story 32);
    others get a 403
  * `GET /?grants=rcpts` returns `{"accounts": [...], "groups": ["@family", ...], "top": "shared"}`:
    who a grant can go to (and the grants folder, where the button hides itself), without the caller, the all-accounts group (`--grp-all`) and share link password
    accounts. Every account holder sees every account and group name (accepted in the spec)
* a recipient reaches only what is really inside the source folder: anything whose real path
  (symlinks resolved) is outside it is a 404 for every request through the grant (GET, WebDAV,
  thumbnails, uploads, copy/move destinations, and the path lookup other protocols use), and
  links that lead out are left out of listings, PROPFIND and `?zip`/`?tar`. Links that stay inside work. This holds whatever `harden` says, and the owner's
  own volume still follows the links. (`xvol` would not do: it only stops links that leave the
  *volume*, and the source folder is usually a subfolder of a home folder)
  * so with grants, `--hardlink` is the safe dedup: `--dedup` stores a duplicate upload as a
    symlink to the first copy, which may be outside a granted folder and then 404s for the
    recipient
* grants are not in an account's list of readable volumes (`aread`), so search and the upload
  list never see them; listings of `/`, `/shared/` and `/shared/<owner>/` add them for that one
  request

known gaps:

* grants are meant for **HTTP and WebDAV**. FTP and SFTP read `aread` (above), so their login
  refuses an account whose only access is a grant, and `/shared/` is no folder there (FTP lists it
  empty, SFTP fails). An account that can log in (it has a volume of its own) still reaches a
  grant by its full path, `/shared/<owner>/<name>`, with the granted rights. Kept that way so
  grants stay out of search; this deployment keeps FTP/SFTP/SMB off (`test_ftp_sftp`)
* `grant_who` is checked only when a grant is created. Changing a volume to `grant_who: no` later
  doesn't suspend the grants already made from it; the owner or a `--shr-adm` account revokes
  them on the grants page (`test_grant_who_no_later_keeps_existing_grants`)
* opening `/shared/` or `/shared/<owner>/` directly as a page (typing the url, reload) is a 403;
  the web UI gets there through JSON listings from `/` and the tree, which work. Upstream does
  the same for its own folders with no path on disk (`/home/` with only `[/home/${u}]`)
* the reply to a recipient's upload into a read + upload grant (`PUT`) names the file by the
  owner's own path (`/home/alice/photos/up.txt`), which tells the recipient where the folder lives
  in the owner's tree; the file itself is not reachable to them there
* with a **readable root volume** (`[/]`), `/` doesn't list `shared/` (upstream leaves folders
  that have no path on disk out of a real folder's listing); `/shared/` itself works. Our config
  has no root volume

code: `copyparty/fork_grants.py`, tests: `tests/test_fork_grants.py`


## the user-management gap, upstream's position

* #232 "User management through UI with a SQLite DB" -- open; maintainer: "a pipe dream"
* #57 config UI -- open since 2023; Aug 2025: not this year, maybe not next; he has little
  personal use for it
* discussion #1036 -- "at some point there will be a config UI… a long time until that happens"
* #657 -- users posted scripts that append hashed accounts to the config; not merged
* the closest thing that exists: the **UI V1.5** work (PR #1453, `tilse/copyparty-uiV1.5`,
  shipped as `copyparty/ac:beta`) has a config GUI at `?config` -- but it only *builds* config
  text in the browser; it does not read or write the live config
* no fork or add-on found (Nov 2026, top 200 forks by stars + newest 100 + repo search) that does
  live user management or user-to-user folder sharing


## plan: admin app beside copyparty

copyparty already has the two hooks we need: it loads every `.conf` in its config dir, and
`SIGUSR1` reloads accounts + volumes without a restart.

```
browser → admin app
            ├─ owns one generated file, e.g. /cfg/users.conf  ([accounts], [groups], volumes)
            ├─ hashes passwords with copyparty's own --ah-gen (same format copyparty expects)
            ├─ validates (no duplicate mounts) before writing
            └─ SIGUSR1 → copyparty reloads
```

* never edit the hand-written config; the generated file is the app's only output
* password resets: `chpw.json` stores `(user, original_config_pw, new_pw)`; a user's own change
  only applies while the config still has `original_config_pw` (`AuthSrv.setup_chpw` in
  `copyparty/authsrv.py`). So **changing the password in the config is a reset** -- it wins
  over the user's change.
* a password change needs only a logged-in session, no old password, as upstream
  (`handle_chpw` in `httpcli.py` changes the password of whoever is logged in;
  `test_password_change_needs_no_old_password`). Anyone at an unlocked, logged-in browser can
  change it; the server checks length (`--chpw-len`), `--chpw-no` and "password is taken". The
  control panel's form (`web/ctlpanel.js`) posts the same fields as upstream's link and, before
  sending, checks in the browser that both boxes are filled, equal and at most 64 bytes
* reach the admin app over Tailscale only; never expose it next to public share links
* user-to-user folder sharing would be modelled as: owner picks a folder + user/group →
  app writes an extra volume (or `accs` entry) → reload
* zero-code alternative considered: LLDAP (user UI) + Authelia in front, copyparty in IdP mode
  (`--idp-h-usr`, `--idp-h-grp`). Two extra services on 512 MB, memory not measured.


## related homelab context

the home PC already runs Nextcloud AIO behind a VPS Traefik over WireGuard; the home↔VPS path
(Telkom → Rumahweb) loses 66–90% of packets, so public access should go via Cloudflare Tunnel or
a different VPS -- up2k's chunking handles Cloudflare's 100 MB request cap.

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
| **user shares a folder with another user** | ✅ grants (`grants: /shared` + `js-browser: /.cpr/w/fork-browser.js`), fork-only; a "🤝 people" button (a grant) beside upstream's share button, relabelled "🔗 link", in the file browser, to an account or a config group, read-only or read + upload, optional expiry; owners revoke and extend them on `?grants`, linked from the control panel |
| share links | ✅ `shr: /share`; password, expiry, optional upload; owner manages them in the control panel |
| stream video | ✅ served as-is with range requests; no video transcoding (fine for the Pi) |
| edit text | ✅ text viewer + two markdown editors |
| edit docs | ⚠️ `--wopi` can hand off to a Collabora server running elsewhere; untested |
| pick several files like Nextcloud | ✅ `web/rowsel.js` through `js-browser: /.cpr/w/fork-browser.js`, fork-only; a checkbox on every row of the list view and a select-all box in the header, mirroring upstream's selection, so cut / copy / paste, zip, dl, share and grant act on what is ticked. Row click, `space`, shift-click and the bottom bar work as upstream; grid view keeps its own multiselect |
| move files by dragging, like Nextcloud | ✅ `web/dragmove.js` through `js-browser: /.cpr/w/fork-browser.js`, fork-only; drag rows of the list view onto a folder row, a folder in the sidebar tree or a breadcrumb, and they move there with paste's `?move` request. A selected row carries the whole selection, an unselected one only itself. A progress toast with abort, then one toast naming each item the server refused and why (its reason, minus the URL line). A drop moves without asking. Checked by hand in Chrome, no automated check (ticket 02's Comments; [its upstream edit](#upstream-edit-drag-to-move-dragmovejs)): in grid view and search results no move-drag starts; a pointer reported as touch makes rows non-draggable; a file drag (a `File` in the `DataTransfer`) still gets up2k's upload overlay and uploads; a move-drag carries the items' URLs as `text/uri-list` and `text/plain`. Not checked there: a real file from the desktop, devtools touch emulation, and dropping a name into another tab or the address bar. Rows are draggable wherever you may move, so text in a row can't be selected by dragging there |
| reach the control panel from the file browser | ✅ on the `drive-ux` branch: `web/forkacct.js`, fork-only; the account menu on the top bar's avatar (the account's initial): Change password (the control panel's form, focused), My share links, My grants, Control panel, Log out, at the `--rp-loc` prefix. Hidden for guests and with `ui_noacci`; Control panel left out with `ui_nocpla` (both unless `?fullui`), as upstream hides its own account box and link. [Its upstream edit](#upstream-edit-account-menu-forkacctjs) |
| search like Drive | ✅ on the `drive-ux` branch: `web/forksearch.js`, fork-only; the top bar's search box searches names under the current folder (upstream's search, results in the list), with Type and Modified chips, Advanced (upstream's full form), `/` to focus, Esc or ✕ to get the folder back. Only where upstream shows its search (indexed volumes, not on share links). [Its upstream edit](#upstream-edit-drive-ux-search-forksearchjs) |
| a control panel that makes sense to users | ✅ `js-other: /.cpr/w/ctlpanel.js` + `nb`, fork-only; "other stuff:" becomes "more:" with "your share links", "your grants", recently added files, logout everywhere (in that order); "reset client settings", the `π` link and "powered by" are hidden; the share links page gets an intro line ("Links anyone can open without an account. Revoke one to stop it working."). With `chpw`, a "change password:" form of its own (new password, repeat, button) sits under "welcome back"; upstream's small "change password" link next to the login button is hidden |


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
* not covered: SMB with `--smba` (upstream maps every SMB user to its internal superuser, which
  bypasses all permissions anyway); keep SMB off

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
| [share link wording (linkbtn.js)](#upstream-edit-share-link-wording-linkbtnjs) | `scripts/sfx.ls` only |
| [row checkboxes (rowsel.js)](#upstream-edit-row-checkboxes-rowseljs) | `scripts/sfx.ls` only |
| [drag to move (dragmove.js)](#upstream-edit-drag-to-move-dragmovejs) | `scripts/sfx.ls` only |
| [`--shr-adm` as a real list](#upstream-edit---shr-adm-as-a-real-list) | `svchub.py`, `httpcli.py`, `authsrv.py` |
| [`harden`: dotfiles](#upstream-edit-harden-dotfiles) | `authsrv.py`, `httpcli.py`, `up2k.py`, `__main__.py` |
| [share link password equal to an account password](#upstream-edit-share-link-password-equal-to-an-account-password) | `authsrv.py` |
| [text listing of a folder with no path on disk](#upstream-edit-text-listing-of-a-folder-with-no-path-on-disk) | `httpcli.py` |
| [`nospawn` with per-user volumes](#upstream-edit-nospawn-with-per-user-volumes) | `authsrv.py` |
| [sidebar tree of a folder with no path on disk](#upstream-edit-sidebar-tree-of-a-folder-with-no-path-on-disk) | `httpcli.py`, `scripts/sfx.ls` |
| [end-to-end harness (tests/e2e)](#upstream-edit-end-to-end-harness-testse2e) | none |
| [drive-ux frame (forkui.js, forkshell.js)](#upstream-edit-drive-ux-frame-forkuijs-forkshelljs) | `scripts/sfx.ls` only |
| [drive-ux list and selection bar (forklist.js)](#upstream-edit-drive-ux-list-and-selection-bar-forklistjs) | `scripts/sfx.ls` only |
| [drive-ux + New and upload card (forknew.js)](#upstream-edit-drive-ux--new-and-upload-card-forknewjs) | `scripts/sfx.ls` only |
| [account menu (forkacct.js)](#upstream-edit-account-menu-forkacctjs) | `scripts/sfx.ls` only |
| [drive-ux views that aren't folders (forkviews.js)](#upstream-edit-drive-ux-views-that-arent-folders-forkviewsjs) | `scripts/sfx.ls` only |
| [drive-ux search (forksearch.js)](#upstream-edit-drive-ux-search-forksearchjs) | `scripts/sfx.ls` only |

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
  `web/grantbtn.js`, `web/grants.html` and `web/grants.js`; `httpcli.py` `run`: the `http_request`
  line (see `harden`); `__main__.py` `add_share`: the `--grants` and `--grants-db` options;
  `cfg.py` `flagcats["others"]`: one `grant_who=auth` line after `shr_who=auth` (registers the
  volflag, so copyparty doesn't warn that it's unrecognized); `svchub.py` `run`: one import +
  `start_expiry_timer(self)` right after `self.tcpsrv.run()` (marked `# fork`; the timer reloads
  through `SvcHub.reload` and checks under `AuthSrv.mutex`)
- **fork files:** `copyparty/fork_grants.py`, `copyparty/fork_harden.py` (dot rule and upload-name
  rule also on grant volumes, `harden_nodes`), `copyparty/fork_util.py` (`grants_top`),
  `copyparty/web/grants.html`, `copyparty/web/grants.js`, `copyparty/web/grantbtn.js` (the page
  loads its own template through `httpsrv.load_jinja2_resource` and adds it to `hsrv.j2` as
  `fork_grants` on first use, so it renders through `HttpCli.j2s` while httpsrv's template list is
  untouched; `fork_grants.py` also adds those three files to upstream's `RES` set at import, which
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
  `test_every_loaded_browser_script_is_registered_and_served` catches `RES` moving. `web/grantbtn.js` leans on upstream's
  browser.js by name: `fileman.render`, `msel.getsel`, `#fshr`, `#wfm`, `#shui`, `perms`,
  `in_shr`, `acct`; after an upstream merge, open the file browser and check the grant button
  still shows and opens its dialog (no automated check)

### upstream edit: control panel tidy-up (ctlpanel.js)

- **what it is:** control panel tidy-up (`web/ctlpanel.js`, loaded with `js-other:
  /.cpr/w/ctlpanel.js`; behind `--rp-loc`, prefix that path)
- **upstream lines touched:** none in templates: `splash.html`, `splash.js` and the other pages
  are untouched. `scripts/sfx.ls`: `web/ctlpanel.js`; `fork_grants.py` adds it to upstream's `RES`
  next to `grantbtn.js`
- **fork files:** `copyparty/web/ctlpanel.js`, `tests/test_fork_grants.py`
  (`test_control_panel_script_is_served`, `test_control_panel_has_the_ids_the_script_moves`,
  `test_control_panel_password_form_is_served`,
  `test_control_panel_has_the_ids_the_password_form_uses`,
  `test_share_links_page_has_what_the_intro_line_is_put_before`)
- **on conflict:** nothing to merge, but the script leans on upstream ids by name: `#cc` (the
  heading) followed by `div.agr`, whose entries `#y`, `#yg`, `#af`, `#k`, `#wb`, `#ag` and the
  `<form>` holding `#lo` it reorders, rebuilding the `<br />` between them (`#y` and `#yg` it
  relabels "your share links" / "your grants"); on the share links page (`shares.html`,
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
  `fork_grants.py` adds it to upstream's `RES` next to `grantbtn.js`
- **fork files:** `copyparty/web/fork-browser.js`, `tests/test_fork_grants.py`
  (`test_every_loaded_browser_script_is_registered_and_served`, `test_file_browser_tag_the_loader_relies_on`)
- **on conflict:** nothing to merge. It loads the scripts in its `SCRIPTS` list one after another
  (one line per script; a script that fails to load or throws doesn't stop the rest), each from
  its own url with the file name swapped, so the `--rp-loc` prefix and the `?_=` cache-buster that
  `browser.html` appends (`{{ js }}_={{ ts }}`) carry over. It copies its own `nonce` to each
  script because `--csp-ui` only allows scripts with the page's nonce;
  `test_file_browser_tag_the_loader_relies_on` renders `browser.html` and fails if the nonce or
  the `?_=` query leaves that tag. If upstream changes the csp (say to `'strict-dynamic'`),
  recheck that the grant button still shows. The loading itself has no automated check; after an
  upstream merge, open the file browser and check the grant button, the row checkboxes, the
  control panel link and dragging a file onto a folder

### upstream edit: share link wording (linkbtn.js)

- **what it is:** says who upstream's share link is for (`web/linkbtn.js`, loaded by
  `fork-browser.js`): the share button reads "🔗 link", its two tooltips say anyone with the link
  can open it, and the share-link dialog starts with "Anyone with this link can open it, no
  account needed." Ticket grants/16; the grant button's matching words are in `grantbtn.js`
- **upstream lines touched:** only `scripts/sfx.ls` (`web/linkbtn.js`); `browser.js` and `tl/`
  are untouched. `fork_grants.py` adds it to upstream's `RES` next to `grantbtn.js`; one line
  in `fork-browser.js`'s `SCRIPTS`
- **fork files:** `copyparty/web/linkbtn.js`, `tests/test_fork_grants.py`
  (`test_every_loaded_browser_script_is_registered_and_served`, `test_browser_names_the_link_button_relies_on`)
- **on conflict:** nothing to merge, but the script leans on upstream's browser.js by name: it
  sets `#fshr`'s `innerHTML` (upstream's `📨<span>share</span>`), overwrites `L.fs_sc` /
  `L.fs_ss` (which `fileman.render` puts in `#fshr`'s `tt` on every selection change), and wraps
  `fileman.share` to prepend its line to `#shui`'s first `<div>`, which `share` rebuilds on every
  open; since upstream bound `bshr.onclick = r.share` before the wrap, it rebinds `#fshr`'s
  `onclick` to the wrapper. It also reads `msel.getsel` and `acct` (from `CGV`; it does nothing
  for guests). `test_browser_names_the_link_button_relies_on` reads `browser.js` and
  fails if one of those names goes. Behaviour has no automated check; after an upstream merge,
  check the button's label and tooltip with and without a selection, and open the share-link
  dialog twice

### upstream edit: row checkboxes (rowsel.js)

- **what it is:** row checkboxes in the file list (`web/rowsel.js`, loaded by `fork-browser.js`)
- **upstream lines touched:** none: `browser.js`, `browser.css` and `browser.html` are untouched;
  the script injects its own `<style>`. `scripts/sfx.ls`: `web/rowsel.js`; `fork_grants.py` adds
  it to upstream's `RES` next to `grantbtn.js`; one line in `fork-browser.js`'s `SCRIPTS`
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
  `fork_grants.py` adds it to upstream's `RES` next to `grantbtn.js`; one line in
  `fork-browser.js`'s `SCRIPTS`
- **fork files:** `copyparty/web/dragmove.js`, `tests/test_fork_grants.py`
  (`test_every_loaded_browser_script_is_registered_and_served`, `test_browser_names_drag_move_relies_on`)
- **on conflict:** nothing to merge, but the script leans on upstream by name. `browser.js`:
  `msel.getall` / `msel.getsel` and their items (`id`, `vp`, `fn`, `isd`), `tr2id`, the `sel`
  class on `#files tbody tr`; paste's request shape in `fileman.paste` (`POST
  <src>?move=<dst>&akey=<key>`, 201 = moved, else the reply text is the reason) and
  `/?fs_abrt=<key>` for abort; `fileman.tx` (tells other tabs); `treectl.goto` (refreshes list and
  tree); tree folder links `#treeul li>a+a`, breadcrumbs `#path a[href]`; the globals `perms`
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

### upstream edit: share link password equal to an account password

- **what it is:** a share link password equal to an account's password no longer breaks every
  reload (upstream loaded it as a made-up `s_...` account with the same password, which tripped
  the "same password" check; reload/restart then failed for everyone). The share is now granted to
  the account that owns that password, so the password logs in as that account and opens the share
  (that account may not be the share's owner: if bob sets alice's password on a share, alice's
  login also gets the share)
- **upstream lines touched:** `authsrv.py` `_reload`, share loader: a `pw2u` password->account map
  before the loop, and an `if s_pw and s_pw.strip() in pw2u: sun = pw2u[s_pw.strip()]` branch
  before the `s_` account is made (both marked `# fork`)
- **fork files:** `tests/test_fork_shr_pw.py`
- **on conflict:** **take theirs if upstream fixes it**, then drop the `pw2u` line and the extra
  branch; keep the test if it still passes

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


### upstream edit: drive-ux frame (forkui.js, forkshell.js)

- **what it is:** the Drive-style frame of the file browser (drive-ux ticket 02, ADR 0003; on the
  `drive-ux` branch until ticket 17): a top bar (server name, search box, More tools, avatar) and
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

- **what it is:** the Drive-style file list (drive-ux ticket 03, ADR 0003; on the `drive-ux`
  branch until ticket 17). The list shows a checkbox, an icon and the name, Modified and Size
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

- **what it is:** drive-ux ticket 05 (on the `drive-ux` branch until ticket 17). **+ New** (the
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

- **what it is:** the account menu of the Drive-style file browser (drive-ux ticket 10; on the
  `drive-ux` branch until ticket 17). The top bar's avatar (a button with the account's initial,
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


### upstream edit: drive-ux views that aren't folders (forkviews.js)

- **what it is:** the nav's *Shared with me* and *Recent uploads* of the Drive-style file browser
  (drive-ux ticket 04; on the `drive-ux` branch until ticket 17), drawn in the section
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

- **what it is:** the search box of the Drive-style file browser (drive-ux ticket 14; on the
  `drive-ux` branch until ticket 17). Typing (500 ms after the last key) or Enter in the top
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

* the **grant button** (`web/grantbtn.js`), loaded by `web/fork-browser.js` with
  `js-browser: /.cpr/w/fork-browser.js` (`--js-browser`; behind a reverse proxy with `--rp-loc`,
  prefix that path). It reads "🤝 people" (tooltip: "give an account or group on this server
  access to this folder") and sits beside the share link button ("🔗 link", see
  [linkbtn.js](#upstream-edit-share-link-wording-linkbtnjs)) in the file browser; it acts on the
  current folder, or on the one folder selected; it
  hides when a file or several things are selected, for guests, without read access, inside
  `/shared/` and share links, and when grants are off (it asks `?grants=rcpts` once per page load).
  Its dialog opens with "Gives an account or group on this server access to this folder. They
  find it in their own file tree, no link needed.", then picks the recipient from `?grants=rcpts`, read-only or read + upload, the name
  (default: the folder's name) and an optional expiry in hours / days / weeks, then posts
  `?grant` and shows where the recipient finds it, or the server's refusal word for word. It wraps
  upstream's `fileman.render` to update itself and reuses the share dialog's `#shui` box (and its
  css); upstream's `browser.js` is not edited. `js-browser: /.cpr/w/grantbtn.js` still works on its
  own, but `--js-browser` takes one url, so the fork's other file-browser scripts need the
  loader. Checked by hand only (no JS test harness); see ticket 11
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

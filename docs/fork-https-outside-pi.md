# HTTPS where Outside opens only share links: putting it on the Pi

Fork-only. A by-hand checklist for the admin: put the nginx site file
[`contrib/nginx/fork-https-outside.conf`](../contrib/nginx/fork-https-outside.conf) on the Pi and
confirm each rule from a phone. Its header says what each part of the file is for; the same rules
are checked locally, on this machine only, by `./scripts/fork-https-check.sh`.

Every command here runs **on the Pi or the phone, by you**. Nothing in the repo logs in to the Pi.
In the commands, put your own values in place of these (the repo is public, so it holds none):

| here | stands for |
|---|---|
| `files.example.org` | your domain, the one the certificate is for |
| `203.0.113.7` | the home's static IP: the domain's `A` record |
| `<key>` | the key of a share link you make in step 0 (`/share/<key>/`) |
| `<locked>` | the key of a share link with a password |
| `<name>` | one account holder's name (for her home folder) |

**Inside** is a phone on the home Wi-Fi: the router's NAT loopback makes every device at home reach
the domain from `203.0.113.7`. **Outside** is the same phone on mobile data, Wi-Fi off.

## 0. Before you start

Each line: the command, then what it must show. Stop at the first one that doesn't.

1. copyparty runs as the systemd service (deploy-pi step 6), not from an SSH session, which stops it
   when the session ends:
   `systemctl is-active copyparty` shows `active`; `systemctl is-enabled copyparty` shows `enabled`.
2. copyparty runs a version with the share-link password change (https-outside ticket 04):
   `ls /opt/copyparty/copyparty/fork_shr_auth.py` shows the file. If not, update the clone
   (`git -C /opt/copyparty pull`) once `https-outside` is merged into the branch the Pi follows,
   then
   `sudo systemctl restart copyparty`. The site file is then at
   `/opt/copyparty/contrib/nginx/fork-https-outside.conf`.
3. copyparty listens on localhost only: `sudo ss -ltnp | grep 3923` shows `127.0.0.1:3923` and
   nothing else (no `0.0.0.0:3923`, no `*:3923`).
4. copyparty's config has the four lines the site file relies on:
   `sudo grep -nE '^\s*(i|rproxy|shr):|^\s*http-only' /etc/copyparty.conf` shows
   `i: 127.0.0.1`, `rproxy: -1`, `http-only` and `shr: /share/`.
5. nginx is nginx.org's stable package, 1.30.7 or later: `nginx -v` shows `nginx/1.30.7` or newer.
6. certbot has its files: `sudo certbot certificates` lists `files.example.org` with an expiry date,
   and `ls /etc/letsencrypt/options-ssl-nginx.conf /etc/letsencrypt/ssl-dhparams.pem` shows both.
   Renewal goes through nginx: `sudo grep -E '^(authenticator|installer)' /etc/letsencrypt/renewal/files.example.org.conf`
   shows `authenticator = nginx` and `installer = nginx`; `systemctl list-timers | grep certbot`
   shows the timer.
7. No other site file uses the site file's names (they are nginx-wide):
   `sudo grep -rln 'fork_' /etc/nginx/` shows nothing yet.
8. Inside, make two share links of a folder with a few photos in it: one with uploads allowed
   (`<key>`), one with a password (`<locked>`). Note both URLs.

## 1. Keep a copy of today's file

```sh
sudo cp -a /etc/nginx/conf.d/copyparty.conf ~/copyparty.conf.before-https-outside
sudo grep -n 'managed by Certbot' /etc/nginx/conf.d/copyparty.conf
```

The copy goes in your home folder, not in `conf.d/`, where nginx would load it too.
The `grep` shows the lines `certbot --nginx` added in 2026-11. The new file already carries the ones
that must stay, in its 443 server:

- `ssl_certificate /etc/letsencrypt/live/files.example.org/fullchain.pem;`
- `ssl_certificate_key /etc/letsencrypt/live/files.example.org/privkey.pem;`
- `include /etc/letsencrypt/options-ssl-nginx.conf;`
- `ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;`

If a path in the old file differs (say `live/files.example.org-0001/`), use the old file's path in
the new one in step 2. The rest of certbot's lines are replaced on purpose: its `listen 443 ssl`
(the new file has its own, without `http2`) and its port-80 block (`if ($host = ...) return 301`,
`return 404`), which the new file's port-80 server replaces.

## 2. Fill in the two placeholders

```sh
sed -e 's/__DOMAIN__/files.example.org/g' -e 's/__HOME_IP__/203.0.113.7/g' \
    /opt/copyparty/contrib/nginx/fork-https-outside.conf >~/copyparty.conf.new
grep -c '__DOMAIN__\|__HOME_IP__' ~/copyparty.conf.new
grep -nE 'server_name|live/|return 301|^\s+[0-9.]+ 0;' ~/copyparty.conf.new
```

- the first `grep` shows `0` (nothing left unfilled)
- the second shows `server_name files.example.org;` twice, the two `live/files.example.org/` paths,
  `return 301 https://files.example.org$request_uri;` (port 80 redirects only to the domain) and
  `203.0.113.7 0;` (the one Inside address)

## 3. Put it in place and reload

```sh
sudo cp ~/copyparty.conf.new /etc/nginx/conf.d/copyparty.conf
sudo nginx -t
```

`nginx -t` must end with `syntax is ok` and `test is successful`, with no `warn` line. A
`conflicting server name "files.example.org"` warning means another file in `conf.d/` (say a
`default.conf` that came back with an nginx upgrade) also claims the domain: move it out first.
Then:

```sh
sudo systemctl reload nginx
systemctl is-active nginx
sudo grep -rln 'fork_' /etc/nginx/
```

`active`, and the `grep` lists only `/etc/nginx/conf.d/copyparty.conf`.

## 4. certbot's renewal still works

```sh
sudo certbot renew --dry-run
sudo diff ~/copyparty.conf.new /etc/nginx/conf.d/copyparty.conf
```

- `Congratulations, all simulated renewals succeeded`. During it certbot adds two lines to each
  server named `files.example.org` (a `rewrite ... break` that skips the redirect, and a location
  for the challenge token), reloads nginx, lets Let's Encrypt fetch the token over port 80, and
  takes the lines out again.
- the `diff` prints nothing: certbot put the file back exactly.

If the dry run fails on the challenge, check that the router still forwards port 80 and that the
port-80 server still has `server_name files.example.org;`. Repeat this step after any edit to the
file.

## 5. Outside: a phone on mobile data (Wi-Fi off)

Open each in the phone's browser; the right column is what you must see.

| open | expect |
|---|---|
| `http://files.example.org/share/<key>/` | moves to `https://`, padlock, no certificate warning, the folder |
| the same share link | styles, icons and thumbnails all load; a file downloads; the folder downloads as zip and as tar |
| upload into `<key>`: a photo, then a file over 1 MB | both arrive (check Inside afterwards) |
| upload a big video into `<key>`, turn on airplane mode for a few seconds mid-way, then off | the upload carries on and finishes |
| `https://files.example.org/share/<locked>/` | the password prompt |
| a wrong password there | refused, the same as Inside |
| the right password | the folder opens |
| `https://files.example.org/share/nosuchkey1234/` | copyparty's page that the link expired or doesn't exist, as Inside |
| `https://files.example.org/` | nginx's plain `404 Not Found`, no login page, no version number |
| `/?h`, `/home/<name>/`, a volume such as `/family/`, `/.cpr`, `/share` | the same plain 404 for each |
| `https://203.0.113.7/` (the bare IP) | a certificate warning (the certificate is for the name); past it, the same 404 |

Then, still Outside:

- **an old login:** log in at home first (Inside), then switch to mobile data. `https://files.example.org/`
  is a 404 for that phone too, and her own share link opens as for a guest (no account menu, no
  control panel).
- **an account password at a share-link prompt counts for nothing:** at `<locked>`'s prompt, type an
  account holder's real password, once. It is refused like a wrong one. Do this once only, and only
  Outside: copyparty counts it as a wrong password (`ban-pw`: more than 9 in an hour bans that
  address for a day). Outside that is only the phone's mobile address; Inside it would be the whole
  household. A restart (`sudo systemctl restart copyparty`) lifts a ban.

From a laptop Outside (on a phone's hotspot or another network), the header and limit checks:

```sh
curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Forwarded-For: 203.0.113.7' https://files.example.org/
curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Real-IP: 203.0.113.7' https://files.example.org/
curl -sI https://files.example.org/share/<key>/ | grep -i '^server'
curl -s -o /dev/null -w '%{http_version}\n' --http2 https://files.example.org/share/<key>/
curl -sI -H 'Host: evil.example' http://files.example.org/ | grep -i '^location'
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://files.example.org/.cpr/
curl -s -o /dev/null -w '%{http_code}\n' https://files.example.org/.cpr/ui.css
```

- `404`, `404`: a forged header doesn't make Outside Inside
- `Server: nginx`, with no version number
- `1.1`: no HTTP/2
- `Location: https://files.example.org/`: port 80 sends any Host to the domain only
- `404`, `200`: copyparty's static files take only GET and HEAD Outside (nginx also drops any
  login sent there, which the local check proves)

The rate limit (optional; normal browsing never gets near it): one Outside address gets 20 requests
a second, plus a burst of 200, and at most 32 open at once. Seeing a 429 by hand takes a quick flood
of more than about 220 requests, so send them in parallel from one curl:

```sh
curl -sZ --parallel-max 20 -o /dev/null -w '%{http_code}\n' \
    "https://files.example.org/share/<key>/?n=[1-400]" | sort | uniq -c
```

Expect about 200 or more `200` and the rest `429`. While it runs, a device on another network (a
different address; the hotspot shares the phone's) still opens the share link. The same command
Inside gives only `200`. A plain loop of single `curl` calls is too slow to see one.

## 6. Inside: the phone on home Wi-Fi

| open | expect |
|---|---|
| `https://files.example.org/` | copyparty's login page; log in |
| your home folder, a grant, a group's volume, the control panel (`/?h`) | all open as before |
| upload a file over 1 MB, and a big one | both arrive |
| both share links | open as Outside |
| the curl flood of step 5, from a laptop at home | only `200`, never `429` |

## 7. On the Pi: logs, memory, the closed port

```sh
sudo tail -n 20 /var/log/nginx/access.log
journalctl -u copyparty -n 30 --no-pager
ps -o rss,comm -C nginx
```

- each access-log line ends with the host asked for and `inside` or `outside`, e.g.
  `"files.example.org" outside`; a scanner using the bare IP shows `"203.0.113.7" outside`
- copyparty's log shows the phone's mobile address for the Outside visits and `203.0.113.7` for
  Inside, never `127.0.0.1`
- `ps`: one nginx master and one worker (`worker_processes 1;` in `/etc/nginx/nginx.conf`), each
  a few MB of RSS (the number is in KiB)

From a laptop at home: `curl -m 5 http://<the Pi's LAN address>:3923/` fails (refused or timed out).
Port 3923 is never forwarded on the router; only TCP 80 and 443 are.

## Undo

If something is wrong and you can't fix it right away, take the site off the internet first:

```sh
sudo systemctl stop nginx
```

Nothing is reachable then (share links included), and nothing is exposed. To go back to the file
from before step 3 instead:

```sh
sudo cp -a ~/copyparty.conf.before-https-outside /etc/nginx/conf.d/copyparty.conf
sudo nginx -t && sudo systemctl reload nginx
```

That file opens the whole site to Outside again (the login page, home folders, the control panel),
as before this change: use it only for as long as you need. Either way, `sudo certbot renew --dry-run`
afterwards confirms renewal still works.

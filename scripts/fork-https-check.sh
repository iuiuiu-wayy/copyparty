#!/bin/bash
# fork-only, local-only: proves the rules of the fork's nginx site file
# (contrib/nginx/fork-https-outside.conf) against a real copyparty and a real nginx 1.30.
#   ./scripts/fork-https-check.sh
# Starts copyparty from this checkout on 127.0.0.1 with a throwaway config, and nginx from the
# official image in Docker on the host network, both on free high ports bound to 127.0.0.1.
# The site file is copied to a temp folder with test values filled in (never edited), and served
# with a throwaway self-signed certificate made in that folder. Requests from 127.0.0.2 stand for
# Inside (the home IP), from 127.0.0.1 for Outside. Prints one PASS/FAIL line per rule and exits
# non-zero on any failure; removes the container, copyparty and the temp folder on any exit.
# Never logs in to another machine. Not in the pre-commit hook: it needs Docker and is slow.
set -u

top=$(cd "$(dirname "$0")/.." && pwd)
main=$(dirname "$(git -C "$top" rev-parse --path-format=absolute --git-common-dir)")
py=$main/.venv/bin/python
site=$top/contrib/nginx/fork-https-outside.conf
image=nginx:1.30
domain=fork-check.test # .test is reserved, never a real domain
inside=127.0.0.2       # stands for the home IP
outside=127.0.0.1
outside2=127.0.0.3     # 127.0.0.1 is also nginx's own address; this one is not
pw=check-pw-user
pw_admin=check-pw-admin
k_open=checkopen1234 # share link keys, 12+ characters like the web UI's
k_pw=checklocked12
pw_share=check-pw-share

die() {
    echo "fork-https-check: $*" >&2
    exit 2
}

[ -x "$py" ] || die "no $py; create it as in CLAUDE.md (Commands)"
[ -f "$site" ] || die "no site file $site"
command -v docker >/dev/null || die "docker not found"
command -v openssl >/dev/null || die "openssl not found"
command -v curl >/dev/null || die "curl not found"

tmp=$(mktemp -d "${TMPDIR:-/tmp}/fork-https-check.XXXXXX")
cname=fork-https-check-$$
cpp_pid=

cleanup() {
    trap '' INT TERM # a second Ctrl-C must not cut the cleanup short
    docker rm -f "$cname" >/dev/null 2>&1
    if [ -n "$cpp_pid" ]; then
        kill "$cpp_pid" 2>/dev/null
        wait "$cpp_pid" 2>/dev/null
    fi
    rm -rf "$tmp"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# three free ports on 127.0.0.1: copyparty, nginx https, nginx http
read -r p_cpp p_https p_http < <("$py" -I -c '
import socket
ss = [socket.socket() for _ in range(3)]
for s in ss:
    s.bind(("127.0.0.1", 0))
print(" ".join(str(s.getsockname()[1]) for s in ss))
')

# --- copyparty -------------------------------------------------------------------------------
mkdir -p "$tmp/srv/vol" "$tmp/srv/home/check-user" "$tmp/db" "$tmp/xdg"
echo "hello from copyparty" >"$tmp/srv/vol/hello.txt"
echo "home of check-user" >"$tmp/srv/home/check-user/mine.txt"
# a 64x64 red PNG, so a share link has something to thumbnail
"$py" -I - "$tmp/srv/vol/red.png" <<'EOF'
import struct, sys, zlib
def chunk(t, d):
    return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
raw = b"".join(b"\x00" + b"\xff\x00\x00" * 64 for _ in range(64))
ihdr = struct.pack(">IIBBBBB", 64, 64, 8, 2, 0, 0, 0)
sig = b"\x89PNG\r\n\x1a\n"
open(sys.argv[1], "wb").write(sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))
EOF
cat >"$tmp/copyparty.conf" <<EOF
[global]
  i: 127.0.0.1
  p: $p_cpp
  rproxy: -1
  http-only
  # the temp folder may be tmpfs, where copyparty refuses uploads without this
  wram
  shr: /share/
  hist: $tmp/hist
  shr-db: $tmp/db/shares.db
  ses-db: $tmp/db/sessions.db
  chpw-db: $tmp/db/chpw.json

[accounts]
  check-admin: $pw_admin
  check-user: $pw

[/vol]
  $tmp/srv/vol
  accs:
    rwmd: check-user
    A: check-admin

[/home/check-user]
  $tmp/srv/home/check-user
  accs:
    A: check-user
EOF
(cd "$top" && XDG_CONFIG_HOME=$tmp/xdg PRTY_NO_VIPS=1 PYTHONUNBUFFERED=1 exec "$py" -m copyparty -c "$tmp/copyparty.conf") \
    >"$tmp/copyparty.log" 2>&1 &
cpp_pid=$!

# --- nginx -----------------------------------------------------------------------------------
mkdir -p "$tmp/letsencrypt/live/$domain"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=$domain" \
    -keyout "$tmp/letsencrypt/live/$domain/privkey.pem" \
    -out "$tmp/letsencrypt/live/$domain/fullchain.pem" >/dev/null 2>&1 || die "openssl failed"
chmod -R a+rX "$tmp/letsencrypt"

# the test values: domain, home IP, and ports (only on 127.0.0.1, never on all interfaces)
sed -e "s/__DOMAIN__/$domain/g" \
    -e "s/__HOME_IP__/$inside/g" \
    -e "s/listen 443 /listen 127.0.0.1:$p_https /" \
    -e "s/listen 80;/listen 127.0.0.1:$p_http;/" \
    -e "s/127\.0\.0\.1:3923/127.0.0.1:$p_cpp/" \
    "$site" >"$tmp/site.conf"
# if the site file's lines change shape, refuse rather than bind this machine's real 80/443
if grep -E '^\s*listen\b' "$tmp/site.conf" | grep -qvE "listen 127\.0\.0\.1:($p_https|$p_http)[ ;]"; then
    die "a listen line in the site file did not get a test port; update the sed in this script"
fi
grep -q "127.0.0.1:$p_cpp" "$tmp/site.conf" || die "the copyparty upstream did not get the test port"
if grep -n '__[A-Z_]*__' "$tmp/site.conf" >&2; then
    die "placeholders left unfilled (above); update the sed in this script"
fi
cat >"$tmp/nginx.conf" <<EOF
worker_processes 1;
error_log stderr warn;
events { worker_connections 512; }
http {
    access_log off;
    include /etc/nginx/fork-site.conf;
}
EOF
chmod a+r "$tmp/site.conf" "$tmp/nginx.conf"
docker run -d --name "$cname" --network host \
    -v "$tmp/nginx.conf:/etc/nginx/nginx.conf:ro" \
    -v "$tmp/site.conf:/etc/nginx/fork-site.conf:ro" \
    -v "$tmp/letsencrypt:/etc/letsencrypt:ro" \
    --entrypoint nginx "$image" -g 'daemon off;' >/dev/null || die "docker run failed"

# wait for each, up to 20 s; on failure show only that one's log
waitfor() { # NAME ALIVE-CMD UP-CMD...
    local name=$1 alive=$2 i
    shift 2
    for i in $(seq 100); do
        "$@" && return 0
        eval "$alive" || break
        sleep 0.2
    done
    if [ "$name" = copyparty ]; then
        tail -n 20 "$tmp/copyparty.log" >&2
    else
        docker logs "$cname" 2>&1 | tail -n 20 >&2
    fi
    die "$name did not come up (its log above)"
}
waitfor copyparty 'kill -0 $cpp_pid 2>/dev/null' curl -s -o /dev/null "http://127.0.0.1:$p_cpp/"
waitfor nginx '[ "$(docker inspect -f "{{.State.Running}}" "$cname" 2>/dev/null)" = true ]' \
    curl -sk -o /dev/null --resolve "$domain:$p_https:127.0.0.1" "https://$domain:$p_https/"

# two share links of /vol/, made straight on copyparty (setup, not under test): an open one
# that also takes uploads, and one behind a password
mkshare() { # KEY PERMS-JSON PASSWORD
    local got
    got=$(curl -s --max-time 30 -u "check-user:$pw" -H 'Content-Type: application/json' \
        "http://127.0.0.1:$p_cpp/vol/?share" \
        -d '{"k":"'"$1"'","vp":["/vol/"],"pw":"'"$3"'","exp":"","perms":'"$2"'}')
    case $got in "created share: "*) ;; *) die "could not make share link $1: ${got:0:200}" ;; esac
}
mkshare $k_open '["read","write","get"]' ""
mkshare $k_pw '["read"]' "$pw_share"

# --- the rules -------------------------------------------------------------------------------
fails=0
pass() { echo "PASS  $1"; }
fail() {
    local why=${2:-}
    echo "FAIL  $1${why:+  (${why//$'\n'/ })}" # one line per rule, even with a body in the reason
    fails=$((fails + 1))
}

# curl through nginx from a source address: req SRC [curl args...] (URLs use $https / $http)
https=https://$domain:$p_https
http=http://$domain:$p_http
req() {
    local src=$1
    shift
    curl -sk --max-time 30 --interface "$src" \
        --resolve "$domain:$p_https:127.0.0.1" --resolve "$domain:$p_http:127.0.0.1" "$@"
}

# sets $m to a new unique query string, to find one request in copyparty's log
n_marker=0
marker() {
    n_marker=$((n_marker + 1))
    m=fork-check-marker-$n_marker
}
# the client address copyparty logged for the request carrying MARKER
logged_ip() {
    local i
    for i in $(seq 20); do # copyparty logs from a thread, a moment after answering
        grep -qF "?$1 " "$tmp/copyparty.log" && break
        sleep 0.1
    done
    # lines look like "23:32:16.942 127.0.0.1 48504  LOG: GET  /vol/?marker @user" (with colours)
    sed 's/\x1b\[[0-9;]*m//g' "$tmp/copyparty.log" | awk -v m="?$1 " 'index($0, m) { print $2; exit }'
}

# an up2k upload through nginx from a source address, all chunks stitched into one POST like
# copyparty's own clients do: up2k SRC DIR-URL FILE NAME [PASSWORD of check-user; none for a
# guest]; prints "ok" or what went wrong
up2k() {
    "$py" -I - "$1" "$p_https" "$domain" "$2" "$3" "$4" "${5:-}" <<'EOF'
import base64, hashlib, http.client, json, os, ssl, sys

src, port, host, url, fn, name, pw = sys.argv[1:]
size = os.path.getsize(fn)
csz = 1024 * 1024  # copyparty's up2k_chunksize() for files up to 256 MiB
with open(fn, "rb") as f:
    data = f.read()
cids = []
for ofs in range(0, size, csz):
    zb = hashlib.sha512(data[ofs : ofs + csz]).digest()[:33]
    cids.append(base64.urlsafe_b64encode(zb).decode("ascii"))

def req(method, url, body, hdrs):
    ctx = ssl._create_unverified_context()
    c = http.client.HTTPSConnection("127.0.0.1", int(port), source_address=(src, 0), context=ctx, timeout=60)
    hdrs = dict(hdrs, Host="%s:%s" % (host, port))
    if pw:
        zs = base64.b64encode(("check-user:" + pw).encode("utf-8")).decode("ascii")
        hdrs["Authorization"] = "Basic " + zs
    c.request(method, url, body, hdrs)
    r = c.getresponse()
    return r.status, r.read().decode("utf-8", "replace")

hs = json.dumps({"name": name, "size": size, "lmod": 1700000000, "hash": cids})
sc, txt = req("POST", url, hs, {"Content-Type": "application/json"})
if sc >= 400:
    sys.exit("handshake: %d %s" % (sc, txt[:200]))
r = json.loads(txt)
if len(r["hash"]) != len(cids):
    sys.exit("handshake asked for %d of %d chunks" % (len(r["hash"]), len(cids)))
n = max(2, min(9, 192 // len(cids)))
stitch = cids[0] + ",%d,%s" % (n, "".join(x[:n] for x in cids[1:]))
hdrs = {"X-Up2k-Hash": stitch, "X-Up2k-Wark": r["wark"], "Content-Type": "application/octet-stream"}
sc, txt = req("POST", r["purl"], data, hdrs)
if sc >= 400:
    sys.exit("chunks: %d %s" % (sc, txt[:200]))
sc, txt = req("POST", url, hs, {"Content-Type": "application/json"})
if sc >= 400 or json.loads(txt)["hash"]:
    sys.exit("final handshake: %d %s" % (sc, txt[:200]))
print("ok")
EOF
}

# 1. HTTPS on the domain reaches copyparty (Inside: a volume; Outside: a share link)
body=$(req $inside "$https/vol/hello.txt" -u "check-user:$pw")
body2=$(req $outside "$https/share/$k_open/hello.txt")
if [ "$body" = "hello from copyparty" ] && [ "$body2" = "hello from copyparty" ]; then
    pass "HTTPS on the domain reaches copyparty"
else
    fail "HTTPS on the domain reaches copyparty" "got: ${body:0:80} / ${body2:0:80}"
fi

# 2. port 80 only redirects to HTTPS, keeping the path
got=$(req $outside -o /dev/null -w '%{http_code} %{redirect_url}' "$http/vol/hello.txt?x=1")
if [ "$got" = "301 https://$domain/vol/hello.txt?x=1" ]; then
    pass "port 80 redirects to HTTPS"
else
    fail "port 80 redirects to HTTPS" "got: $got"
fi

# 3. copyparty sees each client's real address, never nginx's own
for src in $outside $outside2 $inside; do
    marker
    if [ $src = $inside ]; then
        req $src -o /dev/null "$https/vol/?$m" -u "check-user:$pw"
    else
        req $src -o /dev/null "$https/share/$k_open/?$m"
    fi
    got=$(logged_ip "$m")
    if [ "$got" = "$src" ]; then
        pass "copyparty logs the real client address ($src)"
    else
        fail "copyparty logs the real client address ($src)" "logged: ${got:-nothing}"
    fi
done

# 4. a forged X-Forwarded-For (here: posing as Inside) changes nothing; the real address is logged
marker
req $outside2 -o /dev/null "$https/share/$k_open/?$m" -H "X-Forwarded-For: $inside"
got=$(logged_ip "$m")
if [ "$got" = "$outside2" ]; then
    pass "a forged X-Forwarded-For is ignored"
else
    fail "a forged X-Forwarded-For is ignored" "logged: ${got:-nothing}"
fi

# 5. uploads bigger than nginx's default body limit (1 MiB) and than one up2k chunk (1 MiB here),
# by an account holder Inside
head -c $((3 * 1024 * 1024 + 123)) /dev/urandom >"$tmp/big.bin"
want=$(sha256sum <"$tmp/big.bin" | cut -d' ' -f1)
roundtrip() { # name: download it back through nginx and compare
    local got
    got=$(req $inside "$https/vol/$1" -u "check-user:$pw" | sha256sum | cut -d' ' -f1)
    [ "$got" = "$want" ]
}
code=$(req $inside -o /dev/null -w '%{http_code}' -T "$tmp/big.bin" -u "check-user:$pw" "$https/vol/put.bin")
if [ "$code" = 201 ] && roundtrip put.bin; then
    pass "Inside: a 3 MiB PUT upload goes through"
else
    fail "Inside: a 3 MiB PUT upload goes through" "status $code"
fi
got=$(up2k $inside /vol/ "$tmp/big.bin" up2k.bin "$pw" 2>&1)
if [ "$got" = ok ] && roundtrip up2k.bin; then
    pass "Inside: a 3 MiB up2k upload (4 chunks, one POST) goes through"
else
    fail "Inside: a 3 MiB up2k upload (4 chunks, one POST) goes through" "${got:0:200}"
fi

# who answered, and how: answer SRC [curl args...] prints the status and "nginx" for nginx's own
# error page or "copyparty" for anything else; the body is left in $tmp/body
answer() {
    local code
    code=$(req "$@" -o "$tmp/body" -w '%{http_code}')
    if grep -qF '<center>nginx</center>' "$tmp/body" && ! grep -qi copyparty "$tmp/body"; then
        echo "$code nginx"
    else
        echo "$code copyparty"
    fi
}
# a rule that a request gets nginx's bare 404: bare404 NAME SRC [curl args...]
bare404() {
    local name=$1 got
    shift
    got=$(answer "$@")
    if [ "$got" = "404 nginx" ]; then
        pass "$name"
    else
        fail "$name" "got: $got"
    fi
}

# 7. Outside reaches nothing but share links and static files: a bare 404 from nginx
bare404 "Outside: / gives a bare 404" $outside "$https/"
bare404 "Outside: the control panel gives a bare 404" $outside "$https/?h" -u "check-user:$pw"
bare404 "Outside: a home folder gives a bare 404" $outside "$https/home/check-user/mine.txt" -u "check-user:$pw"
bare404 "Outside: a volume gives a bare 404" $outside "$https/vol/hello.txt" -u "check-user:$pw"
bare404 "Outside: the login POST gives a bare 404" $outside "$https/" \
    --form-string act=login --form-string "cppwd=$pw" --form-string uhash=x
# an account holder's login cookie, made Inside, is no use Outside
req $inside -o /dev/null -c "$tmp/jar" "$https/" --form-string act=login --form-string "cppwd=$pw" --form-string uhash=x
if grep -q cppws "$tmp/jar" 2>/dev/null; then
    bare404 "Outside: a login cookie from Inside still gives a bare 404" $outside -b "$tmp/jar" "$https/home/check-user/"
else
    fail "Outside: a login cookie from Inside still gives a bare 404" "no cookie from logging in Inside"
fi
bare404 "Outside: PUT on a volume gives a bare 404" $outside -T "$tmp/big.bin" -u "check-user:$pw" "$https/vol/out.bin"
bare404 "Outside: DELETE on a volume gives a bare 404" $outside -X DELETE -u "check-user:$pw" "$https/vol/hello.txt"
bare404 "Outside: PROPFIND on a volume gives a bare 404" $outside -X PROPFIND -H 'Depth: 1' -u "check-user:$pw" "$https/vol/"
bare404 "Outside: MKCOL on a volume gives a bare 404" $outside -X MKCOL -u "check-user:$pw" "$https/vol/newdir/"
# paths that only look like the share-link or static area
for p in /share /.cpr /sharex//share/../vol/hello.txt /share/%2e%2e/vol/hello.txt /share/..%2fvol/hello.txt \
    /.cpr/../vol/hello.txt /.cpr/%2e%2e/vol/hello.txt /.cpr/..%2fvol/hello.txt /share%2f../vol/hello.txt; do
    bare404 "Outside: $p gives a bare 404" $outside --path-as-is -u "check-user:$pw" "$https$p"
done
# posing as Inside with a header changes nothing
bare404 "Outside: a forged X-Forwarded-For with the home IP stays Outside" $outside \
    -H "X-Forwarded-For: $inside" -u "check-user:$pw" "$https/vol/hello.txt"
bare404 "Outside: a forged X-Real-IP with the home IP stays Outside" $outside \
    -H "X-Real-IP: $inside" -u "check-user:$pw" "$https/vol/hello.txt"
# the 443 server answers any Host and SNI (a scanner sends the bare IP): the same rules hold
noname() { # SRC HOST [curl args...]: a request on 443 with HOST as both Host and SNI
    local src=$1 h=$2
    shift 2
    curl -sk --max-time 30 --interface "$src" --resolve "$h:$p_https:127.0.0.1" "$@"
}
for h in 127.0.0.1 unknown.example; do
    got=$(noname $outside $h -o "$tmp/body" -w '%{http_code}' "https://$h:$p_https/")
    body=$(noname $outside $h "https://$h:$p_https/share/$k_open/hello.txt")
    if [ "$got" = 404 ] && grep -qF '<center>nginx</center>' "$tmp/body" && [ "$body" = "hello from copyparty" ]; then
        pass "Outside: with $h as Host and SNI, / gives a bare 404 and a share link opens"
    else
        fail "Outside: with $h as Host and SNI, / gives a bare 404 and a share link opens" "/ gave $got; share: ${body:0:60}"
    fi
done

# 8. Outside, a guest gets everything a share link gives
ua='Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0' # copyparty sends HTML to browsers
# every static file and share-link URL the page in $tmp/body refers to loads: assets_load SRC
# (not "/share/" itself, the breadcrumb's root, which copyparty refuses to everyone)
assets_load() {
    local src=$1 u code bad=
    for u in $(grep -oE '(href|src)="/(\.cpr|share)/[^"]+"' "$tmp/body" | sed -E 's/^[a-z]+="//; s/"$//; s/&amp;/\&/g' | sort -u); do
        code=$(req $src -A "$ua" -o /dev/null -w '%{http_code}' "$https$u")
        [ "$code" = 200 ] || bad="$bad $u:$code"
    done
    [ -z "$bad" ] || {
        echo "$bad"
        return 1
    }
}
got=$(answer $outside -A "$ua" "$https/share/$k_open/")
if [ "$got" = "200 copyparty" ] && grep -qF '/.cpr/' "$tmp/body" && bad=$(assets_load $outside); then
    pass "Outside: a share link opens, with its styles, scripts and icons"
else
    fail "Outside: a share link opens, with its styles, scripts and icons" "page: $got; failed:${bad:-}"
fi

# a share link behind a password: the prompt, then the right password unlocks it, a wrong one doesn't
got=$(answer $outside -A "$ua" "$https/share/$k_pw/")
if [ "$got" = "403 copyparty" ] && grep -qF 'name="cppwd"' "$tmp/body" && bad=$(assets_load $outside); then
    pass "Outside: a share link with a password shows its prompt"
else
    fail "Outside: a share link with a password shows its prompt" "page: $got; failed:${bad:-}"
fi
unlock() { # SRC PASSWORD: log in to the share link, then fetch a file from it with that cookie
    rm -f "$tmp/sjar"
    req $1 -A "$ua" -o /dev/null -c "$tmp/sjar" --form-string act=login --form-string "cppwd=$2" \
        --form-string uhash=x "$https/share/$k_pw/"
    req $1 -A "$ua" -o /dev/null -w '%{http_code}' -b "$tmp/sjar" "$https/share/$k_pw/hello.txt"
}
right=$(unlock $outside "$pw_share")
wrong=$(unlock $outside wrong-share-pw)
wrong_in=$(unlock $inside wrong-share-pw)
if [ "$right" = 200 ] && [ "$wrong" = 403 ] && [ "$wrong_in" = "$wrong" ]; then
    pass "Outside: the right share password unlocks it, a wrong one is refused as Inside"
else
    fail "Outside: the right share password unlocks it, a wrong one is refused as Inside" \
        "right: $right, wrong: $wrong, wrong Inside: $wrong_in"
fi

# downloads (a single file is rule 1): the folder as zip and tar, a thumbnail
got=$(req $outside -o "$tmp/dl.zip" -w '%{http_code} %{content_type}' "$https/share/$k_open/?zip")
if [ "${got%% *}" = 200 ] && "$py" -I -c 'import sys, zipfile; n = zipfile.ZipFile(sys.argv[1]).namelist(); sys.exit(not any(x.endswith("/hello.txt") for x in n))' "$tmp/dl.zip"; then
    pass "Outside: a share link's folder downloads as a zip"
else
    fail "Outside: a share link's folder downloads as a zip" "got: $got"
fi
got=$(req $outside "$https/share/$k_open/?tar" | tar -tf - 2>/dev/null | grep -c 'hello.txt$')
if [ "$got" = 1 ]; then
    pass "Outside: a share link's folder downloads as a tar"
else
    fail "Outside: a share link's folder downloads as a tar" "hello.txt found $got times"
fi
got=$(req $outside -A "$ua" -o /dev/null -w '%{http_code} %{content_type}' "$https/share/$k_open/red.png?th=j")
case $got in
"200 image/"*) pass "Outside: a share link's thumbnails load" ;;
*) fail "Outside: a share link's thumbnails load" "got: $got" ;;
esac

# a guest's upload into the share link (a new file: copyparty would skip the known one's chunks)
head -c $((3 * 1024 * 1024 + 321)) /dev/urandom >"$tmp/guest.bin"
want_g=$(sha256sum <"$tmp/guest.bin" | cut -d' ' -f1)
got=$(up2k $outside "/share/$k_open/" "$tmp/guest.bin" guest.bin 2>&1)
back=$(req $outside "$https/share/$k_open/guest.bin" | sha256sum | cut -d' ' -f1)
if [ "$got" = ok ] && [ "$back" = "$want_g" ]; then
    pass "Outside: a guest's 3 MiB up2k upload into a share link goes through"
else
    fail "Outside: a guest's 3 MiB up2k upload into a share link goes through" "${got:0:200}"
fi

# a wrong key gets copyparty's dead-link answer, the same Outside as Inside (the CSP nonce aside)
deadlink() {
    answer $1 -A "$ua" "$https/share/nosuchkey1234/"
    grep -vi nonce "$tmp/body" >"$tmp/dead-$1"
}
out=$(deadlink $outside)
ins=$(deadlink $inside)
if [ "$out" = "403 copyparty" ] && [ "$ins" = "$out" ] && cmp -s "$tmp/dead-$outside" "$tmp/dead-$inside"; then
    pass "Outside: a wrong share key gets copyparty's dead-link answer, as Inside"
else
    fail "Outside: a wrong share key gets copyparty's dead-link answer, as Inside" "Outside: $out, Inside: $ins"
fi

# 9. Inside reaches the whole site, answered as copyparty answers it directly. inside_as_direct
# NAME WANT PATH [curl args...]: the status through nginx from Inside must be WANT and equal
# copyparty's own; an @ in PATH becomes "n" (through nginx) or "d" (direct), for writes
inside_as_direct() {
    local name=$1 want=$2 path=$3 via dir
    shift 3
    via=$(req $inside -o /dev/null -w '%{http_code}' "$@" "$https${path//@/n}")
    dir=$(curl -s --max-time 30 -o /dev/null -w '%{http_code}' "$@" "http://127.0.0.1:$p_cpp${path//@/d}")
    if [ "$via" = "$want" ] && [ "$dir" = "$want" ]; then
        pass "Inside: $name"
    else
        fail "Inside: $name" "through nginx $via, copyparty directly $dir, want $want"
    fi
}
inside_as_direct "/ opens" 200 /
inside_as_direct "the control panel opens" 200 "/?h" -u "check-user:$pw"
inside_as_direct "a home folder opens" 200 /home/check-user/mine.txt -u "check-user:$pw"
inside_as_direct "a volume opens" 200 /vol/hello.txt -u "check-user:$pw"
inside_as_direct "the login POST logs in" 200 / --form-string act=login --form-string "cppwd=$pw" --form-string uhash=x
echo "a small upload" >"$tmp/small.txt"
inside_as_direct "PUT on a volume works" 201 /vol/in-@.txt -T "$tmp/small.txt" -u "check-user:$pw"
inside_as_direct "DELETE on a volume works" 200 /vol/in-@.txt -X DELETE -u "check-user:$pw"
inside_as_direct "PROPFIND on a volume works" 207 /vol/ -X PROPFIND -H 'Depth: 1' -u "check-user:$pw"
inside_as_direct "MKCOL on a volume works" 201 /vol/dir-@/ -X MKCOL -u "check-user:$pw"
inside_as_direct "a share link opens" 200 "/share/$k_open/hello.txt"
inside_as_direct "a wrong share key gets the dead-link answer" 403 /share/nosuchkey1234/

# 6. no HTTP/2 (ALPN offers http/1.1 only) and no nginx version anywhere
alpn=$(openssl s_client -connect "127.0.0.1:$p_https" -servername "$domain" -alpn h2,http/1.1 \
    </dev/null 2>/dev/null | grep -E '^ALPN protocol|^No ALPN')
if [ "$alpn" = "ALPN protocol: http/1.1" ]; then
    pass "HTTP/2 is not offered"
else
    fail "HTTP/2 is not offered" "${alpn:-no TLS answer}"
fi
ver=$(docker exec "$cname" nginx -v 2>&1 | sed 's/.*nginx\///')
leak=
for u in "$https/vol/hello.txt" "$https/share/$k_open/hello.txt" "$http/" "$https/.well-known/nonexistent"; do
    if req $outside -i "$u" | grep -qF "$ver"; then
        leak="$leak $u"
    fi
done
if [ -n "$ver" ] && [ -z "$leak" ]; then
    pass "responses carry no nginx version"
else
    fail "responses carry no nginx version" "version ${ver:-unknown} in:$leak"
fi

echo
if [ "$fails" -gt 0 ]; then
    echo "fork-https-check: $fails rule(s) failed"
    exit 1
fi
echo "fork-https-check: all rules pass"

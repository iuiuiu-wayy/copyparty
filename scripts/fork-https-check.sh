#!/bin/bash
# fork-only, local-only: proves the rules of the fork's nginx site file
# (contrib/nginx/fork-https-outside.conf) against a real copyparty and a real nginx 1.30.
#   ./scripts/fork-https-check.sh
# Starts copyparty from this checkout on 127.0.0.1 with a throwaway config, and nginx from the
# official image in Docker on the host network, both on free high ports bound to 127.0.0.1.
# The site file is copied to a temp folder with test values filled in (never edited), and served
# with a throwaway self-signed certificate made in that folder. Requests from 127.0.0.2 stand for
# Inside (the home IP), from 127.0.0.1 for Outside (and other 127.x for more Outside visitors,
# one per rate-limit rule). Prints one PASS/FAIL line per rule and exits
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
slow_pid= # the open-requests rule's curl, while it runs
hdr_pid=  # the slow-header rule's client, while it runs

cleanup() {
    trap '' INT TERM # a second Ctrl-C must not cut the cleanup short
    [ -z "$slow_pid" ] || kill "$slow_pid" 2>/dev/null
    [ -z "$hdr_pid" ] || kill "$hdr_pid" 2>/dev/null
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
# and a folder of 150 images, for a share page loading many thumbnails at once
mkdir "$tmp/srv/vol/pics"
for i in $(seq 150); do cp "$tmp/srv/vol/red.png" "$tmp/srv/vol/pics/$i.png"; done
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
  # password changes on, as on the Pi, so rule 8 has one to refuse
  chpw
  # as on the Pi (login-outside): the admin account logs in only from Inside (the home IP) or
  # from 127.0.0.1 (an SSH tunnel to the Pi); rule 6b
  ipr: $inside/32,127.0.0.1/32=check-admin
  # log the headers nginx passes on (rule 8b); the marker first, to find a request's lines
  ihead: x-fork-marker
  ihead: authorization
  ihead: cookie
  ihead: pw
  # and log every request, /.cpr/ too (by default copyparty leaves those out)
  lf-url: ^/fork-check-logs-everything$

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
# the two files "certbot --nginx" puts beside the certificate, which the site file includes:
# its TLS settings (the gist of certbot's options-ssl-nginx.conf) and DH parameters (ffdhe2048,
# the same group certbot ships)
cat >"$tmp/letsencrypt/options-ssl-nginx.conf" <<'EOF'
ssl_session_cache shared:le_nginx_SSL:10m;
ssl_session_timeout 1440m;
ssl_session_tickets off;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
EOF
openssl genpkey -genparam -algorithm DH -pkeyopt dh_param:ffdhe2048 \
    -out "$tmp/letsencrypt/ssl-dhparams.pem" 2>/dev/null || die "openssl dhparam failed"
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

# rule 14 starts now, since it waits: from Outside, a TLS connection that sends half a request
# header and then nothing; prints "closed SECONDS" once nginx closes it, or "open" after 30 s
"$py" -I - 127.0.0.7 "$p_https" "$domain" >"$tmp/slowhdr" 2>&1 <<'EOF' &
import socket, ssl, sys, time

src, port, host = sys.argv[1:]
ctx = ssl._create_unverified_context()
s = socket.create_connection(("127.0.0.1", int(port)), timeout=10, source_address=(src, 0))
s = ctx.wrap_socket(s, server_hostname=host)
s.sendall(("GET /share/ HTTP/1.1\r\nHost: %s\r\n" % (host,)).encode("ascii"))
t0 = time.time()
s.settimeout(30)
try:
    while s.recv(4096):
        pass
    print("closed %.1f" % (time.time() - t0,))
except socket.timeout:
    print("open")
EOF
hdr_pid=$!
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
# guest] [LOGIN-COOKIE value, sent as cppws]; prints "ok" or what went wrong
up2k() {
    "$py" -I - "$1" "$p_https" "$domain" "$2" "$3" "$4" "${5:-}" "${6:-}" <<'EOF'
import base64, hashlib, http.client, json, os, ssl, sys

src, port, host, url, fn, name, pw, ck = sys.argv[1:]
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
    if ck:
        hdrs["Cookie"] = "cppws=" + ck
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

# and only to the domain, whatever Host the request names (no open redirect)
got=$(curl -s --max-time 30 --interface $outside -o /dev/null -w '%{http_code} %{redirect_url}' \
    -H 'Host: evil.example' "http://127.0.0.1:$p_http/x?y=1")
if [ "$got" = "301 https://$domain/x?y=1" ]; then
    pass "port 80 redirects only to the domain, whatever the Host"
else
    fail "port 80 redirects only to the domain, whatever the Host" "got: $got"
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

# 6. Outside, without a login cookie: / is copyparty's login page; anything else but share links
# and static files stops at nginx (GET and HEAD: 302 to /; any other method: the bare 404)
ua='Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0' # copyparty sends HTML to browsers
# a rule that a request gets copyparty's login form: loginpage NAME SRC [curl args...]
loginpage() {
    local name=$1 got
    shift
    got=$(answer "$@" -A "$ua")
    if [ "$got" = "200 copyparty" ] && grep -qF 'name="cppwd"' "$tmp/body"; then
        pass "$name"
    else
        fail "$name" "got: $got, login form: $(grep -c 'name="cppwd"' "$tmp/body")"
    fi
}
loginpage "Outside: / gives copyparty's login page" $outside "$https/"
loginpage "Outside: the control panel at /?h gives copyparty's login page" $outside "$https/?h"
# a rule that a request stops at nginx with a 302 to / (Location just "/", so the browser stays
# on the name it used; copyparty never answers so on these paths): tologin NAME SRC [curl args...]
tologin() {
    local name=$1 code loc
    shift
    code=$(req "$@" -o /dev/null -D "$tmp/hdrs" -w '%{http_code}')
    loc=$(tr -d '\r' <"$tmp/hdrs" | sed -n 's/^[Ll]ocation: //p')
    if [ "$code" = 302 ] && [ "$loc" = / ]; then
        pass "$name"
    else
        fail "$name" "got: $code, Location: ${loc:-none}"
    fi
}
for how in GET HEAD; do
    h=
    [ $how = HEAD ] && h=-I
    tologin "Outside, no login cookie: $how of a home folder gives 302 to /" $outside $h \
        -u "check-user:$pw" "$https/home/check-user/mine.txt"
    tologin "Outside, no login cookie: $how of a volume gives 302 to /" $outside $h -u "check-user:$pw" "$https/vol/hello.txt"
    tologin "Outside, no login cookie: $how of a volume's control panel gives 302 to /" $outside $h \
        -u "check-user:$pw" "$https/vol/?h"
done
# an everyday account logs in at / (the login page's form) and gets the HTTPS login cookie
rm -f "$tmp/ojar"
req $outside -o /dev/null -c "$tmp/ojar" "$https/" --form-string act=login --form-string "cppwd=$pw" --form-string uhash=x
if grep -qP '\tcppws\t(?!x$)' "$tmp/ojar" 2>/dev/null; then
    pass "Outside: an everyday account logs in at / and gets the HTTPS login cookie"
else
    fail "Outside: an everyday account logs in at / and gets the HTTPS login cookie" "no cppws cookie"
fi
# an account holder's login cookie made Inside, for rule 8
req $inside -o /dev/null -c "$tmp/jar" "$https/" --form-string act=login --form-string "cppwd=$pw" --form-string uhash=x
# with the cookie from Outside: the home folder, a volume and the control panel open
bad=
for u in /home/check-user/mine.txt /vol/hello.txt /vol/?h; do
    got=$(answer $outside -A "$ua" -b "$tmp/ojar" "$https$u")
    [ "$got" = "200 copyparty" ] || bad="$bad $u:$got"
done
grep -qF 'home of check-user' <<<"$(req $outside -b "$tmp/ojar" "$https/home/check-user/mine.txt")" || bad="$bad home:content"
if [ -z "$bad" ]; then
    pass "Outside: with the login cookie, a home folder, a volume and a control panel open"
else
    fail "Outside: with the login cookie, a home folder, a volume and a control panel open" "got:$bad"
fi
# and an up2k upload (larger than one chunk) into the home folder arrives
head -c $((3 * 1024 * 1024 + 456)) /dev/urandom >"$tmp/out.bin"
want_o=$(sha256sum <"$tmp/out.bin" | cut -d' ' -f1)
ck=$(awk '$6 == "cppws" { print $7 }' "$tmp/ojar")
got=$(up2k $outside /home/check-user/ "$tmp/out.bin" out.bin "" "$ck" 2>&1)
back=$(req $outside -b "$tmp/ojar" "$https/home/check-user/out.bin" | sha256sum | cut -d' ' -f1)
if [ "$got" = ok ] && [ "$back" = "$want_o" ]; then
    pass "Outside: with the login cookie, a 3 MiB up2k upload (4 chunks) into the home folder arrives"
else
    fail "Outside: with the login cookie, a 3 MiB up2k upload (4 chunks) into the home folder arrives" "${got:0:200}"
fi
# and writes: PUT, then DELETE, on a volume
echo "a small upload" >"$tmp/small.txt"
put=$(req $outside -o /dev/null -w '%{http_code}' -b "$tmp/ojar" -T "$tmp/small.txt" "$https/vol/out-put.txt")
del=$(req $outside -o /dev/null -w '%{http_code}' -b "$tmp/ojar" -X DELETE "$https/vol/out-put.txt")
if [ "$put" = 201 ] && [ "$del" = 200 ]; then
    pass "Outside: with the login cookie, PUT and DELETE on a volume work"
else
    fail "Outside: with the login cookie, PUT and DELETE on a volume work" "PUT $put, DELETE $del"
fi
# a made-up cookie value passes nginx, and copyparty answers it as a guest's: no home folder
got=$(answer $outside -A "$ua" -b cppws=fork-check-made-up-cookie "$https/home/check-user/mine.txt")
case $got in
*" copyparty")
    if [ "${got%% *}" != 200 ] && ! grep -qF 'home of check-user' "$tmp/body"; then
        pass "Outside: a made-up login cookie reaches copyparty, which answers as for a guest"
    else
        fail "Outside: a made-up login cookie reaches copyparty, which answers as for a guest" "got: $got, with the file"
    fi
    ;;
*) fail "Outside: a made-up login cookie reaches copyparty, which answers as for a guest" "got: $got" ;;
esac

# 6b. the admin account logs in only Inside, or straight at copyparty from 127.0.0.1 (an SSH
# tunnel to the Pi; ipr in copyparty's config). Through nginx, Outside, it is refused like a
# wrong password, whatever the request claims; tested from Outside addresses other than
# 127.0.0.1, so that the tunnel's exception can't hide a hole
# login SRC [curl args...]: log in as the admin account at / through nginx; prints the
# login cookie's value, empty if refused (the jar is left in $tmp/adjar)
login() {
    local src=$1
    shift
    rm -f "$tmp/adjar"
    req $src -o /dev/null -c "$tmp/adjar" "$@" "$https/" --form-string act=login \
        --form-string "cppwd=$pw_admin" --form-string uhash=x
    awk '$6 == "cppws" && $7 != "x" { print $7 }' "$tmp/adjar"
}
n_ipr() { sed 's/\x1b\[[0-9;]*m//g' "$tmp/copyparty.log" | grep -c 'rejected by --ipr'; }
before=$(n_ipr)
got=$(login $outside2)
sleep 0.3 # copyparty logs from a thread
if [ -z "$got" ] && [ "$(n_ipr)" -gt "$before" ]; then
    pass "Outside: the admin account's login at / is refused (copyparty logs: rejected by --ipr)"
else
    fail "Outside: the admin account's login at / is refused (copyparty logs: rejected by --ipr)" \
        "cookie: ${got:-none}; ipr rejections logged: $before, then $(n_ipr)"
fi
got=$(login 127.0.0.11 -H 'X-Forwarded-For: 127.0.0.1' -H 'X-Real-IP: 127.0.0.1')
if [ -z "$got" ]; then
    pass "Outside: a forged X-Forwarded-For: 127.0.0.1 doesn't let the admin account log in"
else
    fail "Outside: a forged X-Forwarded-For: 127.0.0.1 doesn't let the admin account log in" "got a login cookie"
fi
# each refusal counts as a wrong password: past ban-pw's 9, copyparty bans that address (and
# only that one). copyparty doesn't count a password sent again straight after itself, so the
# admin account's 5 logins take turns with 5 different wrong passwords: 10 counted only if the
# admin ones count too. From an address of its own, used by no other rule
for i in $(seq 5); do
    login 127.0.0.21 >/dev/null
    req 127.0.0.21 -o /dev/null "$https/" --form-string act=login --form-string "cppwd=check-wrong-$i" \
        --form-string uhash=x
done
code=$(req 127.0.0.21 -o "$tmp/body" -w '%{http_code}' "$https/")
other=$(req 127.0.0.22 -o /dev/null -w '%{http_code}' "$https/")
if [ "$code" = 403 ] && grep -qF 'thank you for playing' "$tmp/body" && [ "$other" = 200 ]; then
    pass "Outside: admin-account logins count toward copyparty's ban (ban-pw), for that address only"
else
    fail "Outside: admin-account logins count toward copyparty's ban (ban-pw), for that address only" \
        "after: $code $(head -c 60 "$tmp/body"); another address: $other"
fi
got=$(login $inside)
if [ -n "$got" ]; then
    pass "Inside: the admin account logs in at /"
else
    fail "Inside: the admin account logs in at /" "no login cookie"
fi
# the admin account's cookie, made Inside, is a guest's Outside
code=$(req $outside2 -o "$tmp/body" -w '%{http_code}' -b "$tmp/adjar" "$https/vol/?ls")
if [ "$code" != 200 ] && ! grep -qF hello.txt "$tmp/body"; then
    pass "Outside: the admin account's login cookie from Inside counts for nothing"
else
    fail "Outside: the admin account's login cookie from Inside counts for nothing" "got: $code"
fi
# straight at copyparty from 127.0.0.1, as through an SSH tunnel to the Pi (no nginx)
got=$(curl -s --max-time 30 -o /dev/null -D - "http://127.0.0.1:$p_cpp/" --form-string act=login \
    --form-string "cppwd=$pw_admin" --form-string uhash=x | grep -ciE '^set-cookie: cppwd=[^x;]')
if [ "$got" = 1 ]; then
    pass "copyparty from 127.0.0.1 (an SSH tunnel): the admin account logs in"
else
    fail "copyparty from 127.0.0.1 (an SSH tunnel): the admin account logs in" "no login cookie"
fi
bare404 "Outside: PUT on a volume gives a bare 404" $outside -T "$tmp/big.bin" -u "check-user:$pw" "$https/vol/out.bin"
bare404 "Outside: DELETE on a volume gives a bare 404" $outside -X DELETE -u "check-user:$pw" "$https/vol/hello.txt"
bare404 "Outside: PROPFIND on a volume gives a bare 404" $outside -X PROPFIND -H 'Depth: 1' -u "check-user:$pw" "$https/vol/"
bare404 "Outside: MKCOL on a volume gives a bare 404" $outside -X MKCOL -u "check-user:$pw" "$https/vol/newdir/"
bare404 "Outside: POST on a volume gives a bare 404" $outside -u "check-user:$pw" "$https/vol/" \
    --form-string act=mkdir --form-string name=newdir
# paths that only look like the share-link or static area
for p in /share /.cpr /sharex//share/../vol/hello.txt /share/%2e%2e/vol/hello.txt /share/..%2fvol/hello.txt \
    /.cpr/../vol/hello.txt /.cpr/%2e%2e/vol/hello.txt /.cpr/..%2fvol/hello.txt /share%2f../vol/hello.txt; do
    tologin "Outside, no login cookie: $p gives 302 to /" $outside --path-as-is -u "check-user:$pw" "$https$p"
done
# posing as Inside with a header changes nothing
tologin "Outside: a forged X-Forwarded-For with the home IP stays Outside" $outside \
    -H "X-Forwarded-For: $inside" -u "check-user:$pw" "$https/vol/hello.txt"
tologin "Outside: a forged X-Real-IP with the home IP stays Outside" $outside \
    -H "X-Real-IP: $inside" -u "check-user:$pw" "$https/vol/hello.txt"
# the 443 server answers any Host and SNI (a scanner sends the bare IP): the same rules hold
noname() { # SRC HOST [curl args...]: a request on 443 with HOST as both Host and SNI
    local src=$1 h=$2
    shift 2
    curl -sk --max-time 30 --interface "$src" --resolve "$h:$p_https:127.0.0.1" "$@"
}
for h in 127.0.0.1 unknown.example; do
    got=$(noname $outside $h -o /dev/null -D "$tmp/hdrs" -w '%{http_code}' "https://$h:$p_https/vol/hello.txt")
    got="$got $(tr -d '\r' <"$tmp/hdrs" | sed -n 's/^[Ll]ocation: //p')"
    lp=$(noname $outside $h -A "$ua" "https://$h:$p_https/" | grep -c 'name="cppwd"')
    body=$(noname $outside $h "https://$h:$p_https/share/$k_open/hello.txt")
    if [ "$got" = "302 /" ] && [ "$lp" -ge 1 ] && [ "$body" = "hello from copyparty" ]; then
        pass "Outside: with $h as Host and SNI, / is the login page, a volume 302s and a share link opens"
    else
        fail "Outside: with $h as Host and SNI, / is the login page, a volume 302s and a share link opens" \
            "volume: $got; login forms on /: $lp; share: ${body:0:60}"
    fi
done

# 7. Outside, a guest gets everything a share link gives
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

# 8. under a share link, an account's password or login cookie counts for nothing: copyparty
# answers it as a guest's, Inside and Outside alike (nginx can't tell the two kinds of password
# apart). Outside from an address of its own, so that no other rule's wrong passwords add up
# to a ban here (a ban's 403 would look like a refusal)
outside_a=127.0.0.5
# each way of sending an account login, one per line: the password in the query, the PW header,
# basic auth, and the login cookie made Inside in rule 6
logins() { printf '%s\n' query header basic cookie; }
# lreq SRC HOW URL [curl args...]: req with that login added
lreq() {
    local src=$1 how=$2 url=$3
    shift 3
    case $how in
    query) req $src "$@" "$url$(case $url in *\?*) echo '&' ;; *) echo '?' ;; esac)pw=$pw" ;;
    header) req $src "$@" -H "PW: $pw" "$url" ;;
    basic) req $src "$@" -u "check-user:$pw" "$url" ;;
    cookie) req $src "$@" -b "$tmp/jar" "$url" ;;
    esac
}
[ -s "$tmp/jar" ] || fail "rule 8 setup: the login cookie from rule 6" "none in $tmp/jar"
# no account's data: no volume or home folder link, no account name. noacct NAME SRC URL
noacct() {
    local name=$1 src=$2 url=$3 how bad=
    for how in $(logins); do
        lreq $src $how "$url" -A "$ua" -o "$tmp/body"
        [ -s "$tmp/body" ] || bad="$bad $how:empty"
        grep -qE 'href="/(vol|home)/|check-user' "$tmp/body" && bad="$bad $how"
    done
    if [ -z "$bad" ]; then
        pass "$name"
    else
        fail "$name" "account data with:$bad"
    fi
}
noacct "Outside: an account login under a share link gets no control panel data" $outside_a "$https/share/$k_open/?h"
noacct "Outside: an account login under /share gets no control panel data" $outside_a "$https/share/?h"
noacct "Outside: an account login under a share link lists only the link" $outside_a "$https/share/$k_open/"
noacct "Inside: an account login under a share link gets no control panel data" $inside "$https/share/$k_open/?h"
# a share link behind a password stays locked to an account login, even its owner's
bad=
for how in $(logins); do
    code=$(lreq $outside_a $how "$https/share/$k_pw/hello.txt" -A "$ua" -o /dev/null -w '%{http_code}')
    [ "$code" = 403 ] || bad="$bad $how:$code"
done
if [ -z "$bad" ]; then
    pass "Outside: an account login doesn't unlock a share link's password"
else
    fail "Outside: an account login doesn't unlock a share link's password" "got:$bad"
fi
# the account password at the share link's prompt sets no login cookie
rm -f "$tmp/ajar"
code=$(req $outside_a -A "$ua" -o /dev/null -w '%{http_code}' -c "$tmp/ajar" --form-string act=login \
    --form-string "cppwd=$pw" --form-string uhash=x "$https/share/$k_pw/")
if [ "$code" = 200 ] && ! grep -qP 'cppws\t(?!x$)' "$tmp/ajar"; then
    pass "Outside: an account password at a share link's prompt is refused"
else
    fail "Outside: an account password at a share link's prompt is refused" "status $code; cookies: $(grep -c cppws "$tmp/ajar" 2>/dev/null)"
fi
# no password change: afterwards the old password still works, the new one doesn't (checked Inside)
newpw=check-pw-changed
bad=
for how in $(logins); do
    code=$(lreq $outside_a $how "$https/share/$k_open/" -A "$ua" -o "$tmp/body" -w '%{http_code}' \
        --form-string act=chpw --form-string "pw=$newpw")
    [ "$code" = 000 ] && bad="$bad $how:no-answer"
    grep -q 'new password OK' "$tmp/body" && bad="$bad $how"
done
old=$(req $inside -o /dev/null -w '%{http_code}' -u "check-user:$pw" "$https/vol/hello.txt")
new=$(req $inside -o /dev/null -w '%{http_code}' -u "check-user:$newpw" "$https/vol/hello.txt")
if [ -z "$bad" ] && [ "$old" = 200 ] && [ "$new" != 200 ]; then
    pass "Outside: an account login can't change its password under a share link"
else
    fail "Outside: an account login can't change its password under a share link" \
        "changed with:${bad:- none}; old password $old, new $new"
fi
# no new share link, here of the account's home folder: refused, and the key opens nothing
bad=
opened=
for how in $(logins); do
    key=checkstolen-$how
    code=$(lreq $outside_a $how "$https/share/$k_open/?share" -o "$tmp/body" -w '%{http_code}' \
        -H 'Content-Type: application/json' \
        -d '{"k":"'$key'","vp":["/home/check-user/"],"pw":"","exp":"","perms":["read"]}')
    case $code in 000 | 201) bad="$bad $how:$code" ;; esac
    code=$(req $inside -o /dev/null -w '%{http_code}' "$https/share/$key/mine.txt")
    [ "$code" = 200 ] && opened="$opened $key"
done
if [ -z "$bad" ] && [ -z "$opened" ]; then
    pass "Outside: an account login can't make a share link through a share link URL"
else
    fail "Outside: an account login can't make a share link through a share link URL" \
        "made with:${bad:- none}; opens:${opened:- none}"
fi

# 8b. copyparty's static files (/.cpr/) Outside: only GET and HEAD, and no login. nginx passes
# Outside no Authorization, Cookie or PW header and no query string there, and copyparty takes
# no login under /.cpr/ anyway; both are checked. Outside from an address of its own
outside_c=127.0.0.6
# copyparty's log of the request carrying header "X-Fork-Marker: MARKER": the headers it logged
# (ihead in its config above), then its request line
seen() {
    local i
    for i in $(seq 20); do
        grep -qF "[$1]" "$tmp/copyparty.log" && break
        sleep 0.1
    done
    sed 's/\x1b\[[0-9;]*m//g' "$tmp/copyparty.log" |
        awk -v m="x-fork-marker: [$1]" 'index($0, m) { on = 1; print; next } on && /\[H\] / { print; next } on { print; exit }'
}
bad=
code=$(req $outside_c -o /dev/null -w '%{http_code}' -I "$https/.cpr/ui.css")
[ "$code" = 200 ] || bad="$bad HEAD:$code"
for how in $(logins); do
    code=$(lreq $outside_c $how "$https/.cpr/ui.css" -o /dev/null -w '%{http_code}' -D "$tmp/hdrs")
    [ "$code" = 200 ] || bad="$bad $how:$code"
    grep -qiP '^set-cookie: cppw[sd]=(?!x;)' "$tmp/hdrs" && bad="$bad $how:logged-in"
done
if [ -z "$bad" ]; then
    pass "Outside: /.cpr/ loads, and an account login there sets no login cookie"
else
    fail "Outside: /.cpr/ loads, and an account login there sets no login cookie" "got:$bad"
fi
# what reaches copyparty: Outside no login at all, Inside everything as sent
marker
mo=$m
req $outside_c -o /dev/null -H "X-Fork-Marker: $mo" -H "PW: $pw" -u "check-user:$pw" -b "$tmp/jar" "$https/.cpr/ui.css?pw=$pw"
blk=$(seen $mo)
marker
ms=$m # a query hidden in the path, as %3F
req $outside_c --path-as-is -o /dev/null -H "X-Fork-Marker: $ms" "$https/.cpr/ui.css%3Fpw=$pw"
blk_s=$(seen $ms)
marker
mi=$m
req $inside -o /dev/null -H "X-Fork-Marker: $mi" -H "PW: $pw" -u "check-user:$pw" -b "$tmp/jar" "$https/.cpr/ui.css?pw=$pw"
blk_i=$(seen $mi)
bad=
[ -n "$blk" ] || bad="$bad Outside:not-seen"
grep -qiE '\[H\] (authorization|cookie|pw):' <<<"$blk" && bad="$bad Outside:header"
grep -qF 'pw=' <<<"$blk" && bad="$bad Outside:query"
[ -n "$blk_s" ] || bad="$bad %3F:not-seen"
grep -qF '?pw=' <<<"$blk_s" && bad="$bad %3F:query"
[ "$(grep -ciE '\[H\] (authorization|cookie|pw):' <<<"$blk_i")" = 3 ] || bad="$bad Inside:headers"
grep -qF 'pw=' <<<"$blk_i" || bad="$bad Inside:query"
if [ -z "$bad" ]; then
    pass "Outside: nginx passes no Authorization, Cookie, PW or query to /.cpr/ (Inside: all)"
else
    fail "Outside: nginx passes no Authorization, Cookie, PW or query to /.cpr/ (Inside: all)" "got:$bad"
fi
# every other method, with or without a login: nginx's bare 404
bare404 "Outside: the login POST on /.cpr/ gives a bare 404" $outside_c "$https/.cpr/" \
    --form-string act=login --form-string "cppwd=$pw" --form-string uhash=x
bare404 "Outside: PUT on /.cpr/ gives a bare 404" $outside_c -T "$tmp/big.bin" -u "check-user:$pw" "$https/.cpr/x.txt"
bare404 "Outside: DELETE on /.cpr/ gives a bare 404" $outside_c -X DELETE -u "check-user:$pw" "$https/.cpr/ui.css"
bare404 "Outside: PROPFIND on /.cpr/ gives a bare 404" $outside_c -X PROPFIND -H 'Depth: 1' -u "check-user:$pw" "$https/.cpr/"
bad=
for how in $(logins); do
    key=checkcpr-$how
    got=$(lreq $outside_c $how "$https/.cpr/?share" -o "$tmp/body" -w '%{http_code}' \
        -H 'Content-Type: application/json' \
        -d '{"k":"'$key'","vp":["/home/check-user/"],"pw":"","exp":"","perms":["read"]}')
    if [ "$got" != 404 ] || ! grep -qF '<center>nginx</center>' "$tmp/body"; then
        bad="$bad $how:$got"
    fi
done
if [ -z "$bad" ]; then
    pass "Outside: POST /.cpr/?share with an account login gives a bare 404"
else
    fail "Outside: POST /.cpr/?share with an account login gives a bare 404" "got:$bad"
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
inside_as_direct "PUT on a volume works" 201 /vol/in-@.txt -T "$tmp/small.txt" -u "check-user:$pw"
inside_as_direct "DELETE on a volume works" 200 /vol/in-@.txt -X DELETE -u "check-user:$pw"
inside_as_direct "PROPFIND on a volume works" 207 /vol/ -X PROPFIND -H 'Depth: 1' -u "check-user:$pw"
inside_as_direct "MKCOL on a volume works" 201 /vol/dir-@/ -X MKCOL -u "check-user:$pw"
inside_as_direct "a share link opens" 200 "/share/$k_open/hello.txt"
inside_as_direct "a wrong share key gets the dead-link answer" 403 /share/nosuchkey1234/

# 10. no HTTP/2 (ALPN offers http/1.1 only) and no nginx version anywhere
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

# 10b. HSTS: every HTTPS answer, copyparty's and nginx's own, tells browsers to use HTTPS only
# for a year, for this name only (no includeSubDomains); port 80 sends no such header
hsts() { # SRC [curl args...]: the Strict-Transport-Security headers of the answer, one per line
    req "$@" -o /dev/null -D - | tr -d '\r' | grep -i '^strict-transport-security:'
}
bad=
for c in "$outside $https/" "$outside $https/share/$k_open/hello.txt" "$outside $https/.cpr/ui.css" \
    "$outside $https/vol/hello.txt" "$outside -X DELETE $https/vol/hello.txt" "$inside -u check-user:$pw $https/vol/hello.txt"; do
    # shellcheck disable=SC2086 # on purpose: each case is words
    got=$(hsts $c)
    [ "$got" = "Strict-Transport-Security: max-age=31536000" ] || bad="$bad [${c#* }: ${got:-none}]"
done
got=$(hsts $outside "$http/")
[ -z "$got" ] || bad="$bad [port 80: $got]"
if [ -z "$bad" ]; then
    pass "HTTPS answers carry Strict-Transport-Security: max-age=31536000 (port 80 none)"
else
    fail "HTTPS answers carry Strict-Transport-Security: max-age=31536000 (port 80 none)" "${bad:0:300}"
fi

# 11. certbot's renewal (--nginx) still passes Let's Encrypt's HTTP-01 challenge on port 80.
# For each renewal certbot edits the site file for a moment, then puts it back byte for byte:
# into every server block whose server_name holds the domain (its choose_auth_vhosts) it adds
# a "rewrite ... break" at the top, which skips the port-80 "return 301", and an exact location
# for the token. Here the same two lines, as certbot 2.1.0 (Debian 12) writes them
# (certbot_nginx/_internal/http_01.py, _make_or_mod_server_block), go into a copy, nginx
# reloads it, Outside asks for the token, and the original is restored
certbot_edit() { # SITE-FILE TOKEN VALIDATION: prints the file as certbot's challenge leaves it
    awk -v d="$domain" -v tok="$2" -v val="$3" '
    function flush(   i) {
        for (i = 1; i <= n; i++) {
            if (named && i == 1) {
                print buf[i] "rewrite ^(/.well-known/acme-challenge/.*) $1 break; # managed by Certbot"
            } else if (named && i == n) {
                print "location = /.well-known/acme-challenge/" tok "{default_type text/plain;return 200 " val ";} # managed by Certbot"
                print buf[i]
            } else print buf[i]
        }
        n = 0; named = 0
    }
    {
        line = $0; sub(/#.*/, "", line)
        if (!depth && line ~ /^[ \t]*server[ \t]*\{/) { inserver = 1 }
        if (inserver) {
            buf[++n] = $0
            if (line ~ /^[ \t]*server_name[ \t]/ && (" " line " ") ~ ("[ \t]" d "[ ;]")) named = 1
        } else print
        depth += gsub(/\{/, "{", line) - gsub(/\}/, "}", line)
        if (inserver && !depth) { inserver = 0; flush() }
    }' "$1"
}
acme_tok=fork-check-acme-token
acme_val=$acme_tok.fork-check-thumbprint
cp "$tmp/site.conf" "$tmp/site.orig"
certbot_edit "$tmp/site.orig" $acme_tok $acme_val >"$tmp/site.certbot"
# into the same file (same inode: it is bind-mounted), then reload; wait for the new workers
cat "$tmp/site.certbot" >"$tmp/site.conf"
if docker exec "$cname" nginx -s reload 2>"$tmp/reload.err"; then
    for i in $(seq 25); do
        got=$(req $outside -w ' %{http_code}' "$http/.well-known/acme-challenge/$acme_tok")
        [ "$got" = "$acme_val 200" ] && break
        sleep 0.2
    done
else
    got="nginx refused the certbot-edited file: $(head -c 300 "$tmp/reload.err")"
fi
if [ "$got" = "$acme_val 200" ]; then
    pass "port 80 answers certbot's HTTP-01 challenge during a renewal"
else
    fail "port 80 answers certbot's HTTP-01 challenge during a renewal" "got: ${got:0:120}"
fi
cat "$tmp/site.orig" >"$tmp/site.conf"
docker exec "$cname" nginx -s reload 2>/dev/null || die "nginx did not take the site file back"
for i in $(seq 25); do
    got=$(req $outside -o /dev/null -w '%{http_code}' "$http/.well-known/acme-challenge/$acme_tok")
    [ "$got" = 301 ] && break
    sleep 0.2
done
[ "$got" = 301 ] || die "nginx still serves the certbot-edited file after restoring it"

# 12. the access log names the host each request asked for (the domain or a bare IP) and whether
# it was Inside or Outside. The official image sends access.log to the container's stdout
logline() { # MARKER: the access-log line of the request carrying it
    local i
    for i in $(seq 20); do
        docker logs "$cname" 2>/dev/null | grep -F "?$1 " && return
        sleep 0.1
    done
}
bad=
marker
req $outside -o /dev/null "$https/share/$k_open/?$m"
logline "$m" | grep -qF "\"$domain\" outside" || bad="$bad Outside-domain:[$(logline "$m")]"
marker
curl -sk --max-time 30 --interface $outside -o /dev/null "https://127.0.0.1:$p_https/share/$k_open/?$m"
logline "$m" | grep -qF '"127.0.0.1" outside' || bad="$bad Outside-bare-IP:[$(logline "$m")]"
marker
req $inside -o /dev/null "$https/share/$k_open/?$m"
logline "$m" | grep -qF "\"$domain\" inside" || bad="$bad Inside:[$(logline "$m")]"
marker
req $outside -o /dev/null "$http/?$m"
logline "$m" | grep -qF "\"$domain\" outside" || bad="$bad port-80:[$(logline "$m")]"
if [ -z "$bad" ]; then
    pass "the access log shows each request's host and Inside or Outside"
else
    fail "the access log shows each request's host and Inside or Outside" "${bad:0:300}"
fi

# 13. rate limits: Outside per address (20/s, burst 200, 32 connections), Inside never. Last,
# since a flood uses up its address's burst; each rule floods from an address of its own
# (any 127.x works), so one rule's limit never leaks into another
# flood SRC N URL [curl args...]: N requests as fast as one curl sends them (one connection,
# kept alive), "@" in URL becomes 1..N; prints each status in order, one per line
flood() {
    local src=$1 n=$2 url=$3 i
    shift 3
    for i in $(seq "$n"); do
        printf 'url = "%s"\noutput = "/dev/null"\n' "${url//@/$i}"
    done >"$tmp/flood.cfg"
    req "$src" -w '%{http_code}\n' "$@" -K "$tmp/flood.cfg"
}
# count CODE: how many lines of stdin are CODE
count() { grep -cx "$1"; }

# a guest opens a share folder of 150 images: the page, its static files and every thumbnail at
# once, six at a time like a browser over HTTP/1.1 (the grid loads them lazily, so this is more
# than a browser asks for in one go)
req 127.0.0.13 -A "$ua" -o "$tmp/body" "$https/share/$k_open/pics/"
{
    echo "$https/share/$k_open/pics/"
    grep -oE '(href|src)="/(\.cpr|share)/[^"]+"' "$tmp/body" | sed -E 's/^[a-z]+="//; s/"$//; s/&amp;/\&/g' |
        sort -u | sed "s|^|$https|"
    for i in $(seq 150); do echo "$https/share/$k_open/pics/$i.png?th=j"; done
} >"$tmp/page.urls"
n=$(wc -l <"$tmp/page.urls")
sed 's/.*/url = "&"\noutput = "\/dev\/null"/' "$tmp/page.urls" >"$tmp/flood.cfg"
codes=$(req 127.0.0.13 -A "$ua" -Z --parallel-max 6 -w '%{http_code}\n' -K "$tmp/flood.cfg")
if [ "$n" -gt 150 ] && [ "$(count 200 <<<"$codes")" = "$n" ]; then
    pass "Outside: a share folder with 150 images loads all its thumbnails at once, with no 429"
else
    fail "Outside: a share folder with 150 images loads all its thumbnails at once, with no 429" \
        "$n requests: $(sort <<<"$codes" | uniq -c | tr -s ' ')"
fi

codes=$(flood 127.0.0.11 300 "$https/share/$k_open/hello.txt?n=@")
if [ "$(count 200 <<<"$codes")" -ge 200 ] && [ "$(count 429 <<<"$codes")" -ge 1 ] &&
    [ "$(sed -n 1,200p <<<"$codes" | count 200)" = 200 ]; then
    pass "Outside: a flood of share-link requests from one address gets 429 after its burst"
else
    fail "Outside: a flood of share-link requests from one address gets 429 after its burst" \
        "$(sort <<<"$codes" | uniq -c | tr -s ' ')"
fi
# right after: the flooded address is still limited, another Outside address is not
still=$(flood 127.0.0.11 5 "$https/share/$k_open/hello.txt" | count 429)
# (10 at once: a single one could slip into the slot that frees up every 50 ms)
other=$(flood $outside2 10 "$https/share/$k_open/hello.txt" | count 200)
if [ "$still" -ge 1 ] && [ "$other" = 10 ]; then
    pass "Outside: while one address is limited, another still gets through"
else
    fail "Outside: while one address is limited, another still gets through" \
        "flooded address: $still of 5 got 429; other address: $other of 10 got 200"
fi

# a scanner (the Pi saw ~300 paths in 6 s from one address; sent faster here, so that the
# refill of 20/s can't cover it), with no login cookie: nginx's answer for its burst (GET: the
# 302 to /; POST: the bare 404), then 429, and none of it reaches copyparty
scan() { # NAME SRC WANT [curl args...]
    local name=$1 src=$2 want=$3 codes nwant n429 logged
    shift 3
    codes=$(flood $src 300 "$https/fork-scan-$src-@/.env" "$@")
    nwant=$(count $want <<<"$codes")
    n429=$(count 429 <<<"$codes")
    logged=$(grep -c "fork-scan-$src-" "$tmp/copyparty.log")
    if [ "$(sed -n 1,200p <<<"$codes" | count $want)" = 200 ] && [ "$n429" -ge 1 ] &&
        [ $((nwant + n429)) = 300 ] && [ "$logged" = 0 ]; then
        pass "$name"
    else
        fail "$name" "$(sort <<<"$codes" | uniq -c | tr -s ' '); copyparty logged $logged"
    fi
}
scan "Outside: a scanner's GET burst of non-share paths gets 302, then 429, and never reaches copyparty" \
    127.0.0.12 302
scan "Outside: a scanner's POST burst of non-share paths gets 404, then 429, and never reaches copyparty" \
    127.0.0.15 404 -d x=1

# Inside, the same flood is never limited (the whole household is that one address)
codes=$(flood $inside 300 "$https/share/$k_open/hello.txt?n=@")
if [ "$(count 200 <<<"$codes")" = 300 ]; then
    pass "Inside: a flood of 300 requests never gets 429"
else
    fail "Inside: a flood of 300 requests never gets 429" "$(sort <<<"$codes" | uniq -c | tr -s ' ')"
fi

# open requests: 40 downloads at once from one address, each crawling, so all stay open; Outside
# 8 of them get 429 (the limit is 32), Inside none. The file is sparse (no disk used), made now so
# that copyparty doesn't hash it at startup, and too big to fit in the sockets' buffers
truncate -s 256M "$tmp/srv/vol/slow.bin"
for i in $(seq 40); do printf 'url = "%s"\noutput = "/dev/null"\n' "$https/share/$k_open/slow.bin?n=$i"; done >"$tmp/slow.cfg"
slow() { # SRC: sets $got to how many of the 40 got 429 within 2 s
    local i
    curl -sk --interface "$1" --resolve "$domain:$p_https:127.0.0.1" -Z --parallel-immediate \
        --parallel-max 40 --limit-rate 10k -w '%{stderr}%{http_code}\n' -K "$tmp/slow.cfg" 2>"$tmp/slow.codes" &
    slow_pid=$!
    for i in $(seq 20); do # refused ones end at once; stop early once all 8 are in
        [ "$(count 429 <"$tmp/slow.codes")" -ge 8 ] && break
        sleep 0.1
    done
    kill $slow_pid
    wait $slow_pid 2>/dev/null
    slow_pid=
    got=$(count 429 <"$tmp/slow.codes")
}
slow 127.0.0.14
if [ "$got" = 8 ]; then
    pass "Outside: past 32 open requests from one address, 429"
else
    fail "Outside: past 32 open requests from one address, 429" "$got of 40 got 429, want 8"
fi
slow $inside
if [ "$got" = 0 ]; then
    pass "Inside: 40 open requests at once get no 429"
else
    fail "Inside: 40 open requests at once get no 429" "$got of 40 got 429"
fi

# 14. a slow request header (Outside, started before rule 1) is cut off within the site file's
# client_header_timeout, which stays short: limit_conn counts a connection only once its header
# is in, so a long timeout would let anyone hold connections open uncounted
hto=$(grep -oE '^\s*client_header_timeout\s+[0-9]+[sm]?;' "$site" | grep -oE '[0-9]+[sm]?')
case $hto in
"") hto_s=60 ;; # nginx's default
*m) hto_s=$((${hto%m} * 60)) ;;
*) hto_s=${hto%s} ;;
esac
wait "$hdr_pid" 2>/dev/null
hdr_pid=
got=$(cat "$tmp/slowhdr")
case $got in "closed "*) secs=${got#closed } ;; *) secs=999 ;; esac
if [ "$hto_s" -le 60 ] && [ "${secs%.*}" -le $((hto_s + 5)) ]; then
    pass "Outside: a slow request header is cut off within ${hto_s}s (client_header_timeout)"
else
    fail "Outside: a slow request header is cut off within ${hto_s}s (client_header_timeout)" \
        "timeout ${hto:-default}; the connection: ${got:0:120}"
fi

echo
if [ "$fails" -gt 0 ]; then
    echo "fork-https-check: $fails rule(s) failed"
    exit 1
fi
echo "fork-https-check: all rules pass"

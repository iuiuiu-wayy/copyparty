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

# --- the rules -------------------------------------------------------------------------------
fails=0
pass() { echo "PASS  $1"; }
fail() {
    echo "FAIL  $1${2:+  ($2)}"
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
# copyparty's own clients do: up2k SRC DIR-URL FILE NAME; prints "ok" or what went wrong
up2k() {
    "$py" -I - "$1" "$p_https" "$domain" "$2" "$3" "$4" "$pw" <<'EOF'
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
    auth = "Basic " + base64.b64encode(("check-user:" + pw).encode("utf-8")).decode("ascii")
    hdrs = dict(hdrs, Host="%s:%s" % (host, port), Authorization=auth)
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

# 1. HTTPS on the domain reaches copyparty
body=$(req $outside "$https/vol/hello.txt" -u "check-user:$pw")
if [ "$body" = "hello from copyparty" ]; then
    pass "HTTPS on the domain reaches copyparty"
else
    fail "HTTPS on the domain reaches copyparty" "got: ${body:0:80}"
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
    req $src -o /dev/null "$https/vol/?$m" -u "check-user:$pw"
    got=$(logged_ip "$m")
    if [ "$got" = "$src" ]; then
        pass "copyparty logs the real client address ($src)"
    else
        fail "copyparty logs the real client address ($src)" "logged: ${got:-nothing}"
    fi
done

# 4. a forged X-Forwarded-For (here: posing as Inside) changes nothing; the real address is logged
marker
req $outside2 -o /dev/null "$https/vol/?$m" -u "check-user:$pw" -H "X-Forwarded-For: $inside"
got=$(logged_ip "$m")
if [ "$got" = "$outside2" ]; then
    pass "a forged X-Forwarded-For is ignored"
else
    fail "a forged X-Forwarded-For is ignored" "logged: ${got:-nothing}"
fi

# 5. uploads bigger than nginx's default body limit (1 MiB) and than one up2k chunk (1 MiB here)
head -c $((3 * 1024 * 1024 + 123)) /dev/urandom >"$tmp/big.bin"
want=$(sha256sum <"$tmp/big.bin" | cut -d' ' -f1)
roundtrip() { # name: download it back through nginx and compare
    local got
    got=$(req $outside "$https/vol/$1" -u "check-user:$pw" | sha256sum | cut -d' ' -f1)
    [ "$got" = "$want" ]
}
code=$(req $outside -o /dev/null -w '%{http_code}' -T "$tmp/big.bin" -u "check-user:$pw" "$https/vol/put.bin")
if [ "$code" = 201 ] && roundtrip put.bin; then
    pass "a 3 MiB PUT upload goes through"
else
    fail "a 3 MiB PUT upload goes through" "status $code"
fi
got=$(up2k $outside /vol/ "$tmp/big.bin" up2k.bin 2>&1)
if [ "$got" = ok ] && roundtrip up2k.bin; then
    pass "a 3 MiB up2k upload (4 chunks, one POST) goes through"
else
    fail "a 3 MiB up2k upload (4 chunks, one POST) goes through" "${got:0:200}"
fi

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
for u in "$https/vol/hello.txt" "$http/" "$https/.well-known/nonexistent"; do
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

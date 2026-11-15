#!/bin/bash
set -e

# fork-only: build copyparty-sfx.py from this checkout as it stands, without
# touching it. make-sfx.sh run in place stops on local leftovers that aren't in
# sfx.ls (copyparty/.mypy_cache) and on missing webdeps; this builds in a temp
# copy of the tracked + new (not ignored) files instead, with webdeps taken
# from copyparty/web/deps or from a copyparty-sfx.py already extracted in
# ~/.cache (any run of one leaves it there). Nothing is downloaded.
#
#   ./scripts/fork-sfx.sh [make-sfx.sh args]   # default: fast
#
# result: ./dist/copyparty-sfx.py
#
# which fork files ship is checked without a build by tests/test_fork_sfx.py

cd "$(dirname "$0")/.."
repo="$PWD"

wd=
for d in copyparty/web/deps ~/.cache/pe-copyparty.*/copyparty/web/deps; do
	[ -e "$d/mini-fa.woff" ] && wd="$d"
done
[ "$wd" ] || {
	echo "no webdeps: neither copyparty/web/deps nor ~/.cache/pe-copyparty.* has them;"
	echo "run any copyparty-sfx.py once (it extracts into ~/.cache), or see"
	echo "docs/devnotes.md#building (make-sfx.sh dl-wd downloads them from GitHub)"
	exit 1
}
echo "webdeps from $wd"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

git ls-files -co --exclude-standard | grep -v '^\.scratch/' | tar -cf - -T - | tar -xf - -C "$tmp"
cp -pR .git "$tmp/"
rm -rf "$tmp/copyparty/web/deps"
cp -pR "$wd" "$tmp/copyparty/web/"

[ -d .venv/bin ] && export PATH="$repo/.venv/bin:$PATH"
(cd "$tmp" && ./scripts/make-sfx.sh "${@:-fast}")

mkdir -p dist
cp -p "$tmp/dist/copyparty-sfx.py" dist/
echo "built $repo/dist/copyparty-sfx.py"

#!/bin/bash
# fork-only: the fork's pre-commit check (upstream's run-tests.sh also needs python2).
#   ./scripts/fork-check.sh            run it
#   ./scripts/fork-check.sh --install  make it the git pre-commit hook (shared by all worktrees)
# Checks the working tree, not only what is staged.
set -e

top=$(git rev-parse --show-toplevel)
common=$(git rev-parse --path-format=absolute --git-common-dir)
main=$(dirname "$common")  # the main checkout; agent worktrees have no .venv of their own

if [ "$1" = --install ]; then
    ln -sfn "$main/scripts/fork-check.sh" "$common/hooks/pre-commit"
    echo "installed: $common/hooks/pre-commit -> $main/scripts/fork-check.sh"
    exit 0
fi

cd "$top"

py=$main/.venv/bin/python
[ -x "$py" ] || {
    echo "fork-check: no $py; create it as in CLAUDE.md (Commands)" >&2
    exit 1
}

# JS syntax of every fork web script (the ones fork_grants.py adds to RES)
node=$(command -v node || ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | tail -n 1)
if [ -n "$node" ]; then
    for f in $(grep -oE '"web/[^"]+\.js"' copyparty/fork_grants.py | tr -d '"'); do
        "$node" --check "copyparty/$f" || {
            echo "fork-check: JS syntax error in copyparty/$f" >&2
            exit 1
        }
    done
else
    echo "fork-check: node not found; JS syntax not checked" >&2
fi

# the whole unit test suite; on failure show the failures only
log=$(mktemp)
if PRTY_NO_VIPS=1 "$py" -m unittest discover -s tests >"$log" 2>&1; then
    grep -E '^Ran ' "$log"
    rm -f "$log"
else
    grep -E -A25 '^(FAIL|ERROR):' "$log" | head -n 120 >&2
    grep -E '^(Ran |FAILED)' "$log" >&2
    echo "fork-check: tests failed; full log: $log" >&2
    exit 1
fi

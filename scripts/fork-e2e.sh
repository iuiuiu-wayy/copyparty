#!/bin/bash
# fork-only, dev-only: the end-to-end tests of the file browser (tests/e2e/, Playwright).
# Starts copyparty from this checkout on 127.0.0.1 with a temp config and stops it after.
#   ./scripts/fork-e2e.sh                  run every scenario, every size, every installed browser
#   ./scripts/fork-e2e.sh --project chromium-phone specs/select.spec.js   (Playwright's own args)
#   ./scripts/fork-e2e.sh --install        npm ci + Playwright's Chromium (skips what is there)
#   ./scripts/fork-e2e.sh --install-all    the same, plus Firefox and WebKit
# Not in the pre-commit hook: run it per ticket and after every upstream merge.
set -e

cd "$(dirname "$0")/../tests/e2e"

case "$1" in
--install | --install-all)
    npm ci --no-audit --no-fund
    if [ "$1" = --install ]; then
        npx playwright install chromium
    else
        npx playwright install chromium firefox webkit
    fi
    exit 0
    ;;
esac

[ -d node_modules/playwright ] || {
    echo "fork-e2e: no node_modules; run ./scripts/fork-e2e.sh --install" >&2
    exit 1
}

exec npx playwright test "$@"

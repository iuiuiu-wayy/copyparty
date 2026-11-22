// fork-only, dev-only: every scenario at three sizes, in every Playwright browser that is
// installed (Chromium is required; Firefox and WebKit are skipped with a note when missing)
'use strict';

const fs = require('fs');
const { defineConfig, chromium, firefox, webkit } = require('playwright/test');

const SIZES = {
    desktop: { viewport: { width: 1440, height: 900 } },
    phone: { viewport: { width: 412, height: 915 }, hasTouch: true, mobile: true },
    'small-phone': { viewport: { width: 360, height: 800 }, hasTouch: true, mobile: true },
};

const installed = (b) => {
    try {
        return fs.existsSync(b.executablePath());
    } catch (e) {
        return false;
    }
};

const BROWSERS = { chromium, firefox, webkit };
const found = Object.keys(BROWSERS).filter((n) => installed(BROWSERS[n]));
const missing = Object.keys(BROWSERS).filter((n) => !found.includes(n));

if (!found.includes('chromium'))
    throw new Error('e2e: no Playwright Chromium; run: ./scripts/fork-e2e.sh --install');
if (missing.length && !process.env.TEST_WORKER_INDEX)
    console.log(`e2e: skipped ${missing.join(', ')} (not installed; ./scripts/fork-e2e.sh --install-all adds them)`);

const projects = [];
for (const name of found) {
    for (const [size, s] of Object.entries(SIZES)) {
        projects.push({
            name: `${name}-${size}`,
            use: {
                browserName: name,
                viewport: s.viewport,
                hasTouch: !!s.hasTouch,
                // a phone's user agent and meta viewport; Firefox has no isMobile
                isMobile: !!s.mobile && name !== 'firefox',
            },
        });
    }
}

module.exports = defineConfig({
    testDir: './specs',
    globalSetup: require.resolve('./server.js'),
    fullyParallel: true,
    // Playwright's default (half the cores) loads one copyparty and the browsers so much that
    // the slower scenarios (search, resumed uploads) time out; four keep the run reliable
    workers: 4,
    forbidOnly: true,
    reporter: [['list']],
    timeout: 30000,
    // 10 s, not 5: a request that reloads the server (a share link, a grant) waits its turn
    // behind the other workers' (server.js, serialReload), ~0.7 s each
    expect: { timeout: 10000 },
    use: { trace: 'retain-on-failure' },
    projects,
});

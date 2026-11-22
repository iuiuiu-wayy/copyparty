// fork-only, dev-only: what every scenario gets. Act as a person would (log in, open a
// folder, tap or click), check what a person sees or what the server holds (?ls).
'use strict';

const base = require('playwright/test');
const { ACCOUNTS, LOGOUT_USERS, session, reloads, serialReload } = require('./server.js');

// the folders of alice's that scratch() handed out to the scenario running in this worker
const scratched = [];

// a folder of alice's of its own for one scenario and size (the sizes run in parallel),
// deleted when the scenario ends: left behind, one run's folders and uploads push alice's
// seeded files past upstream's first 250 rows and bob's seeded upload off ?ru's 1000
function scratch(info, what) {
    const dir = `/home/alice/${what}-${info.project.name}/`;
    scratched.push(dir);
    return dir;
}

const test = base.test.extend({
    // after each scenario, delete its scratch() folders (gone already when it renamed one)
    scratchCleanup: [async ({ server }, use) => {
        scratched.length = 0;
        await use();
        if (!scratched.length)
            return;
        const s = await session(server.url, 'alice');
        for (const dir of scratched.splice(0)) {
            const r = await s.del(dir);
            if (r.status !== 200 && r.status !== 404)
                throw new Error(`DELETE ${dir} as alice: ${r.status} ${await r.text()}`);
        }
    }, { auto: true }],

    // what the page sends that reloads the server's config takes turns with every other
    // such request, as the API calls do (server.js, serialReload)
    context: async ({ context }, use) => {
        await context.route((u) => reloads('POST', u.search), async (route) => {
            const r = route.request();
            if (r.method() !== 'POST')
                return route.fallback();
            await serialReload(process.env.E2E_BASE, async () => {
                const resp = await route.fetch().catch(() => null);
                return (resp ? route.fulfill({ response: resp }) : route.abort()).catch(() => {});
            });
        });
        await use(context);
    },

    // fail fast when a script error crashes the page (upstream's crash box, #exbox, covers
    // it): close the page so the step waiting on it fails now, not at its timeout, then fail
    // the test with the error. Errors upstream lets pass (a rejected promise, a fetch cut off
    // by a navigation) show no crash box and are left alone
    page: async ({ page }, use) => {
        const errs = [];
        const crashed = (p) => p.evaluate(() => !!document.getElementById('exbox')).catch(() => false);
        const watch = (p) => p.on('pageerror', async (e) => {
            if (!(await crashed(p))) {
                await new Promise((r) => setTimeout(r, 200));
                if (!(await crashed(p)))
                    return;
            }
            errs.push(e);
            p.close().catch(() => {});
        });
        watch(page);
        page.context().on('page', watch);
        await use(page);
        if (errs.length)
            throw new Error(`the page crashed: ${errs[0].stack || errs[0].message}`);
    },

    // set here, not in the config: the server's port is only known after globalSetup
    baseURL: async ({}, use) => {
        await use(process.env.E2E_BASE);
    },

    // where the server is: { url, share } (the share link alice made of her trip/ folder)
    server: async ({}, use) => {
        await use({ url: process.env.E2E_BASE, share: process.env.E2E_SHARE });
    },

    // log the page in as an account holder, the way the login form does; then page.goto
    loginAs: async ({ page, server }, use) => {
        await use(async (user) => {
            const r = await page.request.post(server.url + '/?h', {
                multipart: { act: 'login', uname: user, cppwd: ACCOUNTS[user] },
                maxRedirects: 0,
            });
            if (!(await page.context().cookies()).some((c) => c.name === 'cppwd'))
                throw new Error(`login as ${user} failed: ${r.status()}`);
        });
    },

    // an account this worker alone uses, for a scenario that logs out (which ends every
    // session of the account, in every worker)
    logoutUser: async ({}, use, info) => {
        const u = LOGOUT_USERS[info.parallelIndex];
        if (!u)
            throw new Error(`no logout account for worker ${info.parallelIndex}; add some in server.js`);
        await use(u);
    },

    // tap on a touch screen, click otherwise
    press: async ({ hasTouch }, use) => {
        await use((loc) => (hasTouch ? loc.tap() : loc.click()));
    },

    // open a row as a person would: a double-click on a desktop, a tap on a touch screen
    open: async ({ hasTouch }, use) => {
        await use((loc) => (hasTouch ? loc.tap() : loc.dblclick()));
    },

    // hold a finger on it (Chromium: a real touch through the devtools protocol; elsewhere
    // the pointer events a long press makes)
    longPress: async ({ page, browserName }, use) => {
        await use(async (loc) => {
            await loc.scrollIntoViewIfNeeded();
            const b = await loc.boundingBox();
            const x = b.x + Math.min(b.width / 2, 60), y = b.y + b.height / 2;
            if (browserName === 'chromium') {
                const cdp = await page.context().newCDPSession(page);
                const pt = [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
                await page.waitForTimeout(900);
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
                await cdp.detach();
                return;
            }
            const o = { pointerType: 'touch', isPrimary: true, pointerId: 7, clientX: x, clientY: y, bubbles: true };
            await loc.dispatchEvent('pointerdown', o);
            await page.waitForTimeout(900);
            await loc.dispatchEvent('pointerup', o);
        });
    },

    // drag a finger down from the middle of it by dy px (Chromium: real touch through the
    // devtools protocol; elsewhere the pointer events such a swipe makes)
    swipe: async ({ page, browserName }, use) => {
        await use(async (loc, dy) => {
            const b = await loc.boundingBox();
            const x = b.x + b.width / 2, y = b.y + b.height / 2, steps = 6;
            if (browserName === 'chromium') {
                const cdp = await page.context().newCDPSession(page);
                const pt = (yy) => [{ x, y: yy, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(y) });
                for (let i = 1; i <= steps; i++)
                    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(y + (dy * i) / steps) });
                await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
                await cdp.detach();
                return;
            }
            const o = (yy) => ({ pointerType: 'touch', isPrimary: true, pointerId: 8, clientX: x, clientY: yy, bubbles: true });
            await loc.dispatchEvent('pointerdown', o(y));
            for (let i = 1; i <= steps; i++)
                await loc.dispatchEvent('pointermove', o(y + (dy * i) / steps));
            await loc.dispatchEvent('pointerup', o(y + dy));
        });
    },

    // the bar that replaces the breadcrumb while something is selected
    selbar: async ({ page }, use) => {
        await use(page.getByRole('toolbar', { name: 'Selection' }));
    },

    // phone sizes: the nav is a drawer behind the top bar's menu button
    narrow: async ({ viewport }, use) => {
        await use(viewport.width < 800);
    },

    // the left nav (My files, Shared with me, ...), opening the phone drawer first
    nav: async ({ page, press, narrow }, use) => {
        await use(async () => {
            if (narrow)
                await press(page.getByRole('button', { name: 'Main menu' }));
            const nav = page.getByRole('navigation', { name: 'Main' });
            await base.expect(nav).toBeVisible();
            return nav;
        });
    },

    // pick one entry of the top bar's More tools menu
    tool: async ({ page, press }, use) => {
        await use(async (name) => {
            await press(page.getByRole('button', { name: 'More tools' }));
            await press(page.getByRole('menu', { name: 'More tools' }).getByRole('menuitem', { name, exact: true }));
        });
    },

    // what the server holds, asked as an account holder through ?ls:
    // ls('alice', '/home/alice/') -> { files: ['notes.txt', ...], dirs: ['proj', ...] }
    ls: async ({ server }, use) => {
        await use(async (user, vp) => {
            const s = await session(server.url, user);
            const r = await s.get(vp + '?ls');
            if (r.status !== 200)
                throw new Error(`?ls of ${vp} as ${user}: ${r.status}`);
            const j = await r.json();
            const names = (xs) => xs.map((x) => decodeURIComponent(x.href).replace(/\/$/, ''));
            return { files: names(j.files), dirs: names(j.dirs) };
        });
    },

    // put a file on the server as an account holder (an upload, PUT): put('alice', '/home/alice/x/y.txt', 'hi')
    put: async ({ server }, use) => {
        await use(async (user, vp, body) => {
            const s = await session(server.url, user);
            const r = await s.put(vp, body);
            if (r.status !== 201)
                throw new Error(`PUT ${vp} as ${user}: ${r.status} ${await r.text()}`);
        });
    },
});

// the file list's row for one file or folder, found by its name as shown (a folder: 'proj/')
function row(page, name) {
    return page
        .getByRole('row')
        .filter({ has: page.getByRole('link', { name, exact: true }) });
}

module.exports = { test, expect: base.expect, row, scratch };

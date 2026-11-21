// fork-only, dev-only: what every scenario gets. Act as a person would (log in, open a
// folder, tap or click), check what a person sees or what the server holds (?ls).
'use strict';

const base = require('playwright/test');
const { ACCOUNTS, session } = require('./server.js');

const test = base.test.extend({
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

    // tap on a touch screen, click otherwise
    press: async ({ hasTouch }, use) => {
        await use((loc) => (hasTouch ? loc.tap() : loc.click()));
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

module.exports = { test, expect: base.expect, row };

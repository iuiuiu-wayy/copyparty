// ticket 04: the nav's views that aren't folders, Shared with me and Recent uploads
'use strict';

const { test, expect, row } = require('../fixtures.js');
const { session } = require('../server.js');

async function view(page, nav, press, name) {
    await press((await nav()).getByRole('link', { name }));
    const h = page.getByRole('heading', { name, level: 2 });
    await expect(h).toBeVisible();
    await expect(h).toBeFocused();
}

// the folder links under one heading of Shared with me, as shown
function folders(page, heading) {
    return page.getByRole('region', { name: heading }).getByRole('link');
}

test.describe('Shared with me', () => {
    test('alice sees bob\'s grant under bob, then the server folders', async ({ page, loginAs, nav, press, server }) => {
        // what the server says: bob's old/ is broken and dave's kit/ suspended
        const bob = await session(server.url, 'bob');
        const dave = await session(server.url, 'dave');
        expect(await (await bob.get('/?grants')).text()).toMatch(/broken/);
        expect(await (await dave.get('/?grants')).text()).toMatch(/suspended/);

        await loginAs('alice');
        await page.goto('/home/alice/');
        await expect(row(page, 'notes.txt')).toBeVisible();
        await view(page, nav, press, 'Shared with me');

        const people = page.getByRole('region', { name: 'From people' });
        await expect(people.getByRole('heading', { name: 'bob', level: 4 })).toBeVisible();
        await expect(folders(page, 'From people')).toHaveText(['bike']);
        await expect(people.getByRole('heading', { name: 'dave' })).toHaveCount(0);
        await expect(folders(page, 'Server folders')).toHaveText(['common', 'family']);
        await expect(row(page, 'notes.txt')).toBeHidden();
    });

    test('a grant opens in the normal list', async ({ page, loginAs, nav, press }) => {
        await loginAs('alice');
        await page.goto('/home/alice/');
        await view(page, nav, press, 'Shared with me');

        await press(folders(page, 'From people').filter({ hasText: 'bike' }));
        await expect(page).toHaveURL(/\/shared\/bob\/bike\/$/);
        await expect(row(page, 'chain.txt')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Shared with me', level: 2 })).toBeHidden();
    });

    test('a server folder opens in the normal list', async ({ page, loginAs, nav, press }) => {
        await loginAs('alice');
        await page.goto('/home/alice/');
        await view(page, nav, press, 'Shared with me');

        await press(folders(page, 'Server folders').filter({ hasText: 'family' }));
        await expect(page).toHaveURL(/\/family\/$/);
        await expect(row(page, 'recipes.txt')).toBeVisible();
    });

    test('carol sees only /common', async ({ page, loginAs, nav, press }) => {
        await loginAs('carol');
        await page.goto('/home/carol/');
        await view(page, nav, press, 'Shared with me');

        await expect(folders(page, 'Server folders')).toHaveText(['common']);
        await expect(page.getByRole('region', { name: 'From people' })).toHaveCount(0);
    });

    test('the admin sees every folder the root lists but their own home', async ({ page, loginAs, nav, press, server }) => {
        // the tested config gives the admin `a` on each home folder, not read, so the
        // server lists none but the admin's own under /home/
        const s = await session(server.url, 'admin');
        const home = (await (await s.get('/home/?ls')).json()).dirs.map((d) => d.href);
        expect(home).toEqual(['admin/']);

        await loginAs('admin');
        await page.goto('/home/admin/');
        await view(page, nav, press, 'Shared with me');
        await expect(folders(page, 'Server folders')).toHaveText(['common', 'family', 'lab']);
    });

    test('says so when nothing is shared', async ({ page, loginAs, nav, press }) => {
        // a server where this account can open nothing but its home folder
        await page.route((u) => u.pathname == '/' && u.search == '?ls', (r) => r.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ dirs: [{ href: 'home/', perms: ['read'] }], files: [], perms: [] }),
        }));
        await loginAs('carol');
        await page.goto('/home/carol/');
        await view(page, nav, press, 'Shared with me');

        await expect(page.getByText('Nothing is shared with you yet')).toBeVisible();
        await expect(page.getByRole('region', { name: 'Server folders' })).toHaveCount(0);
    });
});

test.describe('Recent uploads', () => {
    // the Recent uploads table's rows as text per column
    async function rows(page) {
        const t = page.getByRole('table', { name: 'Recent uploads' });
        await expect(t).toBeVisible();
        return t.locator('tbody tr').evaluateAll((trs) => trs.map((tr) => ({
            name: tr.querySelector('[data-col=name]').textContent.trim(),
            href: tr.querySelector('[data-col=name] a').getAttribute('href'),
            loc: tr.querySelector('[data-col=loc] a').getAttribute('href'),
            by: tr.querySelector('[data-col=by]').textContent.trim(),
            at: tr.querySelector('[data-col=at]').textContent.trim(),
            sz: tr.querySelector('[data-col=sz]').textContent.trim(),
        })));
    }

    test('matches the server\'s recent uploads for the same account', async ({ page, loginAs, nav, press, server }) => {
        const s = await session(server.url, 'carol');
        const ups = (await (await s.get('/?ru&j')).json()).ups;
        expect(ups.length).toBe(2);

        await loginAs('carol');
        await page.goto('/home/carol/');
        await view(page, nav, press, 'Recent uploads');

        const got = await rows(page);
        expect(got.map((r) => r.href)).toEqual(ups.map((u) => u.vp));
        expect(got.map((r) => r.name)).toEqual(['carol-b.txt', 'carol-a.txt']);
        expect(got.map((r) => r.loc)).toEqual(['/home/carol/', '/home/carol/up/']);
        expect(got.map((r) => r.by)).toEqual(['carol', 'carol']);
        expect(got.every((r) => r.at !== '')).toBe(true);
        expect(got.map((r) => r.sz)).toEqual(['18 B', '10 B']);
    });

    test('By is blank when the server hides who uploaded', async ({ page, loginAs, nav, press }) => {
        await loginAs('alice');
        await page.goto('/home/alice/');
        await view(page, nav, press, 'Recent uploads');

        const bobs = (await rows(page)).filter((r) => r.name == 'bob-note.txt');
        expect(bobs).toEqual([expect.objectContaining({ loc: '/family/up/', by: '', at: '' })]);
    });

    test('the admin sees who uploaded and when', async ({ page, loginAs, nav, press }) => {
        await loginAs('admin');
        await page.goto('/home/admin/');
        await view(page, nav, press, 'Recent uploads');

        const bobs = (await rows(page)).filter((r) => r.name == 'bob-note.txt');
        expect(bobs.length).toBe(1);
        expect(bobs[0].by).toBe('bob');
        expect(bobs[0].at).not.toBe('');
    });

    test('the location opens its folder in the normal list', async ({ page, loginAs, nav, press }) => {
        await loginAs('carol');
        await page.goto('/home/carol/');
        await view(page, nav, press, 'Recent uploads');

        const r = page.getByRole('table', { name: 'Recent uploads' }).locator('tbody tr').filter({ hasText: 'carol-a.txt' });
        await press(r.getByRole('link', { name: /up/ }));
        await expect(page).toHaveURL(/\/home\/carol\/up\/$/);
        await expect(row(page, 'carol-a.txt')).toBeVisible();
    });

    test('says so when there are none', async ({ page, loginAs, nav, press }) => {
        await loginAs('dave');
        await page.goto('/common/');
        await view(page, nav, press, 'Recent uploads');
        await expect(page.getByText('No recent uploads')).toBeVisible();
        await expect(page.getByRole('table', { name: 'Recent uploads' })).toHaveCount(0);
    });

    test('is not in the nav when the server lists no recent uploads', async ({ page, loginAs, nav }) => {
        // as with --no-ups-page
        await page.route(/\/\?ru&j/, (r) => r.fulfill({ status: 500, body: 'listing of recent uploads is disabled in server config' }));
        await loginAs('carol');
        await page.goto('/home/carol/');
        const n = await nav();
        await expect(n.getByRole('link', { name: 'Shared with me' })).toBeVisible();
        await expect(n.getByRole('link', { name: 'Recent uploads' })).toBeHidden();
    });

    test('on a phone each upload is a name over one line of detail', async ({ page, loginAs, nav, press, narrow }) => {
        test.skip(!narrow, 'phone layout');
        await loginAs('carol');
        await page.goto('/home/carol/');
        await view(page, nav, press, 'Recent uploads');

        const r = page.getByRole('table', { name: 'Recent uploads' }).locator('tbody tr').first();
        const name = await r.locator('[data-col=name] a').boundingBox();
        const by = await r.locator('[data-col=by]').boundingBox();
        expect(by.y).toBeGreaterThanOrEqual(name.y + name.height - 1);
        // shown as "by carol, <when>" (the "by " and ", " are drawn by CSS)
        const shown = await r.evaluate((tr) => {
            const t = (s, p) => {
                const c = getComputedStyle(tr.querySelector(s), p).content;
                return c && c != 'none' && c != 'normal' ? JSON.parse(c) : '';
            };
            const cell = (s) => t(s, '::before') + tr.querySelector(s).textContent;
            return cell('[data-col=by]') + cell('[data-col=at]');
        });
        expect(shown).toMatch(/^by carol, \S/);
        const at = await r.locator('[data-col=at]').boundingBox();
        expect(Math.abs(at.y - by.y)).toBeLessThan(4);
        await expect(r.locator('[data-col=sz]')).toBeHidden();
        // the folder link stays tappable
        const loc = await r.locator('[data-col=loc] a').boundingBox();
        expect(loc.height).toBeGreaterThanOrEqual(44);
        expect(loc.width).toBeGreaterThanOrEqual(44);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
});

test('works from the keyboard alone', async ({ page, loginAs, narrow }) => {
    test.skip(narrow, 'the drawer has its own keyboard scenarios');
    await loginAs('alice');
    await page.goto('/home/alice/');
    await expect(row(page, 'notes.txt')).toBeVisible();

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Shared with me' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Shared with me', level: 2 })).toBeFocused();
    await expect(page.getByRole('link', { name: 'bike' })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'bike' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/shared\/bob\/bike\/$/);
    await expect(row(page, 'chain.txt')).toBeVisible();
});

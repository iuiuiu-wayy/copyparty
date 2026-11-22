'use strict';

// the Drive-style frame: top bar, left nav (a drawer on a phone), More tools

const { test, expect, row, scratch } = require('../fixtures.js');

test('an account holder gets a top bar and a nav', async ({ page, loginAs, nav, narrow }) => {
    await loginAs('alice');
    await page.goto('/home/alice/proj/');

    const top = page.getByRole('banner');
    // the server name: in the top bar, or at the top of the drawer on a phone
    if (!narrow)
        await expect(top.getByText('e2eparty')).toBeVisible();
    await expect(top.getByRole('searchbox', { name: 'Search' })).toBeVisible();
    await expect(top.getByRole('button', { name: 'More tools' })).toBeVisible();
    await expect(top.getByRole('button', { name: 'Account: alice' })).toBeVisible();

    const n = await nav();
    if (narrow)
        await expect(page.getByRole('dialog', { name: 'Main menu' }).getByText('e2eparty')).toBeVisible();
    await expect(n.getByRole('button', { name: 'New' })).toBeVisible();
    for (const name of ['My files', 'Shared with me', 'Recent uploads'])
        await expect(n.getByRole('link', { name })).toBeVisible();
    // the folder tree sits under the active entry
    await expect(n.getByRole('link', { name: 'My files' })).toHaveAttribute('aria-current', 'page');
    await expect(n.getByRole('link', { name: 'trip', exact: true })).toBeVisible();
});

test('My files goes to the home folder, and the tree to a folder', async ({ page, loginAs, nav, press }) => {
    await loginAs('alice');
    await page.goto('/home/alice/proj/');
    await expect(row(page, 'plan.txt')).toBeVisible();

    await press((await nav()).getByRole('link', { name: 'My files' }));
    await expect(page).toHaveURL(/\/home\/alice\/$/);
    await expect(row(page, 'notes.txt')).toBeVisible();

    await press((await nav()).getByRole('link', { name: 'trip', exact: true }));
    await expect(page).toHaveURL(/\/home\/alice\/trip\/$/);
    await expect(row(page, 'budget.xlsx')).toBeVisible();
});

test('Shared with me and Recent uploads show in the list\'s place, My files brings it back', async ({ page, loginAs, nav, press }) => {
    await loginAs('alice');
    await page.goto('/home/alice/');

    for (const name of ['Shared with me', 'Recent uploads']) {
        await press((await nav()).getByRole('link', { name }));
        await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
        await expect(row(page, 'notes.txt')).toBeHidden();
    }

    await press((await nav()).getByRole('link', { name: 'My files' }));
    await expect(row(page, 'notes.txt')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent uploads', level: 2 })).toBeHidden();
});

test('a server folder puts Shared with me in front', async ({ page, loginAs, nav }) => {
    await loginAs('alice');
    await page.goto('/family/');
    await expect(row(page, 'recipes.txt')).toBeVisible();

    const n = await nav();
    await expect(n.getByRole('link', { name: 'Shared with me' })).toHaveAttribute('aria-current', 'page');
    await expect(n.getByRole('link', { name: 'My files' })).not.toHaveAttribute('aria-current', 'page');
});

test.describe('the phone drawer', () => {
    test.beforeEach(async ({ page, loginAs, narrow }) => {
        test.skip(!narrow, 'the nav is a drawer only on a phone');
        await loginAs('alice');
        await page.goto('/home/alice/');
        await expect(row(page, 'notes.txt')).toBeVisible();
    });

    const menu = (page) => page.getByRole('button', { name: 'Main menu' });
    const drawer = (page) => page.getByRole('navigation', { name: 'Main' });

    test('is closed until its button opens it', async ({ page, press }) => {
        await expect(drawer(page)).toBeHidden();
        await expect(menu(page)).toHaveAttribute('aria-expanded', 'false');
        await press(menu(page));
        await expect(drawer(page)).toBeVisible();
        await expect(menu(page)).toHaveAttribute('aria-expanded', 'true');
        // focus moves into it
        await expect(page.getByRole('button', { name: 'Close menu' })).toBeFocused();
    });

    test('closes with its close button, focus back on the menu button', async ({ page, press }) => {
        await press(menu(page));
        await press(page.getByRole('button', { name: 'Close menu' }));
        await expect(drawer(page)).toBeHidden();
        await expect(menu(page)).toBeFocused();
    });

    test('closes with Esc', async ({ page, press }) => {
        await press(menu(page));
        await expect(drawer(page)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(drawer(page)).toBeHidden();
        await expect(menu(page)).toBeFocused();
    });

    test('closes with a tap outside it, and that tap does nothing else', async ({ page, press, viewport }) => {
        // tap beside the drawer, on the notes.txt row (other scenarios add folders above it)
        await row(page, 'notes.txt').scrollIntoViewIfNeeded();
        const b = await row(page, 'notes.txt').boundingBox();
        await press(menu(page));
        await expect(drawer(page)).toBeVisible();
        await page.touchscreen.tap(viewport.width - 10, b.y + b.height / 2);
        await expect(drawer(page)).toBeHidden();
        await expect(menu(page)).toBeFocused();
        await expect(row(page, 'notes.txt').getByRole('checkbox')).not.toBeChecked();
    });

    test('closes with the back gesture and stays in the folder', async ({ page, press }) => {
        await press(menu(page));
        await expect(drawer(page)).toBeVisible();
        await page.goBack();
        await expect(drawer(page)).toBeHidden();
        await expect(page).toHaveURL(/\/home\/alice\/$/);
        await expect(row(page, 'notes.txt')).toBeVisible();
    });

    test('closes when an entry is picked, and back then returns', async ({ page, press }) => {
        await press(menu(page));
        await press(drawer(page).getByRole('link', { name: 'proj', exact: true }));
        await expect(drawer(page)).toBeHidden();
        await expect(page).toHaveURL(/\/home\/alice\/proj\/$/);
        await expect(row(page, 'plan.txt')).toBeVisible();

        await page.goBack();
        await expect(page).toHaveURL(/\/home\/alice\/$/);
        await expect(row(page, 'notes.txt')).toBeVisible();
    });
});

test('the page never scrolls sideways, and its buttons are big enough to tap', async ({ page, loginAs, narrow }) => {
    await loginAs('alice');
    await page.goto('/home/alice/');
    await expect(row(page, 'notes.txt')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const name of narrow ? ['Main menu', 'More tools'] : ['More tools']) {
        const b = await page.getByRole('button', { name }).boundingBox();
        expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
    }
});

test('desktop has the nav beside the list and no menu button', async ({ page, loginAs, narrow }) => {
    test.skip(narrow, 'desktop only');
    await loginAs('alice');
    await page.goto('/home/alice/');
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Main menu' })).toHaveCount(0);
});

test('More tools lists every toolbar tab upstream shows here', async ({ page, loginAs, press }) => {
    await loginAs('alice');
    await page.goto('/home/alice/');
    await expect(row(page, 'notes.txt')).toBeVisible();

    await press(page.getByRole('button', { name: 'More tools' }));
    const menu = page.getByRole('menu', { name: 'More tools' });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem')).toHaveText([
        'New folder', 'New file', 'Upload settings', 'Basic uploader', 'Unpost',
        'Search', 'Message', 'Audio player', 'Settings',
    ]);
    await expect(menu.getByRole('menuitem').first()).not.toBeFocused();

    // Esc closes it, and focus goes back to its button
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.getByRole('button', { name: 'More tools' })).toBeFocused();
});

test('More tools opens from the keyboard and arrows move through it', async ({ page, loginAs, narrow }) => {
    test.skip(narrow, 'keyboard');
    await loginAs('alice');
    await page.goto('/home/alice/');
    await page.getByRole('button', { name: 'More tools' }).focus();
    await page.keyboard.press('Enter');
    const items = page.getByRole('menu', { name: 'More tools' }).getByRole('menuitem');
    await expect(items.first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(items.last()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'switches', exact: true })).toBeVisible();
});

const PANELS = {
    'Upload settings': (page) => page.getByText('drop files / folders'),
    'Basic uploader': (page) => page.getByRole('button', { name: 'start upload' }),
    'Unpost': (page) => page.getByText('you can delete your recent uploads'),
    'Search': (page) => page.locator('#srch_form').getByRole('textbox').first(),
    'Message': (page) => page.getByRole('button', { name: 'send msg to srv log' }),
    'Audio player': (page) => page.getByText('uncache', { exact: true }),
    'Settings': (page) => page.getByRole('heading', { name: 'switches', exact: true }),
    'New file': (page) => page.getByRole('button', { name: 'new file' }),
};

for (const [name, seen] of Object.entries(PANELS)) {
    test(`More tools opens ${name}, and its close button closes it`, async ({ page, loginAs, tool, press }) => {
        await loginAs('alice');
        await page.goto('/home/alice/');
        await expect(row(page, 'notes.txt')).toBeVisible();

        await tool(name);
        await expect(seen(page)).toBeVisible();
        await expect(seen(page)).toBeInViewport();

        await press(page.getByRole('button', { name: 'Close ' + name }));
        await expect(seen(page)).toBeHidden();
    });
}

test('New folder from More tools makes the folder', async ({ page, loginAs, tool, put, ls }, info) => {
    const dir = scratch(info, 'tools');
    await put('alice', dir + 'x.txt', 'x\n');
    await loginAs('alice');
    await page.goto(dir);
    await expect(row(page, 'x.txt')).toBeVisible();

    await tool('New folder');
    await page.getByPlaceholder('awesome mix vol.1').fill('made-here');
    await page.getByRole('button', { name: 'make directory' }).click();

    await expect.poll(async () => (await ls('alice', dir)).dirs).toContain('made-here');
});

test.describe('a guest on a share link', () => {
    test('gets the top bar without nav, avatar or tools the link does not allow', async ({ page, server, press }) => {
        await page.goto(server.share);
        await expect(row(page, 'budget.xlsx')).toBeVisible();

        await expect(page.getByRole('banner')).toBeVisible();
        await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Main menu' })).toHaveCount(0);
        await expect(page.getByRole('banner').getByRole('button', { name: /^Account/ })).toHaveCount(0);
        await expect(page.getByRole('searchbox')).toHaveCount(0);

        await press(page.getByRole('button', { name: 'More tools' }));
        await expect(page.getByRole('menu', { name: 'More tools' }).getByRole('menuitem')).toHaveText([
            // upstream shows up2k on an indexed volume without write too: it then only
            // searches for files the server already has
            'Upload settings', 'Message', 'Audio player', 'Settings',
        ]);
    });

    test('makes no request outside the share link and static files', async ({ page, server }) => {
        // Outside, the proxy passes only these; anything else would fail there
        const bad = [];
        page.on('request', (r) => {
            const u = new URL(r.url());
            // upstream's own cookie check (?setck, only without the js=y cookie) is not ours;
            // the proxy's refusal still lets the page load (util.js setck: onload on any status)
            if (u.origin === new URL(server.url).origin && !/^\/(share\/|\.cpr\/)/.test(u.pathname) &&
                !/^\?setck=/.test(u.search))
                bad.push(u.pathname + u.search);
        });
        await page.goto(server.share);
        await expect(row(page, 'budget.xlsx')).toBeVisible();
        await page.getByRole('button', { name: 'More tools' }).click();
        await page.waitForTimeout(500);
        expect(bad).toEqual([]);
    });
});

'use strict';

// the nav's Storage section: one row per disk the account can upload to (disk-space
// ticket 03), and the control panel's "disk space" page (ticket 02)

const { test, expect, row } = require('../fixtures.js');

const GiB = 1024 * 1024 * 1024;

// the Pi's shape: home on one disk with /family, a folder per other disk in My files
const PI = {
    disks: [
        { vols: ['/family/', '/home/alice/'], free: 40 * GiB, total: 100 * GiB },
        { vols: ['/home/alice/ssd2/'], free: 600 * GiB, total: 931 * GiB },
        { vols: ['/home/alice/hdd2/'], free: 1500 * GiB, total: 1800 * GiB },
        { vols: ['/home/alice/hdd1/'], free: 50 * GiB, total: 931 * GiB },
        { vols: ['/attic/'], free: 1 * GiB, total: 2 * GiB },
    ],
};

test('the nav shows how full the disk of My files is', async ({ page, loginAs, nav }) => {
    await loginAs('alice');
    await page.goto('/home/alice/');
    const n = await nav();
    await expect(n.getByRole('heading', { name: 'Storage' })).toBeVisible();
    // the harness has every volume on one disk: one row, My files, family on it too
    const m = n.getByRole('meter');
    await expect(m).toHaveCount(1);
    await expect(m).toHaveAccessibleName('My files');
    await expect(m).toHaveAttribute('aria-valuetext', /^\d+% used, [\d.]+ \w+ free of [\d.]+ \w+$/);
    await expect(n.getByText(/^[\d.]+ \w+ free of [\d.]+ \w+$/)).toBeVisible();
    await expect(n.getByRole('listitem').filter({ has: page.getByRole('meter') })).toHaveAttribute('title', 'Also on this disk: family');
});

test('one row per disk: My files first, its folders by name, then the rest', async ({ page, loginAs, nav }) => {
    await page.route(/\/\?disks&j$/, (r) => r.fulfill({ json: PI }));
    await loginAs('alice');
    await page.goto('/home/alice/');
    const n = await nav();
    const m = n.getByRole('meter');
    await expect(m).toHaveCount(5);
    for (const [i, name, pct] of [[0, 'My files', 60], [1, 'hdd1', 95], [2, 'hdd2', 17], [3, 'ssd2', 36], [4, 'attic', 50]]) {
        await expect(m.nth(i)).toHaveAccessibleName(name);
        await expect(m.nth(i)).toHaveAttribute('aria-valuenow', '' + pct);
    }
    await expect(n.getByText('50.0 GiB free of 931 GiB')).toBeVisible();
    await expect(n.getByText('1.46 TiB free of 1.76 TiB')).toBeVisible();
});

test('no Storage section with nowhere to upload, or when the server says nothing', async ({ page, loginAs, nav }) => {
    // dave has no home folder and only reads (/common)
    await loginAs('dave');
    await page.goto('/common/');
    let n = await nav();
    await expect(n.getByRole('link', { name: 'Recent uploads' })).toBeVisible();
    await expect(n.getByRole('heading', { name: 'Storage' })).toHaveCount(0);

    await page.route(/\/\?disks&j$/, (r) => r.fulfill({ status: 404, body: 'not found' }));
    await loginAs('alice');
    await page.goto('/home/alice/');
    n = await nav();
    await expect(n.getByRole('link', { name: 'Recent uploads' })).toBeVisible();
    await page.waitForTimeout(300);
    await expect(n.getByRole('heading', { name: 'Storage' })).toHaveCount(0);
});

test('a guest on a share link asks for no disk space', async ({ page, server }) => {
    const asked = [];
    page.on('request', (r) => {
        if (/[?&]disks\b/.test(new URL(r.url()).search))
            asked.push(r.url());
    });
    await page.goto(server.share);
    await expect(row(page, 'budget.xlsx')).toBeVisible();
    await page.waitForTimeout(500);
    expect(asked).toEqual([]);
    await expect(page.getByRole('heading', { name: 'Storage' })).toHaveCount(0);
});

test('the control panel links the disk space page', async ({ page, loginAs, press, narrow }) => {
    await loginAs('alice');
    await page.goto('/?h');
    const link = page.getByRole('link', { name: 'disk space' });
    await expect(link).toHaveAttribute('href', '/?disks');
    // upstream's control panel starts phones at zoom 0.8, where Playwright's taps miss
    // every link of its "more" list (share links and grants too); open it by its href there
    if (narrow)
        await page.goto('/?disks');
    else
        await press(link);
    await expect(page).toHaveURL(/\/\?disks$/);
    // alice administers her home folder only
    const tab = page.getByRole('table');
    await expect(tab.getByRole('link', { name: '/home/alice/' })).toBeVisible();
    await expect(tab.getByRole('link', { name: '/family/' })).toHaveCount(0);
    await expect(tab.getByRole('meter')).toHaveCount(1);
});

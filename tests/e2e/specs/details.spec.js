'use strict';

// the Details panel (ⓘ in the top bar): follows the selection on a desktop, a full-screen
// sheet on a phone; type, size, modified, location and Who has access (the owner's own
// grants and share links on the item, each opening the Share dialog)

const { test, expect, row } = require('../fixtures.js');
const { session } = require('../server.js');

const ibtn = (page) => page.getByRole('banner').getByRole('button', { name: 'Details' });
// a side panel on a desktop, a dialog on a phone
const panel = (page, narrow) => (narrow ? page.getByRole('dialog', { name: 'Details' }) :
    page.getByRole('complementary', { name: 'Details' }));
const field = (p, name) => p.locator('dt').filter({ hasText: new RegExp('^' + name + '$') }).locator('+ dd');
const access = (p) => p.getByRole('list', { name: 'Who has access' }).getByRole('listitem');

async function pick(press, page, name) {
    await press(row(page, name).getByRole('checkbox'));
}

async function inview(page, loc) {
    const b = await loc.boundingBox();
    const vp = page.viewportSize();
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(vp.width + 0.5);
    expect(b.y + b.height).toBeLessThanOrEqual(vp.height + 0.5);
}

test.beforeEach(async ({ page, loginAs }, info) => {
    if (info.title.indexOf('guest') < 0)
        await loginAs('alice');
});

test('prompt, one item, several: the panel follows the selection', async ({ page, press, narrow }) => {
    test.skip(narrow, 'the phone sheet is a dialog over the list');
    await page.goto('/home/alice/');
    await press(ibtn(page));
    const p = panel(page, false);
    await expect(p).toBeVisible();
    await expect(ibtn(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(p.getByText('Select a file or folder to see its details.')).toBeVisible();

    await pick(press, page, 'notes.txt');
    await expect(p.getByRole('heading', { name: 'notes.txt' })).toBeVisible();
    await expect(field(p, 'Type')).toHaveText('Text');
    await expect(field(p, 'Size')).toHaveText('21 bytes');
    await expect(field(p, 'Modified')).toHaveText(/\d{4}-\d\d-\d\d/);
    await expect(field(p, 'Location').getByRole('link', { name: 'My files' })).toBeVisible();

    await pick(press, page, 'trip/');
    await expect(p.getByText('2 items selected')).toBeVisible();

    await press(row(page, 'notes.txt').getByRole('checkbox'));
    await expect(p.getByRole('heading', { name: 'trip' })).toBeVisible();
    await expect(field(p, 'Type')).toHaveText('Folder');
    await expect(field(p, 'Size')).toHaveCount(0);

    // the list doesn't hide under the panel
    const pb = await p.boundingBox();
    const lb = await page.locator('#files').boundingBox();
    expect(lb.x + lb.width).toBeLessThanOrEqual(pb.x + 1);

    // a folder change ends the selection: back to the prompt
    await page.keyboard.press('Escape');
    await row(page, 'proj/').getByRole('link', { name: 'proj/', exact: true }).dblclick();
    await expect(row(page, 'plan.txt')).toBeVisible();
    await expect(p.getByText('Select a file or folder to see its details.')).toBeVisible();
    await pick(press, page, 'plan.txt');
    await expect(field(p, 'Location').getByRole('link')).toHaveText('My files › proj');

    await press(p.getByRole('button', { name: 'Close details' }));
    await expect(p).toBeHidden();
    await expect(ibtn(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(ibtn(page)).toBeFocused();
});

test('Who has access lists the grants and share links on the item', async ({ page, press, narrow }) => {
    await page.goto('/home/alice/');
    // the seeded grant: proj to bob, read-only
    await pick(press, page, 'proj/');
    await press(ibtn(page));
    let p = panel(page, narrow);
    await expect(p.getByRole('heading', { name: 'Who has access' })).toBeVisible();
    await expect(access(p)).toHaveCount(1);
    await expect(access(p).first()).toContainText('bob');
    await expect(access(p).first()).toContainText('Viewer');

    // each entry opens the Share dialog on the item
    await press(access(p).first().getByRole('button'));
    const share = page.getByRole('dialog', { name: /Share/ });
    await expect(share.getByRole('heading', { name: 'Share “proj”' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(share).toBeHidden();

    if (narrow) {
        await page.keyboard.press('Escape');
        await expect(p).toBeHidden();
        await press(row(page, 'proj/').getByRole('checkbox'));
    }
    // the seeded share link on trip
    await pick(press, page, 'trip/');
    if (narrow)
        await press(ibtn(page));
    else
        await press(row(page, 'proj/').getByRole('checkbox'));
    p = panel(page, narrow);
    await expect(p.getByRole('heading', { name: 'trip' })).toBeVisible();
    await expect(access(p)).toHaveCount(1);
    await expect(access(p).first()).toContainText('Anyone with the link');

    if (narrow) {
        await page.keyboard.press('Escape');
        await press(row(page, 'trip/').getByRole('checkbox'));
    }
    // nothing shared
    await pick(press, page, 'notes.txt');
    if (narrow)
        await press(ibtn(page));
    else
        await press(row(page, 'trip/').getByRole('checkbox'));
    p = panel(page, narrow);
    await expect(p.getByRole('heading', { name: 'notes.txt' })).toBeVisible();
    await expect(p.getByText('Not shared by you.')).toBeVisible();
    await expect(access(p)).toHaveCount(0);
});

test('Who has access says so when the grants list fails, and not when grants are off', async ({ page, press, narrow }) => {
    let reply = { status: 500, body: 'database is locked' };
    await page.route(/\/\?grants&j$/, (r) => r.fulfill(reply));
    await page.goto('/home/alice/');
    // proj has a grant (to bob) the panel cannot know of now
    await pick(press, page, 'proj/');
    await press(ibtn(page));
    let p = panel(page, narrow);
    await expect(p.getByRole('heading', { name: 'proj' })).toBeVisible();
    await expect(p.getByText(/^Couldn’t check who has access: database is locked/)).toBeVisible();
    await expect(p.getByText('Not shared by you.')).toHaveCount(0);

    // grants off in the server config: nothing to list, so nothing shared that way
    reply = { status: 400, body: 'grants are disabled in the server config' };
    if (narrow) {
        await page.keyboard.press('Escape');
        await expect(p).toBeHidden();
        await press(row(page, 'proj/').getByRole('checkbox'));
    }
    await pick(press, page, 'trip/');
    if (narrow)
        await press(ibtn(page));
    else
        await press(row(page, 'proj/').getByRole('checkbox'));
    p = panel(page, narrow);
    await expect(p.getByRole('heading', { name: 'trip' })).toBeVisible();
    await expect(access(p)).toHaveCount(1);
    await expect(access(p).first()).toContainText('Anyone with the link');
    await expect(p.getByText(/Couldn’t check/)).toHaveCount(0);
});

test('Who has access matches the server’s grant and link lists', async ({ page, put, press, narrow, server }, info) => {
    // a grant and two links each reload the server
    test.slow();
    // fresh names each run, so a second run (or --repeat-each) finds no taken link key
    const tag = info.project.name.replace(/[^a-z]/g, '') + Date.now().toString(36);
    const dir = `/home/alice/det-${tag}/`;
    const name = dir.slice('/home/alice/'.length, -1);
    await put('alice', dir + 'd.txt', 'details ' + tag + '\n');
    const s = await session(server.url, 'alice');
    expect((await s.postJson('/?grant', { vp: dir, rcpt: '@family', name: 'det' + tag, perms: ['read', 'write'] })).status).toBe(201);
    for (const k of ['a', 'b'])
        expect((await s.postJson('/?share', {
            k: `e2edet${k}${tag}`, vp: [dir], pw: k == 'a' ? 'pw' : '', exp: '', perms: ['read'],
        })).status).toBe(201);
    const grants = (await (await s.get('/?grants&j')).json()).rows.filter((r) => r.src === dir);
    const links = (await (await s.get('/?shares&j')).json()).rows.filter((r) =>
        r.vp.replace(/\/$/, '') + '/' === dir && !r.files.length);

    await page.goto('/home/alice/');
    await pick(press, page, name + '/');
    await press(ibtn(page));
    const p = panel(page, narrow);
    await expect(access(p)).toHaveCount(grants.length + links.length);
    await expect(access(p).filter({ hasText: 'family (group)' })).toContainText('Viewer and uploader');
    await expect(access(p).filter({ hasText: 'Anyone with the link' })).toHaveCount(2);
    await expect(access(p).filter({ hasText: 'password' })).toHaveCount(1);

    // removed in the Share dialog: the panel catches up when it closes
    await press(access(p).filter({ hasText: 'family (group)' }).getByRole('button'));
    const share = page.getByRole('dialog', { name: /Share/ });
    await press(share.getByRole('button', { name: 'Remove access for family (group)' }));
    await expect(share.getByRole('list', { name: 'Shared with' }).getByRole('listitem')).toHaveCount(0);
    await press(share.getByRole('button', { name: 'Done' }));
    await expect(access(p)).toHaveCount(links.length);
});

test('search results: a hit shows its own folder', async ({ page, press, narrow, loginAs }) => {
    await loginAs('carol');
    await page.goto('/home/carol/search/');
    const box = page.getByRole('banner').getByRole('searchbox', { name: 'Search' });
    await box.fill('deep');
    await box.press('Enter');
    await expect(row(page, 'beach-deep.jpg')).toBeVisible({ timeout: 10000 });
    await pick(press, page, 'beach-deep.jpg');
    await press(ibtn(page));
    const p = panel(page, narrow);
    await expect(p.getByRole('heading', { name: 'beach-deep.jpg' })).toBeVisible();
    await expect(field(p, 'Type')).toHaveText('Image');
    await expect(field(p, 'Location').getByRole('link')).toHaveText('My files › search › sub');
});

test('phone: a full-screen sheet from ⓘ and from the row menu', async ({ page, press, narrow }) => {
    test.skip(!narrow, 'phone only');
    await page.goto('/home/alice/');
    await press(ibtn(page));
    const p = panel(page, true);
    await expect(p).toBeVisible();
    const b = await p.boundingBox(), vp = page.viewportSize();
    expect(b.width).toBeGreaterThanOrEqual(vp.width - 1);
    expect(b.height).toBeGreaterThanOrEqual(vp.height - 1);
    await expect(p.getByText('Select a file or folder to see its details.')).toBeVisible();
    const close = p.getByRole('button', { name: 'Close details' });
    expect((await close.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect((await ibtn(page).boundingBox()).height).toBeGreaterThanOrEqual(44);
    await press(close);
    await expect(p).toBeHidden();
    await expect(ibtn(page)).toBeFocused();

    // the row's ⋮: Details on that row, and no selection left behind
    const more = row(page, 'notes.txt').getByRole('button', { name: 'Actions for notes.txt' });
    await press(more);
    await press(page.getByRole('menu').getByRole('menuitem', { name: 'Details' }));
    await expect(p.getByRole('heading', { name: 'notes.txt' })).toBeVisible();
    await expect(field(p, 'Size')).toHaveText('21 bytes');
    await inview(page, p.getByRole('heading', { name: 'Who has access' }));
    await page.keyboard.press('Escape');
    await expect(p).toBeHidden();
    await expect(page.getByRole('toolbar', { name: 'Selection' })).toBeHidden();
});

test('desktop keyboard: in from the selection bar, Esc back out', async ({ page, press, narrow, selbar }) => {
    test.skip(narrow, 'desktop only');
    await page.goto('/home/alice/');
    await pick(press, page, 'notes.txt');
    await press(selbar.getByRole('button', { name: 'More actions' }));
    await page.getByRole('menu', { name: 'More actions' }).getByRole('menuitem', { name: 'Details' }).click();
    const p = panel(page, false);
    await expect(p.getByRole('heading', { name: 'notes.txt' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(p).toBeHidden();
    // Esc closed the panel, not the selection
    await expect(selbar).toBeVisible();
});

test('a guest on a share link gets details without Who has access', async ({ page, press, narrow, server }) => {
    const asked = [];
    page.on('request', (r) => {
        if (/[?&](shares|grants|share|grant)\b/.test(r.url()))
            asked.push(r.url());
    });
    await page.goto(server.share);
    await expect(row(page, 'budget.xlsx')).toBeVisible();
    await pick(press, page, 'budget.xlsx');
    await press(ibtn(page));
    const p = panel(page, narrow);
    await expect(p.getByRole('heading', { name: 'budget.xlsx' })).toBeVisible();
    await expect(field(p, 'Type')).toHaveText('Spreadsheet');
    await expect(p.getByRole('heading', { name: 'Who has access' })).toHaveCount(0);
    expect(asked).toEqual([]);
});

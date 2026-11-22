'use strict';

// the grid view: the Layout toggle switches the list to Drive's grid (a Folders section of
// compact tiles, then file cards with lazy thumbnails and a ⋮ each), remembered per
// browser; selecting, the selection bar, the row menu and opening work as in the list

const { test, expect, row, scratch } = require('../fixtures.js');
const { session } = require('../server.js');

const layout = (page) => page.getByRole('group', { name: 'Layout' });
const section = (page, name) => page.getByRole('list', { name });
const card = (page, name) =>
    page.locator('#fk-grid').getByRole('listitem').filter({ has: page.getByRole('link', { name, exact: true }) });
const more = (page, name) => card(page, name).getByRole('button', { name: 'Actions for ' + name });
const box = (page, name) => card(page, name).getByRole('checkbox', { name: 'Select ' + name });
const menu = (page) => page.getByRole('menu', { name: 'Actions' });
const item = (page, name) => menu(page).getByRole('menuitem', { name, exact: true });

// a 1x1 png, different bytes per file (the server would link copies of the same bytes)
function png(i) {
    const b = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
    );
    return Buffer.concat([b, Buffer.from('#' + i)]);
}

// a folder of its own per size and scenario (the sizes run in parallel): a subfolder and
// some files, put with one session
async function mkdir(server, info, what, files, dirs) {
    const dir = scratch(info, what);
    const s = await session(server.url, 'alice');
    const all = files.concat((dirs || []).map((d) => d + '/x.txt'));
    for (let i = 0; i < all.length; i += 20)
        await Promise.all(
            all.slice(i, i + 20).map(async (f) => {
                const r = await s.put(dir + f, /\.png$/.test(f) ? png(i + f) : f + '\n');
                if (r.status !== 201)
                    throw new Error(`PUT ${dir + f}: ${r.status}`);
            })
        );
    return dir;
}

async function togrid(page, press) {
    await press(layout(page).getByRole('button', { name: 'Grid layout' }));
    await expect(layout(page).getByRole('button', { name: 'Grid layout' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#fk-grid')).toBeVisible();
}

test('the Layout toggle shows folders as tiles, then file cards, and is remembered', async ({ page, loginAs, server, press }, info) => {
    const dir = await mkdir(server, info, 'gtgl', ['a.txt', 'b.png'], ['sub']);
    await loginAs('alice');
    await page.goto(dir);
    await expect(row(page, 'a.txt')).toBeVisible();
    await expect(layout(page).getByRole('button', { name: 'List layout' })).toHaveAttribute('aria-pressed', 'true');

    await togrid(page, press);
    await expect(row(page, 'a.txt')).toBeHidden();
    // Folders first, then Files, in that order on the page
    const folders = section(page, 'Folders'), files = section(page, 'Files');
    await expect(folders.getByRole('link', { name: 'sub', exact: true })).toBeVisible();
    await expect(files.getByRole('link', { name: 'a.txt', exact: true })).toBeVisible();
    await expect(files.getByRole('link', { name: 'b.png', exact: true })).toBeVisible();
    const fb = await folders.boundingBox(), lb = await files.boundingBox();
    expect(fb.y + fb.height).toBeLessThanOrEqual(lb.y + 1);
    // a folder tile is compact; a file card has its thumbnail, loaded lazily
    expect((await card(page, 'sub').boundingBox()).height).toBeLessThan(64);
    const img = card(page, 'b.png').locator('img');
    await expect(img).toHaveAttribute('loading', 'lazy');
    await expect(img).toHaveAttribute('src', /[?&]th=/);
    expect((await card(page, 'b.png').boundingBox()).height).toBeGreaterThan(120);
    // nothing scrolls sideways
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);

    // remembered by this browser
    await page.reload();
    await expect(card(page, 'a.txt')).toBeVisible();
    await expect(row(page, 'a.txt')).toBeHidden();

    await press(layout(page).getByRole('button', { name: 'List layout' }));
    await expect(row(page, 'a.txt')).toBeVisible();
    await expect(page.locator('#fk-grid')).toBeHidden();
});

test('opening an image shows it in the lightbox, a text file in the viewer', async ({ page, loginAs, server, press, open }, info) => {
    const dir = await mkdir(server, info, 'gopen', ['a.png', 'b.png', 'note.txt']);
    await loginAs('alice');
    await page.goto(dir);
    await togrid(page, press);

    await open(card(page, 'b.png'));
    await expect(page.locator('#bbox-overlay')).toBeVisible();
    await expect(page.locator('#bbox-overlay')).toContainText('b.png');
    await page.keyboard.press('Escape');
    await expect(page.locator('#bbox-overlay')).toBeHidden();

    await open(card(page, 'note.txt'));
    await expect(page).toHaveURL(/[?&]doc=note\.txt/);
});

test.describe('on a desktop', () => {
    test.beforeEach(async ({ hasTouch }) => {
        test.skip(hasTouch, 'mouse and keyboard');
    });

    test('a click selects, Ctrl and Shift extend, a double-click opens', async ({ page, loginAs, server, press, selbar }, info) => {
        const dir = await mkdir(server, info, 'gclick', ['a.txt', 'b.txt', 'c.txt', 'd.txt'], ['sub']);
        await loginAs('alice');
        await page.goto(dir);
        await togrid(page, press);

        await card(page, 'b.txt').click();
        await expect(box(page, 'b.txt')).toBeChecked();
        await expect(selbar.getByText('1 selected')).toBeVisible();
        await expect(page).toHaveURL(new RegExp(dir + '$'));

        await card(page, 'a.txt').click({ modifiers: ['ControlOrMeta'] });
        await expect(selbar.getByText('2 selected')).toBeVisible();
        await card(page, 'd.txt').click({ modifiers: ['Shift'] });
        await expect(selbar.getByText('4 selected')).toBeVisible();
        expect(await page.evaluate(() => String(getSelection()))).toBe('');

        // the checkbox shows on hover / once anything is selected, and toggles
        await box(page, 'c.txt').click();
        await expect(selbar.getByText('3 selected')).toBeVisible();
        await expect(box(page, 'c.txt')).not.toBeChecked();

        await page.keyboard.press('Escape');
        await expect(selbar).toBeHidden();

        await card(page, 'sub').dblclick();
        await expect(page).toHaveURL(new RegExp(dir + 'sub/$'));
        await expect(card(page, 'x.txt')).toBeVisible();
    });

    test('the ⋮ and right-click open the row menu for a card', async ({ page, loginAs, server, press, selbar, ls }, info) => {
        const dir = await mkdir(server, info, 'gmenu', ['keep.txt', 'gone.txt']);
        await loginAs('alice');
        await page.goto(dir);
        await togrid(page, press);

        const b = more(page, 'gone.txt');
        await expect(b).toHaveCSS('opacity', '0');
        await card(page, 'gone.txt').hover();
        await expect(b).toHaveCSS('opacity', '1');
        await b.click();
        await expect(menu(page)).toBeVisible();
        await expect(b).toHaveAttribute('aria-expanded', 'true');
        await expect(selbar.getByText('1 selected')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(menu(page)).toBeHidden();
        await expect(b).toBeFocused();

        await card(page, 'keep.txt').click({ button: 'right' });
        await expect(menu(page)).toBeVisible();
        await expect(page.locator('#rcm')).toBeHidden();
        await expect(box(page, 'keep.txt')).toBeChecked();
        await expect(box(page, 'gone.txt')).not.toBeChecked();
        await page.keyboard.press('Escape');

        // Delete from the ⋮ acts on that card
        await card(page, 'gone.txt').hover();
        await more(page, 'gone.txt').click();
        await item(page, 'Delete').click();
        const ok = page.getByRole('link', { name: 'OK', exact: true });
        await ok.click();
        await page.getByText('Last chance!').waitFor({ timeout: 2000 }).then(() => ok.click(), () => null);
        await expect(card(page, 'gone.txt')).toBeHidden();
        await expect(card(page, 'keep.txt')).toBeVisible();
        expect((await ls('alice', dir)).files).toEqual(['keep.txt']);
    });

    test('works with the keyboard alone', async ({ page, loginAs, server, press, selbar }, info) => {
        const dir = await mkdir(server, info, 'gkeys', ['a.txt', 'b.txt'], ['sub']);
        await loginAs('alice');
        await page.goto(dir);
        await togrid(page, press);

        const link = (n) => card(page, n).getByRole('link', { name: n, exact: true });
        await link('a.txt').focus();
        await page.keyboard.press('ArrowRight');
        await expect(link('b.txt')).toBeFocused();
        await page.keyboard.press('ArrowLeft');
        await expect(link('a.txt')).toBeFocused();
        await page.keyboard.press('ArrowUp');
        await expect(link('sub')).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(link('a.txt')).toBeFocused();

        // Space selects, the context-menu keys open the menu, Esc puts focus back
        await page.keyboard.press(' ');
        await expect(selbar.getByText('1 selected')).toBeVisible();
        await page.keyboard.press('Shift+F10');
        await expect(menu(page)).toBeVisible();
        await expect(item(page, 'Open')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(menu(page)).toBeHidden();
        await expect(link('a.txt')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(selbar).toBeHidden();

        // Enter opens
        await link('sub').focus();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(new RegExp(dir + 'sub/$'));
    });
});

test.describe('on a phone', () => {
    test.beforeEach(async ({ hasTouch }) => {
        test.skip(!hasTouch, 'touch');
    });

    test('a tap opens, a long-press selects, then taps toggle', async ({ page, loginAs, server, press, longPress, selbar }, info) => {
        const dir = await mkdir(server, info, 'gtouch', ['a.txt', 'b.txt'], ['sub']);
        await loginAs('alice');
        await page.goto(dir);
        await togrid(page, press);

        await longPress(card(page, 'a.txt'));
        await expect(selbar.getByText('1 selected')).toBeVisible();
        await page.waitForTimeout(500);
        await card(page, 'b.txt').tap();
        await expect(selbar.getByText('2 selected')).toBeVisible();
        await card(page, 'a.txt').tap();
        await expect(selbar.getByText('1 selected')).toBeVisible();
        await card(page, 'b.txt').tap();
        await expect(selbar).toBeHidden();

        await card(page, 'sub').tap();
        await expect(page).toHaveURL(new RegExp(dir + 'sub/$'));
        await expect(card(page, 'x.txt')).toBeVisible();
    });

    test('the ⋮ is always there and opens a bottom sheet for that card only', async ({ page, loginAs, server, press, selbar, ls }, info) => {
        const dir = await mkdir(server, info, 'gsheet', ['keep.txt', 'gone.txt']);
        await loginAs('alice');
        await page.goto(dir);
        await togrid(page, press);

        const b = more(page, 'gone.txt');
        await expect(b).toBeVisible();
        await expect(b).toHaveCSS('opacity', '1');
        const bb = await b.boundingBox();
        expect(bb.width).toBeGreaterThanOrEqual(44);
        expect(bb.height).toBeGreaterThanOrEqual(44);

        await b.tap();
        const m = menu(page);
        await expect(m).toBeVisible();
        const mb = await m.boundingBox();
        expect(Math.round(mb.y + mb.height)).toBeGreaterThanOrEqual(page.viewportSize().height - 2);
        await page.keyboard.press('Escape');
        await expect(m).toBeHidden();
        await expect(selbar).toBeHidden();

        await b.tap();
        await item(page, 'Delete').tap();
        const ok = page.getByRole('link', { name: 'OK', exact: true });
        await ok.tap();
        await page.getByText('Last chance!').waitFor({ timeout: 2000 }).then(() => ok.tap(), () => null);
        await expect(card(page, 'gone.txt')).toBeHidden();
        await expect(selbar).toBeHidden();
        expect((await ls('alice', dir)).files).toEqual(['keep.txt']);
    });

    test('a folder of hundreds of images loads thumbnails lazily and scrolls', async ({ page, loginAs, server, press }, info) => {
        test.setTimeout(90000);
        const names = [];
        for (let i = 0; i < 300; i++)
            names.push(`img${String(i).padStart(3, '0')}.png`);
        const dir = await mkdir(server, info, 'gmany', names);
        await loginAs('alice');
        await page.goto(dir);
        await togrid(page, press);
        // upstream lists the first 250 and the rest once scrolled near the end
        await expect(card(page, 'img000.png')).toBeVisible();

        const thumbs = new Set();
        page.on('request', (r) => {
            if (/[?&]th=/.test(r.url()))
                thumbs.add(r.url());
        });
        await page.waitForTimeout(1000);
        // only the cards near the screen asked for theirs
        expect(thumbs.size).toBeLessThan(60);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width);

        // cards far below are skipped by rendering until they come near
        const cv = await card(page, 'img200.png').evaluate((e) => getComputedStyle(e).contentVisibility);
        expect(cv).toBe('auto');

        const last = card(page, 'img299.png');
        await expect.poll(async () => {
            await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
            // upstream asks first on Firefox for Android (its bd_ask setting)
            const all = page.locator('#bd_all');
            if (await all.isVisible())
                await all.tap();
            return last.count();
        }, { timeout: 20000 }).toBe(1);
        await expect(section(page, 'Files').getByRole('listitem')).toHaveCount(300);
        await last.scrollIntoViewIfNeeded();
        await expect(last.locator('img')).toBeVisible();
        await expect.poll(() => [...thumbs].some((u) => /img299\.png/.test(u))).toBe(true);
    });
});

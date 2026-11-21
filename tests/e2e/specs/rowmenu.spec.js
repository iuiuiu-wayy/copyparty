'use strict';

// the row menu: a ⋮ on every row and right-click open one menu of the item's actions (every
// entry upstream's right-click menu had); a bottom sheet on a phone; it acts on the whole
// selection when the row is part of it

const { test, expect, row } = require('../fixtures.js');

const more = (page, name) => row(page, name).getByRole('button', { name: 'Actions for ' + name });
const menu = (page) => page.getByRole('menu', { name: 'Actions' });
const item = (page, name) => menu(page).getByRole('menuitem', { name, exact: true });
const box = (page, name) => row(page, name).getByRole('checkbox');

// a folder of its own per size, since the sizes run in parallel
async function mkdir(put, info, what, files) {
    const dir = `/home/alice/${what}-${info.project.name}/`;
    await Promise.all(files.map((f) => put('alice', dir + f, f + '\n')));
    return dir;
}

// upstream's delete confirm, and its second ask unless quick delete is on in its settings
async function confirm(page, press) {
    const ok = page.getByRole('link', { name: 'OK', exact: true });
    await press(ok);
    await page.getByText('Last chance!').waitFor({ timeout: 2000 }).then(() => press(ok), () => null);
}

async function labels(page) {
    return (await menu(page).getByRole('menuitem').allInnerTexts()).map((s) => s.trim());
}

async function inview(page, loc) {
    const b = await loc.boundingBox();
    const vp = page.viewportSize();
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(vp.width);
    expect(b.y + b.height).toBeLessThanOrEqual(vp.height);
}

test.describe('on a desktop', () => {
    test.beforeEach(async ({ hasTouch }) => {
        test.skip(hasTouch, 'mouse and keyboard');
    });

    test('the ⋮ shows on hover and opens the item\'s actions', async ({ page, loginAs }) => {
        await loginAs('alice');
        await page.goto('/home/alice/');
        const b = more(page, 'notes.txt');
        await expect(b).toHaveCSS('opacity', '0');
        await row(page, 'notes.txt').hover();
        await expect(b).toHaveCSS('opacity', '1');
        await expect(b).toHaveAttribute('aria-haspopup', 'menu');

        await b.click();
        await expect(menu(page)).toBeVisible();
        await expect(b).toHaveAttribute('aria-expanded', 'true');
        const ls = await labels(page);
        for (const e of ['Open', 'Open as text', 'Download', 'Share', 'Move to…', 'Rename', 'Copy', 'Cut',
            'Copy link', 'Delete', 'Select all', 'Invert selection'])
            expect(ls).toContain(e);
        // the row it was opened on is what it acts on: now the selection, as in Drive
        await expect(box(page, 'notes.txt')).toBeChecked();
        await inview(page, menu(page));

        await page.keyboard.press('Escape');
        await expect(menu(page)).toBeHidden();
        await expect(b).toBeFocused();
        await expect(b).toHaveAttribute('aria-expanded', 'false');
    });

    test('right-click opens the same menu at the pointer, not upstream\'s', async ({ page, loginAs }) => {
        await loginAs('alice');
        await page.goto('/home/alice/');
        const r = row(page, 'notes.txt');
        await r.scrollIntoViewIfNeeded();
        const rb = await r.boundingBox();
        await r.click({ button: 'right', position: { x: 300, y: rb.height / 2 } });
        await expect(menu(page)).toBeVisible();
        await expect(page.locator('#rcm')).toBeHidden();
        const mb = await menu(page).boundingBox();
        expect(Math.abs(mb.x - (rb.x + 300))).toBeLessThan(4);
        // its top-left corner at the pointer, or its bottom-left one where it doesn't fit below;
        // a menu taller than both is moved up just enough to fit (still beside the pointer)
        const py = rb.y + rb.height / 2;
        expect(mb.y).toBeLessThanOrEqual(py + 1);
        expect(mb.y + mb.height).toBeGreaterThanOrEqual(py - 1);
        if (mb.y > 8 && mb.y + mb.height < page.viewportSize().height - 8)
            expect(Math.min(Math.abs(mb.y - py), Math.abs(mb.y + mb.height - py))).toBeLessThan(4);
        await expect(box(page, 'notes.txt')).toBeChecked();

        // Open as text: upstream's text viewer
        await item(page, 'Open as text').click();
        await expect(page.getByText('shopping: milk, eggs')).toBeVisible();
    });

    test('it stays on screen near the edges', async ({ page, loginAs, put }, info) => {
        const names = [];
        for (let i = 0; i < 24; i++)
            names.push(`e${String(i).padStart(2, '0')}.txt`);
        const dir = await mkdir(put, info, 'edge', names);
        await loginAs('alice');
        await page.goto(dir);
        await page.setViewportSize({ width: 1000, height: 600 });

        const vp = page.viewportSize();
        // right-clicks near each corner of the list
        await row(page, 'e00.txt').click({ button: 'right', position: { x: 5, y: 5 } });
        await inview(page, menu(page));
        await page.keyboard.press('Escape');

        const last = row(page, 'e23.txt');
        await last.scrollIntoViewIfNeeded();
        const lb = await last.boundingBox();
        await page.mouse.click(vp.width - 30, Math.min(lb.y + lb.height / 2, vp.height - 5), { button: 'right' });
        await expect(menu(page)).toBeVisible();
        await inview(page, menu(page));
        await page.keyboard.press('Escape');

        // and the ⋮ of the bottom row
        await last.hover();
        await more(page, 'e23.txt').click();
        await inview(page, menu(page));
    });

    test('on a selected row it acts on the whole selection', async ({ page, loginAs, put, ls }, info) => {
        const dir = await mkdir(put, info, 'msel', ['m1.txt', 'm2.txt', 'm3.txt']);
        await loginAs('alice');
        await page.goto(dir);
        await row(page, 'm1.txt').click();
        await row(page, 'm2.txt').click({ modifiers: ['ControlOrMeta'] });

        await row(page, 'm2.txt').click({ button: 'right' });
        await expect(box(page, 'm1.txt')).toBeChecked();
        await item(page, 'Delete').click();
        await expect(page.getByText('Delete 2 items forever?')).toBeVisible();
        await confirm(page, (l) => l.click());
        await expect.poll(async () => (await ls('alice', dir)).files.sort()).toEqual(['m3.txt']);
    });

    test('a right-click on an unselected row selects only it', async ({ page, loginAs, put }, info) => {
        const dir = await mkdir(put, info, 'one', ['o1.txt', 'o2.txt']);
        await loginAs('alice');
        await page.goto(dir);
        await row(page, 'o1.txt').click();
        await row(page, 'o2.txt').click({ button: 'right' });
        await expect(box(page, 'o2.txt')).toBeChecked();
        await expect(box(page, 'o1.txt')).not.toBeChecked();
    });

    test('every entry of upstream\'s right-click menu is there', async ({ page, loginAs, put, ls }, info) => {
        const dir = await mkdir(put, info, 'all', ['song.mp3', 'read.md', 'a.txt']);
        await loginAs('alice');
        await page.goto(dir);

        await row(page, 'song.mp3').click({ button: 'right' });
        expect(await labels(page)).toEqual(expect.arrayContaining(['Open', 'Play', 'Open as text',
            'Copy link', 'Download', 'Download as zip', 'Delete', 'Cut', 'Copy', 'Rename',
            'New folder', 'New text file', 'Select all', 'Invert selection', 'Share']));
        await page.keyboard.press('Escape');

        await row(page, 'read.md').click({ button: 'right' });
        expect(await labels(page)).toContain('Open in markdown viewer');
        // copy: then paste is offered, on a row and on the empty space below the list
        await item(page, 'Copy').click();
        await row(page, 'a.txt').click({ button: 'right' });
        expect(await labels(page)).toContain('Paste');
        // Esc closes the menu, a second one clears the selection the right-click made
        await page.keyboard.press('Escape');
        await expect(menu(page)).toBeHidden();
        await page.keyboard.press('Escape');
        await expect(box(page, 'a.txt')).not.toBeChecked();

        const fb = await page.locator('#files').boundingBox();
        await page.mouse.click(fb.x + 200, fb.y + fb.height + 20, { button: 'right' });
        await expect(menu(page)).toBeVisible();
        const ls2 = await labels(page);
        for (const e of ['Paste', 'New folder', 'File upload', 'New text file', 'Select all', 'Share this folder'])
            expect(ls2).toContain(e);
        expect(ls2).not.toContain('Open');

        // New folder: + New's dialog (forknew.js)
        await item(page, 'New folder').click();
        const d = page.getByRole('dialog', { name: 'New folder' });
        await d.getByRole('textbox', { name: 'Folder name' }).fill('made');
        await d.getByRole('button', { name: 'Create' }).click();
        await expect.poll(async () => (await ls('alice', dir)).dirs).toContain('made');
    });

    test('keyboard: Shift+F10 on a focused row opens it, Esc gives focus back', async ({ page, loginAs }) => {
        await loginAs('alice');
        await page.goto('/home/alice/');
        const r = row(page, 'notes.txt');
        await r.focus();
        await page.keyboard.press('Shift+F10');
        await expect(menu(page)).toBeVisible();
        await expect(item(page, 'Open')).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(menu(page).getByRole('menuitem').nth(1)).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(menu(page)).toBeHidden();
        await expect(r).toBeFocused();
    });

    test('Shift+right-click leaves the browser\'s own menu', async ({ page, loginAs }) => {
        await loginAs('alice');
        await page.goto('/home/alice/');
        const prevented = page.evaluate(() => new Promise((ok) => {
            // Firefox gives Shift+right-click to its own menu without telling the page
            setTimeout(() => ok(null), 1500);
            window.addEventListener('contextmenu', (e) => setTimeout(() => ok(e.defaultPrevented)), { once: true, capture: true });
        }));
        await row(page, 'notes.txt').click({ button: 'right', modifiers: ['Shift'] });
        expect(await prevented).not.toBe(true);
        await expect(menu(page)).toBeHidden();
    });
});

test.describe('on a phone', () => {
    test.beforeEach(async ({ hasTouch }) => {
        test.skip(!hasTouch, 'touch');
    });

    test('the ⋮ is always there and opens a bottom sheet', async ({ page, loginAs }) => {
        await loginAs('alice');
        await page.goto('/home/alice/');
        const b = more(page, 'notes.txt');
        await expect(b).toHaveCSS('opacity', '1');
        const bb = await b.boundingBox();
        expect(bb.width).toBeGreaterThanOrEqual(44);
        expect(bb.height).toBeGreaterThanOrEqual(44);

        await b.tap();
        const m = menu(page);
        await expect(m).toBeVisible();
        const mb = await m.boundingBox();
        const vp = page.viewportSize();
        expect(mb.x).toBe(0);
        expect(Math.round(mb.width)).toBe(vp.width);
        expect(Math.abs(mb.y + mb.height - vp.height)).toBeLessThan(2);
        await expect(m.getByText('notes.txt')).toBeVisible();
        expect(await labels(page)).toEqual(expect.arrayContaining(['Open', 'Download', 'Share', 'Move to…',
            'Rename', 'Copy', 'Cut', 'Delete']));
        // nothing was opened, and the page has no sideways scroll
        await expect(page).toHaveURL(/\/home\/alice\/$/);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });

    test('the sheet closes by tap outside, Esc and swipe; focus back on the ⋮', async ({ page, loginAs, swipe }) => {
        await loginAs('alice');
        await page.goto('/home/alice/');
        const b = more(page, 'notes.txt');

        await b.tap();
        await expect(menu(page)).toBeVisible();
        await page.touchscreen.tap(200, 20);
        await expect(menu(page)).toBeHidden();
        await expect(b).toBeFocused();
        // the tap outside opened nothing, and nothing is left selected
        await expect(page).toHaveURL(/\/home\/alice\/$/);
        await expect(box(page, 'notes.txt')).not.toBeChecked();

        await b.tap();
        await expect(menu(page)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(menu(page)).toBeHidden();
        await expect(b).toBeFocused();

        await b.tap();
        await expect(menu(page)).toBeVisible();
        await swipe(menu(page).locator('.fk-grab'), 200);
        await expect(menu(page)).toBeHidden();
        await expect(b).toBeFocused();
        await expect(box(page, 'notes.txt')).not.toBeChecked();
    });

    test('an entry acts on that row only, and leaves nothing selected', async ({ page, loginAs, put, ls }, info) => {
        const dir = await mkdir(put, info, 'pdel', ['p1.txt', 'p2.txt']);
        await loginAs('alice');
        await page.goto(dir);
        await more(page, 'p1.txt').tap();
        await item(page, 'Delete').tap();
        await expect(page.getByText('Delete 1 item forever?')).toBeVisible();
        await confirm(page, (l) => l.tap());
        await expect.poll(async () => (await ls('alice', dir)).files).toEqual(['p2.txt']);
        await expect(page.getByRole('toolbar', { name: 'Selection' })).toBeHidden();
    });

    test('on a selected row it acts on the whole selection', async ({ page, loginAs, put, longPress }, info) => {
        const dir = await mkdir(put, info, 'psel', ['q1.txt', 'q2.txt', 'q3.txt']);
        await loginAs('alice');
        await page.goto(dir);
        await longPress(row(page, 'q1.txt'));
        await expect(box(page, 'q1.txt')).toBeChecked();
        // the click that ends a long-press is swallowed for 400 ms (forklist.js); a finger
        // takes longer than that to tap the next row
        await page.waitForTimeout(500);
        await row(page, 'q2.txt').getByRole('link', { name: 'q2.txt' }).tap();
        await expect(box(page, 'q2.txt')).toBeChecked();

        await more(page, 'q2.txt').tap();
        await item(page, 'Delete').tap();
        await expect(page.getByText('Delete 2 items forever?')).toBeVisible();
    });
});

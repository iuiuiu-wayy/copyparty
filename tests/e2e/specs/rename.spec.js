'use strict';

// rename: one item opens a small dialog with the name selected up to the extension (the
// whole name for a folder), Enter saves; several items open upstream's batch rename panel;
// F2 does the same; a refused rename shows the server's reason

const { test, expect, row, scratch } = require('../fixtures.js');

const more = (page, name) => row(page, name).getByRole('button', { name: 'Actions for ' + name });
const menu = (page) => page.getByRole('menu', { name: 'Actions' });
const dlg = (page) => page.getByRole('dialog', { name: 'Rename' });
const field = (page) => dlg(page).getByRole('textbox', { name: 'New name' });
const box = (page, name) => row(page, name).getByRole('checkbox');

// a folder of its own per size and browser, since they run in parallel
async function mkdir(put, info, what, files) {
    const dir = scratch(info, what);
    for (const f of files)
        await put('alice', dir + f, f + '\n');
    return dir;
}

const selected = (loc) => loc.evaluate((e) => [e.selectionStart, e.selectionEnd]);

// open the row menu on a row and pick Rename
async function fromRowMenu(page, press, name) {
    await row(page, name).hover().catch(() => null);
    await press(more(page, name));
    await press(menu(page).getByRole('menuitem', { name: 'Rename', exact: true }));
    await expect(dlg(page)).toBeVisible();
}

test('a file: the name is selected up to the extension, Enter saves', async ({ page, loginAs, put, ls, press, hasTouch }, info) => {
    const dir = await mkdir(put, info, 'ren1', ['report.final.txt', 'other.txt']);
    await loginAs('alice');
    await page.goto(dir);

    await fromRowMenu(page, press, 'report.final.txt');
    await expect(field(page)).toBeFocused();
    await expect(field(page)).toHaveValue('report.final.txt');
    expect(await selected(field(page))).toEqual([0, 'report.final'.length]);

    // typing replaces the selected part only
    await page.keyboard.type('summary');
    await expect(field(page)).toHaveValue('summary.txt');
    await page.keyboard.press('Enter');
    await expect(dlg(page)).toBeHidden();

    await expect.poll(async () => (await ls('alice', dir)).files.sort()).toEqual(['other.txt', 'summary.txt']);
    // the list shows it under the new name, with focus on it; still the selection on a
    // desktop (as the row menu left it), while a phone's row menu gave the selection back
    await expect(row(page, 'summary.txt')).toBeVisible();
    await expect(row(page, 'report.final.txt')).toHaveCount(0);
    if (hasTouch)
        await expect(box(page, 'summary.txt')).not.toBeChecked();
    else
        await expect(box(page, 'summary.txt')).toBeChecked();
    await expect(row(page, 'summary.txt')).toBeFocused();
    // nothing is left of the dialog's own state, and the page didn't crash on the way
    await expect(page.locator('#rui')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a folder: the whole name is selected; the Save button saves', async ({ page, loginAs, put, ls, press }, info) => {
    const dir = await mkdir(put, info, 'ren2', ['old.pics/a.txt', 'b.txt']);
    await loginAs('alice');
    await page.goto(dir);

    await fromRowMenu(page, press, 'old.pics/');
    await expect(field(page)).toHaveValue('old.pics');
    expect(await selected(field(page))).toEqual([0, 'old.pics'.length]);
    await field(page).fill('new pics');
    await press(dlg(page).getByRole('button', { name: 'Save', exact: true }));
    await expect(dlg(page)).toBeHidden();

    await expect.poll(async () => (await ls('alice', dir)).dirs).toEqual(['new pics']);
    expect((await ls('alice', dir + 'new%20pics/')).files).toEqual(['a.txt']);
    await expect(row(page, 'new pics/')).toBeVisible();
});

test('a refused rename shows the server\'s reason and keeps the dialog open', async ({ page, loginAs, put, ls, press }, info) => {
    const dir = await mkdir(put, info, 'ren3', ['a.txt', 'b.txt']);
    await loginAs('alice');
    await page.goto(dir);

    await fromRowMenu(page, press, 'a.txt');
    await field(page).fill('b.txt');
    await press(dlg(page).getByRole('button', { name: 'Save', exact: true }));
    const err = dlg(page).getByRole('alert');
    await expect(err).toContainText('target file exists');
    await expect(dlg(page)).toBeVisible();
    await expect(field(page)).toBeFocused();
    // the field is described by the message, so a screen reader reads it on focus
    await expect(field(page)).toHaveAccessibleDescription(/target file exists/);

    // a slash would move it into another folder: refused before asking the server
    await field(page).fill('sub/c.txt');
    await press(dlg(page).getByRole('button', { name: 'Save', exact: true }));
    await expect(err).toContainText('/');
    await field(page).fill('');
    await press(dlg(page).getByRole('button', { name: 'Save', exact: true }));
    await expect(err).toContainText('Type a name');

    await press(dlg(page).getByRole('button', { name: 'Cancel', exact: true }));
    await expect(dlg(page)).toBeHidden();
    expect((await ls('alice', dir)).files.sort()).toEqual(['a.txt', 'b.txt']);
});

test('several items open upstream\'s batch rename', async ({ page, loginAs, put, ls, press, longPress, hasTouch, selbar }, info) => {
    const dir = await mkdir(put, info, 'ren4', ['one.txt', 'two.txt']);
    await loginAs('alice');
    await page.goto(dir);

    if (hasTouch) {
        const link = (name) => row(page, name).getByRole('link', { name, exact: true });
        await longPress(link('one.txt'));
        await expect(box(page, 'one.txt')).toBeChecked();
        // forklist.js swallows clicks for 400 ms after a long-press
        await page.waitForTimeout(500);
        await link('two.txt').tap();
    } else {
        await row(page, 'one.txt').click();
        await row(page, 'two.txt').click({ modifiers: ['Control'] });
    }
    await expect(box(page, 'two.txt')).toBeChecked();
    await press(selbar.getByRole('button', { name: 'More actions' }));
    await press(page.getByRole('menu', { name: 'More actions' }).getByRole('menuitem', { name: 'Rename', exact: true }));

    await expect(dlg(page)).toBeHidden();
    const rui = page.locator('#rui');
    await expect(rui).toBeVisible();
    // upstream's panel: a new-name box per item (in list order), then Apply
    await expect(rui.locator('#rn_new_0')).toHaveValue('one.txt');
    await rui.locator('#rn_new_0').fill('uno.txt');
    await rui.locator('#rn_new_1').fill('dos.txt');
    await press(rui.locator('#rn_apply'));
    await expect.poll(async () => (await ls('alice', dir)).files.sort()).toEqual(['dos.txt', 'uno.txt']);
    await expect(rui).toBeHidden();
});

test.describe('on a desktop', () => {
    test.beforeEach(async ({ hasTouch }) => {
        test.skip(hasTouch, 'keyboard');
    });

    test('F2 renames the selected item; Esc closes with focus back', async ({ page, loginAs, put, ls }, info) => {
        const dir = await mkdir(put, info, 'ren5', ['a.txt', 'b.txt']);
        await loginAs('alice');
        await page.goto(dir);

        await row(page, 'a.txt').click();
        await expect(row(page, 'a.txt')).toBeFocused();
        await page.keyboard.press('F2');
        await expect(dlg(page)).toBeVisible();
        await expect(field(page)).toBeFocused();
        expect(await selected(field(page))).toEqual([0, 1]);
        await page.keyboard.press('Escape');
        await expect(dlg(page)).toBeHidden();
        await expect(row(page, 'a.txt')).toBeFocused();
        // Esc closed only the dialog: the selection stays
        await expect(box(page, 'a.txt')).toBeChecked();

        // again, keyboard only, and Enter on an unchanged name just closes
        await page.keyboard.press('F2');
        await expect(field(page)).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(dlg(page)).toBeHidden();

        await page.keyboard.press('F2');
        await page.keyboard.type('c');
        await page.keyboard.press('Enter');
        await expect.poll(async () => (await ls('alice', dir)).files.sort()).toEqual(['b.txt', 'c.txt']);
        await expect(row(page, 'c.txt')).toBeFocused();
    });

    test('F2 with several selected opens upstream\'s batch rename', async ({ page, loginAs, put }, info) => {
        const dir = await mkdir(put, info, 'ren6', ['a.txt', 'b.txt']);
        await loginAs('alice');
        await page.goto(dir);
        await row(page, 'a.txt').click();
        await row(page, 'b.txt').click({ modifiers: ['Control'] });
        await page.keyboard.press('F2');
        await expect(page.locator('#rui')).toBeVisible();
        await expect(dlg(page)).toBeHidden();
    });
});

test.describe('on a phone', () => {
    test.beforeEach(async ({ hasTouch }) => {
        test.skip(!hasTouch, 'touch');
    });

    test('the dialog fits the screen and leaves nothing selected after', async ({ page, loginAs, put, ls }, info) => {
        const dir = await mkdir(put, info, 'ren7', ['photo.jpeg']);
        await loginAs('alice');
        await page.goto(dir);

        await more(page, 'photo.jpeg').tap();
        await menu(page).getByRole('menuitem', { name: 'Rename', exact: true }).tap();
        await expect(dlg(page)).toBeVisible();
        const b = await dlg(page).boundingBox();
        const vp = page.viewportSize();
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(vp.width);
        for (const n of ['Save', 'Cancel']) {
            const bb = await dlg(page).getByRole('button', { name: n, exact: true }).boundingBox();
            expect(bb.height).toBeGreaterThanOrEqual(44);
        }
        expect(await selected(field(page))).toEqual([0, 'photo'.length]);
        await field(page).fill('beach.jpeg');
        await dlg(page).getByRole('button', { name: 'Save', exact: true }).tap();
        await expect(dlg(page)).toBeHidden();
        await expect.poll(async () => (await ls('alice', dir)).files).toEqual(['beach.jpeg']);
        await expect(row(page, 'beach.jpeg')).toBeVisible();
        await expect(box(page, 'beach.jpeg')).not.toBeChecked();
    });
});

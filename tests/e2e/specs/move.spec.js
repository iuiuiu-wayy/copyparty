'use strict';

// Move to…: a folder picker from the selection bar and the row menu, at the current folder,
// with My files and Shared with me as roots, a breadcrumb and New folder; only folders the
// account can write to can be picked; a refusal names the item and the server's reason.
// Drag to move stays a desktop thing (specs/dragmove.spec.js); nothing drags on touch

const { test, expect, row, scratch } = require('../fixtures.js');

const dlg = (page) => page.getByRole('dialog');
const here = (page) => dlg(page).getByRole('button', { name: 'Move here' });
const folder = (page, name) => dlg(page).getByRole('list', { name: 'Folders' }).getByRole('button', { name, exact: true });
const place = (page, name) => dlg(page).getByRole('group', { name: 'Places' }).getByRole('button', { name });
const crumbs = (page) => dlg(page).getByRole('navigation', { name: 'Folder path' });

// a folder of its own per size and scenario, since the sizes run in parallel
async function seed(put, info, what, files) {
    const dir = scratch(info, what);
    for (const f of files)
        await put('alice', dir + f, f + ' ' + info.project.name + '\n');
    return dir;
}

// select rows as a person would: click / Ctrl+click on a desktop, long-press then taps on touch
async function pick(page, hasTouch, longPress, names) {
    for (let i = 0; i < names.length; i++) {
        const r = row(page, names[i]);
        if (hasTouch && !i) {
            await longPress(r);
            // the click that ends a long-press is swallowed for 400 ms (forklist.js); a finger
            // takes longer than that to tap the next row
            await page.waitForTimeout(500);
        }
        else if (hasTouch)
            await r.tap();
        else
            await r.click({ modifiers: i ? ['Control'] : [], position: { x: 200, y: 20 } });
    }
}

// open a folder in the picker by its name
async function into(page, press, name) {
    await press(folder(page, name));
    await expect(crumbs(page).locator('[aria-current]')).toHaveText(name);
}

test('move one file from the selection bar into a subfolder', async ({ page, loginAs, put, ls, press, hasTouch, longPress, selbar }, info) => {
    const dir = await seed(put, info, 'mv1', ['letter.txt', 'archive/keep.txt']);
    await loginAs('alice');
    await page.goto(dir);
    await pick(page, hasTouch, longPress, ['letter.txt']);
    await press(selbar.getByRole('button', { name: 'Move to…' }));

    await expect(dlg(page)).toBeVisible();
    await expect(dlg(page).getByRole('heading')).toHaveText('Move "letter.txt"');
    // it starts at the current folder, under My files
    await expect(crumbs(page).getByRole('button').first()).toHaveText('My files');
    await expect(crumbs(page).locator('[aria-current]')).toHaveText(`mv1-${info.project.name}`);
    // already there: not pickable
    await expect(here(page)).toBeDisabled();
    await into(page, press, 'archive');
    await expect(here(page)).toBeEnabled();
    await press(here(page));

    await expect(dlg(page)).toBeHidden();
    await expect(row(page, 'letter.txt')).toHaveCount(0);
    expect((await ls('alice', dir + 'archive/')).files).toContain('letter.txt');
    expect((await ls('alice', dir)).files).not.toContain('letter.txt');
});

test('move several items and a folder from the row menu, through My files', async ({ page, loginAs, put, ls, press, hasTouch, longPress }, info) => {
    const dir = await seed(put, info, 'mv2', ['a.txt', 'b.txt', 'box/inner.txt', 'stay.txt']);
    const dest = await seed(put, info, 'mv2dst', ['x.txt']);
    await loginAs('alice');
    await page.goto(dir);
    await pick(page, hasTouch, longPress, ['a.txt', 'b.txt', 'box/']);
    if (!hasTouch)
        await row(page, 'a.txt').hover();
    await press(row(page, 'a.txt').getByRole('button', { name: 'Actions for a.txt' }));
    await press(page.getByRole('menu', { name: 'Actions' }).getByRole('menuitem', { name: 'Move to…' }));

    await expect(dlg(page).getByRole('heading')).toHaveText('Move 3 items');
    // the folder being moved can't be opened as a target
    await expect(folder(page, 'box')).toHaveAttribute('aria-disabled', 'true');
    await press(place(page, 'My files'));
    await expect(crumbs(page).locator('[aria-current]')).toHaveText('My files');
    await into(page, press, `mv2dst-${info.project.name}`);
    await press(here(page));

    await expect(dlg(page)).toBeHidden();
    const got = await ls('alice', dest);
    expect(got.files).toEqual(expect.arrayContaining(['a.txt', 'b.txt', 'x.txt']));
    expect(got.dirs).toContain('box');
    expect((await ls('alice', dest + 'box/')).files).toContain('inner.txt');
    expect(await ls('alice', dir)).toEqual({ files: ['stay.txt'], dirs: [] });
});

test('a refused move names the item and the server\'s reason', async ({ page, loginAs, put, ls, press, hasTouch, longPress, selbar }, info) => {
    const dir = await seed(put, info, 'mv3', ['same.txt', 'fine.txt', 'into/same.txt']);
    await loginAs('alice');
    await page.goto(dir);
    await pick(page, hasTouch, longPress, ['same.txt', 'fine.txt']);
    await press(selbar.getByRole('button', { name: 'Move to…' }));
    await into(page, press, 'into');
    await press(here(page));

    const alert = dlg(page).getByRole('alert');
    await expect(alert).toContainText('1 of 2 moved');
    await expect(alert).toContainText('same.txt');
    await expect(alert).toContainText(/exists/i);
    // the dialog stays on what is left
    await expect(dlg(page).getByRole('heading')).toHaveText('Move "same.txt"');
    expect((await ls('alice', dir + 'into/')).files.sort()).toEqual(['fine.txt', 'same.txt']);
    expect((await ls('alice', dir)).files).toEqual(['same.txt']);
    await press(dlg(page).getByRole('button', { name: 'Cancel' }));
    await expect(dlg(page)).toBeHidden();
});

test('only folders the account can write to are pickable; Shared with me is a root', async ({ page, loginAs, put, press, hasTouch, longPress, selbar }, info) => {
    const dir = await seed(put, info, 'mv4', ['doc.txt']);
    await loginAs('alice');
    await page.goto(dir);
    await pick(page, hasTouch, longPress, ['doc.txt']);
    await press(selbar.getByRole('button', { name: 'Move to…' }));
    await press(place(page, 'Shared with me'));
    // bob's grant (read only) and the server's folders
    await expect(folder(page, 'bike from bob')).toBeVisible();
    await expect(here(page)).toBeDisabled();
    await into(page, press, 'common');
    await expect(dlg(page).getByRole('status')).toHaveText("You can't add to this folder.");
    await expect(here(page)).toBeDisabled();
    await expect(dlg(page).getByRole('button', { name: 'New folder' })).toBeDisabled();
    await expect(crumbs(page).getByRole('button').first()).toHaveText('Shared with me');
    await press(crumbs(page).getByRole('button', { name: 'Shared with me' }));
    await into(page, press, 'family');
    await expect(here(page)).toBeEnabled();
});

test('new folder here, then move into it', async ({ page, loginAs, put, ls, press, hasTouch, longPress, selbar }, info) => {
    const dir = await seed(put, info, 'mv5', ['photo.txt']);
    await loginAs('alice');
    await page.goto(dir);
    await pick(page, hasTouch, longPress, ['photo.txt']);
    await press(selbar.getByRole('button', { name: 'Move to…' }));
    await expect(here(page)).toBeDisabled();
    await press(dlg(page).getByRole('button', { name: 'New folder' }));
    const name = dlg(page).getByLabel('New folder name');
    await expect(name).toBeFocused();
    await name.fill('album');
    await press(dlg(page).getByRole('button', { name: 'Create' }));
    await expect(crumbs(page).locator('[aria-current]')).toHaveText('album');
    await press(here(page));
    await expect(dlg(page)).toBeHidden();
    expect((await ls('alice', dir + 'album/')).files).toEqual(['photo.txt']);
});

test.describe('on a desktop', () => {
    test.beforeEach(async ({ hasTouch }) => {
        test.skip(hasTouch, 'keyboard and mouse');
    });

    test('keyboard alone: open, walk into a folder, move; Esc closes with focus back', async ({ page, loginAs, put, ls, selbar }, info) => {
        const dir = await seed(put, info, 'mv6', ['k.txt', 'dest/d.txt']);
        await loginAs('alice');
        await page.goto(dir);
        await row(page, 'k.txt').click({ position: { x: 200, y: 20 } });
        const btn = selbar.getByRole('button', { name: 'Move to…' });
        await btn.focus();
        await page.keyboard.press('Enter');
        await expect(dlg(page)).toBeVisible();
        await expect(folder(page, 'dest')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(dlg(page)).toBeHidden();
        await expect(btn).toBeFocused();

        await page.keyboard.press('Enter');
        await expect(folder(page, 'dest')).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(crumbs(page).locator('[aria-current]')).toHaveText('dest');
        await here(page).focus();
        await page.keyboard.press('Enter');
        await expect(dlg(page)).toBeHidden();
        expect((await ls('alice', dir + 'dest/')).files.sort()).toEqual(['d.txt', 'k.txt']);
    });

    test('a drop target is highlighted while a row is dragged over it', async ({ page, loginAs, put }, info) => {
        const dir = await seed(put, info, 'mv7', ['drag.txt', 'onto/x.txt']);
        await loginAs('alice');
        await page.goto(dir);
        const src = row(page, 'drag.txt');
        await src.hover();
        await page.mouse.down();
        const t = row(page, 'onto/');
        const b = await t.boundingBox();
        await page.mouse.move(b.x + 200, b.y + b.height / 2, { steps: 5 });
        await page.mouse.move(b.x + 210, b.y + b.height / 2, { steps: 2 });
        await expect(t).toHaveCSS('outline-style', 'solid');
        await page.mouse.up();
    });
});

test.describe('on a touch screen', () => {
    test.beforeEach(async ({ hasTouch }) => {
        test.skip(!hasTouch, 'touch');
    });

    test('nothing starts a drag, and the picker fills the screen', async ({ page, loginAs, put, longPress, selbar }, info) => {
        const dir = await seed(put, info, 'mv8', ['t.txt']);
        await loginAs('alice');
        await page.goto(dir);
        const r = row(page, 't.txt');
        await longPress(r);
        await expect(r).not.toHaveAttribute('draggable', 'true');
        await selbar.getByRole('button', { name: 'Move to…' }).tap();
        const b = await dlg(page).boundingBox();
        const vp = page.viewportSize();
        expect(Math.round(b.width)).toBe(vp.width);
        expect(b.height).toBeGreaterThan(vp.height - 2);
        // thumb-reach buttons, at least 44 px
        const h = await here(page).boundingBox();
        expect(h.height).toBeGreaterThanOrEqual(44);
        expect(h.y + h.height).toBeGreaterThan(vp.height - 100);
        const w = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(w).toBeLessThanOrEqual(vp.width);
    });
});

test('an account the server lists no home folder for gets no My files, in the nav or Move to…', async ({ page, loginAs, nav, narrow, press, hasTouch, longPress, selbar }) => {
    // as on a server with no /home volume: /home/ is not a folder
    await page.route(/\/home\/\?ls$/, (r) => r.fulfill({ status: 404, body: 'no such folder' }));
    await loginAs('alice');
    await page.goto('/family/');
    await expect(row(page, 'recipes.txt')).toBeVisible();

    const n = await nav();
    await expect(n.getByRole('link', { name: 'Shared with me' })).toBeVisible();
    await expect(n.getByRole('link', { name: 'My files' })).toBeHidden();
    if (narrow) {
        await page.keyboard.press('Escape');
        await expect(n).toBeHidden();
    }

    await pick(page, hasTouch, longPress, ['recipes.txt']);
    await press(selbar.getByRole('button', { name: 'Move to…' }));
    await expect(dlg(page)).toBeVisible();
    await expect(place(page, 'Shared with me')).toBeVisible();
    await expect(place(page, 'My files')).toBeHidden();
});

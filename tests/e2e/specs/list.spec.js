'use strict';

// the Drive-style list: a click selects, a double-click (or a tap on a phone) opens, a
// long-press starts selecting on a phone, and the selection bar acts on what is selected

const fs = require('fs');
const { test, expect, row, scratch } = require('../fixtures.js');

const box = (page, name) => row(page, name).getByRole('checkbox');
const link = (page, name) => row(page, name).getByRole('link', { name, exact: true });

// a folder of its own per size, since the sizes run in parallel
async function mkdir(put, info, what, files) {
    const dir = scratch(info, what);
    for (const f of files)
        await put('alice', dir + f, f + '\n');
    return dir;
}

test.describe('on a desktop', () => {
    test.beforeEach(async ({ hasTouch }) => {
        test.skip(hasTouch, 'mouse and keyboard');
    });

    test('a click selects one row, Ctrl and Shift extend it', async ({ page, loginAs, put, selbar }, info) => {
        const dir = await mkdir(put, info, 'click', ['a.txt', 'b.txt', 'c.txt', 'd.txt']);
        await loginAs('alice');
        await page.goto(dir);

        await link(page, 'b.txt').click();
        await expect(box(page, 'b.txt')).toBeChecked();
        await expect(page).toHaveURL(new RegExp(dir + '$'));
        await expect(selbar).toBeVisible();
        await expect(selbar.getByText('1 selected')).toBeVisible();

        // a plain click on another row selects only that one
        await row(page, 'c.txt').getByRole('cell').last().click();
        await expect(box(page, 'c.txt')).toBeChecked();
        await expect(box(page, 'b.txt')).not.toBeChecked();

        await link(page, 'a.txt').click({ modifiers: ['ControlOrMeta'] });
        await expect(selbar.getByText('2 selected')).toBeVisible();

        await link(page, 'd.txt').click({ modifiers: ['Shift'] });
        for (const f of ['a.txt', 'b.txt', 'c.txt', 'd.txt'])
            await expect(box(page, f)).toBeChecked();
        await expect(selbar.getByText('4 selected')).toBeVisible();
        // no text got selected on the way
        expect(await page.evaluate(() => String(getSelection()))).toBe('');

        // clear, from the bar: the breadcrumb is back
        await selbar.getByRole('button', { name: 'Clear selection' }).click();
        await expect(selbar).toBeHidden();
        await expect(box(page, 'a.txt')).not.toBeChecked();
    });

    test('a double-click opens a folder, and a file', async ({ page, loginAs }) => {
        await loginAs('alice');
        await page.goto('/home/alice/');

        await link(page, 'proj/').dblclick();
        await expect(page).toHaveURL(/\/home\/alice\/proj\/$/);
        await expect(row(page, 'plan.txt')).toBeVisible();

        // a text file opens in upstream's text viewer
        await link(page, 'plan.txt').dblclick();
        await expect(page.getByText('step 1: start')).toBeVisible();
        await expect(page).toHaveURL(/\/home\/alice\/proj\/\?doc=plan\.txt$/);
    });

    test('names stay links: a middle-click opens a new tab', async ({ page, loginAs, browserName }) => {
        test.skip(browserName !== 'chromium', 'new-tab gestures are Chromium-only in Playwright');
        await loginAs('alice');
        await page.goto('/home/alice/');

        await expect(link(page, 'notes.txt')).toHaveAttribute('href', /notes\.txt$/);
        const [tab] = await Promise.all([
            page.context().waitForEvent('page'),
            link(page, 'notes.txt').click({ button: 'middle' }),
        ]);
        await expect.poll(() => tab.url()).toMatch(/\/home\/alice\/notes\.txt$/);
        // and the click didn't select it
        await expect(box(page, 'notes.txt')).not.toBeChecked();
    });

    test('keyboard: Enter opens, Ctrl+A selects all, Esc clears, Delete asks', async ({ page, loginAs, put, selbar }, info) => {
        const dir = await mkdir(put, info, 'keys', ['k1.txt', 'k2.txt', 'sub/x.txt']);
        await loginAs('alice');
        await page.goto(dir);
        await expect(row(page, 'k1.txt')).toBeVisible();

        await page.keyboard.press('ControlOrMeta+a');
        await expect(selbar.getByText('3 selected')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(selbar).toBeHidden();

        await link(page, 'k2.txt').click();
        page.once('dialog', (d) => d.dismiss());
        await page.keyboard.press('Delete');
        await expect(page.getByText('Delete 1 item forever?')).toBeVisible();
        await page.keyboard.press('Escape');

        await row(page, 'sub/').focus();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(new RegExp(dir + 'sub/$'));
        await expect(row(page, 'x.txt')).toBeVisible();
    });

    test('a checkbox shows on hover or once selected', async ({ page, loginAs }) => {
        await loginAs('alice');
        await page.goto('/home/alice/');
        const b = box(page, 'notes.txt');
        await expect(b).toHaveCSS('opacity', '0');
        await row(page, 'notes.txt').hover();
        await expect(b).toHaveCSS('opacity', '1');
        await expect(b).toHaveAccessibleName('Select notes.txt');
    });
});

test.describe('on a phone', () => {
    test.beforeEach(async ({ hasTouch }) => {
        test.skip(!hasTouch, 'touch');
    });

    test('a tap opens a folder', async ({ page, loginAs }) => {
        await loginAs('alice');
        await page.goto('/home/alice/');
        await row(page, 'proj/').getByRole('cell').last().tap();
        await expect(page).toHaveURL(/\/home\/alice\/proj\/$/);
        await expect(row(page, 'plan.txt')).toBeVisible();
    });

    test('a long-press selects, then taps add to it', async ({ page, loginAs, put, longPress, selbar }, info) => {
        const dir = await mkdir(put, info, 'hold', ['h1.txt', 'h2.txt', 'h3.txt']);
        await loginAs('alice');
        await page.goto(dir);

        await longPress(link(page, 'h1.txt'));
        await expect(box(page, 'h1.txt')).toBeChecked();
        await expect(selbar.getByText('1 selected')).toBeVisible();
        await expect(page).toHaveURL(new RegExp(dir + '$'));
        // no text selection and no browser callout on the way
        expect(await page.evaluate(() => String(getSelection()))).toBe('');
        await expect(row(page, 'h1.txt')).toHaveCSS('user-select', 'none');

        await link(page, 'h3.txt').tap();
        await expect(selbar.getByText('2 selected')).toBeVisible();
        await expect(page).toHaveURL(new RegExp(dir + '$'));
        await link(page, 'h1.txt').tap();
        await expect(selbar.getByText('1 selected')).toBeVisible();
        await expect(box(page, 'h3.txt')).toBeChecked();
    });
});

test('the list shows name, modified and size, folders first', async ({ page, loginAs }) => {
    await loginAs('alice');
    await page.goto('/home/alice/');
    await expect(row(page, 'notes.txt')).toBeVisible();

    const names = await page.locator('#files tbody tr').evaluateAll((trs) =>
        trs.map((tr) => tr.cells[1].textContent.trim()));
    const firstFile = names.findIndex((n) => !n.endsWith('/'));
    expect(names.slice(firstFile).every((n) => !n.endsWith('/'))).toBe(true);

    const r = row(page, 'notes.txt');
    await expect(r).toContainText(/\d{4}-\d\d-\d\d/);
    await expect(r).toContainText('21');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the selection bar deletes exactly what is selected, also after a sort', async (
    { page, loginAs, put, ls, press, selbar, longPress, hasTouch }, info) => {
    const dir = await mkdir(put, info, 'del', ['a1.txt', 'b2.txt', 'c3.txt', 'd4.txt']);
    await loginAs('alice');
    await page.goto(dir);
    await expect(row(page, 'a1.txt')).toBeVisible();

    await press(box(page, 'b2.txt'));
    await press(box(page, 'c3.txt'));
    // sort by name, twice: right after a sort upstream's list of selected files has each twice
    const th = page.locator('#files thead th[name=href] span');
    await press(th);
    await press(th);
    await expect(selbar.getByText('2 selected')).toBeVisible();

    await press(selbar.getByRole('button', { name: 'Delete' }));
    await expect(page.getByText('Delete 2 items forever?')).toBeVisible();
    const ok = page.getByRole('link', { name: 'OK', exact: true });
    await press(ok);
    // upstream's second ask, unless quick delete is on in its settings
    await page.getByText('Last chance!').waitFor({ timeout: 2000 }).then(() => press(ok), () => null);

    await expect.poll(async () => (await ls('alice', dir)).files.sort()).toEqual(['a1.txt', 'd4.txt']);
    await expect(row(page, 'b2.txt')).toHaveCount(0);
    await expect(selbar).toBeHidden();
});

test('the selection bar downloads the selected file', async ({ page, loginAs, press, selbar }) => {
    await loginAs('alice');
    await page.goto('/home/alice/proj/');
    await press(box(page, 'plan.txt'));
    const [dl] = await Promise.all([
        page.waitForEvent('download'),
        press(selbar.getByRole('button', { name: 'Download' })),
    ]);
    expect(dl.suggestedFilename()).toBe('plan.txt');
    expect(fs.readFileSync(await dl.path(), 'utf8')).toBe('step 1: start\n');
});

test('copy and paste from the selection bar copies the file', async ({ page, loginAs, put, ls, press, open, selbar }, info) => {
    const dir = await mkdir(put, info, 'cpy', ['src.txt', 'to/keep.txt']);
    await loginAs('alice');
    await page.goto(dir);

    await press(box(page, 'src.txt'));
    await press(selbar.getByRole('button', { name: 'More actions' }));
    const menu = page.getByRole('menu', { name: 'More actions' });
    for (const name of ['Rename', 'Copy', 'Cut', 'Download as zip', 'Select all'])
        await expect(menu.getByRole('menuitem', { name, exact: true })).toBeVisible();
    await press(menu.getByRole('menuitem', { name: 'Copy', exact: true }));
    // copying ends the selection, so a tap opens again
    await expect(box(page, 'src.txt')).not.toBeChecked();

    await open(link(page, 'to/'));
    await expect(row(page, 'keep.txt')).toBeVisible();
    // nothing selected here, but the bar offers the paste
    await expect(selbar.getByText('1 to paste')).toBeVisible();
    await press(selbar.getByRole('button', { name: 'Paste here' }));
    await press(page.getByRole('link', { name: 'OK', exact: true }));

    await expect.poll(async () => (await ls('alice', dir + 'to/')).files.sort()).toEqual(['keep.txt', 'src.txt']);
    expect((await ls('alice', dir)).files).toContain('src.txt');
});

test('the bar fits the screen and its buttons are big enough to tap', async ({ page, loginAs, press, selbar }) => {
    await loginAs('alice');
    await page.goto('/home/alice/');
    await press(box(page, 'notes.txt'));
    await expect(selbar).toBeVisible();
    for (const name of ['Clear selection', 'Share', 'Download', 'Move to…', 'Delete', 'More actions']) {
        const b = selbar.getByRole('button', { name, exact: true });
        await expect(b).toBeInViewport({ ratio: 1 });
        const bb = await b.boundingBox();
        expect(Math.min(bb.width, bb.height)).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('search results still list and select', async ({ page, loginAs, press, selbar, tool }) => {
    await loginAs('alice');
    await page.goto('/home/alice/');
    await expect(row(page, 'notes.txt')).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search' }).fill('plan');
    await page.getByRole('searchbox', { name: 'Search' }).press('Enter');
    const hit = page.locator('#files tbody tr:not(.srch_hdr)').filter({ hasText: 'plan.txt' });
    await expect(hit).toBeVisible();
    await press(hit.getByRole('checkbox'));
    await expect(selbar.getByText('1 selected')).toBeVisible();
});

test('grid view still shows the files, and selects', async ({ page, loginAs, selbar, hasTouch }) => {
    test.skip(hasTouch, 'its hotkeys need a keyboard');
    await loginAs('alice');
    await page.goto('/home/alice/proj/');
    await expect(row(page, 'plan.txt')).toBeVisible();

    await page.keyboard.press('g');
    const tile = page.locator('#fk-grid').getByRole('link', { name: 'plan.txt', exact: true });
    await expect(tile).toBeVisible();
    await expect(row(page, 'plan.txt')).toBeHidden();

    await page.keyboard.press('ControlOrMeta+a');
    await expect(selbar.getByText('1 selected')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(selbar).toBeHidden();

    await page.keyboard.press('g');
    await expect(row(page, 'plan.txt')).toBeVisible();
});

'use strict';

// the breadcrumb (ticket 12): its last part, the current folder, opens the folder menu
// (New folder, Upload files, Upload folder, Share, Rename, Download), each hidden where it isn't
// allowed; earlier parts navigate and take a drag-to-move drop; on a phone the parts between
// the first and the current folder collapse into a "…" menu, so the trail fits on one line

const { test, expect, row } = require('../fixtures.js');

const crumbs = (page) => page.getByRole('navigation', { name: 'Breadcrumbs' });
const current = (page) => crumbs(page).locator('[aria-current=page]');
const fmenu = (page) => page.getByRole('menu', { name: 'Folder actions' });
const parts = (page) => crumbs(page).getByRole('listitem');

// a folder tree of its own per size and browser, since they run in parallel
async function tree(put, info, what, files) {
    const dir = `/home/alice/${what}-${info.project.name}/`;
    for (const f of files)
        await put('alice', dir + f, f + '\n');
    return dir;
}

async function openmenu(page, press) {
    await press(current(page));
    await expect(fmenu(page)).toBeVisible();
    return fmenu(page);
}

test('the current folder opens the folder menu with every entry', async ({ page, loginAs, put, press, narrow }, info) => {
    const dir = await tree(put, info, 'fm1', ['sub/a.txt']);
    await loginAs('alice');
    await page.goto(dir + 'sub/');
    await expect(row(page, 'a.txt')).toBeVisible();

    await expect(current(page)).toHaveText('sub');
    await expect(current(page)).toHaveAttribute('aria-haspopup', 'menu');
    const m = await openmenu(page, press);
    await expect(current(page)).toHaveAttribute('aria-expanded', 'true');
    // phones can't pick a folder (upstream offers it only on a desktop)
    await expect(m.getByRole('menuitem')).toHaveText(narrow ?
        ['New folder', 'Upload files', 'Share', 'Rename', 'Download'] :
        ['New folder', 'Upload files', 'Upload folder', 'Share', 'Rename', 'Download']);
    // the current folder as a zip (upstream's own folder download)
    await expect(m.getByRole('menuitem', { name: 'Download' })).toHaveAttribute('href', /\/sub\/\?zip/);
    await page.keyboard.press('Escape');
    await expect(fmenu(page)).toBeHidden();
    await expect(current(page)).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('New folder and Upload files work on the current folder', async ({ page, loginAs, put, ls, press }, info) => {
    const dir = await tree(put, info, 'fm2', ['seed.txt']);
    await loginAs('alice');
    await page.goto(dir);
    await expect(row(page, 'seed.txt')).toBeVisible();

    let m = await openmenu(page, press);
    await press(m.getByRole('menuitem', { name: 'New folder' }));
    const dlg = page.getByRole('dialog', { name: 'New folder' });
    await expect(dlg).toBeVisible();
    await page.keyboard.type('made here');
    await page.keyboard.press('Enter');
    await expect(dlg).toBeHidden();
    await expect.poll(async () => (await ls('alice', dir)).dirs).toEqual(['made here']);

    m = await openmenu(page, press);
    const chooser = page.waitForEvent('filechooser');
    await press(m.getByRole('menuitem', { name: 'Upload files' }));
    await (await chooser).setFiles([{
        name: 'up-' + info.project.name + '.txt', mimeType: 'text/plain', buffer: Buffer.from('fm2 ' + info.project.name),
    }]);
    // upstream's "upload N files to ...?" confirm
    await press(page.getByRole('link', { name: 'OK', exact: true }));
    await expect.poll(async () => (await ls('alice', dir)).files.sort(), { timeout: 20000 })
        .toEqual(['seed.txt', 'up-' + info.project.name + '.txt']);
});

test('Share opens the Share dialog on the current folder', async ({ page, loginAs, put, press }, info) => {
    const dir = await tree(put, info, 'fm3', ['pics/a.txt']);
    await loginAs('alice');
    await page.goto(dir + 'pics/');
    await expect(row(page, 'a.txt')).toBeVisible();

    const m = await openmenu(page, press);
    await press(m.getByRole('menuitem', { name: 'Share' }));
    const dlg = page.getByRole('dialog', { name: 'Share “pics”' });
    await expect(dlg).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(current(page)).toBeFocused();
});

test('Rename renames the current folder and goes there', async ({ page, loginAs, put, ls, press }, info) => {
    const dir = await tree(put, info, 'fm4', ['old/a.txt']);
    await loginAs('alice');
    await page.goto(dir + 'old/');
    await expect(row(page, 'a.txt')).toBeVisible();

    const m = await openmenu(page, press);
    await press(m.getByRole('menuitem', { name: 'Rename' }));
    const dlg = page.getByRole('dialog', { name: 'Rename' });
    const field = dlg.getByRole('textbox', { name: 'New name' });
    await expect(field).toHaveValue('old');
    await field.fill('new one');
    await page.keyboard.press('Enter');
    await expect(dlg).toBeHidden();

    await expect.poll(async () => (await ls('alice', dir)).dirs).toEqual(['new one']);
    await expect(page).toHaveURL(new RegExp(dir + 'new%20one/$'));
    await expect(current(page)).toHaveText('new one');
    await expect(row(page, 'a.txt')).toBeVisible();
});

test('entries are hidden where they are not allowed', async ({ page, loginAs, put, press }, info) => {
    // four folders, each loaded and its menu opened
    test.slow();
    await put('alice', `/family/fm-${info.project.name}/r.txt`, 'r\n');
    await loginAs('alice');
    // My files itself can't be renamed (it is a volume), and alice may do the rest there
    await page.goto('/home/alice/');
    await expect(row(page, 'notes.txt')).toBeVisible();
    await expect(current(page)).toHaveText('My files');
    let m = await openmenu(page, press);
    await expect(m.getByRole('menuitem', { name: 'Rename' })).toHaveCount(0);
    await expect(m.getByRole('menuitem', { name: 'New folder' })).toHaveCount(1);
    await page.keyboard.press('Escape');

    // /family is a volume too; a folder in it can be renamed (its parent takes writes)
    await page.goto('/family/');
    await expect(row(page, 'recipes.txt')).toBeVisible();
    m = await openmenu(page, press);
    await expect(m.getByRole('menuitem', { name: 'New folder' })).toHaveCount(1);
    await expect(m.getByRole('menuitem', { name: 'Rename' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.goto(`/family/fm-${info.project.name}/`);
    await expect(row(page, 'r.txt')).toBeVisible();
    m = await openmenu(page, press);
    await expect(m.getByRole('menuitem', { name: 'Rename' })).toHaveCount(1);
    await page.keyboard.press('Escape');

    // /common is read-only for her: nothing to create or rename, only Share (as the
    // selection bar offers it there) and Download
    await page.goto('/common/');
    await expect(row(page, 'welcome.txt')).toBeVisible();
    m = await openmenu(page, press);
    await expect(m.getByRole('menuitem')).toHaveText(['Share', 'Download']);
});

test('earlier parts navigate: My files, a parent, Shared with me', async ({ page, loginAs, put, press }, info) => {
    const dir = await tree(put, info, 'fm5', ['b/c/x.txt']);
    await loginAs('alice');
    await page.goto(dir + 'b/c/');
    await expect(row(page, 'x.txt')).toBeVisible();

    // on a phone the middle parts sit in the "…" menu
    const reach = async (name) => {
        const a = crumbs(page).getByRole('link', { name, exact: true });
        if (await a.isVisible())
            return press(a);
        await press(crumbs(page).getByRole('button', { name: 'Show the folders in between' }));
        await press(page.getByRole('menu', { name: 'Folders in between' }).getByRole('menuitem', { name, exact: true }));
    };

    await reach('b');
    await expect(page).toHaveURL(new RegExp(dir + 'b/$'));
    await expect(row(page, 'c/')).toBeVisible();
    await expect(current(page)).toHaveText('b');

    await press(crumbs(page).getByRole('link', { name: 'My files', exact: true }));
    await expect(page).toHaveURL(/\/home\/alice\/$/);
    await expect(row(page, 'notes.txt')).toBeVisible();

    // a folder outside My files starts at Shared with me, which opens that view
    await page.goto('/family/');
    await expect(row(page, 'recipes.txt')).toBeVisible();
    await expect(parts(page).first()).toHaveText('Shared with me');
    await expect(current(page)).toHaveText('family');
    await press(crumbs(page).getByRole('link', { name: 'Shared with me', exact: true }));
    await expect(page.getByRole('heading', { name: 'Shared with me' })).toBeVisible();
});

test('the trail is a list of links with decorative separators', async ({ page, loginAs, put }, info) => {
    const dir = await tree(put, info, 'fm6', ['p/q.txt']);
    await loginAs('alice');
    await page.goto(dir + 'p/');
    await expect(row(page, 'q.txt')).toBeVisible();
    // My files > fm6-x > p
    await expect(parts(page)).toHaveCount(3);
    await expect(parts(page).first()).toHaveText('My files');
    // nothing of upstream's breadcrumb is left showing
    await expect(page.locator('#path > a:not(#entree), #path > i')).toHaveCount(0);
});

test.describe('desktop', () => {
    test.skip(({ hasTouch }) => hasTouch, 'desktop only');

    test('a row dragged onto a breadcrumb part moves there', async ({ page, loginAs, put, ls }, info) => {
        const dir = await tree(put, info, 'fm7', ['in/letter.txt']);
        await loginAs('alice');
        await page.goto(dir + 'in/');
        await row(page, 'letter.txt').getByRole('link', { name: 'letter.txt', exact: true })
            .dragTo(crumbs(page).getByRole('link', { name: 'fm7-' + info.project.name, exact: true }));
        await expect(row(page, 'letter.txt')).toHaveCount(0);
        expect((await ls('alice', dir)).files).toContain('letter.txt');
    });

    test('keyboard only: Enter opens the menu on its first entry, Esc gives focus back', async ({ page, loginAs, put }, info) => {
        const dir = await tree(put, info, 'fm8', ['k/a.txt']);
        await loginAs('alice');
        await page.goto(dir + 'k/');
        await expect(row(page, 'a.txt')).toBeVisible();
        await current(page).focus();
        await page.keyboard.press('Enter');
        await expect(fmenu(page)).toBeVisible();
        await expect(fmenu(page).getByRole('menuitem').first()).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(fmenu(page).getByRole('menuitem').nth(1)).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(fmenu(page)).toBeHidden();
        await expect(current(page)).toBeFocused();
    });

    test('a long path shows every part on a desktop', async ({ page, loginAs, put }, info) => {
        const dir = await tree(put, info, 'fm9', ['a/b/c/d/x.txt']);
        await loginAs('alice');
        await page.goto(dir + 'a/b/c/d/');
        await expect(row(page, 'x.txt')).toBeVisible();
        for (const n of ['My files', 'fm9-' + info.project.name, 'a', 'b', 'c'])
            await expect(crumbs(page).getByRole('link', { name: n, exact: true })).toBeVisible();
        await expect(crumbs(page).getByRole('button', { name: 'Show the folders in between' })).toBeHidden();
    });
});

test.describe('phone', () => {
    test.skip(({ hasTouch }) => !hasTouch, 'touch only');

    test('a deep path fits on one line, with the Layout toggle, and every part is reachable', async ({ page, loginAs, put, press }, info) => {
        const dir = await tree(put, info, 'fm10-a-rather-long-folder-name', ['second-long-folder-name/third/fourth/x.txt']);
        await loginAs('alice');
        await page.goto(dir + 'second-long-folder-name/third/fourth/');
        await expect(row(page, 'x.txt')).toBeVisible();

        // one line: every visible part and the Layout toggle share a row
        const boxes = await page.evaluate(() => {
            const vis = (e) => e.getClientRects().length && getComputedStyle(e).visibility != 'hidden';
            const els = [...document.querySelectorAll('nav[aria-label=Breadcrumbs] li')].filter(vis);
            const t = document.querySelector('.fk-layout');
            if (t && vis(t))
                els.push(t);
            return els.map((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, right: r.right }; });
        });
        expect(boxes.length).toBeGreaterThan(2);
        const mid = (b) => (b.top + b.bottom) / 2;
        for (const b of boxes) {
            expect(Math.abs(mid(b) - mid(boxes[0]))).toBeLessThan(12);
            expect(b.right).toBeLessThanOrEqual(page.viewportSize().width);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

        // the first part, "…" and the current folder, which isn't cut short
        await expect(crumbs(page).getByRole('link', { name: 'My files', exact: true })).toBeVisible();
        await expect(crumbs(page).getByRole('link', { name: 'third', exact: true })).toBeHidden();
        expect(await current(page).evaluate((b) => b.querySelector('.fk-cname').scrollWidth <= b.querySelector('.fk-cname').clientWidth)).toBe(true);
        await expect(current(page)).toHaveText('fourth');
        const dots = crumbs(page).getByRole('button', { name: 'Show the folders in between' });
        await expect(dots).toBeVisible();
        const box = await dots.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect((await current(page).boundingBox()).height).toBeGreaterThanOrEqual(44);

        await press(dots);
        const mm = page.getByRole('menu', { name: 'Folders in between' });
        await expect(mm.getByRole('menuitem')).toHaveText(['fm10-a-rather-long-folder-name-' + info.project.name, 'second-long-folder-name', 'third']);
        await press(mm.getByRole('menuitem', { name: 'second-long-folder-name' }));
        await expect(page).toHaveURL(new RegExp(dir + 'second-long-folder-name/$'));
        await expect(current(page)).toHaveText('second-long-folder-name');
    });

    test('the folder menu is a bottom sheet with 44 px entries', async ({ page, loginAs, put, press }, info) => {
        const dir = await tree(put, info, 'fm11', ['s/a.txt']);
        await loginAs('alice');
        await page.goto(dir + 's/');
        await expect(row(page, 'a.txt')).toBeVisible();
        const m = await openmenu(page, press);
        const vp = page.viewportSize();
        const b = await m.boundingBox();
        expect(Math.round(b.y + b.height)).toBeGreaterThanOrEqual(vp.height - 2);
        for (const it of await m.getByRole('menuitem').all())
            expect((await it.boundingBox()).height).toBeGreaterThanOrEqual(44);
    });
});

test('a guest on a share link: the trail starts at the link, and the menu holds what the link allows', async ({ page, server, press }) => {
    await page.goto(server.share);
    await expect(row(page, 'budget.xlsx')).toBeVisible();
    await expect(parts(page)).toHaveCount(1);
    await expect(current(page)).toHaveText('e2etripshare01');
    const m = await openmenu(page, press);
    await expect(m.getByRole('menuitem')).toHaveText(['Download']);
});

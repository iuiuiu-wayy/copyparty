'use strict';

// the Share dialog's General access part: share links made, listed, copied and removed from
// the selection bar and the row menu; the server's refusals shown; guests see none of it

const { test, expect, row } = require('../fixtures.js');
const { session } = require('../server.js');

const dialog = (page) => page.getByRole('dialog');
const general = (page) => dialog(page).getByLabel('Who can open it');
const links = (page) => dialog(page).getByRole('list', { name: 'Links' }).getByRole('listitem');

// a folder of its own per size, since the sizes run in parallel
async function mkdir(put, info, what, files) {
    const dir = `/home/alice/${what}-${info.project.name}/`;
    await Promise.all(files.map((f) => put('alice', dir + f, f + '\n')));
    return dir;
}

// the share links the server holds on a folder (or on a file in it), as alice
async function held(server, vp, file) {
    const s = await session(server.url, 'alice');
    const j = await (await s.get('/?shares&j')).json();
    const want = vp.replace(/^\/|\/$/g, '');
    return j.rows.filter((r) => r.vp.replace(/^\//, '') === want &&
        (file ? r.files.includes(file) : !r.files.length));
}

// pick a row the way a person does: its checkbox (a click on a desktop, a tap on a phone)
async function pick(page, press, name) {
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

test('make a share link of a folder, copy it and remove it', async ({ page, loginAs, put, press, selbar, server, browserName }, info) => {
    const dir = await mkdir(put, info, 'shlink', ['a.txt']);
    const parent = '/home/alice/';
    const name = dir.slice(parent.length, -1);
    if (browserName === 'chromium')
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await loginAs('alice');
    await page.goto(parent);

    await pick(page, press, name + '/');
    await press(selbar.getByRole('button', { name: 'Share' }));
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole('heading', { name: `Share “${name}”` })).toBeVisible();
    await inview(page, dialog(page));
    await expect(general(page)).toHaveValue('no');
    await expect(dialog(page).getByText('Only people with access can open it.')).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: 'Create link' })).toBeHidden();

    await general(page).selectOption('any');
    await dialog(page).getByLabel('Access').selectOption({ label: 'Viewer and uploader' });
    await dialog(page).getByLabel('Password (optional)').fill('pw4link');
    await dialog(page).getByLabel('Expires').selectOption({ label: '1 day' });
    const create = dialog(page).getByRole('button', { name: 'Create link' });
    const cb = await create.boundingBox();
    expect(cb.height).toBeGreaterThanOrEqual(44);
    await press(create);

    await expect(links(page)).toHaveCount(1);
    await expect(dialog(page).getByRole('status')).toHaveText(/Link created/);
    let rows = await held(server, dir);
    expect(rows).toHaveLength(1);
    expect(rows[0].pw).toBe(true);
    expect(rows[0].pr).toBe('rw');
    expect(rows[0].t1 - rows[0].t0).toBeGreaterThan(23 * 3600);
    expect(rows[0].t1 - rows[0].t0).toBeLessThan(25 * 3600);
    const k = rows[0].k;
    await expect(links(page).first().getByRole('textbox')).toHaveValue(rows[0].url);
    await expect(links(page).first()).toContainText('Viewer and uploader · password · expires in');

    await press(links(page).first().getByRole('button', { name: 'Copy link' }));
    await expect(dialog(page).getByRole('status')).toHaveText(/Link copied/);
    if (browserName === 'chromium')
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(rows[0].url);

    // the link opens the folder for a guest, with the password
    const g = await page.context().browser().newContext();
    const gp = await g.newPage();
    await gp.goto(rows[0].url);
    await expect(gp.getByText(/password/i).first()).toBeVisible();
    await g.close();

    await press(links(page).first().getByRole('button', { name: 'Remove link ' + k }));
    await expect(dialog(page).getByRole('status')).toHaveText(/Link removed/);
    await expect(links(page)).toHaveCount(0);
    await expect(general(page)).toHaveValue('no');
    expect(await held(server, dir)).toHaveLength(0);
});

test('a file gets a view-only link from the row menu', async ({ page, loginAs, put, press, server }, info) => {
    const dir = await mkdir(put, info, 'shfile', ['doc.txt', 'other.txt']);
    await loginAs('alice');
    await page.goto(dir);

    await press(row(page, 'doc.txt').getByRole('button', { name: 'Actions for doc.txt' }));
    await press(page.getByRole('menu', { name: 'Actions' }).getByRole('menuitem', { name: 'Share', exact: true }));
    await expect(dialog(page).getByRole('heading', { name: 'Share “doc.txt”' })).toBeVisible();

    await general(page).selectOption('any');
    // a file can't take uploads: only Viewer is offered
    const roles = await dialog(page).getByLabel('Access').locator('option').allInnerTexts();
    expect(roles).toEqual(['Viewer']);
    await press(dialog(page).getByRole('button', { name: 'Create link' }));
    await expect(links(page)).toHaveCount(1);

    const rows = await held(server, dir, 'doc.txt');
    expect(rows).toHaveLength(1);
    expect(rows[0].files).toEqual(['doc.txt']);
    expect(rows[0].pr).toBe('r');
    expect(rows[0].url).toMatch(/\/doc\.txt$/);
    // another file in the folder has no link
    expect(await held(server, dir, 'other.txt')).toHaveLength(0);

    // Esc closes it and gives focus back to the row's ⋮
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
});

test('the folder\'s existing links are listed, and a refusal is shown as given', async ({ page, loginAs, press, selbar }) => {
    await loginAs('alice');
    await page.goto('/home/alice/');
    await pick(page, press, 'trip/');
    await press(selbar.getByRole('button', { name: 'Share' }));

    // the seeded link (read + get, no password, never expires)
    await expect(general(page)).toHaveValue('any');
    await expect(links(page)).toHaveCount(1);
    await expect(links(page).first().getByRole('textbox')).toHaveValue(/\/share\/e2etripshare01\/$/);
    await expect(links(page).first()).toContainText('Viewer · never expires');

    // a second link named like the first: the server refuses, and says why
    await press(dialog(page).getByRole('button', { name: 'Another link' }));
    await dialog(page).getByLabel('Link name (optional)').fill('e2etripshare01');
    await press(dialog(page).getByRole('button', { name: 'Create link' }));
    await expect(dialog(page).getByRole('alert')).toHaveText(/sharekey 'e2etripshare01' is already in use/);
    await expect(links(page)).toHaveCount(1);

    // Done closes it; nothing was removed
    await press(dialog(page).getByRole('button', { name: 'Done' }));
    await expect(dialog(page)).toBeHidden();
});

test('Restricted removes the links, after asking', async ({ page, loginAs, put, press, selbar, server }, info) => {
    const dir = await mkdir(put, info, 'shoff', ['x.txt']);
    const s = await session(server.url, 'alice');
    for (const k of ['a', 'b'])
        expect((await s.postJson('/?share', {
            k: `e2eoff${k}${info.project.name.replace(/[^a-z]/g, '')}`, vp: [dir], pw: '', exp: '', perms: ['read'],
        })).status).toBe(201);
    await loginAs('alice');
    await page.goto('/home/alice/');
    await pick(page, press, dir.slice('/home/alice/'.length));
    await press(selbar.getByRole('button', { name: 'Share' }));
    await expect(links(page)).toHaveCount(2);

    await general(page).selectOption('no');
    const keep = dialog(page).getByRole('button', { name: 'Keep' });
    await expect(keep).toBeFocused();
    await expect(dialog(page).getByText('Remove all 2 links?')).toBeVisible();
    await press(keep);
    await expect(general(page)).toHaveValue('any');
    expect(await held(server, dir)).toHaveLength(2);

    await general(page).selectOption('no');
    await press(dialog(page).getByRole('button', { name: 'Remove 2 links' }));
    await expect(dialog(page).getByRole('status')).toHaveText(/2 links removed/);
    await expect(links(page)).toHaveCount(0);
    expect(await held(server, dir)).toHaveLength(0);
});

test('copy link works without the Clipboard API', async ({ page, loginAs, press, selbar, browserName }) => {
    // plain http on the LAN is no secure context, so navigator.clipboard is missing there
    await page.addInitScript(() => {
        Object.defineProperty(window, 'isSecureContext', { value: false });
    });
    if (browserName === 'chromium')
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await loginAs('alice');
    await page.goto('/home/alice/');
    await pick(page, press, 'trip/');
    await press(selbar.getByRole('button', { name: 'Share' }));
    await press(links(page).first().getByRole('button', { name: 'Copy link' }));
    await expect(dialog(page).getByRole('status')).toHaveText(/Link copied/);
    if (browserName === 'chromium')
        expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/share\/e2etripshare01\/$/);
});

test('the dialog fits the screen and gives focus back', async ({ page, loginAs, press, selbar }) => {
    await loginAs('alice');
    await page.goto('/home/alice/');
    await pick(page, press, 'trip/');
    const b = selbar.getByRole('button', { name: 'Share' });
    await press(b);
    await expect(links(page)).toHaveCount(1);
    await inview(page, dialog(page));
    for (const n of ['Copy link', 'Done']) {
        const bb = await dialog(page).getByRole('button', { name: n }).first().boundingBox();
        expect(bb.height).toBeGreaterThanOrEqual(44);
    }
    await expect(general(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await expect(b).toBeFocused();
});

test('a guest on a share link sees no Share and asks for no link list', async ({ page, server }) => {
    const asked = [];
    page.on('request', (r) => {
        if (/[?&](shares|share|eshare)\b/.test(r.url()))
            asked.push(r.url());
    });
    await page.goto(server.share);
    await expect(row(page, 'budget.xlsx')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Share' })).toHaveCount(0);
    await page.keyboard.press('s');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(asked).toEqual([]);
});

test('a link from a folder that takes none is refused, with the server\'s reason', async ({ page, loginAs, press, selbar }) => {
    // bob can read what alice granted him, but a grant takes no share links (the server's
    // shr_who for it is "no"); upstream still offers Share there, so the refusal is shown
    await loginAs('bob');
    await page.goto('/shared/alice/proj/');
    await pick(page, press, 'plan.txt');
    await press(selbar.getByRole('button', { name: 'Share' }));
    await general(page).selectOption('any');
    await press(dialog(page).getByRole('button', { name: 'Create link' }));
    await expect(dialog(page).getByRole('alert')).toHaveText('you dont have perms to create shares from this volume');
    await expect(links(page)).toHaveCount(0);
});

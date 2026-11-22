'use strict';

// the Share dialog's Add people part: a folder given to an account or a group (a grant),
// listed and revoked; a file can't be; the server's refusals shown; a grant offers no Share

const { test, expect, row } = require('../fixtures.js');
const { session, ACCOUNTS } = require('../server.js');

const dialog = (page) => page.getByRole('dialog');
const who = (page) => dialog(page).getByLabel('Add a person or group');
const people = (page) => dialog(page).getByRole('list', { name: 'Shared with' }).getByRole('listitem');

// a folder of its own per size, since the sizes run in parallel
async function mkdir(put, info, what, files) {
    const dir = `/home/alice/${what}-${info.project.name}/`;
    await Promise.all(files.map((f) => put('alice', dir + f, f + '\n')));
    return dir;
}

// the grants the server holds on a folder, as alice sees them on her grants list
async function held(server, src) {
    const s = await session(server.url, 'alice');
    const r = await s.get('/?grants&j');
    expect(r.status).toBe(200);
    return (await r.json()).rows.filter((x) => x.src === src);
}

async function inview(page, loc) {
    const b = await loc.boundingBox();
    const vp = page.viewportSize();
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(vp.width + 0.5);
    expect(b.y + b.height).toBeLessThanOrEqual(vp.height + 0.5);
}

test('give a folder to a person; they open it; take it back', async ({ page, loginAs, put, press, selbar, server, browser }, info) => {
    // a grant and its revoke each reload the server, and a second browser opens it: past 30 s
    // under load in Firefox
    test.slow();
    const dir = await mkdir(put, info, 'ppl', ['a.txt']);
    const name = dir.slice('/home/alice/'.length, -1);
    await loginAs('alice');
    await page.goto('/home/alice/');

    await press(row(page, name + '/').getByRole('checkbox'));
    const share = selbar.getByRole('button', { name: 'Share' });
    await press(share);
    await expect(dialog(page).getByRole('heading', { name: 'Add people and groups' })).toBeVisible();
    await expect(who(page)).toBeFocused();
    await expect(people(page)).toHaveCount(0);
    await inview(page, dialog(page));

    await who(page).selectOption('bob');
    await press(dialog(page).getByRole('radio', { name: 'Viewer and uploader' }));
    await dialog(page).getByLabel('Time limit').selectOption({ label: '7 days' });
    const add = dialog(page).getByRole('button', { name: 'Add', exact: true });
    expect((await add.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await press(add);

    await expect(dialog(page).getByRole('status')).toHaveText(/bob can now open it/);
    await expect(people(page)).toHaveCount(1);
    await expect(people(page).first()).toContainText('bob');
    await expect(people(page).first()).toContainText('Viewer and uploader · expires in 7 days');
    let rows = await held(server, dir);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rcpt: 'bob', pr: 'rw', name, state: 'active', at: `/shared/alice/${name}/` });
    expect(rows[0].t1 - Date.now() / 1000).toBeGreaterThan(6.9 * 86400);

    // bob finds it under shared, without a link (bob, not carol: views.spec checks carol
    // has nothing from people, and the sizes run alongside it)
    const c = await browser.newContext({ baseURL: server.url });
    const cp = await c.newPage();
    const cs = await session(server.url, 'bob');
    const r = await cs.get(`/shared/alice/${name}/a.txt`);
    expect(r.status).toBe(200);
    await cp.request.post(server.url + '/?h', { multipart: { act: 'login', uname: 'bob', cppwd: ACCOUNTS.bob } });
    await cp.goto(`/shared/alice/${name}/`);
    await expect(row(cp, 'a.txt')).toBeVisible();
    await c.close();

    await press(people(page).first().getByRole('button', { name: 'Remove access for bob' }));
    await expect(dialog(page).getByRole('status')).toHaveText(/bob can no longer open it/);
    await expect(people(page)).toHaveCount(0);
    expect(await held(server, dir)).toHaveLength(0);

    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await expect(share).toBeFocused();
});

test('a group, from the row menu', async ({ page, loginAs, put, press, server }, info) => {
    const dir = await mkdir(put, info, 'pplg', ['b.txt']);
    const name = dir.slice('/home/alice/'.length, -1);
    await loginAs('alice');
    await page.goto('/home/alice/');

    await press(row(page, name + '/').getByRole('button', { name: `Actions for ${name}` }));
    await press(page.getByRole('menu', { name: 'Actions' }).getByRole('menuitem', { name: 'Share', exact: true }));
    await who(page).selectOption({ label: 'family (group)' });
    await press(dialog(page).getByRole('button', { name: 'Add', exact: true }));
    await expect(people(page)).toHaveCount(1);
    await expect(people(page).first()).toContainText('family (group)');
    await expect(people(page).first()).toContainText('Viewer · never expires');
    const rows = await held(server, dir);
    expect(rows.map((x) => [x.rcpt, x.pr, x.t1])).toEqual([['@family', 'r', 0]]);

    // bob is in the group
    const bs = await session(server.url, 'bob');
    expect((await bs.get(`/shared/alice/${name}/b.txt`)).status).toBe(200);

    await press(people(page).first().getByRole('button', { name: 'Remove access for family (group)' }));
    await expect(people(page)).toHaveCount(0);
    expect(await held(server, dir)).toHaveLength(0);
});

test('the folder\'s grants are listed, and a refusal is shown as given', async ({ page, loginAs, press, selbar, server }) => {
    await loginAs('alice');
    await page.goto('/home/alice/');
    await press(row(page, 'proj/').getByRole('checkbox'));
    await press(selbar.getByRole('button', { name: 'Share' }));

    // the seeded grant to bob
    await expect(people(page)).toHaveCount(1);
    await expect(people(page).first()).toContainText('bob');
    await expect(people(page).first()).toContainText('Viewer · never expires');

    // the same folder to bob again, under the same name: refused, in the server's words
    await who(page).selectOption('bob');
    await press(dialog(page).getByRole('button', { name: 'Add', exact: true }));
    await expect(dialog(page).getByRole('alert')).toHaveText("you already gave 'bob' a grant named 'proj'; pick another name");
    await expect(people(page)).toHaveCount(1);
    expect(await held(server, '/home/alice/proj/')).toHaveLength(1);
});

test('a file can\'t be given to people', async ({ page, loginAs, press }) => {
    await loginAs('alice');
    await page.goto('/home/alice/');
    await press(row(page, 'notes.txt').getByRole('button', { name: 'Actions for notes.txt' }));
    await press(page.getByRole('menu', { name: 'Actions' }).getByRole('menuitem', { name: 'Share', exact: true }));

    await expect(dialog(page).getByRole('heading', { name: 'Share “notes.txt”' })).toBeVisible();
    await expect(who(page)).toBeDisabled();
    await expect(dialog(page).getByText('People can only be given folders, use a link for a file.')).toBeVisible();
    await expect(dialog(page).getByRole('button', { name: 'Add', exact: true })).toHaveCount(0);
    // focus skips the disabled part, to General access
    await expect(dialog(page).getByLabel('Who can open it')).toBeFocused();
});

test('a folder given to you offers no Share, and the people button is gone', async ({ page, loginAs, press, selbar }) => {
    const asked = [];
    page.on('request', (r) => {
        if (/[?&](grant|egrant|shares|share)\b/.test(r.url()))
            asked.push(r.url());
    });
    await loginAs('bob');
    await page.goto('/shared/alice/proj/');
    await press(row(page, 'plan.txt').getByRole('checkbox'));
    await expect(selbar).toBeVisible();
    await expect(selbar.getByRole('button', { name: 'Share' })).toHaveCount(0);
    await press(row(page, 'plan.txt').getByRole('button', { name: 'Actions for plan.txt' }));
    const menu = page.getByRole('menu', { name: 'Actions' });
    await expect(menu.getByRole('menuitem').first()).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /^Share/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.keyboard.press('s');
    await expect(dialog(page)).toHaveCount(0);
    expect(asked).toEqual([]);

    // in his own folder, no 🤝 people button beside Share
    await page.goto('/home/bob/');
    await expect(row(page, 'todo.txt')).toBeVisible();
    await expect(page.getByRole('link', { name: /people/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /people/ })).toHaveCount(0);
});

test('a guest on a share link asks for no people list', async ({ page, server }) => {
    const asked = [];
    page.on('request', (r) => {
        if (/[?&](grants|grant|egrant)\b/.test(r.url()))
            asked.push(r.url());
    });
    await page.goto(server.share);
    await expect(row(page, 'budget.xlsx')).toBeVisible();
    await page.keyboard.press('s');
    await expect(dialog(page)).toHaveCount(0);
    expect(asked).toEqual([]);
});

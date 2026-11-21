'use strict';

// + New (the nav button; a floating + on a phone) and the upload card, which follows up2k

const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect, row } = require('../fixtures.js');

// a folder of alice's of its own for each scenario and size (projects run in parallel)
async function folder(put, info, what) {
    const dir = `/home/alice/${what}-${info.project.name}/`;
    await put('alice', dir + 'seed.txt', 'seed\n');
    return dir;
}

// + New, from the nav on a desktop and from the floating button on a phone
async function newmenu(page, press) {
    await press(newbtn(page));
    const m = page.getByRole('menu', { name: 'New' });
    await expect(m).toBeVisible();
    return m;
}

// the New button in view: the nav's on a desktop, the floating + on a phone (the drawer's
// copy is hidden until the drawer opens)
const newbtn = (page) => page.getByRole('button', { name: 'New', exact: true }).filter({ visible: true });

const card = (page) => page.getByRole('region', { name: 'Uploads' });
const item = (page, name) => card(page).getByRole('listitem').filter({ hasText: name });

// upstream asks before uploading (its default, kept): "upload N files to ...?"
async function confirmUpload(page, press) {
    await press(page.getByRole('link', { name: 'OK', exact: true }));
}

// pick File upload and choose these files: [{ name, body }]
async function uploadFiles(page, press, files) {
    const m = await newmenu(page, press);
    const chooser = page.waitForEvent('filechooser');
    await press(m.getByRole('menuitem', { name: 'File upload' }));
    await (await chooser).setFiles(files.map((f) => ({
        name: f.name, mimeType: 'application/octet-stream', buffer: Buffer.from(f.body),
    })));
    await confirmUpload(page, press);
}

test('+ New offers the four ways to create something', async ({ page, loginAs, press, put, narrow }, info) => {
    const dir = await folder(put, info, 'newmenu');
    await loginAs('alice');
    await page.goto(dir);
    await expect(row(page, 'seed.txt')).toBeVisible();

    const m = await newmenu(page, press);
    // phones can't pick a folder (upstream offers it only on a desktop too)
    await expect(m.getByRole('menuitem')).toHaveText(narrow ?
        ['New folder', 'File upload', 'New text file'] :
        ['New folder', 'File upload', 'Folder upload', 'New text file']);
});

test('+ New is hidden in a folder that can not be written to', async ({ page, loginAs }) => {
    await loginAs('alice');
    await page.goto('/common/');
    await expect(row(page, 'welcome.txt')).toBeVisible();
    await expect(newbtn(page)).toHaveCount(0);

    // and back in a writable one, it is there again
    await page.goto('/home/alice/');
    await expect(row(page, 'notes.txt')).toBeVisible();
    await expect(newbtn(page)).toBeVisible();
});

test('+ New comes back when going from a read-only folder to a writable one', async ({ page, loginAs, press, nav }) => {
    // alice's proj/, granted to bob read-only
    await loginAs('bob');
    await page.goto('/shared/alice/proj/');
    await expect(row(page, 'plan.txt')).toBeVisible();
    await expect(newbtn(page)).toHaveCount(0);

    await press((await nav()).getByRole('link', { name: 'My files' }));
    await expect(row(page, 'todo.txt')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Main menu' })).toBeHidden();
    await expect(newbtn(page)).toBeVisible();
});

test('New folder makes the folder and stays in this one', async ({ page, loginAs, press, put, ls }, info) => {
    const dir = await folder(put, info, 'mkdir');
    await loginAs('alice');
    await page.goto(dir);
    await expect(row(page, 'seed.txt')).toBeVisible();

    const opener = newbtn(page);
    const m = await newmenu(page, press);
    await press(m.getByRole('menuitem', { name: 'New folder' }));
    const d = page.getByRole('dialog', { name: 'New folder' });
    await expect(d).toBeVisible();
    const name = d.getByRole('textbox', { name: 'Folder name' });
    await expect(name).toBeFocused();
    await name.fill('holiday pics');
    await press(d.getByRole('button', { name: 'Create' }));

    await expect(d).toBeHidden();
    await expect(row(page, 'holiday pics/')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(dir.replace(/\//g, '\\/') + '$'));
    expect((await ls('alice', dir)).dirs).toContain('holiday pics');
    await expect(opener).toBeFocused();

    // the same name again: the dialog stays and says why
    await press((await newmenu(page, press)).getByRole('menuitem', { name: 'New folder' }));
    await d.getByRole('textbox', { name: 'Folder name' }).fill('holiday pics');
    await d.getByRole('textbox', { name: 'Folder name' }).press('Enter');
    await expect(d.getByRole('alert')).toHaveText(/already exists/);
    await page.keyboard.press('Escape');
    await expect(d).toBeHidden();
});

test('New folder works from the keyboard alone', async ({ page, loginAs, put, ls, narrow }, info) => {
    test.skip(narrow, 'keyboard');
    const dir = await folder(put, info, 'mkdirkb');
    await loginAs('alice');
    await page.goto(dir);
    await expect(row(page, 'seed.txt')).toBeVisible();

    await newbtn(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu', { name: 'New' }).getByRole('menuitem', { name: 'New folder' })).toBeFocused();
    await page.keyboard.press('Enter');
    const name = page.getByRole('dialog', { name: 'New folder' }).getByRole('textbox', { name: 'Folder name' });
    await expect(name).toBeFocused();
    await page.keyboard.type('typed');
    await page.keyboard.press('Enter');
    await expect(row(page, 'typed/')).toBeVisible();
    expect((await ls('alice', dir)).dirs).toContain('typed');
    await expect(newbtn(page)).toBeFocused();
});

test('New text file makes the file', async ({ page, loginAs, press, put, ls }, info) => {
    const dir = await folder(put, info, 'mkfile');
    await loginAs('alice');
    await page.goto(dir);
    await expect(row(page, 'seed.txt')).toBeVisible();

    await press((await newmenu(page, press)).getByRole('menuitem', { name: 'New text file' }));
    const d = page.getByRole('dialog', { name: 'New text file' });
    const name = d.getByRole('textbox', { name: 'File name' });
    await expect(name).toBeFocused();
    await name.fill('shopping.txt');
    await press(d.getByRole('button', { name: 'Create' }));

    await expect(d).toBeHidden();
    await expect(row(page, 'shopping.txt')).toBeVisible();
    expect((await ls('alice', dir)).files).toContain('shopping.txt');
});

test('File upload sends the files and the card follows them', async ({ page, loginAs, press, put, ls }, info) => {
    const dir = await folder(put, info, 'upfiles');
    await loginAs('alice');
    await page.goto(dir);
    await expect(row(page, 'seed.txt')).toBeVisible();

    await uploadFiles(page, press, [
        { name: 'one.txt', body: 'one\n' },
        { name: 'two.txt', body: 'two\n' },
        { name: 'three.txt', body: 'three\n' },
    ]);

    await expect(card(page)).toBeVisible();
    await expect(card(page).getByRole('heading')).toHaveText('3 uploads complete', { timeout: 15000 });
    for (const n of ['one.txt', 'two.txt', 'three.txt']) {
        await expect(item(page, n)).toContainText('Done');
        await expect(row(page, n)).toBeVisible();
    }
    expect((await ls('alice', dir)).files).toEqual(expect.arrayContaining(['one.txt', 'two.txt', 'three.txt']));

    // up2k's full panel stays closed; Details opens it
    await expect(page.getByText('drop files / folders')).toBeHidden();
    await press(card(page).getByRole('button', { name: 'Details' }));
    await expect(page.getByText('drop files / folders')).toBeVisible();
});

test('the card collapses and closes', async ({ page, loginAs, press, put }, info) => {
    const dir = await folder(put, info, 'upcard');
    await loginAs('alice');
    await page.goto(dir);
    await expect(row(page, 'seed.txt')).toBeVisible();
    await uploadFiles(page, press, [{ name: 'a.txt', body: 'a\n' }]);
    await expect(card(page).getByRole('heading')).toHaveText('1 upload complete', { timeout: 15000 });

    const collapse = card(page).getByRole('button', { name: 'Collapse' });
    await expect(collapse).toHaveAttribute('aria-expanded', 'true');
    await press(collapse);
    await expect(item(page, 'a.txt')).toBeHidden();
    await expect(card(page).getByRole('button', { name: 'Expand' })).toHaveAttribute('aria-expanded', 'false');
    await press(card(page).getByRole('button', { name: 'Expand' }));
    await expect(item(page, 'a.txt')).toBeVisible();

    await press(card(page).getByRole('button', { name: 'Close' }));
    await expect(card(page)).toBeHidden();

    // a later upload brings it back with only the new files
    await uploadFiles(page, press, [{ name: 'b.txt', body: 'b\n' }]);
    await expect(card(page).getByRole('heading')).toHaveText('1 upload complete', { timeout: 15000 });
    await expect(item(page, 'b.txt')).toBeVisible();
    await expect(item(page, 'a.txt')).toHaveCount(0);
});

test('a refused file shows as failed with the server\'s reason', async ({ page, loginAs, press, put, ls }, info) => {
    const dir = await folder(put, info, 'upfail');
    await put('alice', dir + 'taken.txt', 'already here\n');
    // upload settings: skip files whose name is taken (upstream's own setting, stored per browser)
    await page.addInitScript(() => localStorage.setItem('u2ow', '3'));
    await loginAs('alice');
    await page.goto(dir);
    await expect(row(page, 'taken.txt')).toBeVisible();

    await uploadFiles(page, press, [
        { name: 'fresh.txt', body: 'new\n' },
        { name: 'taken.txt', body: 'something else\n' },
    ]);
    await expect(card(page).getByRole('heading')).toHaveText('1 upload complete, 1 failed', { timeout: 15000 });
    await expect(item(page, 'fresh.txt')).toContainText('Done');
    await expect(item(page, 'taken.txt')).toContainText('Failed');
    await expect(item(page, 'taken.txt')).toContainText('a file with that name already exists');
    expect((await ls('alice', dir)).files).toContain('fresh.txt');
});

test('an upload cut off halfway resumes and sends only what is missing', async ({ page, context, loginAs, press, put }, info) => {
    // up2k waits between retries of the dropped chunks before the first page is closed
    test.setTimeout(60000);
    const dir = await folder(put, info, 'upresume');
    // 1 MiB per request (upstream's upload setting), so the 4 MiB file takes four
    await context.addInitScript(() => localStorage.setItem('u2sz', '1'));
    await loginAs('alice');
    // its own bytes per size: the server would link a copy it already has instead (dedup)
    const big = Buffer.alloc(4 * 1024 * 1024);
    for (let i = 0; i < big.length; i += 4)
        big.writeUInt32LE((i * 2654435761) >>> 0, i);
    big.write(info.project.name, 0);
    const file = { name: 'big.bin', body: big };

    // the first page gets one chunk through, then the connection drops for good
    let sent = 0;
    await page.route((u) => u.pathname === dir, async (route) => {
        const r = route.request();
        if (r.method() === 'POST' && (await r.headerValue('x-up2k-hash')) && sent++ > 0)
            return route.abort('internetdisconnected');
        return route.continue();
    });
    await page.goto(dir);
    await expect(row(page, 'seed.txt')).toBeVisible();
    const first = page.waitForResponse((r) => r.request().method() === 'POST' &&
        !!r.request().headers()['x-up2k-hash'], { timeout: 15000 });
    await uploadFiles(page, press, [file]);
    expect((await first).status()).toBe(200);
    // the card says it is still going, not done
    await expect(card(page).getByRole('heading')).toHaveText('Uploading 1 item');
    await expect(item(page, 'big.bin')).not.toContainText('Done');
    await page.close();

    // a new page, the same file again: only the missing chunks go up
    const p2 = await context.newPage();
    let chunks = 0;
    p2.on('request', (r) => {
        if (r.method() === 'POST' && r.headers()['x-up2k-hash'])
            chunks++;
    });
    await p2.goto(dir);
    await expect(row(p2, 'seed.txt')).toBeVisible();
    await uploadFiles(p2, press, [file]);
    await expect(card(p2).getByRole('heading')).toHaveText('1 upload complete', { timeout: 20000 });
    await expect(item(p2, 'big.bin')).toContainText('Done');
    // what the first page sent is not sent again (one request may carry two chunks)
    expect(chunks).toBeGreaterThan(0);
    expect(chunks).toBeLessThan(4);
    const got = await p2.request.get(dir + 'big.bin');
    expect((await got.body()).equals(big)).toBe(true);
});

test('Folder upload sends a folder with its subfolders', async ({ page, loginAs, press, put, ls, narrow }, info) => {
    test.skip(narrow, 'phones have no folder upload');
    const dir = await folder(put, info, 'updir');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cpp-e2e-dir-'));
    fs.mkdirSync(path.join(tmp, 'album', 'day1'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'album', 'cover.txt'), 'cover\n');
    fs.writeFileSync(path.join(tmp, 'album', 'day1', 'beach.txt'), 'sand\n');
    try {
        await loginAs('alice');
        await page.goto(dir);
        await expect(row(page, 'seed.txt')).toBeVisible();

        const m = await newmenu(page, press);
        const chooser = page.waitForEvent('filechooser');
        await press(m.getByRole('menuitem', { name: 'Folder upload' }));
        await (await chooser).setFiles(path.join(tmp, 'album'));
        await confirmUpload(page, press);

        await expect(card(page).getByRole('heading')).toHaveText('2 uploads complete', { timeout: 15000 });
        await expect(page.getByText('drop files / folders')).toBeHidden();
        expect((await ls('alice', dir + 'album/')).files).toContain('cover.txt');
        expect((await ls('alice', dir + 'album/day1/')).files).toContain('beach.txt');
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

test('dropping files on the page uploads them to this folder', async ({ page, loginAs, press, put, ls }, info) => {
    const dir = await folder(put, info, 'updrop');
    await loginAs('alice');
    await page.goto(dir);
    await expect(row(page, 'seed.txt')).toBeVisible();

    const dt = await page.evaluateHandle(() => {
        const d = new DataTransfer();
        d.items.add(new File(['dropped\n'], 'dropped.txt', { type: 'text/plain' }));
        return d;
    });
    await page.dispatchEvent('body', 'dragenter', { dataTransfer: dt });
    // upstream's drop zones: upload, or search when the folder is indexed
    await page.dispatchEvent('#up_dz', 'drop', { dataTransfer: dt });
    await confirmUpload(page, press);

    await expect(card(page).getByRole('heading')).toHaveText('1 upload complete', { timeout: 15000 });
    await expect(row(page, 'dropped.txt')).toBeVisible();
    expect((await ls('alice', dir)).files).toContain('dropped.txt');
});

test('the + button never covers the last row or the audio player', async ({ page, loginAs, open, put, narrow }, info) => {
    test.skip(!narrow, 'the floating + is on a phone');
    const dir = await folder(put, info, 'fab');
    for (let i = 0; i < 30; i++)
        await put('alice', dir + `file-${String(i).padStart(2, '0')}.txt`, `${i}\n`);
    await put('alice', dir + 'zz-tone.wav', wav());
    await loginAs('alice');
    await page.goto(dir);

    const fab = newbtn(page);
    const last = row(page, 'zz-tone.wav');
    await expect(fab).toBeVisible();
    await expect(last).toBeAttached();

    // scrolled to the bottom, the last row ends above the + (the layout settles after the
    // audio bar's slide, so this is polled)
    const gap = async () => {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const f = await fab.boundingBox(), r = await last.boundingBox();
        // null while the list redraws: ask again
        return f && r ? f.y - (r.y + r.height) : -1;
    };
    await expect.poll(gap).toBeGreaterThanOrEqual(0);

    // play the tone: upstream's audio bar slides up at the bottom, and the + goes above it
    await open(last.getByRole('link', { name: 'zz-tone.wav', exact: true }));
    const bar = page.locator('#widget');
    await expect(bar).toHaveClass(/open/);
    await expect.poll(async () => {
        const f = await fab.boundingBox(), b = await bar.boundingBox();
        return f && b ? b.y - (f.y + f.height) : -1;
    }).toBeGreaterThanOrEqual(0);
    await expect.poll(gap).toBeGreaterThanOrEqual(0);
});

// 30 seconds of a quiet 440 Hz tone, 8 kHz 8-bit mono (long enough that upstream's player
// does not finish it and go on to the next folder mid-test)
function wav() {
    const n = 8000 * 30, b = Buffer.alloc(44 + n);
    b.write('RIFF', 0);
    b.writeUInt32LE(36 + n, 4);
    b.write('WAVEfmt ', 8);
    b.writeUInt32LE(16, 16);
    b.writeUInt16LE(1, 20);
    b.writeUInt16LE(1, 22);
    b.writeUInt32LE(8000, 24);
    b.writeUInt32LE(8000, 28);
    b.writeUInt16LE(1, 32);
    b.writeUInt16LE(8, 34);
    b.write('data', 36);
    b.writeUInt32LE(n, 40);
    for (let i = 0; i < n; i++)
        b[44 + i] = 128 + Math.round(8 * Math.sin((2 * Math.PI * 440 * i) / 8000));
    return b;
}

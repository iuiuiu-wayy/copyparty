'use strict';

// HEIC pictures open in the lightbox in every browser (deploy-pi ticket 06). A browser that
// can't decode HEIC gets the server's preview (?th=wf3), one that can gets the file itself;
// the bar's Download is the original either way. The harness has no pillow-heif, so the
// preview requests are answered here with a PNG

const fs = require('fs');
const path = require('path');
const { test, expect, row, scratch } = require('../fixtures.js');

const HEIC = fs.readFileSync(path.join(__dirname, '..', 'media', 'tiny.heic'));
const PNG = fs.readFileSync(path.join(__dirname, '..', 'media', 'blue.png'));

const lightbox = (page, n) => page.getByRole('dialog', { name: n, exact: true });
const name = (page, n) => row(page, n).getByRole('link', { name: n, exact: true });
const layout = (page) => page.getByRole('group', { name: 'Layout' });
const card = (page, n) =>
    page.locator('#fk-grid').getByRole('listitem').filter({ has: page.getByRole('link', { name: n, exact: true }) });

async function seed(put, info, what, files) {
    const dir = scratch(info, what);
    for (const f of files)
        await put('alice', dir + f, /\.heic$/.test(f) ? HEIC : PNG);
    return dir;
}

// whether this browser decodes HEIC itself, asked as forkview.js asks it
function native(page) {
    return page.evaluate((b64) => new Promise((ok) => {
        const im = new Image();
        im.onload = () => ok(im.naturalWidth > 0);
        im.onerror = () => ok(false);
        im.src = 'data:image/heic;base64,' + b64;
    }), HEIC.toString('base64'));
}

// the picture shown for file n: the preview, or the file where the browser shows HEIC itself
async function shows(page, nat, n) {
    const box = lightbox(page, n);
    await expect(box).toBeVisible();
    const img = page.locator('#bbox-overlay img[src*="/' + n + '"]');
    await expect(img).toBeVisible();
    if (nat)
        await expect(img).not.toHaveAttribute('src', /th=/);
    else
        await expect(img).toHaveAttribute('src', new RegExp('/' + n.replace('.', '\\.') + '\\?th=wf3'));
    // it loaded (the preview PNG here, or the decoded HEIC)
    await expect.poll(() => img.evaluate((i) => i.complete && i.naturalWidth)).toBeGreaterThan(0);
    await expect(box.getByRole('link', { name: 'Download' })).toHaveAttribute('href', new RegExp('/' + n.replace('.', '\\.') + '$'));
}

test.beforeEach(async ({ page }) => {
    await page.route(/[?&]th=wf3/, (r) => r.fulfill({ contentType: 'image/png', body: PNG }));
});

test('a HEIC opens in the lightbox, between the other pictures', async ({ page, loginAs, put, open, press, browserName }, info) => {
    const dir = await seed(put, info, 'heic', ['a.png', 'b.heic', 'c.heic']);
    await loginAs('alice');
    await page.goto(dir);
    // a folder of pictures may open in the grid by itself (upstream's autogrid)
    await press(layout(page).getByRole('button', { name: 'List layout' }));
    await expect(layout(page).getByRole('button', { name: 'List layout' })).toHaveAttribute('aria-pressed', 'true');
    await expect(name(page, 'b.heic')).toBeVisible();
    const nat = await native(page);
    // Chromium can't decode HEIC: the preview is what this scenario must see there
    if (browserName === 'chromium')
        expect(nat).toBe(false);

    await open(name(page, 'b.heic'));
    await shows(page, nat, 'b.heic');

    await lightbox(page, 'b.heic').getByRole('button', { name: 'Next file' }).click();
    await shows(page, nat, 'c.heic');
    await lightbox(page, 'c.heic').getByRole('button', { name: 'Previous file' }).click();
    await lightbox(page, 'b.heic').getByRole('button', { name: 'Previous file' }).click();
    await expect(lightbox(page, 'a.png')).toBeVisible();
    await expect(page.locator('#bbox-overlay img[src*="/a.png"]')).not.toHaveAttribute('src', /th=/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#bbox-overlay')).toBeHidden();
    // the links in the list are the files themselves again
    await expect(name(page, 'b.heic')).toHaveAttribute('href', /b\.heic$/);
});

test('a folder of only HEIC pictures opens in the grid too', async ({ page, loginAs, put, open, press }, info) => {
    const dir = await seed(put, info, 'heicgrid', ['x.heic', 'y.heic']);
    await loginAs('alice');
    await page.goto(dir);
    await press(layout(page).getByRole('button', { name: 'Grid layout' }));
    await expect(page.locator('#fk-grid')).toBeVisible();
    const nat = await native(page);

    await open(card(page, 'x.heic'));
    await shows(page, nat, 'x.heic');
    await lightbox(page, 'x.heic').getByRole('button', { name: 'Next file' }).click();
    await shows(page, nat, 'y.heic');
    await expect(lightbox(page, 'y.heic').getByRole('button', { name: 'Next file' })).toHaveAttribute('aria-disabled', 'true');
});

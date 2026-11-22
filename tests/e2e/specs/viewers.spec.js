'use strict';

// viewers and the audio player (ticket 16): an image, a video, a text file and a markdown
// file open in upstream's viewers under a top bar of close, name, download, share and ‹ ›;
// arrows, Esc and swipe keep working in the lightbox; audio plays in a bottom bar that
// stays clear of the phone's + button. Carol's seeded media/ folder (server.js), only read

const { test, expect, row } = require('../fixtures.js');

const DIR = '/home/carol/media/';

const name = (page, n) => row(page, n).getByRole('link', { name: n, exact: true });
const lightbox = (page, n) => page.getByRole('dialog', { name: n, exact: true });
const viewer = (page, n) => page.getByRole('region', { name: n, exact: true });
const player = (page) => page.getByRole('region', { name: 'Audio player' });

// the row is selected (asked of the page: the text viewer hides the list)
const selected = (page, n) => page.evaluate((n) => [...document.querySelectorAll('#files tbody a[id]')]
    .find((a) => a.textContent == n).closest('tr').classList.contains('sel'), n);

async function go(page, loginAs) {
    await loginAs('carol');
    await page.goto(DIR);
    await expect(name(page, 'blue.png')).toBeVisible();
}

// a finger dragged sideways across the screen by dx px (Chromium: real touch
// through the devtools protocol; Firefox: the touch events such a swipe makes)
// (in the upper part of the screen: upstream ignores a swipe that starts near a video's
// controls, and the small seeded video sits in the middle)
async function swipeX(page, browserName, dx) {
    const vp = page.viewportSize(), x = vp.width / 2, y = vp.height * 0.3, steps = 6;
    if (browserName === 'chromium') {
        const cdp = await page.context().newCDPSession(page);
        const pt = (xx) => [{ x: xx, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x) });
        for (let i = 1; i <= steps; i++)
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x + (dx * i) / steps) });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach();
        return;
    }
    await page.evaluate(({ x, y, dx, steps }) => {
        const ov = document.getElementById('bbox-overlay');
        const t = (xx) => new Touch({ identifier: 1, target: ov, clientX: xx, clientY: y, pageX: xx, pageY: y });
        const fire = (type, xx, list) => ov.dispatchEvent(new TouchEvent(type, {
            bubbles: true, cancelable: true, touches: list ? [t(xx)] : [], changedTouches: [t(xx)],
        }));
        fire('touchstart', x, true);
        for (let i = 1; i <= steps; i++)
            fire('touchmove', x + (dx * i) / steps, true);
        fire('touchend', x + dx, false);
    }, { x, y, dx, steps });
}

// every button of the bar a finger can reach is at least 44 px, and nothing is cut off
async function fits(page, bar) {
    const vw = page.viewportSize().width;
    const boxes = await bar.locator('button:visible, a:visible').evaluateAll((els) =>
        els.map((e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, l: r.left, r: r.right }; }));
    expect(boxes.length).toBeGreaterThan(3);
    for (const b of boxes) {
        expect(b.w).toBeGreaterThanOrEqual(44);
        expect(b.h).toBeGreaterThanOrEqual(44);
        expect(b.l).toBeGreaterThanOrEqual(0);
        expect(b.r).toBeLessThanOrEqual(vw);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vw);
}

test.describe('the lightbox', () => {
    test('an image opens under the top bar; ‹ › go through the images and the video; close', async ({ page, loginAs, open }) => {
        test.slow();
        await go(page, loginAs);
        await open(name(page, 'blue.png'));

        const box = lightbox(page, 'blue.png');
        await expect(box).toBeVisible();
        await expect(box.getByRole('heading', { name: 'blue.png' })).toBeVisible();
        await expect(box.getByRole('button', { name: 'Close' })).toBeVisible();
        await expect(box.getByRole('link', { name: 'Download' })).toHaveAttribute('href', /\/home\/carol\/media\/blue\.png/);
        await expect(box.getByRole('button', { name: 'Share' })).toBeVisible();
        await expect(box.locator('img[src*="blue.png"]')).toBeVisible();
        await fits(page, box.locator('.fk-vbar'));

        // the first item has nothing before it
        await expect(box.getByRole('button', { name: 'Previous file' })).toHaveAttribute('aria-disabled', 'true');
        await box.getByRole('button', { name: 'Next file' }).click();
        await expect(lightbox(page, 'clip.webm')).toBeVisible();
        await expect(page.locator('#bbox-overlay video[src*="clip.webm"]')).toBeVisible();
        await lightbox(page, 'clip.webm').getByRole('button', { name: 'Next file' }).click();
        await expect(lightbox(page, 'orange.png')).toBeVisible();
        await expect(lightbox(page, 'orange.png').getByRole('button', { name: 'Next file' })).toHaveAttribute('aria-disabled', 'true');
        await lightbox(page, 'orange.png').getByRole('button', { name: 'Previous file' }).click();
        await expect(lightbox(page, 'clip.webm')).toBeVisible();

        await lightbox(page, 'clip.webm').getByRole('button', { name: 'Close' }).click();
        await expect(page.locator('#bbox-overlay')).toBeHidden();
        await expect(name(page, 'blue.png')).toBeVisible();
    });

    test('arrows go back and forth, Esc closes and gives focus back', async ({ page, loginAs, open, hasTouch }) => {
        test.skip(hasTouch, 'keyboard');
        await go(page, loginAs);
        await open(name(page, 'blue.png'));
        await expect(lightbox(page, 'blue.png')).toBeVisible();
        // focus starts inside, on Close
        await expect(lightbox(page, 'blue.png').getByRole('button', { name: 'Close' })).toBeFocused();

        await page.keyboard.press('ArrowRight');
        await expect(lightbox(page, 'clip.webm')).toBeVisible();
        await page.keyboard.press('ArrowRight');
        await expect(lightbox(page, 'orange.png')).toBeVisible();
        await page.keyboard.press('ArrowLeft');
        await expect(lightbox(page, 'clip.webm')).toBeVisible();

        // every control of the bar is reached with Tab
        for (const n of ['Previous file', 'Next file', 'Download', 'Share', 'More options']) {
            await page.keyboard.press('Tab');
            await expect(page.locator(':focus')).toHaveAccessibleName(n);
        }

        // focus lands on the row of the file last shown
        await page.keyboard.press('Escape');
        await expect(page.locator('#bbox-overlay')).toBeHidden();
        await expect(row(page, 'clip.webm')).toBeFocused();
    });

    test('a swipe goes to the next and the previous image', async ({ page, loginAs, open, hasTouch, browserName }) => {
        test.skip(!hasTouch, 'touch');
        await go(page, loginAs);
        await open(name(page, 'blue.png'));
        await expect(lightbox(page, 'blue.png')).toBeVisible();

        await swipeX(page, browserName, -150);
        await expect(lightbox(page, 'clip.webm')).toBeVisible();
        await swipeX(page, browserName, 150);
        await expect(lightbox(page, 'blue.png')).toBeVisible();
    });

    test('Download saves the file', async ({ page, loginAs, open }) => {
        await go(page, loginAs);
        await open(name(page, 'orange.png'));
        const dl = page.waitForEvent('download');
        await lightbox(page, 'orange.png').getByRole('link', { name: 'Download' }).click();
        expect((await dl).suggestedFilename()).toBe('orange.png');
    });

    test('Share opens the Share dialog on the file; closing it leaves the lightbox open', async ({ page, loginAs, open, press }) => {
        await go(page, loginAs);
        await open(name(page, 'blue.png'));
        await press(lightbox(page, 'blue.png').getByRole('button', { name: 'Share' }));

        const dlg = page.getByRole('dialog', { name: 'Share “blue.png”' });
        await expect(dlg).toBeVisible();
        // focus may go into the dialog (the lightbox doesn't pull it back), and its keys
        // don't drive the lightbox
        // (General access's select: Add people, first in the dialog, is disabled on a file)
        const access = dlg.getByRole('combobox').filter({ hasText: 'Restricted' });
        await access.focus();
        await expect(access).toBeFocused();
        await page.keyboard.press('ArrowRight');
        await expect(lightbox(page, 'blue.png')).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(dlg).toBeHidden();
        await expect(lightbox(page, 'blue.png')).toBeVisible();
        await expect(lightbox(page, 'blue.png').getByRole('button', { name: 'Share' })).toBeFocused();
    });

    test('More options keeps upstream\'s tools: rotate, full screen, zoom, select, shortcuts', async ({ page, loginAs, open, press }) => {
        await go(page, loginAs);
        await open(name(page, 'blue.png'));
        const box = lightbox(page, 'blue.png');
        await press(box.getByRole('button', { name: 'More options' }));
        const menu = page.getByRole('menu', { name: 'More options' });
        for (const n of ['Rotate left', 'Rotate right', 'Zoom to fill', 'Select', 'Keyboard shortcuts'])
            await expect(menu.getByRole('menuitem', { name: n })).toBeVisible();
        await press(menu.getByRole('menuitem', { name: 'Rotate right' }));
        await expect(menu).toBeHidden();
        await expect(page.locator('#bbox-overlay img[src*="blue.png"]')).toHaveAttribute('rot', '90');
        await expect(box).toBeVisible();

        // Select toggles the row's selection in the list behind (opening with a double-click
        // selected it first on a desktop)
        const was = await selected(page, 'blue.png');
        await press(box.getByRole('button', { name: 'More options' }));
        await press(menu.getByRole('menuitem', { name: 'Select' }));
        await expect.poll(() => selected(page, 'blue.png')).toBe(!was);
    });
});

test.describe('the text viewer', () => {
    test('a text file opens under the top bar; ‹ › go to the markdown file; close', async ({ page, loginAs, open }) => {
        test.slow();
        await go(page, loginAs);
        await open(name(page, 'notes.txt'));

        const v = viewer(page, 'notes.txt');
        await expect(v).toBeVisible();
        await expect(v.getByRole('heading', { name: 'notes.txt' })).toBeVisible();
        await expect(v.getByText('second line')).toBeVisible();
        await expect(v.getByRole('button', { name: 'Share' })).toBeVisible();
        await fits(page, v.locator('.fk-vbar'));
        // upstream's own button row is gone
        await expect(page.locator('#xdoc')).toBeHidden();

        await v.getByRole('button', { name: 'Previous file' }).click();
        const md = viewer(page, 'guide.md');
        await expect(md).toBeVisible();
        await expect(page).toHaveURL(/doc=guide\.md/);
        await md.getByRole('button', { name: 'Next file' }).click();
        await expect(viewer(page, 'notes.txt')).toBeVisible();

        await viewer(page, 'notes.txt').getByRole('button', { name: 'Close' }).click();
        await expect(page.locator('#bdoc')).toBeHidden();
        await expect(name(page, 'notes.txt')).toBeVisible();
        await expect(page).not.toHaveURL(/doc=/);
    });

    test('a markdown file opens in the viewer; Download, Share and More options', async ({ page, loginAs, open, press }) => {
        await go(page, loginAs);
        await open(name(page, 'guide.md'));
        // (rendered by upstream's marked.js, which a source checkout doesn't have: the
        // harness gets no rendered text, only the viewer)
        const v = viewer(page, 'guide.md');
        await expect(v).toBeVisible();
        await expect(page).toHaveURL(/doc=guide\.md/);

        const dl = page.waitForEvent('download');
        await press(v.getByRole('button', { name: 'Download' }));
        expect((await dl).suggestedFilename()).toBe('guide.md');

        await press(v.getByRole('button', { name: 'More options' }));
        const menu = page.getByRole('menu', { name: 'More options' });
        for (const n of ['Edit', 'Select', 'Follow changes'])
            await expect(menu.getByRole('menuitem', { name: n })).toBeVisible();
        const was = await selected(page, 'guide.md');
        await press(menu.getByRole('menuitem', { name: 'Select' }));
        await expect.poll(() => selected(page, 'guide.md')).toBe(!was);

        await press(v.getByRole('button', { name: 'Share' }));
        await expect(page.getByRole('dialog', { name: 'Share “guide.md”' })).toBeVisible();
    });
});

test.describe('the audio player', () => {
    test('a bottom bar: name, pause / play, next track, close', async ({ page, loginAs, open, press }) => {
        test.slow();
        await go(page, loginAs);
        await expect(player(page)).toBeHidden();
        await open(name(page, 'tone-a.wav'));

        const p = player(page);
        await expect(p).toBeVisible();
        await expect(p.getByText('tone-a.wav')).toBeVisible();
        await expect(p.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
        await expect.poll(() => page.evaluate(() => !mp.au.paused)).toBe(true);
        await fits(page, p);
        // the bar is the whole width, over the nav on a desktop, at the bottom
        const b = await p.boundingBox(), vp = page.viewportSize();
        expect(b.x).toBeLessThanOrEqual(0);
        expect(Math.round(b.y + b.height)).toBeGreaterThanOrEqual(vp.height - 1);
        // upstream's tab of buttons above the bar is gone
        await expect(page.locator('#wtoggle')).toBeHidden();

        // (a pause before the track has loaded is lost: Firefox gets the wav transcoded by
        // the server, which takes seconds on a busy machine)
        await expect.poll(() => page.evaluate(() => mp.au.currentTime), { timeout: 25000 }).toBeGreaterThan(0.3);
        await press(p.getByRole('button', { name: 'Pause', exact: true }));
        await expect(p.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
        await expect.poll(() => page.evaluate(() => mp.au.paused)).toBe(true);

        await press(p.getByRole('button', { name: 'Next track' }));
        await expect(p.getByText('tone-b.wav')).toBeVisible();
        await expect(p.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

        await press(p.getByRole('button', { name: 'Close player' }));
        await expect(p).toBeHidden();
        await expect.poll(() => page.evaluate(() => mp.au.paused)).toBe(true);
    });

    test('player settings are in its menu and in More tools', async ({ page, loginAs, open, press }) => {
        await go(page, loginAs);
        await press(page.getByRole('button', { name: 'More tools' }));
        await expect(page.getByRole('menu', { name: 'More tools' }).getByRole('menuitem', { name: 'Audio player', exact: true })).toBeVisible();
        await page.keyboard.press('Escape');

        await open(name(page, 'tone-a.wav'));
        const p = player(page);
        await expect(p).toBeVisible();
        await press(p.getByRole('button', { name: 'More player options' }));
        const menu = page.getByRole('menu', { name: 'More player options' });
        await expect(menu.getByRole('menuitem', { name: 'Download track' })).toBeVisible();
        await press(menu.getByRole('menuitem', { name: 'Player settings' }));
        await expect(page.locator('#op_player')).toBeVisible();
    });

    test('on a phone the bar sits below the + button, and the last row above both', async ({ page, loginAs, open, narrow }) => {
        test.slow();
        test.skip(!narrow, 'phone');
        await go(page, loginAs);
        // (not the folder's last track: near its end upstream may go on to the next folder)
        await open(name(page, 'tone-a.wav'));
        const p = player(page), fab = page.getByRole('button', { name: 'New', exact: true });
        await expect(p).toBeVisible();
        await expect(fab).toBeVisible();
        await expect.poll(async () => {
            const f = await fab.boundingBox(), b = await p.boundingBox();
            return f && b ? b.y - (f.y + f.height) : -1;
        }).toBeGreaterThanOrEqual(0);
        await expect.poll(async () => {
            await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
            const f = await fab.boundingBox(), r = await row(page, 'tone-b.wav').boundingBox();
            return f && r ? f.y - (r.y + r.height) : -1;
        }).toBeGreaterThanOrEqual(0);
    });
});

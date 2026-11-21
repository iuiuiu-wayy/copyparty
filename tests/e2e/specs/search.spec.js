'use strict';

// the top bar's search box: names under the current folder, in the list; Type and Modified
// chips narrow the hits, Advanced opens upstream's full form; Esc or the clear button bring
// the folder back. Carol's seeded search/ folder (server.js): beach.jpg, beach.txt,
// beach-sunset.png, beach-clip.mp4, beach-2019.pdf (modified in 2019), sub/beach-deep.jpg,
// and beach.jpg in the folders search2/ and other/ next to it, which must not show

const { test, expect, row } = require('../fixtures.js');

const DIR = '/home/carol/search/';

const box = (page) => page.getByRole('banner').getByRole('searchbox', { name: 'Search' });
const chips = (page) => page.getByRole('toolbar', { name: 'Search filters' });

// the hits listed, as paths under DIR ('sub/beach-deep.jpg'), sorted
async function hits(page) {
    const hrefs = await page.locator('#files tbody tr:not(.srch_hdr) td:nth-child(2) a[id]')
        .evaluateAll((as) => as.map((a) => decodeURIComponent(new URL(a.href).pathname)));
    return hrefs.map((h) => (h.indexOf(DIR) === 0 ? h.slice(DIR.length) : h)).sort();
}

async function expectHits(page, want) {
    await expect.poll(() => hits(page), { timeout: 10000 }).toEqual(want.slice().sort());
}

async function search(page, txt) {
    await box(page).fill(txt);
    await box(page).press('Enter');
}

// pick an entry of a chip's menu
async function pick(page, press, chip, entry) {
    await press(chips(page).getByRole('button', { name: chip }));
    await press(page.getByRole('menu', { name: chip }).getByRole('menuitem', { name: entry, exact: true }));
}

const ALL = ['beach.jpg', 'beach.txt', 'beach-sunset.png', 'beach-clip.mp4', 'beach-2019.pdf', 'sub/beach-deep.jpg'];

test.beforeEach(async ({ page, loginAs }) => {
    await loginAs('carol');
    await page.goto(DIR);
    await expect(row(page, 'beach.jpg')).toBeVisible();
});

test('a name search lists the matches under this folder only', async ({ page }) => {
    await search(page, 'beach');
    await expectHits(page, ALL);
    await expect(page.getByRole('status').filter({ hasText: '6 results' })).toBeAttached();
    // two words: both must be in the name
    await search(page, 'beach deep');
    await expectHits(page, ['sub/beach-deep.jpg']);
    await search(page, 'nothing-like-this');
    await expectHits(page, []);
    await expect(page.getByRole('status').filter({ hasText: 'No results' })).toBeAttached();
});

test('typing searches without Enter', async ({ page }) => {
    await box(page).fill('sunset');
    await expectHits(page, ['beach-sunset.png']);
});

test('the Type chip narrows the hits, and gives what upstream\'s form gives', async ({ page, press, tool }) => {
    test.slow();  // many searches, and upstream's form searches as you type
    await search(page, 'beach');
    await expectHits(page, ALL);
    await pick(page, press, 'Type', 'Images');
    await expectHits(page, ['beach.jpg', 'beach-sunset.png', 'sub/beach-deep.jpg']);
    await expect(chips(page).getByRole('button', { name: 'Type: Images' })).toHaveText('Images');
    await pick(page, press, 'Type', 'Videos');
    await expectHits(page, ['beach-clip.mp4']);
    await pick(page, press, 'Type', 'PDFs');
    await expectHits(page, ['beach-2019.pdf']);
    await pick(page, press, 'Type', 'Any type');
    await expectHits(page, ALL);

    // upstream's form, the same search for each image extension seeded here
    await press(box(page).locator('xpath=..').getByRole('button', { name: 'Clear search' }));
    const form = {};
    for (const ext of ['jpg', 'png']) {
        await openForm(page, tool);
        await page.locator('#srch_namev').fill('beach .' + ext + '$');
        await page.locator('#srch_pathv').fill('^home/carol/search -^home/carol/search2');
        form[ext] = await settle(page);
    }
    expect(form.jpg.concat(form.png).sort()).toEqual(['beach.jpg', 'beach-sunset.png', 'sub/beach-deep.jpg'].sort());
});

test('the Modified chip narrows the hits, and gives what upstream\'s form gives', async ({ page, press, tool }) => {
    test.slow();  // many searches, and upstream's form searches as you type
    await search(page, 'beach');
    await expectHits(page, ALL);
    await pick(page, press, 'Modified', 'Last 7 days');
    await expectHits(page, ALL.filter((f) => f !== 'beach-2019.pdf'));
    await expect(chips(page).getByRole('button', { name: 'Modified: Last 7 days' })).toBeVisible();
    await pick(page, press, 'Modified', 'Any time');
    await expectHits(page, ALL);

    // a custom range around 2019
    await pick(page, press, 'Modified', 'Custom range…');
    const dlg = page.getByRole('dialog', { name: 'Modified between' });
    await expect(dlg).toBeVisible();
    await dlg.getByLabel('After').fill('2019-01-01');
    await dlg.getByLabel('Before').fill('2019-12-31');
    await press(dlg.getByRole('button', { name: 'Apply' }));
    await expect(dlg).toBeHidden();
    await expectHits(page, ['beach-2019.pdf']);
    await expect(chips(page).getByRole('button', { name: /^Modified: 2019-01-01/ })).toBeVisible();
    const ours = await hits(page);

    // Advanced opens upstream's form with the name and dates filled in
    await press(chips(page).getByRole('button', { name: 'Advanced' }));
    await expect(page.locator('#srch_namev')).toBeVisible();
    await expect(page.locator('#srch_namev')).toHaveValue('beach');
    await expect(page.locator('#srch_dtlv')).not.toHaveValue('');
    await expect(page.locator('#srch_dtuv')).not.toHaveValue('');

    // upstream's form, by hand: the same name and dates, this folder by path
    await press(box(page).locator('xpath=..').getByRole('button', { name: 'Clear search' }));
    await openForm(page, tool);
    await page.locator('#srch_namev').fill('beach');
    await page.locator('#srch_pathv').fill('^home/carol/search -^home/carol/search2');
    await page.locator('#srch_dtlv').fill('2019-01-01');
    await page.locator('#srch_dtuv').fill('2020-01-01');
    expect(await settle(page)).toEqual(ours);
});

async function openForm(page, tool) {
    if (!(await page.locator('#srch_namev').isVisible()))
        await tool('Search');
    await expect(page.locator('#srch_namev')).toBeVisible();
}

// upstream's form searches as you type; wait for its hits to stop changing
async function settle(page) {
    let last = null;
    for (let i = 0; i < 40; i++) {
        await page.waitForTimeout(400);
        const busy = await page.locator('#srch_q').textContent();
        const h = (await page.locator('#unsearch').count()) ? await hits(page) : null;
        if (h && !busy && JSON.stringify(h) === JSON.stringify(last))
            return h;
        last = h;
    }
    throw new Error('upstream\'s search never settled');
}

test('Esc or the clear button bring the folder back', async ({ page, press }) => {
    await search(page, 'sunset');
    await expectHits(page, ['beach-sunset.png']);
    await expect(chips(page)).toBeVisible();

    await box(page).press('Escape');
    await expect(box(page)).toHaveValue('');
    await expect(row(page, 'sub/')).toBeVisible();
    await expect(row(page, 'beach.txt')).toBeVisible();
    await expect(page.locator('#unsearch')).toHaveCount(0);
    await expect(chips(page)).toBeHidden();
    await expect(page).toHaveURL(new RegExp(DIR + '#?$'));

    await search(page, 'sunset');
    await expectHits(page, ['beach-sunset.png']);
    await press(box(page).locator('xpath=..').getByRole('button', { name: 'Clear search' }));
    await expect(box(page)).toHaveValue('');
    await expect(row(page, 'sub/')).toBeVisible();
    await expect(chips(page)).toBeHidden();
    // focus back in the box, to type the next search
    await expect(box(page)).toBeFocused();
});

test('opening a folder ends the search', async ({ page, open }) => {
    await search(page, 'deep');
    await expectHits(page, ['sub/beach-deep.jpg']);
    await page.goto(DIR + 'sub/');
    await expect(row(page, 'beach-deep.jpg')).toBeVisible();
    await expect(box(page)).toHaveValue('');
    await expect(chips(page)).toBeHidden();
});

test('a hit selects, and the results stay', async ({ page, press, selbar }) => {
    await search(page, 'beach.txt');
    await expectHits(page, ['beach.txt']);
    const hit = page.locator('#files tbody tr:not(.srch_hdr)').filter({ hasText: 'beach.txt' });
    await press(hit.getByRole('checkbox'));
    await expect(selbar.getByText('1 selected')).toBeVisible();
    await press(selbar.getByRole('button', { name: 'Clear selection' }));
    await expect(selbar).toBeHidden();
    await expectHits(page, ['beach.txt']);
    await expect(chips(page)).toBeVisible();
});

test('/ focuses the search box', async ({ page, hasTouch }) => {
    test.skip(hasTouch, 'a keyboard');
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('/');
    await expect(box(page)).toBeFocused();
    await expect(box(page)).toHaveValue('');
    await page.keyboard.type('sunset');
    await page.keyboard.press('Enter');
    await expectHits(page, ['beach-sunset.png']);
});

test('the chips are buttons in one toolbar, reachable by keyboard', async ({ page, hasTouch }) => {
    test.skip(hasTouch, 'a keyboard');
    await search(page, 'beach');
    await expectHits(page, ALL);
    await chips(page).getByRole('button', { name: 'Type' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(chips(page).getByRole('button', { name: 'Modified' })).toBeFocused();
    await page.keyboard.press('Enter');
    const m = page.getByRole('menu', { name: 'Modified' });
    await expect(m.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(m).toBeHidden();
    await expect(chips(page).getByRole('button', { name: 'Modified' })).toBeFocused();
});

test('the chips fit a phone: they scroll sideways, the page doesn\'t', async ({ page, narrow }) => {
    await search(page, 'beach');
    await expectHits(page, ALL);
    const bar = chips(page);
    expect(await bar.evaluate((b) => getComputedStyle(b).overflowX)).toBe('auto');
    expect(await bar.evaluate((b) => getComputedStyle(b).flexWrap)).toBe('nowrap');
    for (const name of ['Type', 'Modified', 'Advanced']) {
        const b = bar.getByRole('button', { name });
        await b.scrollIntoViewIfNeeded();
        await expect(b).toBeInViewport({ ratio: 1 });
        const bb = await b.boundingBox();
        expect(bb.height).toBeGreaterThanOrEqual(narrow ? 44 : 32);
    }
    const clear = box(page).locator('xpath=..').getByRole('button', { name: 'Clear search' });
    const cb = await clear.boundingBox();
    expect(Math.min(cb.width, cb.height)).toBeGreaterThanOrEqual(narrow ? 44 : 32);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('no search box on a folder that isn\'t indexed', async ({ page }) => {
    await page.goto('/attic/');
    await expect(row(page, 'beach.txt')).toBeVisible();
    await expect(box(page)).toBeHidden();
    await page.goto(DIR);
    await expect(box(page)).toBeVisible();
});

'use strict';

const fs = require('fs');
const { test, expect, row } = require('../fixtures.js');
const { SEED } = require('../server.js');

// a click only selects on a desktop: a double-click (or a tap) opens
test('a guest opens the share link and downloads a file', async ({ page, server, open }) => {
    await page.goto(server.share);

    const link = row(page, 'budget.xlsx').getByRole('link', { name: 'budget.xlsx', exact: true });
    const [dl] = await Promise.all([page.waitForEvent('download'), open(link)]);

    expect(dl.suggestedFilename()).toBe('budget.xlsx');
    expect(fs.readFileSync(await dl.path(), 'utf8')).toBe(SEED['home/alice/trip/budget.xlsx']);
});

'use strict';

const { test, expect, row } = require('../fixtures.js');

test('ticking a row checkbox selects that row', async ({ page, loginAs, press }) => {
    await loginAs('alice');
    await page.goto('/home/alice/');

    const notes = row(page, 'notes.txt');
    const box = notes.getByRole('checkbox');
    await expect(box).not.toBeChecked();
    await press(box);

    await expect(box).toBeChecked();
    await expect(row(page, 'proj/').getByRole('checkbox')).not.toBeChecked();
});

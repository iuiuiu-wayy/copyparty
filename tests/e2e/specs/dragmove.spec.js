'use strict';

const { test, expect, row, scratch } = require('../fixtures.js');

test('dragging a row onto a folder row moves it there', async ({ page, loginAs, put, ls }, info) => {
    // its own file and folder, so the sizes running in parallel don't move each other's
    const dir = scratch(info, 'drag');
    await put('alice', dir + 'letter.txt', 'dear bob\n');
    await put('alice', dir + 'archive/keep.txt', 'kept\n');

    await loginAs('alice');
    await page.goto(dir);
    await row(page, 'letter.txt').getByRole('link', { name: 'letter.txt', exact: true })
        .dragTo(row(page, 'archive/'));

    await expect(row(page, 'letter.txt')).toHaveCount(0);
    expect((await ls('alice', dir + 'archive/')).files).toContain('letter.txt');
    expect((await ls('alice', dir)).files).not.toContain('letter.txt');
});

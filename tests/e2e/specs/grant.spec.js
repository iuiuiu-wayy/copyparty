'use strict';

const { test, expect, row } = require('../fixtures.js');

test('bob finds the folder alice gave him under shared', async ({ page, loginAs }) => {
    await loginAs('bob');
    await page.goto('/shared/alice/proj/');

    await expect(row(page, 'plan.txt')).toBeVisible();
});

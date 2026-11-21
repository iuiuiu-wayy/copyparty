'use strict';

const { test, expect, row } = require('../fixtures.js');

test('opening / takes an account holder to their home folder', async ({ page, loginAs }) => {
    await loginAs('alice');
    await page.goto('/');

    await expect(page).toHaveURL(/\/home\/alice\/$/);
    await expect(row(page, 'notes.txt')).toBeVisible();
});

test('an account with no home folder stays on /', async ({ page, loginAs }) => {
    await loginAs('dave');
    await page.goto('/');

    // the control panel, with the folders dave may open
    await expect(page.getByRole('link', { name: '/common/' }).first()).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: '/home/dave/' })).toHaveCount(0);
});

test('the control panel itself is still reachable', async ({ page, loginAs }) => {
    await loginAs('alice');
    await page.goto('/?h');

    await expect(page.getByRole('link', { name: '/home/alice/' }).first()).toBeVisible();
    await expect(page).toHaveURL(/\/\?h$/);
});

test('logging in on the front page lands in the home folder', async ({ page }) => {
    const { ACCOUNTS } = require('../server.js');
    await page.goto('/');
    await page.getByPlaceholder('username').fill('alice');
    await page.getByPlaceholder('password').fill(ACCOUNTS.alice);
    await page.getByPlaceholder('password').press('Enter');

    await expect(page).toHaveURL(/\/home\/alice\/$/);
    await expect(row(page, 'notes.txt')).toBeVisible();
});

'use strict';

// the account menu: the avatar at the top right, with change password, share links,
// grants, control panel and log out

const { test, expect, row } = require('../fixtures.js');

const ENTRIES = ['Change password', 'My share links', 'My grants', 'Control panel', 'Log out'];

// open the avatar's menu and return it
async function openMenu(page, press, user) {
    await press(page.getByRole('banner').getByRole('button', { name: 'Account: ' + user }));
    const m = page.getByRole('menu', { name: 'Account' });
    await expect(m).toBeVisible();
    return m;
}

test('the avatar shows the initial and opens the account menu', async ({ page, loginAs, press }) => {
    await loginAs('alice');
    await page.goto('/home/alice/');
    const av = page.getByRole('banner').getByRole('button', { name: 'Account: alice' });
    await expect(av).toHaveText('A');

    const m = await openMenu(page, press, 'alice');
    await expect(m.getByRole('menuitem')).toHaveText(ENTRIES);
    // destinations are links (open in a new tab, copy as a url), with the --rp-loc prefix
    await expect(m.getByRole('menuitem', { name: 'My share links' })).toHaveAttribute('href', '/?shares');
    await expect(m.getByRole('menuitem', { name: 'My grants' })).toHaveAttribute('href', '/?grants');
    await expect(m.getByRole('menuitem', { name: 'Control panel' })).toHaveAttribute('href', '/?h');
    await expect(m.getByRole('menuitem', { name: 'Change password' })).toHaveAttribute('href', '/?h#chpw');
    // the fork's old control-panel link is gone
    await expect(page.locator('#facp')).toHaveCount(0);
});

test('My share links lists the account\'s share links', async ({ page, loginAs, press }) => {
    await loginAs('alice');
    await page.goto('/home/alice/');
    await press((await openMenu(page, press, 'alice')).getByRole('menuitem', { name: 'My share links' }));
    await expect(page).toHaveURL(/\/\?shares$/);
    await expect(page.getByText('e2etripshare01').first()).toBeVisible();
});

test('My grants opens the grants page', async ({ page, loginAs, press }) => {
    await loginAs('alice');
    await page.goto('/home/alice/');
    await press((await openMenu(page, press, 'alice')).getByRole('menuitem', { name: 'My grants' }));
    await expect(page).toHaveURL(/\/\?grants$/);
    // the grant alice gave bob of proj/
    await expect(page.getByText('/home/alice/proj/').first()).toBeVisible();
});

test('Control panel opens the control panel', async ({ page, loginAs, press }) => {
    await loginAs('alice');
    await page.goto('/home/alice/');
    await press((await openMenu(page, press, 'alice')).getByRole('menuitem', { name: 'Control panel' }));
    await expect(page).toHaveURL(/\/\?h$/);
    await expect(page.locator('#un')).toHaveText('alice');
});

test('Change password opens the form with the new password box focused', async ({ page, loginAs, press }) => {
    await loginAs('alice');
    await page.goto('/home/alice/');
    await press((await openMenu(page, press, 'alice')).getByRole('menuitem', { name: 'Change password' }));
    await expect(page).toHaveURL(/\/\?h#chpw$/);
    await expect(page.getByRole('textbox', { name: 'new password', exact: true })).toBeFocused();
});

test('Log out logs out', async ({ page, loginAs, press, logoutUser }) => {
    await loginAs(logoutUser);
    await page.goto('/common/');
    await expect(row(page, 'welcome.txt')).toBeVisible();
    await press((await openMenu(page, press, logoutUser)).getByRole('menuitem', { name: 'Log out' }));
    // upstream's "ok bye" page, then the control panel with the login form
    await expect(page.locator('#lp')).toBeVisible({ timeout: 10000 });
    const r = await page.request.get('/common/?ls');
    expect(r.status()).toBe(403);
});

test('the menu is still there after moving to another folder', async ({ page, loginAs, press, nav }) => {
    await loginAs('alice');
    await page.goto('/home/alice/');
    await press((await nav()).getByRole('link', { name: 'trip', exact: true }));
    await expect(page).toHaveURL(/\/home\/alice\/trip\/$/);
    await expect(row(page, 'budget.xlsx')).toBeVisible();
    const m = await openMenu(page, press, 'alice');
    await expect(m.getByRole('menuitem')).toHaveText(ENTRIES);
});

test('a guest on a share link gets no avatar', async ({ page, server }) => {
    await page.goto(server.share);
    await expect(row(page, 'budget.xlsx')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Account/ })).toHaveCount(0);
});

test('noacci hides the avatar, like upstream\'s account box', async ({ page, loginAs }) => {
    await loginAs('alice');
    await page.goto('/home/alice/?noacci');
    await expect(row(page, 'notes.txt')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Account/ })).toHaveCount(0);
});

test('nocpla leaves out Control panel, and fullui brings it back', async ({ page, loginAs, press }) => {
    await loginAs('alice');
    await page.goto('/home/alice/?nocpla');
    let m = await openMenu(page, press, 'alice');
    await expect(m.getByRole('menuitem')).toHaveText(ENTRIES.filter((e) => e != 'Control panel'));
    // the menu replaces upstream's account box, which stays hidden
    await expect(page.locator('#acc_info')).toBeHidden();

    await page.goto('/home/alice/?nocpla&fullui');
    m = await openMenu(page, press, 'alice');
    await expect(m.getByRole('menuitem')).toHaveText(ENTRIES);
});

test('the keyboard opens it, arrows move, Esc closes it and focus returns', async ({ page, loginAs, narrow }) => {
    test.skip(narrow, 'keyboard');
    await loginAs('alice');
    await page.goto('/home/alice/');
    const av = page.getByRole('banner').getByRole('button', { name: 'Account: alice' });
    await av.focus();
    await page.keyboard.press('Enter');
    const m = page.getByRole('menu', { name: 'Account' });
    await expect(m.getByRole('menuitem', { name: 'Change password' })).toBeFocused();
    await page.keyboard.press('End');
    await expect(m.getByRole('menuitem', { name: 'Log out' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(m.getByRole('menuitem', { name: 'Change password' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(m).toBeHidden();
    await expect(av).toBeFocused();
});

test('on a phone the menu is a bottom sheet with the account name and big entries', async ({ page, loginAs, press, narrow, viewport }) => {
    test.skip(!narrow, 'phone only');
    await loginAs('alice');
    await page.goto('/home/alice/');
    const m = await openMenu(page, press, 'alice');
    await expect(m.getByText('alice', { exact: true })).toBeVisible();
    const box = await m.boundingBox();
    expect(Math.round(box.y + box.height)).toBe(viewport.height);
    for (const it of await m.getByRole('menuitem').all())
        expect((await it.boundingBox()).height).toBeGreaterThanOrEqual(44);
    // a tap outside closes it and does nothing else
    await page.touchscreen.tap(viewport.width / 2, 100);
    await expect(m).toBeHidden();
    await expect(page).toHaveURL(/\/home\/alice\/$/);
});

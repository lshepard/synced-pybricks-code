import { expect, test } from '@playwright/test';

test.setTimeout(120_000);

// The tour used to leave a beacon on screen and switch the sidebar to
// Settings. It is no longer rendered at all, so nothing of it should exist
// even for someone whose browser has it enabled from a previous visit.
test('the tour is gone', async ({ page }) => {
    await page.addInitScript(() =>
        window.localStorage.setItem('tour.showOnStartup', 'true'),
    );

    await page.goto('/project/wah');
    await page.waitForTimeout(10_000);

    const found = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('*'))
            .filter((el) => /joyride|beacon/i.test(String(el.className || '')))
            .map((el) => String(el.className).slice(0, 60)),
    );

    const explorerVisible = await page
        .locator('.pb-explorer-file-tree')
        .isVisible()
        .catch(() => false);

    console.log('\n=== tour elements in the dom ===');
    console.log('  found          :', JSON.stringify(found));
    console.log('  file list shown:', explorerVisible);
    console.log('');

    expect(found, 'no part of the tour should be rendered').toEqual([]);
    expect(explorerVisible, 'a project should open on the file list').toBe(true);
});

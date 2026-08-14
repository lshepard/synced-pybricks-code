// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

// A minimal reproduction that reports what actually happened.
//
// Not a regression test. It turns on action logging, does the smallest thing
// that fails, and prints the sequence, so a fix can be based on what the app
// did rather than on what the code looks like it should do.

import { expect, test } from '@playwright/test';

const runId = `zzDiag${Date.now()}`;

test('what happens when reopening a project', async ({ page }) => {
    await page.addInitScript(() => {
        window.localStorage.setItem('tour.showOnStartup', 'false');
        window.localStorage.setItem('cloud.debug', '1');
    });

    await page.goto('/');

    const nameField = page.getByPlaceholder('First name');
    if (await nameField.isVisible().catch(() => false)) {
        await nameField.fill('Diag');
        await page.getByRole('button', { name: 'Continue' }).click();
    }

    // one project with one file in it
    await page.getByRole('button', { name: 'New project' }).click();
    let dialog = page.getByRole('dialog').filter({ hasText: 'New project' });
    await dialog.getByPlaceholder('Line Follower').fill(`${runId} A`);
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/project\//, { timeout: 30_000 });

    await page.getByRole('button', { name: /add.*new|new file/i }).click();
    dialog = page.getByRole('dialog').filter({ hasText: 'Create a new file' });
    await dialog.getByRole('textbox').first().fill('main');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(page.locator('.monaco-editor').first()).toBeVisible({
        timeout: 30_000,
    });

    await page.locator('.monaco-editor').first().click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('DIAG_MARKER = 1\n');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    dialog = page.getByRole('dialog').filter({ hasText: 'Save to the cloud' });
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    // this is the transition that fails
    await page.evaluate(() => (window.__cloudLog = []));

    await page.getByRole('link', { name: 'Jahn Robotics' }).click();
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    await page
        .getByRole('heading', { name: `${runId} A` })
        .first()
        .click();
    await expect(page).toHaveURL(/\/project\//, { timeout: 30_000 });

    // give the load time to finish or to stall
    await page.waitForTimeout(8000);

    const log = await page.evaluate(() => window.__cloudLog ?? []);
    const editorVisible = await page
        .locator('.monaco-editor')
        .first()
        .isVisible()
        .catch(() => false);
    const text = editorVisible
        ? await page.locator('.monaco-editor').first().innerText()
        : '(no editor)';
    const tabs = await page.locator('[role="tab"]').allInnerTexts();
    const files = await page.locator('.pb-explorer-file-tree').innerText();

    console.log('\n=== actions after clicking into the project ===');
    for (const entry of log) {
        console.log('  ' + entry.type);
    }

    console.log('\n=== what the screen shows ===');
    console.log('  editor visible:', editorVisible);
    console.log('  editor text   :', JSON.stringify(text.slice(0, 120)));
    console.log('  tabs          :', JSON.stringify(tabs));
    console.log('  explorer      :', JSON.stringify(files.replace(/\n/g, ' | ')));
    console.log('');
});

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

// Reports what actually happens, rather than asserting what should.
//
// Not a regression test. It turns on action logging, walks the smallest path
// that fails, and prints the action sequence plus the state of the screen at
// each step, so a fix can be based on measurement instead of on reading the
// code and guessing.

import { Page, expect, test } from '@playwright/test';

const runId = `zzDiag${Date.now()}`;

/** Everything worth knowing about what is on screen. */
async function inspect(page: Page) {
    return await page.evaluate(async () => {
        const host = document.querySelector<HTMLElement>('.pb-cloud-editor-host');
        const monaco = document.querySelector<HTMLElement>('.monaco-editor');

        // only the editor's own tabs; the sidebar activities are tabs too
        const tabs = Array.from(
            document.querySelectorAll('[role="tab"]'),
            (t) => t.textContent ?? '',
        ).filter((t) => t !== '');

        const request = indexedDB.open('pybricks.fileStorage');
        const paths = await new Promise<string[]>((resolve) => {
            request.onsuccess = () => {
                const tx = request.result.transaction('metadata', 'readonly');
                const all = tx.objectStore('metadata').getAll();
                all.onsuccess = () =>
                    resolve(all.result.map((f: { path: string }) => f.path));
                all.onerror = () => resolve(['(read failed)']);
            };
            request.onerror = () => resolve(['(open failed)']);
        });

        return {
            tabs,
            storage: paths,
            monacoCount: document.querySelectorAll('.monaco-editor').length,
            hostSize: host ? `${host.offsetWidth}x${host.offsetHeight}` : '(none)',
            monacoSize: monaco
                ? `${monaco.offsetWidth}x${monaco.offsetHeight}`
                : '(none)',
            text: (monaco?.innerText ?? '(none)').replace(/\s+/g, ' ').slice(0, 90),
        };
    });
}

/** Prints a labelled snapshot with the actions that led to it. */
async function report(page: Page, label: string) {
    const log = await page.evaluate(() => {
        const entries = window.__cloudLog ?? [];
        window.__cloudLog = [];
        return entries;
    });

    const state = await inspect(page);

    console.log(`\n──── ${label} ────`);
    console.log('  actions:');
    for (const e of log) {
        console.log('    ' + e.type);
    }
    console.log('  monaco elements:', state.monacoCount);
    console.log('  host size      :', state.hostSize);
    console.log('  monaco size    :', state.monacoSize);
    console.log('  editor tabs    :', JSON.stringify(state.tabs));
    console.log('  storage holds  :', JSON.stringify(state.storage));
    console.log('  editor shows   :', JSON.stringify(state.text));
}

test('creating a file, and reopening a project', async ({ page }) => {
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

    await page.getByRole('button', { name: 'New project' }).click();
    let dialog = page.getByRole('dialog').filter({ hasText: 'New project' });
    await dialog.getByPlaceholder('Line Follower').fill(`${runId} A`);
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/project\//, { timeout: 30_000 });
    await page.waitForTimeout(3000);

    await report(page, 'after creating an empty project');

    // first thing under test: does a newly created file open?
    await page.getByRole('button', { name: /add.*new|new file/i }).click();
    dialog = page.getByRole('dialog').filter({ hasText: 'Create a new file' });
    await dialog.getByRole('textbox').first().fill('main');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(4000);

    await report(page, 'after adding main.py');

    // give it identifiable content, so the reopen has something to show
    const editor = page.locator('.monaco-editor').first();

    if (await editor.isVisible().catch(() => false)) {
        await editor.click();
        await page.keyboard.press('ControlOrMeta+A');
        await page.keyboard.type('DIAG_MARKER = 1\n');
    }

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    dialog = page.getByRole('dialog').filter({ hasText: 'Save to the cloud' });
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await page.waitForTimeout(2000);

    await report(page, 'after saving');

    // third thing under test: does an empty second project clear the screen?
    await page.getByRole('link', { name: 'Jahn Robotics' }).click();
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    await page.getByRole('button', { name: 'New project' }).click();
    dialog = page.getByRole('dialog').filter({ hasText: 'New project' });
    await dialog.getByPlaceholder('Line Follower').fill(`${runId} B`);
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/project\//, { timeout: 30_000 });
    await page.waitForTimeout(5000);

    await report(page, 'after opening a second, empty project');

    // second thing under test: does reopening show the code again?
    await page.getByRole('link', { name: 'Jahn Robotics' }).click();
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    await page
        .getByRole('heading', { name: `${runId} A` })
        .first()
        .click();
    await expect(page).toHaveURL(/\/project\//, { timeout: 30_000 });
    await page.waitForTimeout(6000);

    await report(page, 'after reopening the project');
    console.log('');
});

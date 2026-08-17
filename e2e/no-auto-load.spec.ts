// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

// Opening a project must not replace what is in the editor.
//
// It used to: every open loaded the newest version over local storage, which
// deleted every file and wrote it back under a new uuid. The editor had
// already restored its tabs from the previous load's uuids by then, so it was
// left holding references to rows that no longer existed, and the failure kept
// `cloud.version` from ever being written, which made the next open do it all
// again.

import { Page, expect, test } from '@playwright/test';

const runId = `zzNoAuto${Date.now()}`;

/** Gets past the name prompt, if it is showing. */
async function giveName(page: Page, name: string) {
    const field = page.getByPlaceholder('First name');

    if (await field.isVisible().catch(() => false)) {
        await field.fill(name);
        await page.getByRole('button', { name: 'Continue' }).click();
    }
}

/** Makes a project and lands in its editor. */
async function newProject(page: Page, name: string) {
    await page.getByRole('button', { name: 'New project' }).click();

    const dialog = page.getByRole('dialog').filter({ hasText: 'New project' });
    await dialog.getByPlaceholder('Line Follower').fill(name);
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/project\//, { timeout: 30_000 });
}

/** Adds a file and types contents into it. */
async function addFile(page: Page, stem: string, contents: string) {
    await page.getByRole('button', { name: /add.*new|new file/i }).click();

    const dialog = page.getByRole('dialog').filter({ hasText: 'Create a new file' });
    await dialog.getByRole('textbox').first().fill(stem);
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    const editor = page.locator('.monaco-editor').first();
    await expect(editor).toBeVisible({ timeout: 20_000 });
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(contents);
}

/** Saves a version through the dialog. */
async function save(page: Page) {
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    const dialog = page.getByRole('dialog').filter({ hasText: 'Save to the cloud' });
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
}

/** What the editor is currently showing. */
async function editorText(page: Page): Promise<string> {
    return await page.evaluate(
        () =>
            document.querySelector<HTMLElement>('.monaco-editor')?.innerText ??
            '(none)',
    );
}

test.setTimeout(180_000);

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        window.localStorage.setItem('tour.showOnStartup', 'false');
        window.localStorage.setItem('cloud.debug', '1');
    });
});

test('a refresh keeps unsaved edits and raises no error', async ({ page }) => {
    await page.goto('/');
    await giveName(page, 'NoAuto');
    await newProject(page, `${runId} keep`);
    await addFile(page, 'main', 'SAVED = 1\n');
    await save(page);

    // an edit that exists only in this browser
    const editor = page.locator('.monaco-editor').first();
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('UNSAVED_EDIT = 2\n');
    await page.waitForTimeout(2000);

    await page.reload();
    await page.waitForTimeout(6000);

    // The whole point: a reload is not a reason to throw away work.
    expect(await editorText(page)).toContain('UNSAVED_EDIT');

    // The uuid failures surfaced as toasts, so any error on screen is a
    // regression even if the text is right.
    await expect(page.getByText(/could not be opened|not found/i)).toHaveCount(0);

    // Nothing was loaded, so no file was deleted and rewritten.
    const log = await page.evaluate(() => window.__cloudLog ?? []);
    expect(log.map((e) => e.type)).not.toContain('cloud.loadFiles');
});

test('local storage that is empty loads the latest without asking', async ({
    page,
}) => {
    await page.goto('/');
    await giveName(page, 'NoAuto');
    await newProject(page, `${runId} empty`);
    await addFile(page, 'main', 'FROM_CLOUD = 1\n');
    await save(page);

    const url = page.url();

    // a browser that has never seen this project
    await page.evaluate(async () => {
        window.localStorage.clear();
        window.sessionStorage.clear();
        indexedDB.deleteDatabase('pybricks.fileStorage');
    });

    await page.goto(url);
    await giveName(page, 'NoAuto');
    await page.waitForTimeout(8000);

    // nothing to lose, so it loads rather than prompting
    expect(await editorText(page)).toContain('FROM_CLOUD');
    await expect(page.getByText('Load it')).toHaveCount(0);
});

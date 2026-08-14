// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

// Browser tests for the parts that only a browser can check: that the editor
// boots, that files survive a save and load, and that swapping projects does
// not leave the editor holding files it can no longer open.

import { Page, expect, test } from '@playwright/test';

/** Names every project made here, so a run's data can be told apart. */
const runId = `zzE2E${Date.now()}`;

/** Gets past the name prompt and onto the dashboard. */
async function arrive(page: Page, who = 'Tester'): Promise<void> {
    // The welcome tour opens over the editor on a first visit and swallows
    // clicks. A real first-time user dismisses it; these tests are about what
    // happens afterwards.
    await page.addInitScript(() => {
        window.localStorage.setItem('tour.showOnStartup', 'false');
    });

    await page.goto('/');

    const nameField = page.getByPlaceholder('First name');

    if (await nameField.isVisible().catch(() => false)) {
        await nameField.fill(who);
        await page.getByRole('button', { name: 'Continue' }).click();
    }

    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
}

/** Creates a project from the dashboard and waits for the editor. */
async function createProject(page: Page, label: string): Promise<string> {
    const name = `${runId} ${label}`;

    await page.getByRole('button', { name: 'New project' }).click();
    await page.getByPlaceholder('Line Follower').fill(name);
    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page).toHaveURL(/\/project\//, { timeout: 30_000 });

    return name;
}

/** Types into the code editor. */
async function typeCode(page: Page, code: string): Promise<void> {
    const editor = page.locator('.monaco-editor').first();
    await expect(editor).toBeVisible({ timeout: 30_000 });

    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(code);
}

/** Saves to the cloud with an optional note. */
async function save(page: Page, note = ''): Promise<void> {
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    const noteField = page.getByPlaceholder('fixed the turn radius');
    await expect(noteField).toBeVisible();

    if (note) {
        await noteField.fill(note);
    }

    await page.getByRole('button', { name: 'Save', exact: true }).last().click();
    await expect(noteField).toBeHidden({ timeout: 30_000 });
}

test.describe('the editor', () => {
    test('should load with cross origin isolation, which its workers need', async ({
        page,
    }) => {
        await page.goto('/');

        // without this Pyodide and mpy-cross cannot run, and the failure shows
        // up much later as the editor quietly not working
        expect(await page.evaluate(() => globalThis.crossOriginIsolated)).toBe(true);
    });

    test('should open a new project with nothing in it', async ({ page }) => {
        await arrive(page);
        await createProject(page, 'Blank');

        // A new project has no files at all, so there is no editor yet. What
        // matters is that it did not inherit the previous project's files.
        await expect(page.getByRole('button', { name: /History \(0\)/ })).toBeVisible();
        await expect(page.locator('.monaco-editor')).toHaveCount(0);
    });

    test('should keep code across a save and reload', async ({ page }) => {
        await arrive(page);
        await createProject(page, 'RoundTrip');

        const code = 'from pybricks.hubs import PrimeHub\nhub = PrimeHub()\n';
        await typeCode(page, code);
        await save(page, 'first save');

        await expect(page.getByRole('button', { name: /History \(1\)/ })).toBeVisible();

        // reloading rebuilds everything from storage, so it proves the save
        // landed rather than just the editor still holding the text
        await page.reload();

        await expect(page.locator('.monaco-editor').first()).toBeVisible({
            timeout: 30_000,
        });
        await expect(page.locator('.monaco-editor').first()).toContainText('PrimeHub', {
            timeout: 30_000,
        });
    });

    test('should swap files when moving between projects', async ({ page }) => {
        await arrive(page);

        // first project, with something identifiable in it
        await createProject(page, 'AlphaSide');
        await typeCode(page, 'ALPHA_MARKER = 1\n');
        await save(page, 'alpha');

        // second project, likewise
        await page.getByRole('link', { name: 'Jahn Robotics' }).click();
        await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
        await createProject(page, 'BetaSide');
        await typeCode(page, 'BETA_MARKER = 2\n');
        await save(page, 'beta');

        const editor = page.locator('.monaco-editor').first();
        await expect(editor).toContainText('BETA_MARKER');
        await expect(editor).not.toContainText('ALPHA_MARKER');

        // back to the first: its files must come back, and the editor must be
        // able to open them. Reusing a file uuid whose web lock was never
        // released is what produces "already open in another window".
        await page.getByRole('link', { name: 'Jahn Robotics' }).click();
        await page
            .getByRole('heading', { name: `${runId} AlphaSide` })
            .first()
            .click();

        await expect(editor).toBeVisible({ timeout: 30_000 });
        await expect(editor).toContainText('ALPHA_MARKER', { timeout: 30_000 });
        await expect(editor).not.toContainText('BETA_MARKER');
    });

    test('should not report a file as already open after switching twice', async ({
        page,
    }) => {
        const errors: string[] = [];
        page.on('console', (message) => {
            if (message.type() === 'error') {
                errors.push(message.text());
            }
        });

        await arrive(page);
        const first = await createProject(page, 'Bounce');
        await typeCode(page, 'BOUNCE = 1\n');
        await save(page);

        // leave and come back twice, which is when the stale lock showed up
        for (let i = 0; i < 2; i++) {
            await page.getByRole('link', { name: 'Jahn Robotics' }).click();
            await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
            await page.getByRole('heading', { name: first }).first().click();
            await expect(page.locator('.monaco-editor').first()).toBeVisible({
                timeout: 30_000,
            });
        }

        await expect(page.locator('.monaco-editor').first()).toContainText('BOUNCE', {
            timeout: 30_000,
        });

        expect(
            errors.filter((e) => /already open|in use/i.test(e)),
            'the editor should not have reported a file as already open',
        ).toEqual([]);
    });

    test('should show a saved version in the history and load it back', async ({
        page,
    }) => {
        await arrive(page);
        await createProject(page, 'History');

        await typeCode(page, 'VERSION_ONE = 1\n');
        await save(page, 'version one');

        await typeCode(page, 'VERSION_TWO = 2\n');
        await save(page, 'version two');

        await page.getByRole('button', { name: /History \(2\)/ }).click();

        const feed = page.getByText('version one');
        await expect(feed).toBeVisible();

        // loading an older version brings its files back; saving on top of it
        // would then append rather than overwrite
        await feed.click();

        await expect(page.locator('.monaco-editor').first()).toContainText(
            'VERSION_ONE',
            { timeout: 30_000 },
        );
    });
});

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

// One journey through the whole thing, in a real browser.
//
// This is deliberately a single test rather than several small ones. Every bug
// worth catching here has been about the editor not drawing after files moved
// underneath it, and unit tests kept passing through all of them: they check
// that actions fire in the right order, not that text appears on screen. What
// matters is that a person can make a project, type in it, leave, come back
// and still see their code.

import { Page, expect, test } from '@playwright/test';

const runId = `zzE2E${Date.now()}`;

/** The text currently visible in the code editor. */
function editorText(page: Page) {
    return page.locator('.monaco-editor').first();
}

/** Gets past the name prompt and onto the dashboard. */
async function arrive(page: Page): Promise<void> {
    // the welcome tour opens over the editor on a first visit and takes clicks
    await page.addInitScript(() =>
        window.localStorage.setItem('tour.showOnStartup', 'false'),
    );

    await page.goto('/');

    const nameField = page.getByPlaceholder('First name');

    if (await nameField.isVisible().catch(() => false)) {
        await nameField.fill('Tester');
        await page.getByRole('button', { name: 'Continue' }).click();
    }

    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
}

/** Creates a project and waits for its page, from wherever the test is. */
async function createProject(page: Page, label: string): Promise<string> {
    const name = `${runId} ${label}`;

    // the button lives on the dashboard, so get there first
    if (!page.url().endsWith('/')) {
        await page.getByRole('link', { name: 'Jahn Robotics' }).click();
        await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    }

    await page.getByRole('button', { name: 'New project' }).click();

    const dialog = page.getByRole('dialog').filter({ hasText: 'New project' });
    await dialog.getByPlaceholder('Line Follower').fill(name);
    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(page).toHaveURL(/\/project\//, { timeout: 30_000 });

    return name;
}

/** Adds a file through the explorer, which is how a project gets its first. */
async function addFile(page: Page, name: string): Promise<void> {
    await page.getByRole('button', { name: /add.*new|new file/i }).click();

    const dialog = page.getByRole('dialog').filter({ hasText: 'Create a new file' });
    await dialog.getByRole('textbox').first().fill(name);
    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(dialog).toBeHidden();
    await expect(editorText(page)).toBeVisible({ timeout: 30_000 });
}

/** Replaces the contents of the open file. */
async function typeCode(page: Page, code: string): Promise<void> {
    await editorText(page).click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');

    // Typed slowly, and with the suggestion popup dismissed after each line.
    // Code completion opens on the first letter of an identifier and eats the
    // keystrokes that follow, which truncated the text to a single character.
    for (const line of code.split('\n')) {
        await page.keyboard.type(line, { delay: 30 });
        await page.keyboard.press('Escape');
        await page.keyboard.press('Enter');
    }

    await expect(editorText(page)).toContainText(code.split('\n')[0], {
        timeout: 15_000,
    });
}

/** Saves the project to the cloud. */
async function save(page: Page, note: string): Promise<void> {
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    const dialog = page.getByRole('dialog').filter({ hasText: 'Save to the cloud' });
    await dialog.getByPlaceholder('fixed the turn radius').fill(note);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(dialog).toBeHidden({ timeout: 30_000 });
}

/** Opens a project from the dashboard by name. */
async function openFromDashboard(page: Page, name: string): Promise<void> {
    await page.getByRole('link', { name: 'Jahn Robotics' }).click();
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();

    await page.getByRole('heading', { name }).first().click();
    await expect(page).toHaveURL(/\/project\//, { timeout: 30_000 });

    // the project's own history count appearing means its load finished; the
    // url changes before that, so asserting on content straight away races it
    await expect(page.getByRole('button', { name: /History \(\d+\)/ })).toBeVisible({
        timeout: 30_000,
    });
}

test('a project can be made, saved, left and reopened', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    await arrive(page);

    // the editor needs cross-origin isolation for pyodide and the mpy-cross
    // workers, and gets it from headers that are easy to lose
    expect(await page.evaluate(() => globalThis.crossOriginIsolated)).toBe(true);

    // a new project starts with nothing in it
    const first = await createProject(page, 'Journey');
    await expect(page.getByRole('button', { name: /History \(0\)/ })).toBeVisible();

    await addFile(page, 'main');
    await typeCode(page, 'FIRST_MARKER = 1\n');
    await save(page, 'first save');

    await expect(page.getByRole('button', { name: /History \(1\)/ })).toBeVisible();

    // A second project must not inherit the first one's files. It has none, so
    // the editor should end up with nothing open at all: waiting for that is
    // what says the swap finished. Checking the text instead races the
    // teardown and catches the previous project's still on screen.
    const second = await createProject(page, 'Other');
    await expect(page.getByRole('button', { name: /History \(0\)/ })).toBeVisible();
    await expect(page.locator('.monaco-editor')).toHaveCount(0, { timeout: 30_000 });

    await addFile(page, 'other');
    await typeCode(page, 'SECOND_MARKER = 2\n');
    await save(page, 'second save');

    // going back to the first must bring its code back and show it. Leaving a
    // project unmounts the editor, and the saga that drives it used to keep
    // writing to the widget that unmounting disposed, so the code loaded but
    // the pane stayed blank.
    await openFromDashboard(page, first);

    await expect(editorText(page)).toBeVisible({ timeout: 30_000 });
    await expect(editorText(page)).toContainText('FIRST_MARKER', { timeout: 30_000 });
    await expect(editorText(page)).not.toContainText('SECOND_MARKER');

    // and again, since the handlers accumulated one per visit
    await openFromDashboard(page, second);
    await expect(editorText(page)).toContainText('SECOND_MARKER', { timeout: 30_000 });

    await openFromDashboard(page, first);
    await expect(editorText(page)).toContainText('FIRST_MARKER', { timeout: 30_000 });

    // adding a file after all that still has to work
    await addFile(page, 'late');
    await typeCode(page, 'LATE_MARKER = 3\n');
    await expect(editorText(page)).toContainText('LATE_MARKER');

    // a reload rebuilds everything from storage, so it proves the save landed
    await page.reload();
    await expect(editorText(page)).toBeVisible({ timeout: 30_000 });
    await expect(editorText(page)).toContainText('MARKER', { timeout: 30_000 });

    expect(
        errors.filter((e) => /already open|in use|not found|disposed/i.test(e)),
        'the editor should not have complained about files or disposed widgets',
    ).toEqual([]);
});

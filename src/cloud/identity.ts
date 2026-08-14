// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

// Who is using this browser, and which tab they are using.
//
// There are no accounts. A name is attribution, not authentication.

import { maxAuthorLength } from './protocol';

const nameKey = 'cloud.name';
const sessionKey = 'cloud.sessionId';
const projectKey = 'cloud.project';
const savedKey = 'cloud.lastSavedAt';
const editedKey = 'cloud.lastEditedAt';

/**
 * Reads the stored display name.
 *
 * @returns The name, or undefined if none has been given.
 */
export function getName(): string | undefined {
    return localStorage.getItem(nameKey) ?? undefined;
}

/**
 * Stores the display name.
 *
 * @param name The name as typed.
 */
export function setName(name: string): void {
    localStorage.setItem(nameKey, name.trim().slice(0, maxAuthorLength));
}

/** Forgets the display name, so the prompt shows again. */
export function clearName(): void {
    localStorage.removeItem(nameKey);
}

/**
 * Returns this tab's session id, creating one if needed.
 *
 * Kept in sessionStorage so each tab is distinct and a reopened browser does
 * not inherit a lock it no longer holds.
 *
 * @returns The session id.
 */
export function getSessionId(): string {
    const existing = sessionStorage.getItem(sessionKey);

    if (existing) {
        return existing;
    }

    const created = crypto.randomUUID();
    sessionStorage.setItem(sessionKey, created);

    return created;
}

/**
 * Reads which project the local files belong to.
 *
 * @returns The slug, or undefined if local storage is not tied to a project.
 */
export function getCurrentProject(): string | undefined {
    return localStorage.getItem(projectKey) ?? undefined;
}

/**
 * Records which project the local files belong to, and marks them as saved.
 *
 * @param slug The project, or undefined to forget.
 */
export function setCurrentProject(slug: string | undefined): void {
    if (slug === undefined) {
        localStorage.removeItem(projectKey);
        localStorage.removeItem(savedKey);
        localStorage.removeItem(editedKey);
        return;
    }

    localStorage.setItem(projectKey, slug);
}

/** Records that the local files were just saved to the cloud. */
export function markSaved(): void {
    localStorage.setItem(savedKey, String(Date.now()));
}

/** Records that the local files were just edited. */
export function markEdited(): void {
    localStorage.setItem(editedKey, String(Date.now()));
}

/**
 * Tests whether local files have changed since the last cloud save.
 *
 * @returns True if there are edits that have not been saved.
 */
export function isDirty(): boolean {
    const edited = Number(localStorage.getItem(editedKey) ?? 0);
    const saved = Number(localStorage.getItem(savedKey) ?? 0);

    return edited > saved;
}

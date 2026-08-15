// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

// Who is using this browser, and which tab they are using.
//
// There are no accounts. A name is attribution, not authentication.

import { maxAuthorLength } from './protocol';

const nameKey = 'cloud.name';
const sessionKey = 'cloud.sessionId';
const projectKey = 'cloud.project';
const versionKey = 'cloud.version';

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
 * Records which project the local files belong to.
 *
 * @param slug The project, or undefined to forget.
 */
export function setCurrentProject(slug: string | undefined): void {
    if (slug === undefined) {
        localStorage.removeItem(projectKey);
        localStorage.removeItem(versionKey);
        return;
    }

    localStorage.setItem(projectKey, slug);
}

/**
 * Records which version the local files came from.
 *
 * Set when a version is loaded and when one is saved, since in both cases the
 * files on this machine are that version.
 *
 * @param slug The project the version belongs to.
 * @param id The version id.
 */
export function setLocalVersion(slug: string, id: number): void {
    localStorage.setItem(projectKey, slug);
    localStorage.setItem(versionKey, String(id));
}

/**
 * Reads which version the local files came from.
 *
 * @param slug The project being opened.
 * @returns The version id, or undefined if the local files are from another
 * project or from no version at all.
 */
export function getLocalVersion(slug: string): number | undefined {
    if (localStorage.getItem(projectKey) !== slug) {
        return undefined;
    }

    const stored = Number(localStorage.getItem(versionKey));

    return Number.isFinite(stored) && stored > 0 ? stored : undefined;
}

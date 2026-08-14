// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

// Data types and pure logic shared between the cloud API and the browser.
//
// Everything in this file is free of I/O so that it can be unit tested and
// used from both the serverless functions and the front end without pulling
// in a storage backend.

/** How long a lock is honored before it is considered abandoned. */
export const lockTtlMs = 20 * 60 * 1000;

/** Maximum length of a user-supplied project name. */
export const maxProjectNameLength = 60;

/** Maximum length of a save note. */
export const maxNoteLength = 280;

/** Maximum length of a user's display name. */
export const maxAuthorLength = 40;

/** An entry in the project manifest. */
export type ProjectInfo = Readonly<{
    /** URL- and path-safe unique identifier derived from the name. */
    slug: string;
    /** The name as typed by the user. */
    name: string;
    /** ISO 8601 timestamp of when the project was created. */
    createdAt: string;
    /** ISO 8601 timestamp of the most recent version. */
    updatedAt: string;
    /** Archived projects are hidden from the main list but never deleted. */
    archived: boolean;
}>;

/** An entry in a project's version index. */
export type VersionInfo = Readonly<{
    /** Unique identifier for the version, also its sort key. */
    id: string;
    /** ISO 8601 timestamp of when the version was saved. */
    savedAt: string;
    /** The name of whoever saved it. */
    author: string;
    /** Optional free-text description of the change. */
    note: string;
}>;

/** A complete snapshot of every file in a project at a point in time. */
export type VersionSnapshot = VersionInfo &
    Readonly<{
        /** Maps file path to file contents. */
        files: Readonly<Record<string, string>>;
    }>;

/** The current holder of a project's edit lock. */
export type Lock = Readonly<{
    /** The name of whoever holds the lock. */
    holder: string;
    /** Identifies the browser tab, so a stale lock can't be reused. */
    sessionId: string;
    /** ISO 8601 timestamp of when the lock was acquired or refreshed. */
    since: string;
}>;

/**
 * Converts a user-supplied project name to a path-safe slug.
 *
 * Blob keys end up in URLs, so the result is restricted to lowercase
 * alphanumerics and single dashes.
 *
 * @param name The name as typed by the user.
 * @returns The slug, or an empty string if the name has no usable characters.
 */
export function slugify(name: string): string {
    return (
        name
            .normalize('NFKD')
            // strip combining marks so accented letters become their base letter
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 64)
            // slicing can leave a trailing dash
            .replace(/-+$/g, '')
    );
}

/**
 * Picks a slug that is not already used by an existing project.
 *
 * Archived projects still occupy their slug, since they remain readable and
 * can be unarchived at any time.
 *
 * @param name The name as typed by the user.
 * @param existing The slugs already in the manifest.
 * @returns A slug that is not in `existing`.
 */
export function uniqueSlug(name: string, existing: readonly string[]): string {
    const base = slugify(name) || 'project';
    const taken = new Set(existing);

    if (!taken.has(base)) {
        return base;
    }

    for (let i = 2; ; i++) {
        const candidate = `${base}-${i}`;
        if (!taken.has(candidate)) {
            return candidate;
        }
    }
}

/**
 * Tests whether a lock may be taken by someone else.
 *
 * A lock is stale once it has not been refreshed within {@link lockTtlMs},
 * which covers the common case of a browser being closed without releasing it.
 *
 * @param lock The current lock, or undefined if there is none.
 * @param now The current time in milliseconds since the epoch.
 * @returns True if the lock is absent or expired.
 */
export function isLockStale(lock: Lock | undefined, now: number): boolean {
    if (!lock) {
        return true;
    }

    const since = Date.parse(lock.since);

    // a lock with an unparsable timestamp can't be trusted to ever expire
    if (Number.isNaN(since)) {
        return true;
    }

    return now - since >= lockTtlMs;
}

/**
 * Tests whether a session is allowed to save to a project.
 *
 * @param lock The current lock, or undefined if there is none.
 * @param sessionId The session asking to save.
 * @param now The current time in milliseconds since the epoch.
 * @returns True if the session holds the lock or the lock is stale.
 */
export function canSave(
    lock: Lock | undefined,
    sessionId: string,
    now: number,
): boolean {
    return isLockStale(lock, now) || lock?.sessionId === sessionId;
}

/**
 * Sorts version index entries newest first.
 *
 * @param versions The entries to sort.
 * @returns A new sorted array.
 */
export function sortVersions(versions: readonly VersionInfo[]): VersionInfo[] {
    return [...versions].sort((a, b) => b.id.localeCompare(a.id));
}

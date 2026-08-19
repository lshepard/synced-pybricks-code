// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

// Data types and pure logic shared between the cloud API and the browser.
//
// Anything that a database can express directly belongs in SQL rather than
// here. This file is limited to shapes and to string handling that has to
// match on both sides of the wire.

/** How long a lock is honored before it is considered abandoned. */
export const lockTtlMs = 20 * 60 * 1000;

/** Maximum length of a user-supplied project name. */
export const maxProjectNameLength = 60;

/** Maximum length of a save note. */
export const maxNoteLength = 280;

/** Maximum length of a user's display name. */
export const maxAuthorLength = 40;

/** A project as shown in the dashboard. */
export type ProjectInfo = Readonly<{
    /** URL-safe unique identifier derived from the name. */
    slug: string;
    /** The name as typed by the user. */
    name: string;
    /** ISO 8601 timestamp of when the project was created. */
    createdAt: string;
    /** ISO 8601 timestamp of the most recent version. */
    updatedAt: string;
    /** Archived projects are hidden from the main list but never deleted. */
    archived: boolean;
    /**
     * The name of whoever saved the most recent version, or undefined if the
     * project has never been saved to.
     */
    lastEditor?: string;
}>;

/** An entry in a project's version feed. */
export type VersionInfo = Readonly<{
    /** Unique identifier for the version. */
    id: number;
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
 * Converts a user-supplied project name to a URL-safe slug.
 *
 * Slugs appear in URLs, so the result is restricted to lowercase
 * alphanumerics and single dashes.
 *
 * Uniqueness is not handled here. The database owns that, via a unique
 * constraint, because only it can decide it without a race.
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

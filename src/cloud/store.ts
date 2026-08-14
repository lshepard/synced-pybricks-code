// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Pybricks Authors

// Project storage operations.
//
// These sit on top of a minimal key/value interface so that the logic here can
// be tested without a storage backend, and so that swapping backends does not
// touch anything else.

import {
    Lock,
    ProjectInfo,
    VersionInfo,
    VersionSnapshot,
    canSave,
    isLockStale,
    maxAuthorLength,
    maxNoteLength,
    maxProjectNameLength,
    sortVersions,
    uniqueSlug,
} from './protocol';

/**
 * A minimal key/value blob store.
 *
 * Implementations must be safe to call with keys that do not exist.
 */
export type BlobStore = {
    /** Reads a value, or resolves undefined if the key does not exist. */
    get(key: string): Promise<string | undefined>;
    /** Writes a value, overwriting any existing one. */
    put(key: string, value: string): Promise<void>;
};

/** Reasons an operation can fail. */
export type CloudErrorName =
    | 'NotFound'
    | 'Locked'
    | 'InvalidName'
    | 'InvalidNote'
    | 'InvalidAuthor'
    | 'InvalidFiles';

/** An error with a machine-readable name, so callers can map it to a status. */
export class CloudError extends Error {
    constructor(
        public readonly name: CloudErrorName,
        message: string,
        /** Extra detail returned to the client, e.g. who holds a lock. */
        public readonly detail?: unknown,
    ) {
        super(message);
    }
}

const manifestKey = 'cloud/manifest.json';

function versionIndexKey(slug: string): string {
    return `cloud/${slug}/versions/index.json`;
}

function versionKey(slug: string, id: string): string {
    return `cloud/${slug}/versions/${id}.json`;
}

function lockKey(slug: string): string {
    return `cloud/${slug}/lock.json`;
}

async function readJson<T>(store: BlobStore, key: string): Promise<T | undefined> {
    const raw = await store.get(key);

    if (raw === undefined) {
        return undefined;
    }

    try {
        return JSON.parse(raw) as T;
    } catch {
        // A corrupt blob should not take down the whole dashboard. Treating it
        // as missing lets the caller fall back to an empty default, and since
        // nothing is ever deleted the original blob is still there to inspect.
        return undefined;
    }
}

async function writeJson(store: BlobStore, key: string, value: unknown): Promise<void> {
    await store.put(key, JSON.stringify(value));
}

/**
 * Builds a version id that sorts lexicographically by time.
 *
 * Blob listings and string compares are lexicographic, so a fixed-width form
 * is used rather than a bare epoch number, which would misorder once it grows
 * a digit.
 *
 * @param when The time to encode.
 * @returns A sortable id, e.g. `20260813T143200000Z`.
 */
export function versionId(when: Date): string {
    return when.toISOString().replace(/[-:.]/g, '');
}

/**
 * Reads the project manifest.
 *
 * @param store The blob store.
 * @returns All projects, including archived ones. Empty if not yet created.
 */
export async function getProjects(store: BlobStore): Promise<ProjectInfo[]> {
    return (await readJson<ProjectInfo[]>(store, manifestKey)) ?? [];
}

function requireProject(projects: readonly ProjectInfo[], slug: string): ProjectInfo {
    const project = projects.find((p) => p.slug === slug);

    if (!project) {
        throw new CloudError('NotFound', `no project '${slug}'`);
    }

    return project;
}

function validText(
    value: unknown,
    max: number,
    error: CloudErrorName,
    what: string,
): string {
    if (typeof value !== 'string') {
        throw new CloudError(error, `${what} is required`);
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
        throw new CloudError(error, `${what} cannot be blank`);
    }

    if (trimmed.length > max) {
        throw new CloudError(error, `${what} cannot exceed ${max} characters`);
    }

    return trimmed;
}

/**
 * Creates a project with an empty version history.
 *
 * @param store The blob store.
 * @param name The name as typed by the user.
 * @param now The current time.
 * @returns The newly created project.
 */
export async function createProject(
    store: BlobStore,
    name: string,
    now: Date,
): Promise<ProjectInfo> {
    const validName = validText(name, maxProjectNameLength, 'InvalidName', 'name');

    const projects = await getProjects(store);
    const timestamp = now.toISOString();

    const project: ProjectInfo = {
        slug: uniqueSlug(
            validName,
            projects.map((p) => p.slug),
        ),
        name: validName,
        createdAt: timestamp,
        updatedAt: timestamp,
        archived: false,
    };

    await writeJson(store, versionIndexKey(project.slug), []);
    await writeJson(store, manifestKey, [...projects, project]);

    return project;
}

/**
 * Sets a project's archived flag.
 *
 * Archiving hides a project from the default list. It never deletes anything,
 * and is always reversible.
 *
 * @param store The blob store.
 * @param slug The project to change.
 * @param archived The new value.
 * @returns The updated project.
 */
export async function setArchived(
    store: BlobStore,
    slug: string,
    archived: boolean,
): Promise<ProjectInfo> {
    const projects = await getProjects(store);
    requireProject(projects, slug);

    const updated = projects.map((p) => (p.slug === slug ? { ...p, archived } : p));
    await writeJson(store, manifestKey, updated);

    return requireProject(updated, slug);
}

/**
 * Reads a project's version feed, newest first.
 *
 * @param store The blob store.
 * @param slug The project to read.
 * @returns The version index.
 */
export async function getVersions(
    store: BlobStore,
    slug: string,
): Promise<VersionInfo[]> {
    requireProject(await getProjects(store), slug);

    return sortVersions(
        (await readJson<VersionInfo[]>(store, versionIndexKey(slug))) ?? [],
    );
}

/**
 * Reads one complete version snapshot.
 *
 * @param store The blob store.
 * @param slug The project to read.
 * @param id The version to read.
 * @returns The snapshot including all file contents.
 */
export async function getVersion(
    store: BlobStore,
    slug: string,
    id: string,
): Promise<VersionSnapshot> {
    requireProject(await getProjects(store), slug);

    const snapshot = await readJson<VersionSnapshot>(store, versionKey(slug, id));

    if (!snapshot) {
        throw new CloudError('NotFound', `no version '${id}' in '${slug}'`);
    }

    return snapshot;
}

function validFiles(files: unknown): Record<string, string> {
    if (typeof files !== 'object' || files === null || Array.isArray(files)) {
        throw new CloudError('InvalidFiles', 'files must be an object');
    }

    const entries = Object.entries(files as Record<string, unknown>);

    if (entries.length === 0) {
        throw new CloudError('InvalidFiles', 'cannot save an empty project');
    }

    for (const [path, contents] of entries) {
        if (typeof contents !== 'string') {
            throw new CloudError(
                'InvalidFiles',
                `contents of '${path}' must be a string`,
            );
        }
    }

    return Object.fromEntries(entries) as Record<string, string>;
}

/**
 * Appends a new version.
 *
 * Versions are only ever added. Saving while an older version is loaded does
 * not branch or overwrite; it simply becomes the newest version.
 *
 * @param store The blob store.
 * @param slug The project to save to.
 * @param save The snapshot contents and who is saving.
 * @param now The current time.
 * @returns The new version's index entry.
 */
export async function addVersion(
    store: BlobStore,
    slug: string,
    save: {
        files: unknown;
        author: unknown;
        note?: unknown;
        sessionId: string;
    },
    now: Date,
): Promise<VersionInfo> {
    const projects = await getProjects(store);
    requireProject(projects, slug);

    const author = validText(save.author, maxAuthorLength, 'InvalidAuthor', 'author');
    const files = validFiles(save.files);

    const note =
        save.note === undefined || save.note === null || save.note === ''
            ? ''
            : validText(save.note, maxNoteLength, 'InvalidNote', 'note');

    const lock = await readJson<Lock>(store, lockKey(slug));

    if (!canSave(lock, save.sessionId, now.getTime())) {
        throw new CloudError('Locked', `'${slug}' is being edited by ${lock?.holder}`, {
            holder: lock?.holder,
            since: lock?.since,
        });
    }

    const timestamp = now.toISOString();
    const info: VersionInfo = {
        id: versionId(now),
        savedAt: timestamp,
        author,
        note,
    };

    const snapshot: VersionSnapshot = { ...info, files };

    // Write the snapshot before indexing it. If the index write fails the
    // snapshot is merely unlisted, whereas the reverse would leave the feed
    // pointing at a version that cannot be opened.
    await writeJson(store, versionKey(slug, info.id), snapshot);

    const index = (await readJson<VersionInfo[]>(store, versionIndexKey(slug))) ?? [];
    await writeJson(store, versionIndexKey(slug), [info, ...index]);

    await writeJson(
        store,
        manifestKey,
        projects.map((p) => (p.slug === slug ? { ...p, updatedAt: timestamp } : p)),
    );

    return info;
}

/**
 * Reads a project's lock, treating an expired one as absent.
 *
 * @param store The blob store.
 * @param slug The project to read.
 * @param now The current time.
 * @returns The lock, or undefined if free or stale.
 */
export async function getLock(
    store: BlobStore,
    slug: string,
    now: Date,
): Promise<Lock | undefined> {
    const lock = await readJson<Lock>(store, lockKey(slug));

    return isLockStale(lock, now.getTime()) ? undefined : lock;
}

/**
 * Acquires or refreshes a project's edit lock.
 *
 * @param store The blob store.
 * @param slug The project to lock.
 * @param holder The name of whoever is editing.
 * @param sessionId Identifies the browser tab.
 * @param force Take the lock even if someone else holds it.
 * @param now The current time.
 * @returns The lock now in effect.
 */
export async function acquireLock(
    store: BlobStore,
    slug: string,
    holder: unknown,
    sessionId: string,
    force: boolean,
    now: Date,
): Promise<Lock> {
    requireProject(await getProjects(store), slug);

    const validHolder = validText(holder, maxAuthorLength, 'InvalidAuthor', 'holder');
    const current = await readJson<Lock>(store, lockKey(slug));

    if (!force && !canSave(current, sessionId, now.getTime())) {
        throw new CloudError(
            'Locked',
            `'${slug}' is being edited by ${current?.holder}`,
            {
                holder: current?.holder,
                since: current?.since,
            },
        );
    }

    const lock: Lock = {
        holder: validHolder,
        sessionId,
        since: now.toISOString(),
    };

    await writeJson(store, lockKey(slug), lock);

    return lock;
}

/**
 * Releases a project's edit lock.
 *
 * Releasing a lock held by a different session does nothing, so that a tab
 * whose lock was taken over cannot free the new holder's lock on its way out.
 *
 * @param store The blob store.
 * @param slug The project to unlock.
 * @param sessionId The session releasing the lock.
 * @returns True if a lock was released.
 */
export async function releaseLock(
    store: BlobStore,
    slug: string,
    sessionId: string,
): Promise<boolean> {
    const current = await readJson<Lock>(store, lockKey(slug));

    if (!current || current.sessionId !== sessionId) {
        return false;
    }

    // There is no delete in the store interface, and an expired lock is
    // equivalent to no lock, so release by backdating past the ttl.
    await writeJson(store, lockKey(slug), {
        ...current,
        since: new Date(0).toISOString(),
    });

    return true;
}

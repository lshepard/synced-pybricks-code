// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

// Database access for the shared project store.
//
// Neon's HTTP driver runs each statement as its own round trip, and its
// transactions are non-interactive: every statement is sent up front, so a
// later one cannot depend on an earlier one's result. Each operation here is
// therefore written as a single statement, with decisions expressed as WHERE
// clauses rather than as branching in JavaScript. That is also what makes them
// atomic without holding a transaction open across the network.

import { neon } from '@neondatabase/serverless';
import {
    Lock,
    ProjectInfo,
    VersionInfo,
    VersionSnapshot,
    lockTtlMs,
    slugify,
} from './protocol';

/** A tagged-template SQL runner, as returned by {@link neon}. */
export type Sql = ReturnType<typeof neon>;

/** Reasons an operation can fail. */
export type CloudErrorName = 'NotFound' | 'Locked' | 'Invalid';

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

/**
 * Connects using the pooled URL from the environment.
 *
 * @returns A SQL runner.
 */
export function connect(): Sql {
    const url = process.env.DATABASE_URL;

    if (!url) {
        throw new Error('DATABASE_URL is not set');
    }

    return neon(url);
}

/** Shape of a project row as selected below. */
type ProjectRow = {
    slug: string;
    name: string;
    created_at: Date;
    updated_at: Date;
    archived: boolean;
};

function toProject(row: ProjectRow): ProjectInfo {
    return {
        slug: row.slug,
        name: row.name,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        archived: row.archived,
    };
}

/** Shape of a version row as selected below. */
type VersionRow = {
    id: string;
    saved_at: Date;
    author: string;
    note: string;
};

function toVersion(row: VersionRow): VersionInfo {
    return {
        // bigserial arrives as a string, since it can exceed a JS number
        id: Number(row.id),
        savedAt: row.saved_at.toISOString(),
        author: row.author,
        note: row.note,
    };
}

/**
 * Lists all projects, newest activity first.
 *
 * Archived projects are included. Hiding them is a presentation choice, and
 * they stay openable.
 *
 * @param sql The database.
 * @returns Every project.
 */
export async function getProjects(sql: Sql): Promise<ProjectInfo[]> {
    const rows = (await sql`
        select slug, name, created_at, updated_at, archived
        from project
        order by updated_at desc
    `) as ProjectRow[];

    return rows.map(toProject);
}

/**
 * Creates a project.
 *
 * The slug is derived from the name and made unique by retrying against the
 * unique constraint rather than by checking first, which would race.
 *
 * @param sql The database.
 * @param name The name as typed by the user.
 * @returns The new project.
 */
export async function createProject(sql: Sql, name: string): Promise<ProjectInfo> {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    const base = slugify(trimmed) || 'project';

    // The constraint decides; this loop only supplies the next candidate.
    for (let attempt = 0; ; attempt++) {
        const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;

        const rows = (await sql`
            insert into project (slug, name)
            values (${slug}, ${trimmed})
            on conflict (slug) do nothing
            returning slug, name, created_at, updated_at, archived
        `) as ProjectRow[];

        if (rows.length > 0) {
            return toProject(rows[0]);
        }

        // Guards against an unbounded loop if something other than a slug
        // collision is causing the insert to return nothing.
        if (attempt > 100) {
            throw new CloudError('Invalid', 'could not find an unused name');
        }
    }
}

/**
 * Sets a project's archived flag.
 *
 * @param sql The database.
 * @param slug The project to change.
 * @param archived The new value.
 * @returns The updated project.
 */
export async function setArchived(
    sql: Sql,
    slug: string,
    archived: boolean,
): Promise<ProjectInfo> {
    const rows = (await sql`
        update project set archived = ${archived}
        where slug = ${slug}
        returning slug, name, created_at, updated_at, archived
    `) as ProjectRow[];

    if (rows.length === 0) {
        throw new CloudError('NotFound', `no project '${slug}'`);
    }

    return toProject(rows[0]);
}

/**
 * Reads a project's version feed, newest first.
 *
 * File contents are deliberately not selected: the feed only needs the
 * headline fields, and snapshots can be large.
 *
 * @param sql The database.
 * @param slug The project to read.
 * @returns The feed.
 */
export async function getVersions(sql: Sql, slug: string): Promise<VersionInfo[]> {
    const rows = (await sql`
        select v.id, v.saved_at, v.author, v.note
        from project_version v
        join project p on p.id = v.project_id
        where p.slug = ${slug}
        order by v.saved_at desc, v.id desc
    `) as VersionRow[];

    return rows.map(toVersion);
}

/**
 * Reads one complete version, including file contents.
 *
 * @param sql The database.
 * @param slug The project to read.
 * @param id The version to read.
 * @returns The snapshot.
 */
export async function getVersion(
    sql: Sql,
    slug: string,
    id: number,
): Promise<VersionSnapshot> {
    const rows = (await sql`
        select v.id, v.saved_at, v.author, v.note, v.files
        from project_version v
        join project p on p.id = v.project_id
        where p.slug = ${slug} and v.id = ${id}
    `) as (VersionRow & { files: Record<string, string> })[];

    if (rows.length === 0) {
        throw new CloudError('NotFound', `no version ${id} in '${slug}'`);
    }

    return { ...toVersion(rows[0]), files: rows[0].files };
}

/**
 * Appends a new version, if the caller's session may write.
 *
 * The lock check is part of the insert rather than a preceding read, so there
 * is no window between checking and writing. Zero rows inserted means either
 * the project does not exist or someone else holds a live lock, which is then
 * distinguished by a follow-up read purely to produce a useful message.
 *
 * @param sql The database.
 * @param slug The project to save to.
 * @param save The snapshot and who is saving.
 * @returns The new feed entry.
 */
export async function addVersion(
    sql: Sql,
    slug: string,
    save: { files: unknown; author: string; note?: string; sessionId: string },
): Promise<VersionInfo> {
    const files = validFiles(save.files);
    const author = (save.author ?? '').trim();
    const note = (save.note ?? '').trim();

    const rows = (await sql`
        insert into project_version (project_id, author, note, files)
        select p.id, ${author}, ${note}, ${JSON.stringify(files)}::jsonb
        from project p
        where p.slug = ${slug}
          and not exists (
              select 1 from project_edit_lock l
              where l.project_id = p.id
                and l.session_id <> ${save.sessionId}
                and l.since > now() - make_interval(secs => ${lockTtlMs / 1000})
          )
        returning id, saved_at, author, note
    `) as VersionRow[];

    if (rows.length === 0) {
        throw await describeWriteFailure(sql, slug);
    }

    await sql`
        update project set updated_at = now()
        where slug = ${slug}
    `;

    return toVersion(rows[0]);
}

/**
 * Works out why a lock-guarded write matched no rows.
 *
 * Only called on the failure path, to turn "zero rows" into something a person
 * can act on.
 */
async function describeWriteFailure(sql: Sql, slug: string): Promise<CloudError> {
    const lock = await getLock(sql, slug);

    if (lock) {
        return new CloudError('Locked', `'${slug}' is being edited by ${lock.holder}`, {
            holder: lock.holder,
            since: lock.since,
        });
    }

    return new CloudError('NotFound', `no project '${slug}'`);
}

function validFiles(files: unknown): Record<string, string> {
    if (typeof files !== 'object' || files === null || Array.isArray(files)) {
        throw new CloudError('Invalid', 'files must be an object');
    }

    const entries = Object.entries(files as Record<string, unknown>);

    if (entries.length === 0) {
        throw new CloudError('Invalid', 'cannot save an empty project');
    }

    for (const [path, contents] of entries) {
        if (typeof contents !== 'string') {
            throw new CloudError('Invalid', `contents of '${path}' must be a string`);
        }
    }

    return Object.fromEntries(entries) as Record<string, string>;
}

/**
 * Reads a project's live lock.
 *
 * Expiry is evaluated by the database against its own clock, so a client with
 * a wrong clock cannot hold or steal a lock.
 *
 * @param sql The database.
 * @param slug The project to read.
 * @returns The lock, or undefined if free or expired.
 */
export async function getLock(sql: Sql, slug: string): Promise<Lock | undefined> {
    const rows = (await sql`
        select l.holder, l.session_id, l.since
        from project_edit_lock l
        join project p on p.id = l.project_id
        where p.slug = ${slug}
          and l.since > now() - make_interval(secs => ${lockTtlMs / 1000})
    `) as { holder: string; session_id: string; since: Date }[];

    if (rows.length === 0) {
        return undefined;
    }

    return {
        holder: rows[0].holder,
        sessionId: rows[0].session_id,
        since: rows[0].since.toISOString(),
    };
}

/**
 * Acquires or refreshes a project's edit lock.
 *
 * Succeeds when the lock is free, expired, already this session's, or when
 * taking over deliberately. Everything else is refused.
 *
 * @param sql The database.
 * @param slug The project to lock.
 * @param holder The name of whoever is editing.
 * @param sessionId Identifies the browser tab.
 * @param force Take the lock even if someone else holds a live one.
 * @returns The lock now in effect.
 */
export async function acquireLock(
    sql: Sql,
    slug: string,
    holder: string,
    sessionId: string,
    force: boolean,
): Promise<Lock> {
    const rows = (await sql`
        insert into project_edit_lock (project_id, holder, session_id)
        select p.id, ${holder.trim()}, ${sessionId}
        from project p
        where p.slug = ${slug}
        on conflict (project_id) do update
            set holder = excluded.holder,
                session_id = excluded.session_id,
                since = now()
            where ${force}
               or project_edit_lock.session_id = ${sessionId}
               or project_edit_lock.since
                  <= now() - make_interval(secs => ${lockTtlMs / 1000})
        returning holder, session_id, since
    `) as { holder: string; session_id: string; since: Date }[];

    if (rows.length === 0) {
        throw await describeWriteFailure(sql, slug);
    }

    return {
        holder: rows[0].holder,
        sessionId: rows[0].session_id,
        since: rows[0].since.toISOString(),
    };
}

/**
 * Releases a project's edit lock.
 *
 * A release from a session that no longer holds the lock does nothing, so a
 * tab whose lock was taken over cannot free the new holder's lock as it exits.
 *
 * @param sql The database.
 * @param slug The project to unlock.
 * @param sessionId The session releasing the lock.
 * @returns True if a lock was released.
 */
export async function releaseLock(
    sql: Sql,
    slug: string,
    sessionId: string,
): Promise<boolean> {
    const rows = (await sql`
        delete from project_edit_lock l
        using project p
        where l.project_id = p.id
          and p.slug = ${slug}
          and l.session_id = ${sessionId}
        returning l.project_id
    `) as { project_id: string }[];

    return rows.length > 0;
}

/**
 * @jest-environment node
 */
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

// Integration tests against a real Postgres.
//
// These write to whatever TEST_DATABASE_URL points at, so they deliberately do
// not fall back to DATABASE_URL: a Neon project has one database on its
// default branch, which means the obvious variable is the live one. Point
// TEST_DATABASE_URL at the local database from docker-compose.yml, or at a
// separate Neon branch. Without it these are skipped, so the suite still
// passes for anyone who has not set one up.
//
// The node environment is required: the driver needs TextEncoder/TextDecoder,
// which jsdom does not provide, and node is what the API actually runs on.

import { neon } from '@neondatabase/serverless';
import {
    CloudError,
    Sql,
    acquireLock,
    addVersion,
    createProject,
    getLock,
    getProjects,
    getVersion,
    getVersions,
    releaseLock,
    setArchived,
} from './db';

const url = process.env.TEST_DATABASE_URL;

if (!url) {
    // eslint-disable-next-line no-console
    console.warn(
        'TEST_DATABASE_URL is not set, skipping database tests. Run ' +
            '`docker compose up -d` and point it at the local database, or at a ' +
            'Neon branch created for testing; do not point it at the branch the ' +
            'app uses.',
    );
}

const describeDb = url ? describe : describe.skip;

describeDb('database', () => {
    let sql: Sql;
    // every project made here is named with this prefix so cleanup can find
    // them without touching anything else in the database
    const prefix = `zzTest${Date.now()}`;
    const slugs: string[] = [];

    const session = 'session-a';
    const files = { 'main.py': 'print("hi")' };

    /** Creates a project with a name unique to this run. */
    async function newProject(label = 'Bot') {
        const project = await createProject(sql, `${prefix} ${label}`);
        slugs.push(project.slug);
        return project;
    }

    beforeAll(() => {
        sql = neon(url as string);
    });

    // Leave the database as it was found. Done in three statements rather than
    // three per project, since each is a network round trip.
    afterAll(async () => {
        if (slugs.length === 0) {
            return;
        }

        await sql`
            delete from project_edit_lock
            where project_id in (select id from project where slug = any(${slugs}))
        `;
        await sql`
            delete from project_version
            where project_id in (select id from project where slug = any(${slugs}))
        `;
        await sql`delete from project where slug = any(${slugs})`;
    }, 30000);

    describe('createProject', () => {
        it('should derive a slug from the name', async () => {
            const project = await createProject(sql, `${prefix} Line Follower`);
            slugs.push(project.slug);

            expect(project.slug).toBe(`${prefix.toLowerCase()}-line-follower`);
            expect(project.archived).toBe(false);
        });

        it('should preserve the name as typed', async () => {
            const project = await createProject(sql, `${prefix} Timmy's Bot`);
            slugs.push(project.slug);

            expect(project.name).toBe(`${prefix} Timmy's Bot`);
        });

        it('should give a colliding name a distinct slug', async () => {
            const a = await createProject(sql, `${prefix} Dup`);
            const b = await createProject(sql, `${prefix} dup`);
            slugs.push(a.slug, b.slug);

            expect(b.slug).not.toBe(a.slug);
            expect(b.slug).toBe(`${a.slug}-2`);
        });

        it('should reject a blank name at the database', async () => {
            await expect(createProject(sql, '   ')).rejects.toThrow();
        });

        it('should appear in the project list', async () => {
            const project = await newProject('Listed');
            const all = await getProjects(sql);

            expect(all.map((p) => p.slug)).toContain(project.slug);
        });
    });

    describe('setArchived', () => {
        it('should set and clear the flag', async () => {
            const project = await newProject('Arch');

            expect((await setArchived(sql, project.slug, true)).archived).toBe(true);
            expect((await setArchived(sql, project.slug, false)).archived).toBe(false);
        });

        it('should keep an archived project readable', async () => {
            const project = await newProject('ArchRead');
            await addVersion(sql, project.slug, {
                files,
                author: 'Ava',
                sessionId: session,
            });
            await setArchived(sql, project.slug, true);

            expect(await getVersions(sql, project.slug)).toHaveLength(1);
        });

        it('should reject an unknown project', async () => {
            await expect(
                setArchived(sql, 'no-such-project', true),
            ).rejects.toMatchObject({ name: 'NotFound' });
        });
    });

    describe('addVersion', () => {
        it('should round trip file contents exactly', async () => {
            const project = await newProject('Round');
            const multi = {
                'main.py': 'from pybricks import *\n\n# tab\there\n',
                'helpers.py': 'def turn():\n    pass\n',
            };

            const info = await addVersion(sql, project.slug, {
                files: multi,
                author: 'Ava',
                sessionId: session,
            });

            expect((await getVersion(sql, project.slug, info.id)).files).toEqual(multi);
        });

        it('should default a missing note to empty', async () => {
            const project = await newProject('NoNote');
            const info = await addVersion(sql, project.slug, {
                files,
                author: 'Ava',
                sessionId: session,
            });

            expect(info.note).toBe('');
        });

        it('should list versions newest first', async () => {
            const project = await newProject('Order');

            await addVersion(sql, project.slug, {
                files,
                author: 'Ava',
                note: 'one',
                sessionId: session,
            });
            await addVersion(sql, project.slug, {
                files,
                author: 'Marcus',
                note: 'two',
                sessionId: session,
            });

            expect((await getVersions(sql, project.slug)).map((v) => v.note)).toEqual([
                'two',
                'one',
            ]);
        });

        it('should never modify an earlier version', async () => {
            const project = await newProject('Immutable');

            const first = await addVersion(sql, project.slug, {
                files: { 'main.py': 'original' },
                author: 'Ava',
                sessionId: session,
            });
            await addVersion(sql, project.slug, {
                files: { 'main.py': 'replaced' },
                author: 'Ava',
                sessionId: session,
            });

            expect(
                (await getVersion(sql, project.slug, first.id)).files['main.py'],
            ).toBe('original');
        });

        it('should append rather than branch when saving over an old version', async () => {
            const project = await newProject('Append');

            await addVersion(sql, project.slug, {
                files,
                author: 'Ava',
                sessionId: session,
            });
            await addVersion(sql, project.slug, {
                files,
                author: 'Ava',
                sessionId: session,
            });
            // simulates loading v1 and saving on top of it
            await addVersion(sql, project.slug, {
                files,
                author: 'Ava',
                sessionId: session,
            });

            expect(await getVersions(sql, project.slug)).toHaveLength(3);
        });

        it('should advance updated_at', async () => {
            const project = await newProject('Touch');
            await addVersion(sql, project.slug, {
                files,
                author: 'Ava',
                sessionId: session,
            });

            const all = await getProjects(sql);
            const found = all.find((p) => p.slug === project.slug);
            expect(Date.parse(found?.updatedAt ?? '')).toBeGreaterThanOrEqual(
                Date.parse(project.updatedAt),
            );
        });

        it('should reject an empty file set', async () => {
            const project = await newProject('EmptyFiles');
            await expect(
                addVersion(sql, project.slug, {
                    files: {},
                    author: 'Ava',
                    sessionId: session,
                }),
            ).rejects.toMatchObject({ name: 'Invalid' });
        });

        it('should reject non-string file contents', async () => {
            const project = await newProject('BadFiles');
            await expect(
                addVersion(sql, project.slug, {
                    files: { 'main.py': 42 },
                    author: 'Ava',
                    sessionId: session,
                }),
            ).rejects.toMatchObject({ name: 'Invalid' });
        });

        it('should reject an unknown project', async () => {
            await expect(
                addVersion(sql, 'no-such-project', {
                    files,
                    author: 'Ava',
                    sessionId: session,
                }),
            ).rejects.toMatchObject({ name: 'NotFound' });
        });

        it('should allow saving when no lock was ever taken', async () => {
            // the lock is advisory, so a save must not require one
            const project = await newProject('NoLock');

            await expect(
                addVersion(sql, project.slug, {
                    files,
                    author: 'Ava',
                    sessionId: session,
                }),
            ).resolves.toBeDefined();
        });
    });

    describe('locking', () => {
        it('should report no lock on a new project', async () => {
            const project = await newProject('Unlocked');
            expect(await getLock(sql, project.slug)).toBeUndefined();
        });

        it('should acquire a free lock', async () => {
            const project = await newProject('Acquire');
            const lock = await acquireLock(sql, project.slug, 'Ava', session, false);

            expect(lock).toMatchObject({ holder: 'Ava', sessionId: session });
        });

        it('should let the same session refresh its lock', async () => {
            const project = await newProject('Refresh');
            const first = await acquireLock(sql, project.slug, 'Ava', session, false);
            const second = await acquireLock(sql, project.slug, 'Ava', session, false);

            expect(Date.parse(second.since)).toBeGreaterThanOrEqual(
                Date.parse(first.since),
            );
        });

        it('should refuse a second session while the lock is live', async () => {
            const project = await newProject('Contended');
            await acquireLock(sql, project.slug, 'Ava', session, false);

            await expect(
                acquireLock(sql, project.slug, 'Marcus', 'session-b', false),
            ).rejects.toMatchObject({ name: 'Locked' });
        });

        it('should report who holds the lock when refusing', async () => {
            const project = await newProject('WhoHolds');
            await acquireLock(sql, project.slug, 'Ava', session, false);

            await expect(
                acquireLock(sql, project.slug, 'Marcus', 'session-b', false),
            ).rejects.toMatchObject({ detail: { holder: 'Ava' } });
        });

        it('should allow a forced takeover', async () => {
            const project = await newProject('Takeover');
            await acquireLock(sql, project.slug, 'Ava', session, false);

            const lock = await acquireLock(
                sql,
                project.slug,
                'Marcus',
                'session-b',
                true,
            );
            expect(lock).toMatchObject({ holder: 'Marcus', sessionId: 'session-b' });
        });

        it('should stop the original session saving after a takeover', async () => {
            // the crash-recovery case: a tab returns believing it still holds
            // the lock
            const project = await newProject('AfterTakeover');
            await acquireLock(sql, project.slug, 'Ava', session, false);
            await acquireLock(sql, project.slug, 'Marcus', 'session-b', true);

            await expect(
                addVersion(sql, project.slug, {
                    files,
                    author: 'Ava',
                    sessionId: session,
                }),
            ).rejects.toMatchObject({ name: 'Locked' });
        });

        it('should let the new holder save after a takeover', async () => {
            const project = await newProject('NewHolderSaves');
            await acquireLock(sql, project.slug, 'Ava', session, false);
            await acquireLock(sql, project.slug, 'Marcus', 'session-b', true);

            await expect(
                addVersion(sql, project.slug, {
                    files,
                    author: 'Marcus',
                    sessionId: 'session-b',
                }),
            ).resolves.toMatchObject({ author: 'Marcus' });
        });

        it('should release a lock it holds', async () => {
            const project = await newProject('Release');
            await acquireLock(sql, project.slug, 'Ava', session, false);

            expect(await releaseLock(sql, project.slug, session)).toBe(true);
            expect(await getLock(sql, project.slug)).toBeUndefined();
        });

        it('should let someone else lock right after a release', async () => {
            const project = await newProject('Relock');
            await acquireLock(sql, project.slug, 'Ava', session, false);
            await releaseLock(sql, project.slug, session);

            await expect(
                acquireLock(sql, project.slug, 'Marcus', 'session-b', false),
            ).resolves.toMatchObject({ holder: 'Marcus' });
        });

        it('should ignore a release from a superseded session', async () => {
            // otherwise a tab that lost the lock could free the new holder's
            const project = await newProject('StaleRelease');
            await acquireLock(sql, project.slug, 'Ava', session, false);
            await acquireLock(sql, project.slug, 'Marcus', 'session-b', true);

            expect(await releaseLock(sql, project.slug, session)).toBe(false);
            expect(await getLock(sql, project.slug)).toMatchObject({
                holder: 'Marcus',
            });
        });

        it('should report releasing a lock that is not held', async () => {
            const project = await newProject('NoRelease');
            expect(await releaseLock(sql, project.slug, session)).toBe(false);
        });

        it('should not lock an unknown project', async () => {
            await expect(
                acquireLock(sql, 'no-such-project', 'Ava', session, false),
            ).rejects.toMatchObject({ name: 'NotFound' });
        });
    });

    describe('project isolation', () => {
        it('should keep versions of different projects separate', async () => {
            const a = await newProject('IsoA');
            const b = await newProject('IsoB');

            await addVersion(sql, a.slug, {
                files: { 'main.py': 'from a' },
                author: 'Ava',
                sessionId: session,
            });

            expect(await getVersions(sql, a.slug)).toHaveLength(1);
            expect(await getVersions(sql, b.slug)).toHaveLength(0);
        });

        it('should let projects share file names', async () => {
            const a = await newProject('SameNameA');
            const b = await newProject('SameNameB');

            const va = await addVersion(sql, a.slug, {
                files: { 'main.py': 'from a' },
                author: 'Ava',
                sessionId: session,
            });
            const vb = await addVersion(sql, b.slug, {
                files: { 'main.py': 'from b' },
                author: 'Ava',
                sessionId: session,
            });

            expect((await getVersion(sql, a.slug, va.id)).files['main.py']).toBe(
                'from a',
            );
            expect((await getVersion(sql, b.slug, vb.id)).files['main.py']).toBe(
                'from b',
            );
        });

        it('should keep locks of different projects separate', async () => {
            const a = await newProject('LockIsoA');
            const b = await newProject('LockIsoB');
            await acquireLock(sql, a.slug, 'Ava', session, false);

            expect(await getLock(sql, b.slug)).toBeUndefined();
        });
    });

    describe('getVersions', () => {
        it('should return an empty feed for a project with no saves', async () => {
            const project = await newProject('NeverSaved');
            expect(await getVersions(sql, project.slug)).toEqual([]);
        });

        it('should reject an unknown project rather than return an empty feed', async () => {
            // otherwise a mistyped link looks like a project with no history
            await expect(getVersions(sql, 'no-such-project')).rejects.toMatchObject({
                name: 'NotFound',
            });
        });
    });

    describe('getVersion', () => {
        it('should reject an unknown version', async () => {
            const project = await newProject('NoVersion');
            await expect(
                getVersion(sql, project.slug, 999999999),
            ).rejects.toMatchObject({ name: 'NotFound' });
        });
    });
});

// keeps the suite meaningful when there is no database configured
test('CloudError carries a machine readable name', () => {
    expect(new CloudError('NotFound', 'x').name).toBe('NotFound');
});

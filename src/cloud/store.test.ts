// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Pybricks Authors

import { MemoryStore } from './memoryStore';
import { lockTtlMs } from './protocol';
import {
    CloudError,
    acquireLock,
    addVersion,
    createProject,
    getLock,
    getProjects,
    getVersion,
    getVersions,
    releaseLock,
    setArchived,
    versionId,
} from './store';

const t0 = new Date('2026-08-13T14:00:00.000Z');
const later = (ms: number) => new Date(t0.getTime() + ms);

const session = 'session-a';
const files = { 'main.py': 'print("hi")' };

/** Asserts that a promise rejects with a CloudError of the given name. */
async function expectCloudError(promise: Promise<unknown>, name: string) {
    await expect(promise).rejects.toThrow(CloudError);
    await expect(promise).rejects.toMatchObject({ name });
}

describe('versionId', () => {
    it('should produce a sortable fixed width id', () => {
        expect(versionId(new Date('2026-08-13T14:32:00.000Z'))).toBe(
            '20260813T143200000Z',
        );
    });

    it('should sort lexicographically in time order across digit growth', () => {
        // a bare epoch number would misorder here once it gains a digit
        const early = versionId(new Date('2001-09-09T01:46:39.000Z'));
        const late = versionId(new Date('2001-09-09T01:46:41.000Z'));
        expect(early < late).toBe(true);
    });
});

describe('createProject', () => {
    it('should return a project with matching name and slug', async () => {
        const store = new MemoryStore();
        const project = await createProject(store, 'Line Follower', t0);

        expect(project).toEqual({
            slug: 'line-follower',
            name: 'Line Follower',
            createdAt: t0.toISOString(),
            updatedAt: t0.toISOString(),
            archived: false,
        });
    });

    it('should appear in the manifest', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Line Follower', t0);

        expect(await getProjects(store)).toHaveLength(1);
    });

    it('should start with an empty version list', async () => {
        const store = new MemoryStore();
        const project = await createProject(store, 'Line Follower', t0);

        expect(await getVersions(store, project.slug)).toEqual([]);
    });

    it('should give colliding names distinct slugs', async () => {
        const store = new MemoryStore();
        const a = await createProject(store, 'Line Follower', t0);
        const b = await createProject(store, 'line follower', t0);

        expect(a.slug).toBe('line-follower');
        expect(b.slug).toBe('line-follower-2');
    });

    it('should preserve the name as typed', async () => {
        const store = new MemoryStore();
        const project = await createProject(store, "Timmy's Bot", t0);

        expect(project.name).toBe("Timmy's Bot");
        expect(project.slug).toBe('timmy-s-bot');
    });

    it('should trim surrounding whitespace from the name', async () => {
        const store = new MemoryStore();
        expect((await createProject(store, '  Spaced  ', t0)).name).toBe('Spaced');
    });

    it('should reject a blank name', async () => {
        const store = new MemoryStore();
        await expectCloudError(createProject(store, '   ', t0), 'InvalidName');
    });

    it('should reject an over-long name', async () => {
        const store = new MemoryStore();
        await expectCloudError(createProject(store, 'x'.repeat(61), t0), 'InvalidName');
    });

    it('should reject a non-string name', async () => {
        const store = new MemoryStore();
        await expectCloudError(
            createProject(store, undefined as unknown as string, t0),
            'InvalidName',
        );
    });
});

describe('setArchived', () => {
    it('should set and clear the flag', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);

        expect((await setArchived(store, 'bot', true)).archived).toBe(true);
        expect((await setArchived(store, 'bot', false)).archived).toBe(false);
    });

    it('should keep the project readable while archived', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        await addVersion(
            store,
            'bot',
            { files, author: 'Ava', sessionId: session },
            t0,
        );
        await setArchived(store, 'bot', true);

        expect(await getVersions(store, 'bot')).toHaveLength(1);
    });

    it('should keep the project in the manifest', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        await setArchived(store, 'bot', true);

        expect(await getProjects(store)).toHaveLength(1);
    });

    it('should not affect other projects', async () => {
        const store = new MemoryStore();
        await createProject(store, 'One', t0);
        await createProject(store, 'Two', t0);
        await setArchived(store, 'one', true);

        const projects = await getProjects(store);
        expect(projects.find((p) => p.slug === 'two')?.archived).toBe(false);
    });

    it('should reject an unknown project', async () => {
        const store = new MemoryStore();
        await expectCloudError(setArchived(store, 'nope', true), 'NotFound');
    });
});

describe('addVersion', () => {
    it('should return an entry describing the save', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);

        const info = await addVersion(
            store,
            'bot',
            { files, author: 'Ava', note: 'first try', sessionId: session },
            t0,
        );

        expect(info).toMatchObject({ author: 'Ava', note: 'first try' });
    });

    it('should round trip file contents exactly', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        const multi = {
            'main.py': 'from pybricks import *\n\n# tab\there\n',
            'helpers.py': 'def turn():\n    pass\n',
        };

        const info = await addVersion(
            store,
            'bot',
            { files: multi, author: 'Ava', sessionId: session },
            t0,
        );

        expect((await getVersion(store, 'bot', info.id)).files).toEqual(multi);
    });

    it('should default a missing note to empty', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);

        const info = await addVersion(
            store,
            'bot',
            { files, author: 'Ava', sessionId: session },
            t0,
        );

        expect(info.note).toBe('');
    });

    it('should list versions newest first', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);

        await addVersion(
            store,
            'bot',
            { files, author: 'Ava', note: 'one', sessionId: session },
            t0,
        );
        await addVersion(
            store,
            'bot',
            { files, author: 'Marcus', note: 'two', sessionId: session },
            later(1000),
        );

        expect((await getVersions(store, 'bot')).map((v) => v.note)).toEqual([
            'two',
            'one',
        ]);
    });

    it('should never overwrite an earlier version', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);

        const first = await addVersion(
            store,
            'bot',
            { files: { 'main.py': 'original' }, author: 'Ava', sessionId: session },
            t0,
        );
        await addVersion(
            store,
            'bot',
            { files: { 'main.py': 'replaced' }, author: 'Ava', sessionId: session },
            later(1000),
        );

        expect((await getVersion(store, 'bot', first.id)).files['main.py']).toBe(
            'original',
        );
    });

    it('should append rather than branch when saving over an old version', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);

        await addVersion(
            store,
            'bot',
            { files, author: 'Ava', sessionId: session },
            t0,
        );
        await addVersion(
            store,
            'bot',
            { files, author: 'Ava', sessionId: session },
            later(1000),
        );
        // simulates loading v1 and saving on top of it
        await addVersion(
            store,
            'bot',
            { files, author: 'Ava', sessionId: session },
            later(2000),
        );

        expect(await getVersions(store, 'bot')).toHaveLength(3);
    });

    it('should advance the project updatedAt', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        await addVersion(
            store,
            'bot',
            { files, author: 'Ava', sessionId: session },
            later(5000),
        );

        const project = (await getProjects(store)).find((p) => p.slug === 'bot');
        expect(project?.updatedAt).toBe(later(5000).toISOString());
        expect(project?.createdAt).toBe(t0.toISOString());
    });

    it('should write the snapshot before the index', async () => {
        // otherwise a partial failure leaves the feed listing an unopenable version
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        store.writes.length = 0;

        await addVersion(
            store,
            'bot',
            { files, author: 'Ava', sessionId: session },
            t0,
        );

        const snapshotWrite = store.writes.findIndex((k) => /versions\/2026/.test(k));
        const indexWrite = store.writes.findIndex((k) => k.endsWith('index.json'));
        expect(snapshotWrite).toBeGreaterThanOrEqual(0);
        expect(snapshotWrite).toBeLessThan(indexWrite);
    });

    it('should reject an unknown project', async () => {
        const store = new MemoryStore();
        await expectCloudError(
            addVersion(store, 'nope', { files, author: 'Ava', sessionId: session }, t0),
            'NotFound',
        );
    });

    it('should reject a blank author', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        await expectCloudError(
            addVersion(store, 'bot', { files, author: '  ', sessionId: session }, t0),
            'InvalidAuthor',
        );
    });

    it('should reject an empty file set', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        await expectCloudError(
            addVersion(
                store,
                'bot',
                { files: {}, author: 'Ava', sessionId: session },
                t0,
            ),
            'InvalidFiles',
        );
    });

    it('should reject non-string file contents', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        await expectCloudError(
            addVersion(
                store,
                'bot',
                { files: { 'main.py': 42 }, author: 'Ava', sessionId: session },
                t0,
            ),
            'InvalidFiles',
        );
    });

    it('should reject an array in place of files', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        await expectCloudError(
            addVersion(
                store,
                'bot',
                { files: [], author: 'Ava', sessionId: session },
                t0,
            ),
            'InvalidFiles',
        );
    });

    it('should reject an over-long note', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        await expectCloudError(
            addVersion(
                store,
                'bot',
                { files, author: 'Ava', note: 'x'.repeat(281), sessionId: session },
                t0,
            ),
            'InvalidNote',
        );
    });

    it('should not write anything when validation fails', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        store.writes.length = 0;

        await expect(
            addVersion(
                store,
                'bot',
                { files: {}, author: 'Ava', sessionId: session },
                t0,
            ),
        ).rejects.toThrow();

        expect(store.writes).toEqual([]);
    });
});

describe('locking', () => {
    it('should report no lock on a fresh project', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);

        expect(await getLock(store, 'bot', t0)).toBeUndefined();
    });

    it('should acquire a free lock', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);

        const lock = await acquireLock(store, 'bot', 'Ava', session, false, t0);
        expect(lock).toMatchObject({ holder: 'Ava', sessionId: session });
    });

    it('should let the same session refresh its own lock', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        await acquireLock(store, 'bot', 'Ava', session, false, t0);

        const refreshed = await acquireLock(
            store,
            'bot',
            'Ava',
            session,
            false,
            later(60_000),
        );
        expect(refreshed.since).toBe(later(60_000).toISOString());
    });

    it('should refuse a second session while the lock is fresh', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        await acquireLock(store, 'bot', 'Ava', session, false, t0);

        await expectCloudError(
            acquireLock(store, 'bot', 'Marcus', 'session-b', false, later(60_000)),
            'Locked',
        );
    });

    it('should report who holds the lock when refusing', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        await acquireLock(store, 'bot', 'Ava', session, false, t0);

        await expect(
            acquireLock(store, 'bot', 'Marcus', 'session-b', false, t0),
        ).rejects.toMatchObject({ detail: { holder: 'Ava' } });
    });

    it('should allow a second session once the lock goes stale', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        await acquireLock(store, 'bot', 'Ava', session, false, t0);

        const lock = await acquireLock(
            store,
            'bot',
            'Marcus',
            'session-b',
            false,
            later(lockTtlMs),
        );
        expect(lock.holder).toBe('Marcus');
    });

    it('should allow a forced takeover of a fresh lock', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        await acquireLock(store, 'bot', 'Ava', session, false, t0);

        const lock = await acquireLock(store, 'bot', 'Marcus', 'session-b', true, t0);
        expect(lock).toMatchObject({ holder: 'Marcus', sessionId: 'session-b' });
    });

    it('should stop the original session saving after a takeover', async () => {
        // the crash-recovery case: a tab returns believing it still holds the lock
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        await acquireLock(store, 'bot', 'Ava', session, false, t0);
        await acquireLock(store, 'bot', 'Marcus', 'session-b', true, t0);

        await expectCloudError(
            addVersion(store, 'bot', { files, author: 'Ava', sessionId: session }, t0),
            'Locked',
        );
    });

    it('should let the new holder save after a takeover', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        await acquireLock(store, 'bot', 'Ava', session, false, t0);
        await acquireLock(store, 'bot', 'Marcus', 'session-b', true, t0);

        await expect(
            addVersion(
                store,
                'bot',
                { files, author: 'Marcus', sessionId: 'session-b' },
                t0,
            ),
        ).resolves.toMatchObject({ author: 'Marcus' });
    });

    it('should release a lock it holds', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        await acquireLock(store, 'bot', 'Ava', session, false, t0);

        expect(await releaseLock(store, 'bot', session)).toBe(true);
        expect(await getLock(store, 'bot', t0)).toBeUndefined();
    });

    it('should let someone else lock immediately after a release', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        await acquireLock(store, 'bot', 'Ava', session, false, t0);
        await releaseLock(store, 'bot', session);

        await expect(
            acquireLock(store, 'bot', 'Marcus', 'session-b', false, t0),
        ).resolves.toMatchObject({ holder: 'Marcus' });
    });

    it('should not release a lock held by another session', async () => {
        // a superseded tab must not free the new holder's lock on its way out
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        await acquireLock(store, 'bot', 'Ava', session, false, t0);
        await acquireLock(store, 'bot', 'Marcus', 'session-b', true, t0);

        expect(await releaseLock(store, 'bot', session)).toBe(false);
        expect(await getLock(store, 'bot', t0)).toMatchObject({ holder: 'Marcus' });
    });

    it('should report releasing a lock that does not exist', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);

        expect(await releaseLock(store, 'bot', session)).toBe(false);
    });

    it('should hide a stale lock from getLock', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        await acquireLock(store, 'bot', 'Ava', session, false, t0);

        expect(await getLock(store, 'bot', later(lockTtlMs))).toBeUndefined();
    });

    it('should reject a blank holder name', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        await expectCloudError(
            acquireLock(store, 'bot', '', session, false, t0),
            'InvalidAuthor',
        );
    });

    it('should not lock an unknown project', async () => {
        const store = new MemoryStore();
        await expectCloudError(
            acquireLock(store, 'nope', 'Ava', session, false, t0),
            'NotFound',
        );
    });

    it('should allow saving with no lock ever acquired', async () => {
        // the lock is advisory, so a save must not require one
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);

        await expect(
            addVersion(store, 'bot', { files, author: 'Ava', sessionId: session }, t0),
        ).resolves.toBeDefined();
    });
});

describe('getVersion', () => {
    it('should reject an unknown version', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        await expectCloudError(getVersion(store, 'bot', 'nope'), 'NotFound');
    });

    it('should reject an unknown project', async () => {
        const store = new MemoryStore();
        await expectCloudError(getVersion(store, 'nope', 'x'), 'NotFound');
    });
});

describe('corrupt data', () => {
    it('should treat an unparsable manifest as empty', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        store.poison('cloud/manifest.json', 'not json{');

        expect(await getProjects(store)).toEqual([]);
    });

    it('should treat an unparsable version index as empty', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        await addVersion(
            store,
            'bot',
            { files, author: 'Ava', sessionId: session },
            t0,
        );
        store.poison('cloud/bot/versions/index.json', ']]]');

        expect(await getVersions(store, 'bot')).toEqual([]);
    });

    it('should not let a corrupt lock wedge the project', async () => {
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        store.poison('cloud/bot/lock.json', 'garbage');

        await expect(
            acquireLock(store, 'bot', 'Ava', session, false, t0),
        ).resolves.toMatchObject({ holder: 'Ava' });
    });

    it('should keep a corrupt blob rather than dropping it', async () => {
        // nothing is ever deleted, so the bad data stays available to inspect
        const store = new MemoryStore();
        await createProject(store, 'Bot', t0);
        store.poison('cloud/manifest.json', 'not json{');
        await getProjects(store);

        expect(store.keys()).toContain('cloud/manifest.json');
    });
});

describe('project isolation', () => {
    it('should keep versions of different projects separate', async () => {
        const store = new MemoryStore();
        await createProject(store, 'One', t0);
        await createProject(store, 'Two', t0);

        await addVersion(
            store,
            'one',
            { files: { 'main.py': 'from one' }, author: 'Ava', sessionId: session },
            t0,
        );

        expect(await getVersions(store, 'one')).toHaveLength(1);
        expect(await getVersions(store, 'two')).toHaveLength(0);
    });

    it('should keep locks of different projects separate', async () => {
        const store = new MemoryStore();
        await createProject(store, 'One', t0);
        await createProject(store, 'Two', t0);
        await acquireLock(store, 'one', 'Ava', session, false, t0);

        expect(await getLock(store, 'two', t0)).toBeUndefined();
    });

    it('should let projects with the same file names coexist', async () => {
        const store = new MemoryStore();
        await createProject(store, 'One', t0);
        await createProject(store, 'Two', t0);

        const a = await addVersion(
            store,
            'one',
            { files: { 'main.py': 'from one' }, author: 'Ava', sessionId: session },
            t0,
        );
        const b = await addVersion(
            store,
            'two',
            { files: { 'main.py': 'from two' }, author: 'Ava', sessionId: session },
            t0,
        );

        expect((await getVersion(store, 'one', a.id)).files['main.py']).toBe(
            'from one',
        );
        expect((await getVersion(store, 'two', b.id)).files['main.py']).toBe(
            'from two',
        );
    });
});

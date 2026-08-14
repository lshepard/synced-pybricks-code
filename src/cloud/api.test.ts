/**
 * @jest-environment node
 */
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

// Drives the browser client against a running deployment, so that the paths
// it builds and the shapes it expects are checked against what the routes
// actually serve. The route tests call the handlers directly and so cannot
// catch a wrong URL or a routing rule that never reaches them.
//
// Set SMOKE_URL to a deployment to run these; they skip otherwise.

import * as api from './api';

const target = process.env.SMOKE_URL;
const describeSmoke = target ? describe : describe.skip;

describeSmoke('client against a deployment', () => {
    const created: string[] = [];
    const session = 'smoke-session';

    beforeAll(() => {
        // the client uses relative paths, as it does in the browser
        const base = target as string;
        const realFetch = globalThis.fetch;

        globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
            const path = typeof input === 'string' ? input : String(input);

            return realFetch(
                path.startsWith('/') ? `${base.replace(/\/$/, '')}${path}` : path,
                init,
            );
        }) as typeof fetch;
    });

    afterAll(async () => {
        // archived rather than deleted, since the API never deletes
        for (const slug of created) {
            await api.setArchived(slug, true).catch(() => undefined);
        }
    }, 60000);

    it('should complete the round trip a person makes', async () => {
        // create, as the dashboard does
        const project = await api.createProject(`zzSmoke ${Date.now()}`);
        created.push(project.slug);
        expect(project.archived).toBe(false);

        // save, as the save button does
        const files = {
            'main.py': 'from pybricks.hubs import PrimeHub\nhub = PrimeHub()\n',
            'helpers.py': 'def turn(deg):\n    pass\n',
        };
        const saved = await api.saveVersion(project.slug, {
            files,
            author: 'Ava',
            note: 'first working version',
            sessionId: session,
        });
        expect(saved.author).toBe('Ava');

        // the dashboard lists it
        const all = await api.fetchProjects();
        expect(all.map((p) => p.slug)).toContain(project.slug);

        // the history shows the save
        const feed = await api.fetchVersions(project.slug);
        expect(feed[0]).toMatchObject({
            author: 'Ava',
            note: 'first working version',
        });

        // opening it loads the files back exactly
        const snapshot = await api.fetchVersion(project.slug, feed[0].id);
        expect(snapshot.files).toEqual(files);
    }, 60000);

    it('should keep every version rather than overwrite', async () => {
        const project = await api.createProject(`zzSmoke Versions ${Date.now()}`);
        created.push(project.slug);

        const first = await api.saveVersion(project.slug, {
            files: { 'main.py': 'original' },
            author: 'Ava',
            sessionId: session,
        });
        await api.saveVersion(project.slug, {
            files: { 'main.py': 'replaced' },
            author: 'Marcus',
            sessionId: session,
        });

        expect((await api.fetchVersion(project.slug, first.id)).files['main.py']).toBe(
            'original',
        );
        expect(await api.fetchVersions(project.slug)).toHaveLength(2);
    }, 60000);

    it('should refuse a save from a session that does not hold the lock', async () => {
        const project = await api.createProject(`zzSmoke Lock ${Date.now()}`);
        created.push(project.slug);

        await api.acquireLock(project.slug, 'Ava', session);

        await expect(
            api.saveVersion(project.slug, {
                files: { 'main.py': 'x' },
                author: 'Marcus',
                sessionId: 'a-different-session',
            }),
        ).rejects.toMatchObject({ name: 'Locked' });
    }, 60000);

    it('should report a missing project rather than an empty history', async () => {
        await expect(
            api.fetchVersions('definitely-not-a-real-project'),
        ).rejects.toMatchObject({ name: 'NotFound' });
    }, 60000);
});

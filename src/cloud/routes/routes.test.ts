/**
 * @jest-environment node
 */
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

// Exercises the route handlers as functions, which is what Vercel does with
// them. Uses TEST_DATABASE_URL, and skips when it is unset.

import { neon } from '@neondatabase/serverless';
import * as archive from './projects/[slug]/archive';
import * as lock from './projects/[slug]/lock';
import * as versions from './projects/[slug]/versions';
import * as projects from './projects/index';

const url = process.env.TEST_DATABASE_URL;
const describeApi = url ? describe : describe.skip;

/** Builds a request the way Vercel delivers one to a route. */
function req(method: string, path: string, body?: unknown): Request {
    return new Request(`https://example.test${path}`, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
    });
}

describeApi('api routes', () => {
    const prefix = `zzApi${Date.now()}`;
    const slugs: string[] = [];
    const session = 'api-session';

    beforeAll(() => {
        // routes read DATABASE_URL; point it at the test database
        process.env.DATABASE_URL = url;
    });

    afterAll(async () => {
        const sql = neon(url as string);

        if (slugs.length > 0) {
            await sql`delete from project_edit_lock where project_id in (select id from project where slug = any(${slugs}))`;
            await sql`delete from project_version where project_id in (select id from project where slug = any(${slugs}))`;
            await sql`delete from project where slug = any(${slugs})`;
        }
    }, 30000);

    /** Creates a project through the API and remembers it for cleanup. */
    async function make(label: string) {
        const response = await projects.POST(
            req('POST', '/api/projects', { name: `${prefix} ${label}` }),
        );
        const created = await response.json();
        slugs.push(created.slug);
        return created;
    }

    it('should create a project and report 201', async () => {
        const response = await projects.POST(
            req('POST', '/api/projects', { name: `${prefix} Created` }),
        );
        const created = await response.json();
        slugs.push(created.slug);

        expect(response.status).toBe(201);
        expect(created.slug).toContain('created');
    });

    it('should reject a project with no name', async () => {
        const response = await projects.POST(req('POST', '/api/projects', {}));

        expect(response.status).toBe(400);
        expect((await response.json()).error).toBe('Invalid');
    });

    it('should reject a malformed body', async () => {
        const bad = new Request('https://example.test/api/projects', {
            method: 'POST',
            body: 'not json',
            headers: { 'content-type': 'application/json' },
        });

        expect((await projects.POST(bad)).status).toBe(400);
    });

    it('should list projects', async () => {
        const created = await make('Listed');
        const all = await (await projects.GET()).json();

        expect(all.map((p: { slug: string }) => p.slug)).toContain(created.slug);
    });

    it('should save and read back a version', async () => {
        const created = await make('Saved');
        const files = { 'main.py': 'print("hello")' };

        const saved = await versions.POST(
            req('POST', `/api/projects/${created.slug}/versions`, {
                files,
                author: 'Ava',
                note: 'first',
                sessionId: session,
            }),
        );
        const info = await saved.json();

        expect(saved.status).toBe(201);

        const one = await versions.GET(
            req('GET', `/api/projects/${created.slug}/versions/${info.id}`),
        );

        expect((await one.json()).files).toEqual(files);
    });

    it('should list versions newest first', async () => {
        const created = await make('Feed');

        for (const note of ['one', 'two']) {
            await versions.POST(
                req('POST', `/api/projects/${created.slug}/versions`, {
                    files: { 'main.py': note },
                    author: 'Ava',
                    note,
                    sessionId: session,
                }),
            );
        }

        const feed = await (
            await versions.GET(req('GET', `/api/projects/${created.slug}/versions`))
        ).json();

        expect(feed.map((v: { note: string }) => v.note)).toEqual(['two', 'one']);
    });

    it('should report 404 for a project that does not exist', async () => {
        const response = await versions.GET(
            req('GET', '/api/projects/definitely-not-real/versions'),
        );

        expect(response.status).toBe(404);
    });

    it('should report 400 when saving nothing', async () => {
        const created = await make('Empty');

        const response = await versions.POST(
            req('POST', `/api/projects/${created.slug}/versions`, {
                files: {},
                author: 'Ava',
                sessionId: session,
            }),
        );

        expect(response.status).toBe(400);
    });

    it('should archive and unarchive', async () => {
        const created = await make('Archive');

        const archived = await archive.POST(
            req('POST', `/api/projects/${created.slug}/archive`, { archived: true }),
        );
        expect((await archived.json()).archived).toBe(true);

        const restored = await archive.POST(
            req('POST', `/api/projects/${created.slug}/archive`, { archived: false }),
        );
        expect((await restored.json()).archived).toBe(false);
    });

    it('should acquire, report, and release a lock', async () => {
        const created = await make('Lock');

        const taken = await lock.POST(
            req('POST', `/api/projects/${created.slug}/lock`, {
                holder: 'Ava',
                sessionId: session,
            }),
        );
        expect((await taken.json()).holder).toBe('Ava');

        const read = await lock.GET(req('GET', `/api/projects/${created.slug}/lock`));
        expect((await read.json()).holder).toBe('Ava');

        const freed = await lock.DELETE(
            req('DELETE', `/api/projects/${created.slug}/lock`, {
                sessionId: session,
            }),
        );
        expect((await freed.json()).released).toBe(true);
    });

    it('should report 409 when someone else holds the lock', async () => {
        const created = await make('Contended');

        await lock.POST(
            req('POST', `/api/projects/${created.slug}/lock`, {
                holder: 'Ava',
                sessionId: session,
            }),
        );

        const refused = await lock.POST(
            req('POST', `/api/projects/${created.slug}/lock`, {
                holder: 'Marcus',
                sessionId: 'someone-else',
            }),
        );

        expect(refused.status).toBe(409);
        expect((await refused.json()).detail.holder).toBe('Ava');
    });

    it('should block a save from a session that lost the lock', async () => {
        const created = await make('Blocked');

        await lock.POST(
            req('POST', `/api/projects/${created.slug}/lock`, {
                holder: 'Ava',
                sessionId: session,
            }),
        );

        const response = await versions.POST(
            req('POST', `/api/projects/${created.slug}/versions`, {
                files: { 'main.py': 'x' },
                author: 'Marcus',
                sessionId: 'someone-else',
            }),
        );

        expect(response.status).toBe(409);
    });
});

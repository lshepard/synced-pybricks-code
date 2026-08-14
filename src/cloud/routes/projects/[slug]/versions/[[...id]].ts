// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

import { addVersion, connect, getVersion, getVersions } from '../../../../db';
import { body, handle, json, requireString, segments } from '../../../_lib';

// An optional catch-all so that one handler serves both the feed and a
// single version. Vercel matches a request to a file, so versions.ts alone
// would leave /versions/<id> with nothing to answer it.

/** Reads the slug, and an optional version id, from the path. */
function target(request: Request): { slug: string; id?: number } {
    const parts = segments(request, '/api/projects/');
    const slug = parts[0] ?? '';
    const raw = parts[2];

    return { slug, id: raw === undefined ? undefined : Number(raw) };
}

export function GET(request: Request): Promise<Response> {
    return handle(async () => {
        const { slug, id } = target(request);
        const sql = connect();

        if (id !== undefined) {
            return json(await getVersion(sql, slug, id));
        }

        return json(await getVersions(sql, slug));
    });
}

export function POST(request: Request): Promise<Response> {
    return handle(async () => {
        const { slug } = target(request);
        const fields = await body(request);

        const info = await addVersion(connect(), slug, {
            files: fields.files,
            author: requireString(fields, 'author'),
            note: typeof fields.note === 'string' ? fields.note : '',
            sessionId: requireString(fields, 'sessionId'),
        });

        return json(info, 201);
    });
}

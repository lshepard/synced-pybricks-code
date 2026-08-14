// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

import { acquireLock, connect, getLock, releaseLock } from '../../../db';
import { body, handle, json, requireString, segments } from '../../_lib';

function slugOf(request: Request): string {
    return segments(request, '/api/projects/')[0] ?? '';
}

export function GET(request: Request): Promise<Response> {
    return handle(async () => {
        const lock = await getLock(connect(), slugOf(request));

        return json(lock ?? null);
    });
}

export function POST(request: Request): Promise<Response> {
    return handle(async () => {
        const fields = await body(request);

        const lock = await acquireLock(
            connect(),
            slugOf(request),
            requireString(fields, 'holder'),
            requireString(fields, 'sessionId'),
            fields.force === true,
        );

        return json(lock);
    });
}

export function DELETE(request: Request): Promise<Response> {
    return handle(async () => {
        const fields = await body(request);

        const released = await releaseLock(
            connect(),
            slugOf(request),
            requireString(fields, 'sessionId'),
        );

        return json({ released });
    });
}

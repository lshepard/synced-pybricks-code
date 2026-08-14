// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

import { connect, setArchived } from '../../../db';
import { body, handle, json, segments } from '../../_lib';

export function POST(request: Request): Promise<Response> {
    return handle(async () => {
        const slug = segments(request, '/api/projects/')[0] ?? '';
        const fields = await body(request);

        // archiving is reversible, so one route carries both directions
        const archived = fields.archived !== false;

        return json(await setArchived(connect(), slug, archived));
    });
}

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

import { connect, createProject, getProjects } from '../../src/cloud/db';
import { body, handle, json, requireString } from '../_lib';

export function GET(): Promise<Response> {
    return handle(async () => json(await getProjects(connect())));
}

export function POST(request: Request): Promise<Response> {
    return handle(async () => {
        const fields = await body(request);
        const name = requireString(fields, 'name');

        return json(await createProject(connect(), name), 201);
    });
}

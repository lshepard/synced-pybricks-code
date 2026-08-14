// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

// Shared plumbing for the API routes.
//
// Route files are kept thin on purpose: they parse a request and delegate to
// src/cloud/db.ts, which is where the logic and its tests live.

import { CloudError } from '../db';

/** Maps a failure to the status code that best describes it. */
const statusByError: Record<string, number> = {
    NotFound: 404,
    Locked: 409,
    Invalid: 400,
};

const jsonHeaders = { 'content-type': 'application/json' };

/**
 * Serializes a value as a JSON response.
 *
 * @param body The value to send.
 * @param status The HTTP status code.
 * @returns The response.
 */
export function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

/**
 * Runs a handler, turning failures into JSON error responses.
 *
 * Anything that is not a {@link CloudError} is reported as a 500 without its
 * message, since it may carry connection details.
 *
 * @param handler The handler to run.
 * @returns The handler's response, or an error response.
 */
export async function handle(handler: () => Promise<Response>): Promise<Response> {
    try {
        return await handler();
    } catch (err) {
        if (err instanceof CloudError) {
            return json(
                { error: err.name, message: err.message, detail: err.detail },
                statusByError[err.name] ?? 400,
            );
        }

        // eslint-disable-next-line no-console
        console.error(err);

        return json({ error: 'Internal', message: 'something went wrong' }, 500);
    }
}

/**
 * Reads and parses a JSON request body.
 *
 * @param request The request.
 * @returns The parsed body, or an empty object if there is none.
 */
export async function body(request: Request): Promise<Record<string, unknown>> {
    try {
        const parsed = await request.json();

        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new CloudError('Invalid', 'body must be a JSON object');
        }

        return parsed as Record<string, unknown>;
    } catch (err) {
        if (err instanceof CloudError) {
            throw err;
        }

        throw new CloudError('Invalid', 'body must be valid JSON');
    }
}

/**
 * Reads a required string field from a request body.
 *
 * @param source The parsed body.
 * @param field The field to read.
 * @returns The trimmed value.
 */
export function requireString(source: Record<string, unknown>, field: string): string {
    const value = source[field];

    if (typeof value !== 'string' || value.trim() === '') {
        throw new CloudError('Invalid', `${field} is required`);
    }

    return value.trim();
}

/**
 * Reads the trailing path segments of a request URL.
 *
 * Vercel routes /api/projects/a/b to a catch-all file, so the parts after the
 * route's own prefix identify what is being addressed.
 *
 * @param request The request.
 * @param after The path prefix to strip, e.g. '/api/projects'.
 * @returns The remaining segments, without empties.
 */
export function segments(request: Request, after: string): string[] {
    const { pathname } = new URL(request.url);

    return pathname
        .slice(pathname.indexOf(after) + after.length)
        .split('/')
        .filter((s) => s !== '');
}

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

// Browser-side client for the cloud API.

import { Lock, ProjectInfo, VersionInfo, VersionSnapshot } from './protocol';

/** An error carrying the API's machine-readable failure name. */
export class ApiError extends Error {
    constructor(
        public readonly name: string,
        message: string,
        public readonly detail?: unknown,
    ) {
        super(message);
    }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, {
        ...init,
        headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    });

    const text = await response.text();
    const parsed = text ? JSON.parse(text) : null;

    if (!response.ok) {
        throw new ApiError(
            parsed?.error ?? 'Unknown',
            parsed?.message ?? response.statusText,
            parsed?.detail,
        );
    }

    return parsed as T;
}

/** Lists all projects, including archived ones. */
export function fetchProjects(): Promise<ProjectInfo[]> {
    return request('/api/projects');
}

/** Creates a project. */
export function createProject(name: string): Promise<ProjectInfo> {
    return request('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name }),
    });
}

/** Sets a project's archived flag. */
export function setArchived(slug: string, archived: boolean): Promise<ProjectInfo> {
    return request(`/api/projects/${encodeURIComponent(slug)}/archive`, {
        method: 'POST',
        body: JSON.stringify({ archived }),
    });
}

/** Reads a project's version feed, newest first. */
export function fetchVersions(slug: string): Promise<VersionInfo[]> {
    return request(`/api/projects/${encodeURIComponent(slug)}/versions`);
}

/** Reads one version, including file contents. */
export function fetchVersion(slug: string, id: number): Promise<VersionSnapshot> {
    return request(`/api/projects/${encodeURIComponent(slug)}/versions/${id}`);
}

/** Appends a new version. */
export function saveVersion(
    slug: string,
    save: {
        files: Record<string, string>;
        author: string;
        note?: string;
        sessionId: string;
    },
): Promise<VersionInfo> {
    return request(`/api/projects/${encodeURIComponent(slug)}/versions`, {
        method: 'POST',
        body: JSON.stringify(save),
    });
}

/** Reads a project's live lock, or null if free. */
export function fetchLock(slug: string): Promise<Lock | null> {
    return request(`/api/projects/${encodeURIComponent(slug)}/lock`);
}

/** Acquires or refreshes a project's lock. */
export function acquireLock(
    slug: string,
    holder: string,
    sessionId: string,
    force = false,
): Promise<Lock> {
    return request(`/api/projects/${encodeURIComponent(slug)}/lock`, {
        method: 'POST',
        body: JSON.stringify({ holder, sessionId, force }),
    });
}

/** Releases a project's lock. */
export function releaseLock(
    slug: string,
    sessionId: string,
): Promise<{ released: boolean }> {
    return request(`/api/projects/${encodeURIComponent(slug)}/lock`, {
        method: 'DELETE',
        body: JSON.stringify({ sessionId }),
    });
}

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

// Moves whole projects between the editor's local storage and the cloud.
//
// This talks to the Dexie database directly rather than going through the
// file storage sagas. The sagas are built around one file at a time driven by
// user gestures, whereas a cloud save or load is a bulk operation on the whole
// project, and doing it in one transaction avoids a half-replaced file set.

import { UUID } from '../fileStorage';
import { db } from '../fileStorage/context';
import { sha256Digest } from '../utils/crypto';

/**
 * Reads every file in local storage.
 *
 * @returns Maps file path to contents.
 */
export async function readAllFiles(): Promise<Record<string, string>> {
    const files: Record<string, string> = {};

    await db.transaction('r', db.metadata, db._contents, async () => {
        for (const meta of await db.metadata.toArray()) {
            const row = await db._contents.get(meta.path);

            if (row) {
                files[meta.path] = row.contents;
            }
        }
    });

    return files;
}

/**
 * Replaces every file in local storage with the given set.
 *
 * Done in one transaction so a failure cannot leave a mix of two projects'
 * files, which would then be saved back to the cloud as if it were one.
 *
 * @param files Maps file path to contents.
 */
export async function replaceAllFiles(files: Record<string, string>): Promise<void> {
    const entries = Object.entries(files);

    // hashing is async, so it cannot happen inside the Dexie transaction
    const prepared = await Promise.all(
        entries.map(async ([path, contents]) => ({
            path,
            contents,
            sha256: await sha256Digest(contents),
        })),
    );

    await db.transaction('rw', db.metadata, db._contents, async () => {
        await db.metadata.clear();
        await db._contents.clear();

        for (const file of prepared) {
            await db.metadata.add({
                path: file.path,
                sha256: file.sha256,
                viewState: null,
            } as never);
            await db._contents.add({ path: file.path, contents: file.contents });
        }
    });
}

/**
 * Reads the uuid of a file, so it can be opened in the editor.
 *
 * @param path The file path.
 * @returns The uuid, or undefined if there is no such file.
 */
export async function uuidForPath(path: string): Promise<UUID | undefined> {
    const meta = await db.metadata.where('path').equals(path).first();

    return meta?.uuid;
}

/**
 * Picks which file to show when a project opens.
 *
 * @returns A uuid, or undefined if the project has no files.
 */
export async function firstFileUuid(): Promise<UUID | undefined> {
    const all = await db.metadata.toArray();

    if (all.length === 0) {
        return undefined;
    }

    // main.py is the entry point of a Pybricks project, so prefer it
    const main = all.find((f) => f.path === 'main.py');

    return (main ?? all[0]).uuid;
}

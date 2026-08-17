// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

// Moving whole projects between the cloud and the editor's local storage.
//
// Loading a project closes all open files, clears storage, writes the new
// files, then opens one. This is simpler than trying to update files in place,
// which requires coordinating Redux state with Monaco models.

import {
    call,
    getContext,
    put,
    race,
    select,
    take,
    takeEvery,
} from 'typed-redux-saga/macro';
import {
    editorActivateFile,
    editorCloseFile,
    editorDidCloseFile,
} from '../editor/actions';
import { FileStorageDb } from '../fileStorage';
import {
    fileStorageDeleteFile,
    fileStorageDidDeleteFile,
    fileStorageDidDumpAllFiles,
    fileStorageDidFailToDeleteFile,
    fileStorageDidFailToDumpAllFiles,
    fileStorageDidFailToWriteFile,
    fileStorageDidWriteFile,
    fileStorageDumpAllFiles,
    fileStorageWriteFile,
} from '../fileStorage/actions';
import { RootState } from '../reducers';
import { defined, ensureError } from '../utils';
import {
    cloudDidFailToLoadFiles,
    cloudDidLoadFiles,
    cloudDidReadFiles,
    cloudLoadFiles,
    cloudReadFiles,
} from './actions';

/** Reads every file in local storage, for saving to the cloud. */
function* handleCloudReadFiles(): Generator {
    yield* put(fileStorageDumpAllFiles());

    const { didDump, didFailToDump } = yield* race({
        didDump: take(fileStorageDidDumpAllFiles),
        didFailToDump: take(fileStorageDidFailToDumpAllFiles),
    });

    if (didFailToDump) {
        yield* put(cloudDidReadFiles({}));
        return;
    }

    defined(didDump);

    yield* put(
        cloudDidReadFiles(
            Object.fromEntries(didDump.files.map((f) => [f.path, f.contents])),
        ),
    );
}

/** Writes one file, waiting for storage to confirm. */
function* writeFile(path: string, contents: string): Generator {
    yield* put(fileStorageWriteFile(path, contents));

    const { didFailToWrite } = yield* race({
        didWrite: take(fileStorageDidWriteFile.when((a) => a.path === path)),
        didFailToWrite: take(
            fileStorageDidFailToWriteFile.when((a) => a.path === path),
        ),
    });

    if (didFailToWrite) {
        throw didFailToWrite.error;
    }
}

/**
 * Clears the editor's file history from sessionStorage.
 *
 * The editor saves open file UUIDs to sessionStorage and restores them on
 * reload. When loading a cloud project, the old UUIDs are invalid because
 * we delete and recreate all files with new UUIDs.
 */
function clearEditorHistory(): void {
    const keysToRemove: string[] = [];

    for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);

        if (key?.startsWith('editor.activeFileHistory.')) {
            keysToRemove.push(key);
        }
    }

    for (const key of keysToRemove) {
        sessionStorage.removeItem(key);
    }
}

/**
 * Replaces local storage with a project's files.
 *
 * Closes all open tabs, deletes all files, writes the new ones, then opens
 * main.py (or the first file). This is jarring but consistent.
 */
function* handleCloudLoadFiles(action: ReturnType<typeof cloudLoadFiles>): Generator {
    try {
        const db = yield* getContext<FileStorageDb>('fileStorage');

        // Clear stale file history that references old UUIDs
        clearEditorHistory();

        // 1. Close all open files
        const openUuids = yield* select((s: RootState) => s.editor.openFileUuids);

        for (const uuid of openUuids) {
            yield* put(editorCloseFile(uuid));
            yield* take(editorDidCloseFile.when((a) => a.uuid === uuid));
        }

        // 2. Delete all existing files
        const existing = yield* call(() => db.metadata.toArray());

        for (const file of existing) {
            yield* put(fileStorageDeleteFile(file.path));

            const { didFailToDelete } = yield* race({
                didDelete: take(
                    fileStorageDidDeleteFile.when((a) => a.path === file.path),
                ),
                didFailToDelete: take(
                    fileStorageDidFailToDeleteFile.when((a) => a.path === file.path),
                ),
            });

            if (didFailToDelete) {
                throw didFailToDelete.error;
            }
        }

        // 3. Write all new files
        for (const [path, contents] of Object.entries(action.files)) {
            yield* call(writeFile, path, contents);
        }

        // 4. Open main.py or the first file
        const files = yield* call(() => db.metadata.toArray());
        const first = files.find((f) => f.path === 'main.py') ?? files[0];

        if (first) {
            yield* put(editorActivateFile(first.uuid));
        }

        yield* put(cloudDidLoadFiles());
    } catch (err) {
        yield* put(cloudDidFailToLoadFiles(ensureError(err)));
    }
}

export default function* (): Generator {
    yield* takeEvery(cloudReadFiles, handleCloudReadFiles);
    yield* takeEvery(cloudLoadFiles, handleCloudLoadFiles);
}

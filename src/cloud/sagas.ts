// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

// Moving whole projects between the cloud and the editor's local storage.
//
// Everything here goes through the file storage and editor actions the app
// already uses, rather than writing to the database underneath them. Those
// actions own the editor's invariants: which files are open, the web lock per
// open file, the monaco model per file, and the active file history. Reaching
// past them leaves all four pointing at files that no longer exist.
//
// Loading a project therefore updates files in place where it can. A file that
// exists in both the snapshot and local storage keeps its uuid, so the editor
// keeps its lock, its model and its tab, and only the text changes.

import {
    call,
    delay,
    getContext,
    put,
    race,
    select,
    take,
    takeEvery,
} from 'typed-redux-saga/macro';
import {
    editorCloseFile,
    editorDidCloseFile,
    editorReplaceFile,
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

/** Removes one file, closing it in the editor first if it is open. */
function* deleteFile(path: string, uuid: string): Generator {
    const openUuids = yield* select((s: RootState) => s.editor.openFileUuids);

    // deleting a file that is open in the editor fails with "in use", so the
    // editor has to let go of it first
    if (openUuids.includes(uuid as never)) {
        yield* put(editorCloseFile(uuid as never));

        // The editor confirms a close from the task that opened the file, and
        // that task ends with the editor widget. Navigating between projects
        // replaces the widget, so a file opened by the previous one is never
        // confirmed and waiting alone would hang. The delete below is the real
        // check: it fails if the file is still held.
        yield* race({
            closed: take(editorDidCloseFile.when((a) => a.uuid === uuid)),
            timeout: delay(2000),
        });
    }

    yield* put(fileStorageDeleteFile(path));

    const { didFailToDelete } = yield* race({
        didDelete: take(fileStorageDidDeleteFile.when((a) => a.path === path)),
        didFailToDelete: take(
            fileStorageDidFailToDeleteFile.when((a) => a.path === path),
        ),
    });

    if (didFailToDelete) {
        throw didFailToDelete.error;
    }
}

/**
 * Makes local storage match a project's file set.
 *
 * Files present in both are updated rather than replaced, which is what keeps
 * the editor working: the uuid stays the same, so its lock, model and tab all
 * remain valid and it simply shows the new text.
 */
function* handleCloudLoadFiles(action: ReturnType<typeof cloudLoadFiles>): Generator {
    try {
        const db = yield* getContext<FileStorageDb>('fileStorage');
        const existing = yield* call(() => db.metadata.toArray());
        const openUuids = yield* select((s: RootState) => s.editor.openFileUuids);

        // remove what the project does not have
        for (const file of existing) {
            if (!(file.path in action.files)) {
                yield* call(deleteFile, file.path, file.uuid);
            }
        }

        // add or update the rest
        for (const [path, contents] of Object.entries(action.files)) {
            const match = existing.find((f) => f.path === path);

            if (match && openUuids.includes(match.uuid)) {
                // the editor owns this file's text while it is open, so ask it
                // to change it rather than writing underneath it
                yield* put(editorReplaceFile(match.uuid, contents));
                continue;
            }

            yield* call(writeFile, path, contents);
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

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

// Swapping the editor's file set for a project's.

import { useCallback } from 'react';
import { useDispatch, useStore } from 'react-redux';
import { editorActivateFile, editorCloseFile } from '../editor/actions';
import { UUID } from '../fileStorage';
import { RootState } from '../reducers';
import { firstFileUuid, replaceAllFiles } from './localFiles';

/** How long to wait for the editor to let go of its files. */
const closeTimeoutMs = 4000;

/**
 * Replaces the editor's files, closing whatever is open first.
 *
 * The editor holds a web lock per open file, named for that file's uuid, and
 * releases it only on close. Clearing storage underneath it leaves those locks
 * held, and since uuids come from the database a new file can be handed one
 * that is still locked, so opening it fails with "already open in another
 * window". Closing first is what avoids that.
 *
 * @returns A function that takes the new file set and opens one of the files.
 */
export function useReplaceProjectFiles(): (
    files: Record<string, string>,
) => Promise<void> {
    const dispatch = useDispatch();
    const store = useStore<RootState>();

    return useCallback(
        async (files: Record<string, string>) => {
            const open = store.getState().editor.openFileUuids;

            if (open.length > 0) {
                open.forEach((uuid) => dispatch(editorCloseFile(uuid)));

                // The editor releases each lock as it closes. Waiting for the
                // store to empty is more reliable than waiting on the actions,
                // which can be missed if a close is already in flight.
                const deadline = Date.now() + closeTimeoutMs;

                while (
                    store.getState().editor.openFileUuids.length > 0 &&
                    Date.now() < deadline
                ) {
                    await new Promise((resolve) => setTimeout(resolve, 25));
                }
            }

            await replaceAllFiles(files);

            const uuid = await firstFileUuid();

            if (uuid) {
                dispatch(editorActivateFile(uuid as UUID));
            }
        },
        [dispatch, store],
    );
}

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

// Swapping the editor's file set for a project's.

import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { AnyAction, Middleware } from 'redux';
import {
    editorActivateFile,
    editorCloseAllFiles,
    editorDidCloseAllFiles,
} from '../editor/actions';
import { UUID } from '../fileStorage';
import { firstFileUuid, replaceAllFiles } from './localFiles';

/** How long to wait for the editor to let go of its files. */
const closeTimeoutMs = 5000;

/** Resolvers waiting for the editor to finish closing its files. */
const waiting = new Set<() => void>();

/**
 * Redux middleware that lets {@link useReplaceProjectFiles} await a close.
 *
 * A plain store subscription cannot see actions, only state, and "the editor
 * has finished releasing its file locks" is not something the state says.
 */
export const closeAllFilesMiddleware: Middleware = () => (next) => (action) => {
    const result = next(action);

    if (editorDidCloseAllFiles.matches(action as AnyAction)) {
        for (const resolve of waiting) {
            resolve();
        }

        waiting.clear();
    }

    return result;
};

/**
 * Waits for the editor to report that it closed everything.
 *
 * Falls through on timeout rather than hanging, since a project that opens
 * with a stale tab beats one that never opens at all.
 */
function waitForClose(): Promise<void> {
    return new Promise((resolve) => {
        const finish = () => {
            clearTimeout(timer);
            waiting.delete(finish);
            resolve();
        };

        const timer = setTimeout(finish, closeTimeoutMs);
        waiting.add(finish);
    });
}

/**
 * Replaces the editor's files with a project's.
 *
 * Closing has to happen first and has to finish first. Each open file holds a
 * web lock named for its uuid and owns a monaco model keyed by the same uuid,
 * both released only once the close completes. Uuids come from the database,
 * so a file created straight afterwards can be handed one that is still in
 * use, which is what produces "already open in another window" and tabs with
 * no editor behind them.
 *
 * @returns A function that takes the new file set and opens one of the files.
 */
export function useReplaceProjectFiles(): (
    files: Record<string, string>,
) => Promise<void> {
    const dispatch = useDispatch();

    return useCallback(
        async (files: Record<string, string>) => {
            // Always sent, even with nothing open: it also clears the active
            // file history, which otherwise reopens a file from a project that
            // is no longer loaded.
            const closed = waitForClose();
            dispatch(editorCloseAllFiles());
            await closed;

            await replaceAllFiles(files);

            const uuid = await firstFileUuid();

            if (uuid) {
                dispatch(editorActivateFile(uuid as UUID));
            }
        },
        [dispatch],
    );
}

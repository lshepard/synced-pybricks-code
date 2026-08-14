// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

// Reading and writing the editor's file set from React.
//
// Both go through the cloud saga, which in turn uses the file storage and
// editor actions. Nothing here touches the database directly: doing so leaves
// the editor holding locks, models and tabs for files that no longer exist.

import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { AnyAction, Middleware } from 'redux';
import {
    cloudDidFailToLoadFiles,
    cloudDidLoadFiles,
    cloudDidReadFiles,
    cloudLoadFiles,
    cloudReadFiles,
} from './actions';

/** How long to wait for the editor before giving up. */
const timeoutMs = 15000;

type Resolver = {
    resolve: (files: Record<string, string>) => void;
    reject: (e: Error) => void;
};

const readers = new Set<Resolver>();
const loaders = new Set<Resolver>();

/**
 * Redux middleware that lets the hooks below await a saga's result.
 *
 * A store subscription can only see state, and neither "here are the files"
 * nor "the editor has finished swapping them" is something the state records.
 */
export const cloudMiddleware: Middleware = () => (next) => (action) => {
    const result = next(action);
    const typed = action as AnyAction;

    if (cloudDidReadFiles.matches(typed)) {
        for (const r of readers) {
            r.resolve(typed.files);
        }

        readers.clear();
    }

    if (cloudDidLoadFiles.matches(typed)) {
        for (const r of loaders) {
            r.resolve({});
        }

        loaders.clear();
    }

    if (cloudDidFailToLoadFiles.matches(typed)) {
        for (const r of loaders) {
            r.reject(typed.error);
        }

        loaders.clear();
    }

    return result;
};

function awaitFrom(set: Set<Resolver>): Promise<Record<string, string>> {
    return new Promise((resolve, reject) => {
        const entry: Resolver = {
            resolve: (files) => {
                clearTimeout(timer);
                set.delete(entry);
                resolve(files);
            },
            reject: (err) => {
                clearTimeout(timer);
                set.delete(entry);
                reject(err);
            },
        };

        const timer = setTimeout(
            () => entry.reject(new Error('the editor did not respond')),
            timeoutMs,
        );

        set.add(entry);
    });
}

/**
 * Returns a function that reads every file currently in the editor.
 *
 * @returns Maps file path to contents.
 */
export function useReadProjectFiles(): () => Promise<Record<string, string>> {
    const dispatch = useDispatch();

    return useCallback(async () => {
        const files = awaitFrom(readers);
        dispatch(cloudReadFiles());

        return await files;
    }, [dispatch]);
}

/**
 * Returns a function that makes the editor's files match a project's.
 *
 * Files in both are updated in place, so the editor keeps its tabs and the
 * text simply changes.
 */
export function useReplaceProjectFiles(): (
    files: Record<string, string>,
) => Promise<void> {
    const dispatch = useDispatch();

    return useCallback(
        async (files: Record<string, string>) => {
            const done = awaitFrom(loaders);
            dispatch(cloudLoadFiles(files));

            await done;
        },
        [dispatch],
    );
}

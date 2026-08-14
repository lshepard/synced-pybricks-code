// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

import { createAction } from '../actions';

/** Requests every file in local storage, to save to the cloud. */
export const cloudReadFiles = createAction(() => ({
    type: 'cloud.action.readFiles',
}));

/**
 * Indicates that {@link cloudReadFiles} completed.
 * @param files Maps file path to contents.
 */
export const cloudDidReadFiles = createAction((files: Record<string, string>) => ({
    type: 'cloud.action.didReadFiles',
    files,
}));

/**
 * Requests that local storage be made to match a project's files.
 * @param files Maps file path to contents.
 */
export const cloudLoadFiles = createAction((files: Record<string, string>) => ({
    type: 'cloud.action.loadFiles',
    files,
}));

/** Indicates that {@link cloudLoadFiles} succeeded. */
export const cloudDidLoadFiles = createAction(() => ({
    type: 'cloud.action.didLoadFiles',
}));

/**
 * Indicates that {@link cloudLoadFiles} failed.
 * @param error The error.
 */
export const cloudDidFailToLoadFiles = createAction((error: Error) => ({
    type: 'cloud.action.didFailToLoadFiles',
    error,
}));

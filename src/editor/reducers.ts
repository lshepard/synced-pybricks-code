// SPDX-License-Identifier: MIT
// Copyright (c) 2022 The Pybricks Authors

import { Reducer, combineReducers } from 'redux';
import { UUID } from '../fileStorage';
import {
    editorDidActivateFile,
    editorDidCloseFile,
    editorDidCreate,
    editorDidOpenFile,
    editorRevokeEditingLocks,
    editorSetFileEditable,
    editorSetFileReadOnly,
} from './actions';
import codeCompletion from './redux/codeCompletion';

/** Indicates that the code editor is ready for use. */
const isReady: Reducer<boolean> = (state = false, action) => {
    if (editorDidCreate.matches(action)) {
        return true;
    }

    return state;
};

/**
 * Indicates which file out of {@link openFileUuids} is the currently active file.
 *
 * If {@link activeFileUuid} is not in {@link openFileUuids}, then there is no active file.
 */
const activeFileUuid: Reducer<UUID | null> = (state = null, action) => {
    if (editorDidActivateFile.matches(action)) {
        return action.uuid;
    }

    return state;
};

/** A list of open files in the order they should be displayed to the user. */
const openFileUuids: Reducer<readonly UUID[]> = (state = [], action) => {
    if (editorDidOpenFile.matches(action)) {
        return [...state, action.uuid];
    }

    if (editorDidCloseFile.matches(action)) {
        return state.filter((f) => f !== action.uuid);
    }

    return state;
};

/** A set of file UUIDs that are currently read-only due to being locked by other users. */
const readOnlyFileUuids: Reducer<readonly UUID[]> = (state = [], action) => {
    if (editorSetFileReadOnly.matches(action)) {
        // Add to read-only list if not already there
        if (!state.includes(action.uuid)) {
            return [...state, action.uuid];
        }
        return state;
    }

    if (editorSetFileEditable.matches(action)) {
        // Remove from read-only list
        return state.filter((uuid) => uuid !== action.uuid);
    }

    if (editorDidCloseFile.matches(action)) {
        // Clean up read-only status when file is closed
        return state.filter((uuid) => uuid !== action.uuid);
    }

    if (editorRevokeEditingLocks.matches(action)) {
        // Add files that lost their locks to read-only list
        const newReadOnlyFiles = action.uuids.filter((uuid) => !state.includes(uuid));
        return [...state, ...newReadOnlyFiles];
    }

    return state;
};

export default combineReducers({
    codeCompletion,
    isReady,
    activeFileUuid,
    openFileUuids,
    readOnlyFileUuids,
});

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

// Action logging, for working out what actually happened rather than what the
// code looks like it should do.
//
// Off unless localStorage has cloud.debug set to '1', so it costs nothing
// normally and can be switched on in a deployed build from the console:
//
//     localStorage.setItem('cloud.debug', '1'); location.reload();
//
// It records to window.__cloudLog as well as printing, so a browser test can
// read the sequence back and assert on it.

import { AnyAction, Middleware } from 'redux';

/** Action prefixes worth seeing; the rest are noise for this purpose. */
const interesting = ['cloud.', 'editor.', 'fileStorage.'];

declare global {
    interface Window {
        __cloudLog?: Array<{ at: number; type: string }>;
    }
}

export const debugMiddleware: Middleware = () => (next) => (action) => {
    const typed = action as AnyAction;

    if (
        typeof typed?.type === 'string' &&
        interesting.some((p) => typed.type.startsWith(p))
    ) {
        try {
            if (localStorage.getItem('cloud.debug') === '1') {
                window.__cloudLog ??= [];
                window.__cloudLog.push({ at: Date.now(), type: typed.type });
                // eslint-disable-next-line no-console
                console.debug('action', typed.type);
            }
        } catch {
            // storage can throw in a locked down browser; logging is optional
        }
    }

    return next(action);
};

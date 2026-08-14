// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

// Defaults for a shared, school-owned browser.
//
// The editor keeps these in storage and reads them once at startup. Setting
// them before the app renders changes the starting point without touching the
// components that own them, and a person can still change either afterwards.

/**
 * Applies the defaults, if they have not been set already.
 *
 * Called before the app renders.
 */
export function applyPreferences(): void {
    try {
        // The welcome tour opens over the editor on a first visit and has to be
        // clicked through. Fine for someone arriving at pybricks.com alone;
        // here a teacher has already explained what this is, and it is in the
        // way. It also switches the sidebar to Settings when it starts, and
        // leaves it there, which is the other half of why projects opened on
        // the wrong panel.
        //
        // Stored bare rather than JSON quoted; booleans and strings are encoded
        // differently, which is why these values were read off a running build
        // rather than guessed.
        localStorage.setItem('tour.showOnStartup', 'false');
    } catch {
        // a locked down browser can refuse storage; the app still works
    }
}

/**
 * Selects the file list, so opening a project starts there.
 *
 * The sidebar remembers the selected activity across sessions and windows, so
 * on a shared computer one person leaving it on Settings sends everyone there
 * next. Only applied when a project is opened, so that choosing Settings
 * within a session still sticks.
 */
export function showFileList(): void {
    try {
        localStorage.setItem('activities.selectedActivity', '"activity.explorer"');
        sessionStorage.setItem('activities.selectedActivity', '"activity.explorer"');
    } catch {
        // a locked down browser can refuse storage; the app still works
    }
}

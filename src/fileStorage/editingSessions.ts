// SPDX-License-Identifier: MIT
// Copyright (c) 2024 The Pybricks Authors

/**
 * File editing session management for cross-device coordination
 * This works alongside existing editor locks and file storage locks
 */

import { acquireRemoteLock, releaseRemoteLock } from './remoteLocks';

// Track active editing sessions
const activeSessions = new Map<string, string>(); // path -> sessionId

/**
 * Start an editing session for a file path
 * This should be called when a file is opened for editing
 */
export async function startEditingSession(filePath: string): Promise<{
    success: boolean;
    sessionId?: string;
    message?: string;
}> {
    try {
        console.log('[Editing Session] Starting session for:', filePath);

        // Try to acquire a file editing lock
        const lockName = `file-editing:${filePath}`;
        const acquired = await acquireRemoteLock(lockName);

        if (!acquired) {
            return {
                success: false,
                message: `File "${filePath}" is currently being edited by another user`,
            };
        }

        // Generate a session ID for this editing session
        const sessionId = `edit-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`;
        activeSessions.set(filePath, sessionId);

        console.log('[Editing Session] Started session:', sessionId, 'for:', filePath);

        return {
            success: true,
            sessionId,
        };
    } catch (error) {
        console.error('[Editing Session] Error starting session:', error);
        return {
            success: false,
            message: 'Failed to start editing session due to network error',
        };
    }
}

/**
 * End an editing session for a file path
 * This should be called when a file is closed or user switches files
 */
export async function endEditingSession(filePath: string): Promise<void> {
    try {
        console.log('[Editing Session] Ending session for:', filePath);

        const sessionId = activeSessions.get(filePath);
        if (!sessionId) {
            console.warn('[Editing Session] No active session found for:', filePath);
            return;
        }

        // Release the file editing lock
        const lockName = `file-editing:${filePath}`;
        await releaseRemoteLock(lockName);

        // Remove from active sessions
        activeSessions.delete(filePath);

        console.log('[Editing Session] Ended session:', sessionId, 'for:', filePath);
    } catch (error) {
        console.error('[Editing Session] Error ending session:', error);
    }
}

/**
 * Check if a file is currently being edited by someone else
 */
export async function checkEditingStatus(filePath: string): Promise<{
    canEdit: boolean;
    message?: string;
}> {
    // If we have an active session for this file, we can edit it
    if (activeSessions.has(filePath)) {
        return { canEdit: true };
    }

    // Try to start a session to see if the file is available
    const result = await startEditingSession(filePath);

    if (result.success) {
        // Immediately end it - we were just checking
        await endEditingSession(filePath);
        return { canEdit: true };
    }

    return {
        canEdit: false,
        message: result.message,
    };
}

/**
 * Get list of currently active editing sessions
 */
export function getActiveSessions(): Array<{ filePath: string; sessionId: string }> {
    return Array.from(activeSessions.entries()).map(([filePath, sessionId]) => ({
        filePath,
        sessionId,
    }));
}

/**
 * Global function for testing - check editing status from console
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).checkFileEditing = async (filePath: string) => {
    const status = await checkEditingStatus(filePath);
    console.log(`Editing status for "${filePath}":`, status);
    return status;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).getActiveSessions = () => {
    const sessions = getActiveSessions();
    console.log('Active editing sessions:', sessions);
    return sessions;
};

/**
 * Validate that we still have the editing lock for a file
 */
export async function validateEditingSession(filePath: string): Promise<boolean> {
    try {
        const { isFileLockedByOther } = await import('./remoteLocks');
        const lockResult = await isFileLockedByOther(`file-editing:${filePath}`);

        // If locked by another session, we lost the lock
        if (lockResult.locked) {
            console.warn(
                '[Editing Session] Lost lock for:',
                filePath,
                'locked by:',
                lockResult.sessionId,
            );

            // Remove from our active sessions since we lost it
            activeSessions.delete(filePath);
            return false;
        }

        return true;
    } catch (error) {
        console.error('[Editing Session] Error validating session:', error);
        return false;
    }
}

/**
 * Validate all active editing sessions and return which ones are still valid
 */
export async function validateAllEditingSessions(): Promise<{
    valid: string[];
    invalid: string[];
}> {
    const sessions = getActiveSessions();
    const valid: string[] = [];
    const invalid: string[] = [];

    for (const { filePath } of sessions) {
        const isValid = await validateEditingSession(filePath);
        if (isValid) {
            valid.push(filePath);
        } else {
            invalid.push(filePath);
        }
    }

    return { valid, invalid };
}

/**
 * Initialize page unload cleanup to release all active editing sessions
 * This ensures that locks are released when the browser tab is closed
 */
export function initializePageUnloadCleanup(): void {
    const handleBeforeUnload = () => {
        // Get all active sessions and end them
        const sessions = getActiveSessions();
        console.log(
            '[File Editing] Page unload - cleaning up',
            sessions.length,
            'active sessions',
        );

        for (const { filePath } of sessions) {
            // Use synchronous cleanup for page unload
            endEditingSession(filePath).catch((error) => {
                console.error(
                    '[File Editing] Failed to cleanup session on unload:',
                    filePath,
                    error,
                );
            });
        }
    };

    // Listen for page unload events
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleBeforeUnload);

    // Also handle visibility change (when tab becomes hidden)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            handleBeforeUnload();
        }
    });

    console.log('[File Editing] Initialized page unload cleanup');
}

/**
 * Start periodic validation of editing sessions
 * This checks every 10 seconds if we still have valid locks
 */
let validationInterval: NodeJS.Timeout | null = null;
let onValidationCallback: ((invalidFiles: string[]) => void) | null = null;

export function startEditingSessionValidation(
    callback: (invalidFiles: string[]) => void,
): void {
    if (validationInterval) {
        return; // Already running
    }

    onValidationCallback = callback;

    validationInterval = setInterval(async () => {
        try {
            const result = await validateAllEditingSessions();

            if (result.invalid.length > 0) {
                console.log(
                    '[Editing Session] Found invalid sessions:',
                    result.invalid,
                );
                onValidationCallback?.(result.invalid);
            }
        } catch (error) {
            console.error('[Editing Session] Validation check failed:', error);
        }
    }, 10000); // Check every 10 seconds

    console.log('[File Editing] Started editing session validation');
}

export function stopEditingSessionValidation(): void {
    if (validationInterval) {
        clearInterval(validationInterval);
        validationInterval = null;
        onValidationCallback = null;
        console.log('[File Editing] Stopped editing session validation');
    }
}

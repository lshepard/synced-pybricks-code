// SPDX-License-Identifier: MIT
// Copyright (c) 2024 The Pybricks Authors

import { SupabaseClient, createClient } from '@supabase/supabase-js';

/**
 * Remote file locking coordination using Supabase
 * Works alongside Web Locks API for hybrid local + remote locking
 */

let supabase: SupabaseClient | null = null;
let sessionId: string | null = null;

// Track active locks for heartbeat
const activeLocks = new Set<string>();
let heartbeatInterval: NodeJS.Timeout | null = null;

// Initialize Supabase client and session ID
function initializeRemoteLocks(): void {
    if (supabase) {
        return;
    } // Already initialized

    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || '';
    const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseKey) {
        console.warn(
            '[Remote Locks] Supabase not configured - remote locking disabled',
        );
        return;
    }

    supabase = createClient(supabaseUrl, supabaseKey);
    sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log('[Remote Locks] Initialized with session:', sessionId);

    // Start heartbeat system
    startHeartbeat();
}

/**
 * Try to acquire a remote lock for any resource name
 */
export async function acquireRemoteLock(lockName: string): Promise<boolean> {
    initializeRemoteLocks();

    if (!supabase || !sessionId) {
        console.warn('[Remote Locks] Not available - allowing local-only lock');
        return true; // Allow local lock to proceed
    }

    try {
        // Clean up expired locks first
        await cleanupExpiredLocks();

        // Try to insert our lock (will fail if path already exists)
        const expiresAt = new Date(Date.now() + 30000); // 30 seconds from now

        const { error } = await supabase.from('file_locks').insert({
            path: lockName,
            session_id: sessionId,
            expires_at: expiresAt.toISOString(),
        });

        if (error) {
            // Lock already exists - check if it's ours
            const { data: existingLock } = await supabase
                .from('file_locks')
                .select('session_id, expires_at')
                .eq('path', lockName)
                .single();

            if (existingLock?.session_id === sessionId) {
                // It's our lock - refresh it
                const newExpiresAt = new Date(Date.now() + 30000);
                await supabase
                    .from('file_locks')
                    .update({ expires_at: newExpiresAt.toISOString() })
                    .eq('path', lockName)
                    .eq('session_id', sessionId);

                console.log('[Remote Locks] Refreshed existing lock for:', lockName);
                return true;
            }

            // Someone else has the lock
            console.log('[Remote Locks] Resource locked by another session:', lockName);
            return false;
        }

        console.log('[Remote Locks] Acquired lock for:', lockName);

        // Add to active locks for heartbeat
        activeLocks.add(lockName);
        console.log('[Remote Locks] Active locks:', activeLocks.size);

        return true;
    } catch (error) {
        console.error('[Remote Locks] Error acquiring lock:', error);
        return true; // Allow local lock on error
    }
}

/**
 * Release a remote lock for any resource name
 */
export async function releaseRemoteLock(lockName: string): Promise<void> {
    if (!supabase || !sessionId) {
        return;
    }

    try {
        const { error } = await supabase
            .from('file_locks')
            .delete()
            .eq('path', lockName)
            .eq('session_id', sessionId);

        if (error) {
            console.warn('[Remote Locks] Error releasing lock:', error);
        } else {
            console.log('[Remote Locks] Released lock for:', lockName);

            // Remove from active locks
            activeLocks.delete(lockName);
            console.log('[Remote Locks] Active locks:', activeLocks.size);
        }
    } catch (error) {
        console.error('[Remote Locks] Error releasing lock:', error);
    }
}

/**
 * Check if a resource is locked by another session
 */
export async function isFileLockedByOther(lockName: string): Promise<{
    locked: boolean;
    sessionId?: string;
}> {
    if (!supabase || !sessionId) {
        return { locked: false };
    }

    try {
        await cleanupExpiredLocks();

        const { data: lock } = await supabase
            .from('file_locks')
            .select('session_id')
            .eq('path', lockName)
            .single();

        if (!lock) {
            return { locked: false };
        }

        if (lock.session_id === sessionId) {
            return { locked: false }; // Our own lock doesn't block us
        }

        return {
            locked: true,
            sessionId: lock.session_id,
        };
    } catch (error) {
        console.error('[Remote Locks] Error checking lock status:', error);
        return { locked: false };
    }
}

/**
 * Clean up expired locks
 */
async function cleanupExpiredLocks(): Promise<void> {
    if (!supabase) {
        return;
    }

    try {
        const { error } = await supabase
            .from('file_locks')
            .delete()
            .lt('expires_at', new Date().toISOString());

        if (error) {
            console.warn('[Remote Locks] Error cleaning up expired locks:', error);
        }
    } catch (error) {
        console.error('[Remote Locks] Error in cleanup:', error);
    }
}

/**
 * Refresh lock expiration for any resource (called periodically)
 */
export async function refreshLockExpiration(lockName: string): Promise<void> {
    if (!supabase || !sessionId) {
        return;
    }

    try {
        const newExpiresAt = new Date(Date.now() + 30000); // 30 seconds from now

        await supabase
            .from('file_locks')
            .update({ expires_at: newExpiresAt.toISOString() })
            .eq('path', lockName)
            .eq('session_id', sessionId);
    } catch (error) {
        console.error('[Remote Locks] Error refreshing lock:', error);
    }
}

/**
 * Start the heartbeat system to keep active locks alive
 */
function startHeartbeat(): void {
    if (heartbeatInterval) {
        return; // Already running
    }

    // Refresh locks every 15 seconds (locks expire in 30 seconds)
    heartbeatInterval = setInterval(() => {
        if (activeLocks.size > 0) {
            console.log(
                '[Remote Locks] Heartbeat - refreshing',
                activeLocks.size,
                'active locks',
            );

            // Refresh all active locks
            activeLocks.forEach(async (lockName) => {
                try {
                    await refreshLockExpiration(lockName);
                } catch (error) {
                    console.warn(
                        '[Remote Locks] Heartbeat refresh failed for lock:',
                        lockName,
                        'attempting to re-acquire',
                    );

                    // Try to re-acquire the lock if refresh failed
                    try {
                        const reacquired = await acquireRemoteLock(lockName);
                        if (reacquired) {
                            console.log(
                                '[Remote Locks] Successfully re-acquired lock:',
                                lockName,
                            );
                        } else {
                            console.error(
                                '[Remote Locks] Failed to re-acquire lock:',
                                lockName,
                            );
                            activeLocks.delete(lockName);
                        }
                    } catch (reacquireError) {
                        console.error(
                            '[Remote Locks] Error re-acquiring lock:',
                            lockName,
                            reacquireError,
                        );
                        activeLocks.delete(lockName);
                    }
                }
            });
        }
    }, 15000); // 15 seconds

    console.log('[Remote Locks] Heartbeat system started');
}

/**
 * Stop the heartbeat system
 */
export function stopHeartbeat(): void {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
        console.log('[Remote Locks] Heartbeat system stopped');
    }
}

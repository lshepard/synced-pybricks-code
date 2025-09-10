// SPDX-License-Identifier: MIT
// Copyright (c) 2022 The Pybricks Authors

import { createContext } from 'react';
import { SupabaseFileSync } from './supabaseSync';
import { FileStorageDb } from '.';

export const db = new FileStorageDb('pybricks.fileStorage');

// Initialize Supabase sync
let supabaseSync: SupabaseFileSync | null = null;
try {
    supabaseSync = new SupabaseFileSync(db);

    // Start sync when database is ready
    db.on('ready', () => {
        supabaseSync?.start().catch((error) => {
            console.error('[File Sync] Failed to start sync:', error);
        });
    });
} catch (error) {
    console.warn('[File Sync] Supabase sync not available:', error);
}

// Global access for testing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).fileSyncStatus = () => {
    return supabaseSync?.getStatus() || { error: 'Sync not initialized' };
};

export const FileStorageContext = createContext(db);
export { supabaseSync };

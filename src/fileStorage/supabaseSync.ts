// SPDX-License-Identifier: MIT
// Copyright (c) 2024 The Pybricks Authors

import { SupabaseClient, createClient } from '@supabase/supabase-js';
import type { IDatabaseChange } from 'dexie-observable/api';
import { FileMetadata, FileStorageDb } from '.';

export interface SyncedFile {
    id?: number;
    path: string;
    contents: string;
    sha256: string;
    view_state: unknown;
    updated_at: string;
    created_at?: string;
}

/**
 * Supabase-based file sync that integrates with Dexie Observable
 */
export class SupabaseFileSync {
    private supabase: SupabaseClient;
    private db: FileStorageDb;
    private isActive: boolean = false;
    private syncInterval: number = 3000; // 3 seconds
    private intervalId?: NodeJS.Timeout;
    private lastSyncTime: Date = new Date(0);

    constructor(db: FileStorageDb) {
        // Use environment variables or defaults
        const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || '';
        const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

        console.log('[Supabase Sync] Environment check:', {
            hasUrl: !!supabaseUrl,
            hasKey: !!supabaseKey,
            urlStart: supabaseUrl.substring(0, 20),
        });

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Supabase URL and anon key must be configured');
        }

        this.supabase = createClient(supabaseUrl, supabaseKey);
        this.db = db;

        console.log('[Supabase Sync] Initialized successfully');
    }

    /**
     * Start syncing files
     */
    async start(): Promise<void> {
        if (this.isActive) {
            return;
        }

        this.isActive = true;
        console.log('[Supabase Sync] Starting sync service');

        // Subscribe to local database changes
        this.db.on('changes').subscribe((changes) => {
            this.handleDatabaseChanges(changes);
        });

        // Start periodic download sync
        this.intervalId = setInterval(() => {
            this.downloadAndMergeFiles().catch(console.error);
        }, this.syncInterval);

        // Do initial sync
        await this.downloadAndMergeFiles();

        console.log('[Supabase Sync] Sync service started');
    }

    /**
     * Stop syncing
     */
    stop(): void {
        if (!this.isActive) {
            return;
        }

        this.isActive = false;

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }

        // Note: Can't easily unsubscribe from Dexie Observable, but that's ok
        console.log('[Supabase Sync] Sync service stopped');
    }

    /**
     * Handle local database changes - upload to Supabase
     */
    private async handleDatabaseChanges(changes: IDatabaseChange[]): Promise<void> {
        if (!this.isActive) {
            return;
        }

        for (const change of changes) {
            try {
                // Only sync metadata table changes (file creation/updates)
                if (change.table === 'metadata') {
                    if (change.type === 1) {
                        // Create
                        await this.uploadFile(change.obj as FileMetadata);
                    } else if (change.type === 2) {
                        // Update
                        await this.uploadFile(change.obj as FileMetadata);
                    } else if (change.type === 3) {
                        // Delete
                        await this.deleteFile(change.oldObj.path);
                    }
                }
            } catch (error) {
                console.error('[Supabase Sync] Failed to handle change:', error);
            }
        }
    }

    /**
     * Upload a file to Supabase
     */
    private async uploadFile(metadata: FileMetadata): Promise<void> {
        try {
            // Get file contents
            const fileContents = await this.db._contents.get(metadata.path);
            if (!fileContents) {
                console.warn('[Supabase Sync] No contents for file:', metadata.path);
                return;
            }

            const syncedFile: Omit<SyncedFile, 'id' | 'created_at'> = {
                path: metadata.path,
                contents: fileContents.contents,
                sha256: metadata.sha256,
                view_state: metadata.viewState,
                updated_at: new Date().toISOString(),
            };

            const { error } = await this.supabase
                .from('synced_files')
                .upsert(syncedFile, {
                    onConflict: 'path',
                });

            if (error) {
                console.error('[Supabase Sync] Upload failed:', error);
            } else {
                console.log('[Supabase Sync] Uploaded:', metadata.path);
            }
        } catch (error) {
            console.error('[Supabase Sync] Upload error:', error);
        }
    }

    /**
     * Delete a file from Supabase
     */
    private async deleteFile(path: string): Promise<void> {
        try {
            const { error } = await this.supabase
                .from('synced_files')
                .delete()
                .eq('path', path);

            if (error) {
                console.error('[Supabase Sync] Delete failed:', error);
            } else {
                console.log('[Supabase Sync] Deleted:', path);
            }
        } catch (error) {
            console.error('[Supabase Sync] Delete error:', error);
        }
    }

    /**
     * Download files from Supabase and merge into local database
     */
    private async downloadAndMergeFiles(): Promise<void> {
        try {
            const { data: remoteFiles, error } = await this.supabase
                .from('synced_files')
                .select('*')
                .gte('updated_at', this.lastSyncTime.toISOString())
                .order('updated_at', { ascending: true });

            if (error) {
                console.error('[Supabase Sync] Download failed:', error);
                return;
            }

            if (!remoteFiles || remoteFiles.length === 0) {
                return; // No new changes
            }

            console.log(
                '[Supabase Sync] Downloaded',
                remoteFiles.length,
                'file changes',
            );

            // Process each remote file
            for (const remoteFile of remoteFiles) {
                await this.mergeFile(remoteFile);
            }

            // Update last sync time
            this.lastSyncTime = new Date();
        } catch (error) {
            console.error('[Supabase Sync] Download error:', error);
        }
    }

    /**
     * Merge a remote file into local database
     */
    private async mergeFile(remoteFile: SyncedFile): Promise<void> {
        try {
            await this.db.transaction(
                'rw',
                this.db.metadata,
                this.db._contents,
                async () => {
                    // Check if local file exists
                    const localMetadata = await this.db.metadata
                        .where('path')
                        .equals(remoteFile.path)
                        .first();

                    if (!localMetadata) {
                        // File doesn't exist locally - create it
                        const newMetadata: Omit<FileMetadata, 'uuid'> = {
                            path: remoteFile.path,
                            sha256: remoteFile.sha256,
                            viewState: remoteFile.view_state as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                        };

                        await this.db.metadata.add(newMetadata as FileMetadata);
                        await this.db._contents.put({
                            path: remoteFile.path,
                            contents: remoteFile.contents,
                        });

                        console.log(
                            '[Supabase Sync] Created local file:',
                            remoteFile.path,
                        );
                    } else {
                        // File exists - check if we need to update
                        if (localMetadata.sha256 !== remoteFile.sha256) {
                            // Content has changed - update local
                            await this.db.metadata.update(localMetadata.uuid, {
                                sha256: remoteFile.sha256,
                                viewState: remoteFile.view_state as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                            });

                            await this.db._contents.put({
                                path: remoteFile.path,
                                contents: remoteFile.contents,
                            });

                            console.log(
                                '[Supabase Sync] Updated local file:',
                                remoteFile.path,
                            );
                        }
                    }
                },
            );
        } catch (error) {
            console.error(
                '[Supabase Sync] Merge error for',
                remoteFile.path,
                ':',
                error,
            );
        }
    }

    /**
     * Get sync status
     */
    getStatus() {
        return {
            isActive: this.isActive,
            lastSyncTime: this.lastSyncTime,
            syncInterval: this.syncInterval,
        };
    }
}

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

import { BlobStore } from './store';

/** A {@link BlobStore} backed by a map, for tests and local development. */
export class MemoryStore implements BlobStore {
    private readonly blobs = new Map<string, string>();

    /** Counts writes per key, so tests can assert on write behavior. */
    readonly writes: string[] = [];

    async get(key: string): Promise<string | undefined> {
        return this.blobs.get(key);
    }

    async put(key: string, value: string): Promise<void> {
        this.writes.push(key);
        this.blobs.set(key, value);
    }

    /** Returns the keys currently in the store, sorted. */
    keys(): string[] {
        return [...this.blobs.keys()].sort();
    }

    /** Overwrites a key with arbitrary content, to simulate corruption. */
    poison(key: string, value: string): void {
        this.blobs.set(key, value);
    }
}

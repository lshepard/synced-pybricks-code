// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

import {
    Lock,
    VersionInfo,
    canSave,
    isLockStale,
    lockTtlMs,
    slugify,
    sortVersions,
    uniqueSlug,
} from './protocol';

describe('slugify', () => {
    it('should lowercase and join words with dashes', () => {
        expect(slugify('Line Follower')).toBe('line-follower');
    });

    it('should collapse runs of separators into one dash', () => {
        expect(slugify('Robot   #2')).toBe('robot-2');
        expect(slugify('a---b')).toBe('a-b');
    });

    it('should strip leading and trailing separators', () => {
        expect(slugify('  spaced  ')).toBe('spaced');
        expect(slugify('!!!bang!!!')).toBe('bang');
    });

    it('should remove apostrophes without splitting the word', () => {
        // "Timmy's" must not become "timmy-s"
        expect(slugify("Timmy's Bot")).toBe('timmy-s-bot');
    });

    it('should reduce accented letters to their base letter', () => {
        expect(slugify('Café Robot')).toBe('cafe-robot');
    });

    it('should be case insensitive', () => {
        expect(slugify('Test')).toBe(slugify('test'));
        expect(slugify('TEST')).toBe(slugify('test'));
    });

    it('should return an empty string when there are no usable characters', () => {
        expect(slugify('')).toBe('');
        expect(slugify('!!!')).toBe('');
        expect(slugify('   ')).toBe('');
        // emoji only
        expect(slugify('🤖')).toBe('');
    });

    it('should limit length and not end with a dash', () => {
        const slug = slugify('a b '.repeat(40));
        expect(slug.length).toBeLessThanOrEqual(64);
        expect(slug.endsWith('-')).toBe(false);
    });
});

describe('uniqueSlug', () => {
    it('should use the plain slug when it is free', () => {
        expect(uniqueSlug('Line Follower', [])).toBe('line-follower');
    });

    it('should append a counter when the slug is taken', () => {
        expect(uniqueSlug('Line Follower', ['line-follower'])).toBe('line-follower-2');
        expect(uniqueSlug('Line Follower', ['line-follower', 'line-follower-2'])).toBe(
            'line-follower-3',
        );
    });

    it('should fill a gap left in the counter sequence', () => {
        expect(uniqueSlug('Test', ['test', 'test-3'])).toBe('test-2');
    });

    it('should treat names that differ only by case as colliding', () => {
        expect(uniqueSlug('TEST', ['test'])).toBe('test-2');
    });

    it('should fall back to a placeholder when the name has no usable characters', () => {
        expect(uniqueSlug('🤖', [])).toBe('project');
        expect(uniqueSlug('🤖', ['project'])).toBe('project-2');
    });

    it('should still avoid the slug of an archived project', () => {
        // archived projects keep their slug because they can be unarchived
        expect(uniqueSlug('Old Bot', ['old-bot'])).toBe('old-bot-2');
    });
});

describe('isLockStale', () => {
    const now = Date.parse('2026-08-13T14:00:00.000Z');

    const lockAt = (iso: string): Lock => ({
        holder: 'Ava',
        sessionId: 'session-a',
        since: iso,
    });

    it('should be stale when there is no lock', () => {
        expect(isLockStale(undefined, now)).toBe(true);
    });

    it('should not be stale when just acquired', () => {
        expect(isLockStale(lockAt('2026-08-13T14:00:00.000Z'), now)).toBe(false);
    });

    it('should not be stale one millisecond before the ttl', () => {
        const since = new Date(now - lockTtlMs + 1).toISOString();
        expect(isLockStale(lockAt(since), now)).toBe(false);
    });

    it('should be stale exactly at the ttl', () => {
        const since = new Date(now - lockTtlMs).toISOString();
        expect(isLockStale(lockAt(since), now)).toBe(true);
    });

    it('should be stale well past the ttl', () => {
        expect(isLockStale(lockAt('2026-08-13T10:00:00.000Z'), now)).toBe(true);
    });

    it('should be stale when the timestamp cannot be parsed', () => {
        // a lock we can't date would otherwise never expire and would
        // permanently wedge the project
        expect(isLockStale(lockAt('not a date'), now)).toBe(true);
    });

    it('should not be stale when the clock is behind the lock', () => {
        expect(isLockStale(lockAt('2026-08-13T15:00:00.000Z'), now)).toBe(false);
    });
});

describe('canSave', () => {
    const now = Date.parse('2026-08-13T14:00:00.000Z');
    const fresh: Lock = {
        holder: 'Ava',
        sessionId: 'session-a',
        since: '2026-08-13T13:55:00.000Z',
    };

    it('should allow the session holding the lock', () => {
        expect(canSave(fresh, 'session-a', now)).toBe(true);
    });

    it('should deny a different session while the lock is fresh', () => {
        expect(canSave(fresh, 'session-b', now)).toBe(false);
    });

    it('should allow any session once the lock is stale', () => {
        const stale = { ...fresh, since: '2026-08-13T10:00:00.000Z' };
        expect(canSave(stale, 'session-b', now)).toBe(true);
    });

    it('should allow any session when there is no lock', () => {
        expect(canSave(undefined, 'session-b', now)).toBe(true);
    });

    it('should deny a session that reuses the holder name but not the id', () => {
        // two tabs open by the same person are still distinct sessions
        expect(canSave(fresh, 'session-c', now)).toBe(false);
    });
});

describe('sortVersions', () => {
    const version = (id: string): VersionInfo => ({
        id,
        savedAt: '2026-08-13T14:00:00.000Z',
        author: 'Ava',
        note: '',
    });

    it('should order newest first', () => {
        const sorted = sortVersions([
            version('20260812T161000000Z'),
            version('20260813T143200000Z'),
            version('20260812T130500000Z'),
        ]);

        expect(sorted.map((v) => v.id)).toEqual([
            '20260813T143200000Z',
            '20260812T161000000Z',
            '20260812T130500000Z',
        ]);
    });

    it('should not modify the input array', () => {
        const input = [version('20260812T161000000Z'), version('20260813T143200000Z')];
        sortVersions(input);
        expect(input.map((v) => v.id)).toEqual([
            '20260812T161000000Z',
            '20260813T143200000Z',
        ]);
    });

    it('should handle an empty list', () => {
        expect(sortVersions([])).toEqual([]);
    });
});

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

import { slugify } from './protocol';

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

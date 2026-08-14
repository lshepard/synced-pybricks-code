// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

import 'fake-indexeddb/auto';
import { db } from '../fileStorage/context';
import {
    firstFileUuid,
    readAllFiles,
    replaceAllFiles,
    uuidForPath,
} from './localFiles';

describe('localFiles', () => {
    beforeEach(async () => {
        await db.metadata.clear();
        await db._contents.clear();
    });

    it('should read nothing when storage is empty', async () => {
        expect(await readAllFiles()).toEqual({});
    });

    it('should round trip a file set', async () => {
        const files = {
            'main.py': 'from pybricks import *\n',
            'helpers.py': 'def turn():\n    pass\n',
        };

        await replaceAllFiles(files);

        expect(await readAllFiles()).toEqual(files);
    });

    it('should give every file a uuid so the editor can open it', async () => {
        await replaceAllFiles({ 'main.py': 'x' });

        expect(await uuidForPath('main.py')).toBeDefined();
    });

    it('should record a hash for each file, as the schema expects', async () => {
        await replaceAllFiles({ 'main.py': 'x' });
        const meta = await db.metadata.where('path').equals('main.py').first();

        expect(meta?.sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should replace rather than merge, so projects cannot mix', async () => {
        await replaceAllFiles({ 'from-a.py': 'a' });
        await replaceAllFiles({ 'from-b.py': 'b' });

        expect(await readAllFiles()).toEqual({ 'from-b.py': 'b' });
    });

    it('should preserve contents exactly, including whitespace', async () => {
        const tricky = { 'main.py': '  indented\n\ttab\n\nblank above\n' };
        await replaceAllFiles(tricky);

        expect((await readAllFiles())['main.py']).toBe(tricky['main.py']);
    });

    it('should prefer main.py as the file to show first', async () => {
        await replaceAllFiles({ 'aaa.py': 'a', 'main.py': 'm' });

        expect(await firstFileUuid()).toBe(await uuidForPath('main.py'));
    });

    it('should fall back to another file when there is no main.py', async () => {
        await replaceAllFiles({ 'only.py': 'x' });

        expect(await firstFileUuid()).toBe(await uuidForPath('only.py'));
    });

    it('should have no file to show when the project is empty', async () => {
        expect(await firstFileUuid()).toBeUndefined();
    });

    it('should report no uuid for a path that does not exist', async () => {
        expect(await uuidForPath('nope.py')).toBeUndefined();
    });
});

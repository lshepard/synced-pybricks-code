// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

import { AsyncSaga, uuid } from '../../test';
import {
    editorCloseFile,
    editorDidCloseFile,
    editorReplaceFile,
} from '../editor/actions';
import { FileStorageDb } from '../fileStorage';
import {
    fileStorageDeleteFile,
    fileStorageDidDeleteFile,
    fileStorageDidDumpAllFiles,
    fileStorageDidWriteFile,
    fileStorageDumpAllFiles,
    fileStorageWriteFile,
} from '../fileStorage/actions';
import {
    cloudDidLoadFiles,
    cloudDidReadFiles,
    cloudLoadFiles,
    cloudReadFiles,
} from './actions';
import cloud from './sagas';

const mainUuid = uuid(0);
const helpersUuid = uuid(1);

/** A file storage stand-in holding the given paths. */
function mockStorage(files: Array<{ path: string; uuid: string }>) {
    return {
        fileStorage: {
            metadata: { toArray: async () => files },
        } as unknown as FileStorageDb,
    };
}

describe('reading files to save', () => {
    it('should report what storage dumped', async () => {
        const saga = new AsyncSaga(cloud, mockStorage([]));

        saga.put(cloudReadFiles());

        await expect(saga.take()).resolves.toEqual(fileStorageDumpAllFiles());

        saga.put(
            fileStorageDidDumpAllFiles([
                { path: 'main.py', contents: 'print(1)' },
                { path: 'helpers.py', contents: 'def turn(): pass' },
            ]),
        );

        await expect(saga.take()).resolves.toEqual(
            cloudDidReadFiles({
                'main.py': 'print(1)',
                'helpers.py': 'def turn(): pass',
            }),
        );

        await saga.end();
    });
});

describe('loading a project', () => {
    it('should write a file that does not exist yet', async () => {
        const saga = new AsyncSaga(cloud, mockStorage([]));

        saga.put(cloudLoadFiles({ 'main.py': 'print(1)' }));

        await expect(saga.take()).resolves.toEqual(
            fileStorageWriteFile('main.py', 'print(1)'),
        );

        saga.put(fileStorageDidWriteFile('main.py', mainUuid));

        await expect(saga.take()).resolves.toEqual(cloudDidLoadFiles());

        await saga.end();
    });

    it('should update an open file through the editor', async () => {
        // The editor owns an open file's text. Writing underneath it would
        // leave the tab showing something else, so it is asked to change the
        // text instead, which keeps the uuid, the lock and the model intact.
        const saga = new AsyncSaga(
            cloud,
            mockStorage([{ path: 'main.py', uuid: mainUuid }]),
        );
        saga.updateState({ editor: { openFileUuids: [mainUuid] } });

        saga.put(cloudLoadFiles({ 'main.py': 'print(2)' }));

        await expect(saga.take()).resolves.toEqual(
            editorReplaceFile(mainUuid, 'print(2)'),
        );

        await expect(saga.take()).resolves.toEqual(cloudDidLoadFiles());

        await saga.end();
    });

    it('should write a closed file that already exists', async () => {
        const saga = new AsyncSaga(
            cloud,
            mockStorage([{ path: 'main.py', uuid: mainUuid }]),
        );
        saga.updateState({ editor: { openFileUuids: [] } });

        saga.put(cloudLoadFiles({ 'main.py': 'print(2)' }));

        await expect(saga.take()).resolves.toEqual(
            fileStorageWriteFile('main.py', 'print(2)'),
        );

        saga.put(fileStorageDidWriteFile('main.py', mainUuid));
        await expect(saga.take()).resolves.toEqual(cloudDidLoadFiles());

        await saga.end();
    });

    it('should remove a file the project does not have', async () => {
        const saga = new AsyncSaga(
            cloud,
            mockStorage([{ path: 'stale.py', uuid: helpersUuid }]),
        );
        saga.updateState({ editor: { openFileUuids: [] } });

        saga.put(cloudLoadFiles({ 'main.py': 'print(1)' }));

        await expect(saga.take()).resolves.toEqual(fileStorageDeleteFile('stale.py'));

        saga.put(fileStorageDidDeleteFile('stale.py'));

        await expect(saga.take()).resolves.toEqual(
            fileStorageWriteFile('main.py', 'print(1)'),
        );

        saga.put(fileStorageDidWriteFile('main.py', mainUuid));
        await expect(saga.take()).resolves.toEqual(cloudDidLoadFiles());

        await saga.end();
    });

    it('should close a file in the editor before deleting it', async () => {
        // deleting a file that is open fails with "in use", which is why the
        // editor is asked to let go of it first
        const saga = new AsyncSaga(
            cloud,
            mockStorage([{ path: 'stale.py', uuid: helpersUuid }]),
        );
        saga.updateState({ editor: { openFileUuids: [helpersUuid] } });

        saga.put(cloudLoadFiles({ 'main.py': 'print(1)' }));

        await expect(saga.take()).resolves.toEqual(editorCloseFile(helpersUuid));

        saga.put(editorDidCloseFile(helpersUuid));

        await expect(saga.take()).resolves.toEqual(fileStorageDeleteFile('stale.py'));

        saga.put(fileStorageDidDeleteFile('stale.py'));
        await expect(saga.take()).resolves.toEqual(
            fileStorageWriteFile('main.py', 'print(1)'),
        );

        saga.put(fileStorageDidWriteFile('main.py', mainUuid));
        await expect(saga.take()).resolves.toEqual(cloudDidLoadFiles());

        await saga.end();
    });

    it('should empty storage for a project with no files', async () => {
        const saga = new AsyncSaga(
            cloud,
            mockStorage([{ path: 'main.py', uuid: mainUuid }]),
        );
        saga.updateState({ editor: { openFileUuids: [] } });

        saga.put(cloudLoadFiles({}));

        await expect(saga.take()).resolves.toEqual(fileStorageDeleteFile('main.py'));

        saga.put(fileStorageDidDeleteFile('main.py'));
        await expect(saga.take()).resolves.toEqual(cloudDidLoadFiles());

        await saga.end();
    });
});

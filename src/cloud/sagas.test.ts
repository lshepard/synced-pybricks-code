// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

import { AsyncSaga, uuid } from '../../test';
import {
    editorActivateFile,
    editorCloseFile,
    editorDidCloseFile,
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

/**
 * A file storage stand-in.
 *
 * The saga reads storage twice: once to find files to delete, and again at
 * the end to pick a file to show. `after` is what the second read returns.
 */
function mockStorage(files: Array<{ path: string; uuid: string }>, after = files) {
    let reads = 0;

    return {
        fileStorage: {
            metadata: {
                toArray: async () => (reads++ === 0 ? files : after),
            },
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
    it('should write a file into empty storage', async () => {
        const saga = new AsyncSaga(
            cloud,
            mockStorage([], [{ path: 'main.py', uuid: mainUuid }]),
        );
        saga.updateState({ editor: { openFileUuids: [] } });

        saga.put(cloudLoadFiles({ 'main.py': 'print(1)' }));

        // no files to close, no files to delete, just write
        await expect(saga.take()).resolves.toEqual(
            fileStorageWriteFile('main.py', 'print(1)'),
        );

        saga.put(fileStorageDidWriteFile('main.py', mainUuid));

        await expect(saga.take()).resolves.toEqual(editorActivateFile(mainUuid));
        await expect(saga.take()).resolves.toEqual(cloudDidLoadFiles());

        await saga.end();
    });

    it('should close open files before deleting', async () => {
        const saga = new AsyncSaga(
            cloud,
            mockStorage(
                [{ path: 'old.py', uuid: helpersUuid }],
                [{ path: 'main.py', uuid: mainUuid }],
            ),
        );
        saga.updateState({ editor: { openFileUuids: [helpersUuid] } });

        saga.put(cloudLoadFiles({ 'main.py': 'print(1)' }));

        // 1. close the open file
        await expect(saga.take()).resolves.toEqual(editorCloseFile(helpersUuid));
        saga.put(editorDidCloseFile(helpersUuid));

        // 2. delete it
        await expect(saga.take()).resolves.toEqual(fileStorageDeleteFile('old.py'));
        saga.put(fileStorageDidDeleteFile('old.py'));

        // 3. write the new file
        await expect(saga.take()).resolves.toEqual(
            fileStorageWriteFile('main.py', 'print(1)'),
        );
        saga.put(fileStorageDidWriteFile('main.py', mainUuid));

        // 4. open main.py
        await expect(saga.take()).resolves.toEqual(editorActivateFile(mainUuid));
        await expect(saga.take()).resolves.toEqual(cloudDidLoadFiles());

        await saga.end();
    });

    it('should delete all existing files before writing new ones', async () => {
        const saga = new AsyncSaga(
            cloud,
            mockStorage(
                [{ path: 'stale.py', uuid: helpersUuid }],
                [{ path: 'main.py', uuid: mainUuid }],
            ),
        );
        saga.updateState({ editor: { openFileUuids: [] } });

        saga.put(cloudLoadFiles({ 'main.py': 'print(1)' }));

        // delete existing file
        await expect(saga.take()).resolves.toEqual(fileStorageDeleteFile('stale.py'));
        saga.put(fileStorageDidDeleteFile('stale.py'));

        // write new file
        await expect(saga.take()).resolves.toEqual(
            fileStorageWriteFile('main.py', 'print(1)'),
        );
        saga.put(fileStorageDidWriteFile('main.py', mainUuid));

        await expect(saga.take()).resolves.toEqual(editorActivateFile(mainUuid));
        await expect(saga.take()).resolves.toEqual(cloudDidLoadFiles());

        await saga.end();
    });

    it('should empty storage for a project with no files', async () => {
        const saga = new AsyncSaga(
            cloud,
            mockStorage([{ path: 'main.py', uuid: mainUuid }], []),
        );
        saga.updateState({ editor: { openFileUuids: [] } });

        saga.put(cloudLoadFiles({}));

        await expect(saga.take()).resolves.toEqual(fileStorageDeleteFile('main.py'));
        saga.put(fileStorageDidDeleteFile('main.py'));

        // no files to open
        await expect(saga.take()).resolves.toEqual(cloudDidLoadFiles());

        await saga.end();
    });

    it('should close multiple open files', async () => {
        const saga = new AsyncSaga(
            cloud,
            mockStorage(
                [
                    { path: 'main.py', uuid: mainUuid },
                    { path: 'helpers.py', uuid: helpersUuid },
                ],
                [{ path: 'new.py', uuid: uuid(2) }],
            ),
        );
        saga.updateState({ editor: { openFileUuids: [mainUuid, helpersUuid] } });

        saga.put(cloudLoadFiles({ 'new.py': 'print(3)' }));

        // close both open files
        await expect(saga.take()).resolves.toEqual(editorCloseFile(mainUuid));
        saga.put(editorDidCloseFile(mainUuid));

        await expect(saga.take()).resolves.toEqual(editorCloseFile(helpersUuid));
        saga.put(editorDidCloseFile(helpersUuid));

        // delete both
        await expect(saga.take()).resolves.toEqual(fileStorageDeleteFile('main.py'));
        saga.put(fileStorageDidDeleteFile('main.py'));

        await expect(saga.take()).resolves.toEqual(fileStorageDeleteFile('helpers.py'));
        saga.put(fileStorageDidDeleteFile('helpers.py'));

        // write new file
        await expect(saga.take()).resolves.toEqual(
            fileStorageWriteFile('new.py', 'print(3)'),
        );
        saga.put(fileStorageDidWriteFile('new.py', uuid(2)));

        await expect(saga.take()).resolves.toEqual(editorActivateFile(uuid(2)));
        await expect(saga.take()).resolves.toEqual(cloudDidLoadFiles());

        await saga.end();
    });
});

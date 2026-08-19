// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

import './cloud.scss';
import {
    Button,
    Dialog,
    DialogBody,
    DialogFooter,
    InputGroup,
    Intent,
} from '@blueprintjs/core';
import React, { useCallback, useState } from 'react';
import * as api from './api';
import { addEditedHere, getName, getSessionId } from './identity';
import { VersionInfo, maxNoteLength } from './protocol';
import { useReadProjectFiles } from './useProjectFiles';

type SaveButtonProps = {
    /** The project being edited. */
    slug: string;
    /** Called with the version that was written. */
    onSaved: (version: VersionInfo) => void;
    /** Whether saving is blocked because someone else holds the lock. */
    readOnly: boolean;
};

/**
 * Saves the whole project to the cloud.
 *
 * A save is a snapshot of every file, appended to the project's history. It
 * never overwrites an earlier version, so there is nothing to lose by saving.
 */
const SaveButton: React.FunctionComponent<SaveButtonProps> = ({
    slug,
    onSaved,
    readOnly,
}) => {
    const [asking, setAsking] = useState(false);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | undefined>();
    const readProjectFiles = useReadProjectFiles();

    const save = useCallback(async () => {
        setBusy(true);
        setError(undefined);

        try {
            const files = await readProjectFiles();

            if (Object.keys(files).length === 0) {
                setError('There are no files to save.');
                setBusy(false);
                return;
            }

            const version = await api.saveVersion(slug, {
                files,
                author: getName() ?? 'Someone',
                note: note.trim(),
                sessionId: getSessionId(),
            });

            addEditedHere(slug);
            setBusy(false);
            setAsking(false);
            setNote('');
            onSaved(version);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save.');
            setBusy(false);
        }
    }, [slug, note, onSaved, readProjectFiles]);

    return (
        <>
            <Button
                className="pb-cloud-save-button"
                icon="cloud-upload"
                text="Save"
                disabled={readOnly}
                title={
                    readOnly
                        ? 'Someone else is editing this project'
                        : 'Save this project for your team'
                }
                onClick={() => {
                    setError(undefined);
                    setAsking(true);
                }}
            />

            <Dialog
                isOpen={asking}
                title="Save to the cloud"
                onClose={() => !busy && setAsking(false)}
            >
                <DialogBody>
                    <p>What did you change? (optional)</p>
                    <InputGroup
                        autoFocus
                        large
                        placeholder="fixed the turn radius"
                        value={note}
                        maxLength={maxNoteLength}
                        onChange={(e) => setNote(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !busy && save()}
                    />
                    {error && (
                        <div className="pb-cloud-error" style={{ marginTop: 12 }}>
                            {error}
                        </div>
                    )}
                </DialogBody>
                <DialogFooter
                    actions={
                        <>
                            <Button
                                text="Cancel"
                                disabled={busy}
                                onClick={() => setAsking(false)}
                            />
                            <Button
                                intent={Intent.PRIMARY}
                                text="Save"
                                loading={busy}
                                onClick={save}
                            />
                        </>
                    }
                />
            </Dialog>
        </>
    );
};

export default SaveButton;

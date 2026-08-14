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
import { getName, getSessionId, markSaved } from './identity';
import { readAllFiles } from './localFiles';
import { maxNoteLength } from './protocol';

type SaveButtonProps = {
    /** The project being edited. */
    slug: string;
    /** Whether there are unsaved local changes. */
    dirty: boolean;
    /** Called after a successful save. */
    onSaved: () => void;
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
    dirty,
    onSaved,
    readOnly,
}) => {
    const [asking, setAsking] = useState(false);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | undefined>();

    const save = useCallback(async () => {
        setBusy(true);
        setError(undefined);

        try {
            const files = await readAllFiles();

            if (Object.keys(files).length === 0) {
                setError('There are no files to save.');
                setBusy(false);
                return;
            }

            await api.saveVersion(slug, {
                files,
                author: getName() ?? 'Someone',
                note: note.trim(),
                sessionId: getSessionId(),
            });

            markSaved();
            setBusy(false);
            setAsking(false);
            setNote('');
            onSaved();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save.');
            setBusy(false);
        }
    }, [slug, note, onSaved]);

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
            {dirty && !readOnly && <span className="pb-cloud-dirty-dot" />}

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

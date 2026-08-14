// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

import {
    Button,
    Dialog,
    DialogBody,
    DialogFooter,
    InputGroup,
} from '@blueprintjs/core';
import React, { useCallback, useState } from 'react';
import { getName, setName } from './identity';
import { maxAuthorLength } from './protocol';

type NameGateProps = {
    /** Called once a name has been given. */
    onDone: (name: string) => void;
    /** Whether to ask even though a name is already stored. */
    force?: boolean;
};

/**
 * Asks who is using this browser.
 *
 * There is no account system. The name is attribution on saves and locks, so
 * that a team can see who changed what.
 */
const NameGate: React.FunctionComponent<NameGateProps> = ({ onDone, force }) => {
    const [value, setValue] = useState(force ? getName() ?? '' : '');

    const submit = useCallback(() => {
        const trimmed = value.trim();

        if (trimmed === '') {
            return;
        }

        setName(trimmed);
        onDone(trimmed);
    }, [value, onDone]);

    return (
        <Dialog
            isOpen={true}
            title="What's your name?"
            // there is no way past this, so no close button
            isCloseButtonShown={false}
            canEscapeKeyClose={false}
            canOutsideClickClose={false}
        >
            <DialogBody>
                <p>This is shown next to the code you save, so your team knows.</p>
                <InputGroup
                    autoFocus
                    large
                    placeholder="First name"
                    value={value}
                    maxLength={maxAuthorLength}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                />
            </DialogBody>
            <DialogFooter
                actions={
                    <Button
                        intent="primary"
                        text="Continue"
                        disabled={value.trim() === ''}
                        onClick={submit}
                    />
                }
            />
        </Dialog>
    );
};

export default NameGate;

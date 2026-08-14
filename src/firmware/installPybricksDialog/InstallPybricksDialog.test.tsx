// SPDX-License-Identifier: MIT
// Copyright (c) 2022-2023 The Pybricks Authors

import { act, cleanup } from '@testing-library/react';
import React from 'react';
import { testRender } from '../../../test';
import { Hub } from '../../components/hubPicker';
import { InstallPybricksDialog } from './InstallPybricksDialog';
import {
    firmwareInstallPybricksDialogAccept,
    firmwareInstallPybricksDialogCancel,
} from './actions';

jest.mock('./hooks');

afterEach(() => {
    jest.resetAllMocks();
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
});

it('should dispatch when close is clicked', async () => {
    const [user, dialog, dispatch] = testRender(<InstallPybricksDialog />, {
        firmware: { installPybricksDialog: { isOpen: true } },
    });

    await act(() => user.click(dialog.getByRole('button', { name: /close/i })));

    expect(dispatch).toHaveBeenCalledWith(firmwareInstallPybricksDialogCancel());
});

it('should dispatch when done is clicked', async () => {
    // The flash method follows from the hub, so state it rather than leaning
    // on whatever the picker defaults to. A hub without USB, such as this one,
    // flashes over the Bluetooth bootloader.
    localStorage.setItem('hubPicker.selectedHub', JSON.stringify(Hub.Move));

    const [user, dialog, dispatch] = testRender(<InstallPybricksDialog />, {
        firmware: { installPybricksDialog: { isOpen: true } },
    });

    // first page - select hub
    await act(() => user.click(dialog.getByRole('button', { name: /next/i })));

    // second page - accept license
    await act(() => user.click(dialog.getByRole('checkbox', { name: /agree/i })));
    await act(() => user.click(dialog.getByRole('button', { name: /next/i })));

    // third page - options
    await act(() => user.click(dialog.getByRole('button', { name: /next/i })));

    // last page
    await act(() => user.click(dialog.getByRole('button', { name: /install/i })));

    expect(dispatch).toHaveBeenCalledWith(
        firmwareInstallPybricksDialogAccept(
            'ble-lwp3-bootloader',
            new ArrayBuffer(0),
            '',
        ),
    );
});

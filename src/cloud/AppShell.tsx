// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

import './cloud.scss';
import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import App from '../app/App';
import { showFileList } from './preferences';

/**
 * Holds the editor for the life of the session.
 *
 * Monaco gives each editor it creates its own id, and the editor's open file
 * list is global redux state shared by all of them. Unmounting the editor and
 * building another therefore leaves the new one showing tabs that belong to
 * the old one, for files it never opened and that may no longer exist.
 *
 * Routes render around the editor rather than containing it, and it is hidden
 * rather than removed when a route has no use for it, so exactly one is ever
 * created.
 */
const AppShell: React.FunctionComponent = () => {
    const { pathname } = useLocation();
    const inProject = pathname.startsWith('/project/');

    // Runs once, before the first render. The sidebar reads its selection from
    // storage when it mounts, and since the editor mounts once and stays, that
    // read happens once too, so this has to be set before it rather than in an
    // effect afterwards.
    useState(() => {
        showFileList();
        return null;
    });

    return (
        <>
            <Outlet />
            <div
                className="pb-cloud-editor-host"
                style={{ display: inProject ? undefined : 'none' }}
            >
                <App />
            </div>
        </>
    );
};

export default AppShell;

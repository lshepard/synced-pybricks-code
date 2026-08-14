// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

import './cloud.scss';
import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import App from '../app/App';

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

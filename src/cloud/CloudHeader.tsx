// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

import './cloud.scss';
import React from 'react';
import { Link } from 'react-router-dom';

type CloudHeaderProps = {
    /** Name of the open project, if any. */
    projectName?: string;
    /** The current user's name. */
    who?: string;
    /** Called when the user wants to be someone else. */
    onChangeWho?: () => void;
    /** Extra controls, shown at the right. */
    children?: React.ReactNode;
};

/**
 * The bar across the top of every page.
 *
 * Deliberately short: the editor needs the vertical space, so this carries
 * identity and little else.
 */
const CloudHeader: React.FunctionComponent<CloudHeaderProps> = ({
    projectName,
    who,
    onChangeWho,
    children,
}) => {
    return (
        <header className="pb-cloud-header">
            <Link to="/" className="pb-cloud-header-title" title="All projects">
                <img
                    src="/jahn-logo.png"
                    alt=""
                    className="pb-cloud-header-logo"
                    style={{ verticalAlign: 'middle', marginRight: 8 }}
                />
                Jahn Robotics
            </Link>
            {projectName && (
                <span className="pb-cloud-header-project">{projectName}</span>
            )}
            <span className="pb-cloud-header-spacer" />
            {children}
            {who && (
                <span className="pb-cloud-header-who">
                    {who}
                    {onChangeWho && (
                        <button type="button" onClick={onChangeWho}>
                            change
                        </button>
                    )}
                </span>
            )}
        </header>
    );
};

export default CloudHeader;

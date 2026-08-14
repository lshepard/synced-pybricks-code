// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

import './cloud.scss';
import {
    Button,
    Dialog,
    DialogBody,
    DialogFooter,
    InputGroup,
    Spinner,
} from '@blueprintjs/core';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CloudHeader from './CloudHeader';
import NameGate from './NameGate';
import * as api from './api';
import { clearName, getName } from './identity';
import { ProjectInfo, maxProjectNameLength } from './protocol';

function when(iso: string): string {
    const date = new Date(iso);
    const days = Math.floor((Date.now() - date.getTime()) / 86400000);

    if (days === 0) {
        return date.toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
        });
    }

    if (days === 1) {
        return 'yesterday';
    }

    if (days < 7) {
        return `${days} days ago`;
    }

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** The project list, and the way in to everything else. */
const Dashboard: React.FunctionComponent = () => {
    const navigate = useNavigate();
    const [projects, setProjects] = useState<ProjectInfo[] | undefined>();
    const [error, setError] = useState<string | undefined>();
    const [showArchived, setShowArchived] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [busy, setBusy] = useState(false);
    const [who, setWho] = useState(getName());
    const [askName, setAskName] = useState(getName() === undefined);

    const load = useCallback(async () => {
        try {
            setProjects(await api.fetchProjects());
            setError(undefined);
        } catch (err) {
            setError(
                err instanceof Error
                    ? `Could not load projects: ${err.message}`
                    : 'Could not load projects.',
            );
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const create = useCallback(async () => {
        const name = newName.trim();

        if (name === '') {
            return;
        }

        setBusy(true);

        try {
            const project = await api.createProject(name);
            navigate(`/project/${project.slug}`);
        } catch (err) {
            setError(
                err instanceof Error
                    ? `Could not create the project: ${err.message}`
                    : 'Could not create the project.',
            );
            setBusy(false);
            setCreating(false);
        }
    }, [newName, navigate]);

    const toggleArchived = useCallback(
        async (project: ProjectInfo) => {
            try {
                await api.setArchived(project.slug, !project.archived);
                await load();
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not change that.');
            }
        },
        [load],
    );

    if (askName) {
        return (
            <NameGate
                onDone={(name) => {
                    setWho(name);
                    setAskName(false);
                }}
            />
        );
    }

    const visible = (projects ?? []).filter((p) => p.archived === showArchived);
    const archivedCount = (projects ?? []).filter((p) => p.archived).length;

    return (
        <>
            <CloudHeader
                who={who}
                onChangeWho={() => {
                    clearName();
                    setAskName(true);
                }}
            />
            <div className="pb-cloud-dashboard">
                <div className="pb-cloud-dashboard-inner">
                    <div className="pb-cloud-dashboard-bar">
                        <h1>{showArchived ? 'Archived projects' : 'Projects'}</h1>
                        <Button
                            icon="plus"
                            intent="primary"
                            text="New project"
                            onClick={() => {
                                setNewName('');
                                setCreating(true);
                            }}
                        />
                    </div>

                    {error && <div className="pb-cloud-error">{error}</div>}

                    {projects === undefined ? (
                        <Spinner />
                    ) : visible.length === 0 ? (
                        <div className="pb-cloud-empty">
                            {showArchived ? (
                                <p>Nothing archived.</p>
                            ) : (
                                <>
                                    <p>No projects yet.</p>
                                    <p>
                                        Make one to start sharing code with your team.
                                    </p>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="pb-cloud-grid">
                            {visible.map((project) => (
                                <div
                                    key={project.slug}
                                    className={`pb-cloud-card${
                                        project.archived
                                            ? ' pb-cloud-card-archived'
                                            : ''
                                    }`}
                                    onClick={() => navigate(`/project/${project.slug}`)}
                                >
                                    <h3>{project.name}</h3>
                                    <div className="pb-cloud-card-meta">
                                        edited {when(project.updatedAt)}
                                    </div>
                                    <div className="pb-cloud-card-actions">
                                        <Button
                                            small
                                            minimal
                                            text={
                                                project.archived
                                                    ? 'Unarchive'
                                                    : 'Archive'
                                            }
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleArchived(project);
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {(archivedCount > 0 || showArchived) && (
                        <div style={{ marginTop: 28, textAlign: 'center' }}>
                            <Button
                                minimal
                                small
                                text={
                                    showArchived
                                        ? 'Back to projects'
                                        : `Archived (${archivedCount})`
                                }
                                onClick={() => setShowArchived(!showArchived)}
                            />
                        </div>
                    )}
                </div>
            </div>

            <Dialog
                isOpen={creating}
                title="New project"
                onClose={() => setCreating(false)}
            >
                <DialogBody>
                    <InputGroup
                        autoFocus
                        large
                        placeholder="Line Follower"
                        value={newName}
                        maxLength={maxProjectNameLength}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && create()}
                    />
                </DialogBody>
                <DialogFooter
                    actions={
                        <>
                            <Button text="Cancel" onClick={() => setCreating(false)} />
                            <Button
                                intent="primary"
                                text="Create"
                                loading={busy}
                                disabled={newName.trim() === ''}
                                onClick={create}
                            />
                        </>
                    }
                />
            </Dialog>
        </>
    );
};

export default Dashboard;

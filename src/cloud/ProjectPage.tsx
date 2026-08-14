// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

import './cloud.scss';
import { Button, Dialog, DialogBody, DialogFooter, Spinner } from '@blueprintjs/core';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import App from '../app/App';
import { editorActivateFile } from '../editor/actions';
import CloudHeader from './CloudHeader';
import NameGate from './NameGate';
import SaveButton from './SaveButton';
import * as api from './api';
import {
    clearName,
    getCurrentProject,
    getName,
    getSessionId,
    isDirty,
    markSaved,
    setCurrentProject,
} from './identity';
import { firstFileUuid, replaceAllFiles } from './localFiles';
import { Lock, ProjectInfo, VersionInfo } from './protocol';

function when(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

/** What has to happen before the editor can be shown. */
type Phase = 'loading' | 'confirmSwitch' | 'ready' | 'failed';

/**
 * One project: the editor, plus the controls that connect it to the cloud.
 *
 * Local storage holds one project at a time, so opening a project replaces
 * whatever was there. When the previous project had unsaved changes, that is
 * confirmed first.
 */
const ProjectPage: React.FunctionComponent = () => {
    const { slug = '' } = useParams();
    const navigate = useNavigate();
    const dispatch = useDispatch();

    const [phase, setPhase] = useState<Phase>('loading');
    const [project, setProject] = useState<ProjectInfo | undefined>();
    const [versions, setVersions] = useState<VersionInfo[]>([]);
    const [lock, setLock] = useState<Lock | undefined>();
    const [error, setError] = useState<string | undefined>();
    const [dirty, setDirty] = useState(false);
    const [who, setWho] = useState(getName());
    const [askName, setAskName] = useState(getName() === undefined);
    const [showFeed, setShowFeed] = useState(false);

    // guards against loading the project twice under React strict mode
    const loadedFor = useRef<string | undefined>(undefined);

    /** Replaces local files with a version's, and opens one in the editor. */
    const loadVersion = useCallback(
        async (versionId?: number) => {
            const list = await api.fetchVersions(slug);
            setVersions(list);

            const target = versionId ?? list[0]?.id;

            if (target !== undefined) {
                const snapshot = await api.fetchVersion(slug, target);
                await replaceAllFiles(snapshot.files);
            }

            setCurrentProject(slug);
            markSaved();
            setDirty(false);

            const uuid = await firstFileUuid();

            if (uuid) {
                dispatch(editorActivateFile(uuid));
            }
        },
        [slug, dispatch],
    );

    const open = useCallback(async () => {
        try {
            const all = await api.fetchProjects();
            const found = all.find((p) => p.slug === slug);

            if (!found) {
                setError(`There is no project called "${slug}".`);
                setPhase('failed');
                return;
            }

            setProject(found);

            const current = getCurrentProject();

            // switching away from unsaved work needs a decision first
            if (current && current !== slug && isDirty()) {
                setPhase('confirmSwitch');
                return;
            }

            // reopening the same project keeps whatever is in the editor,
            // which may be newer than the last save
            if (current !== slug) {
                await loadVersion();
            } else {
                setVersions(await api.fetchVersions(slug));
                setDirty(isDirty());
            }

            try {
                setLock(
                    await api.acquireLock(slug, getName() ?? 'Someone', getSessionId()),
                );
            } catch {
                // someone else is editing; the banner explains and saving is off
                setLock(undefined);
            }

            setPhase('ready');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not open that.');
            setPhase('failed');
        }
    }, [slug, loadVersion]);

    useEffect(() => {
        if (askName || loadedFor.current === slug) {
            return;
        }

        loadedFor.current = slug;
        open();
    }, [open, slug, askName]);

    // release the lock when leaving, so nobody has to wait out the timeout
    useEffect(() => {
        const release = () => {
            navigator.sendBeacon?.(
                `/api/projects/${encodeURIComponent(slug)}/lock`,
                new Blob([JSON.stringify({ sessionId: getSessionId() })], {
                    type: 'application/json',
                }),
            );
        };

        window.addEventListener('pagehide', release);
        return () => window.removeEventListener('pagehide', release);
    }, [slug]);

    // watching storage is enough to know there are edits: the editor writes
    // every keystroke to it
    useEffect(() => {
        const timer = setInterval(() => setDirty(isDirty()), 2000);
        return () => clearInterval(timer);
    }, []);

    const heldByOther = lock === undefined && phase === 'ready';

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

    if (phase === 'failed') {
        return (
            <>
                <CloudHeader who={who} />
                <div className="pb-cloud-dashboard">
                    <div className="pb-cloud-dashboard-inner">
                        <div className="pb-cloud-error">{error}</div>
                        <Button text="Back to projects" onClick={() => navigate('/')} />
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <CloudHeader
                projectName={project?.name}
                who={who}
                onChangeWho={() => {
                    clearName();
                    setAskName(true);
                }}
            >
                <Button
                    minimal
                    small
                    icon="history"
                    text={`History (${versions.length})`}
                    style={{ color: 'white', marginRight: 8 }}
                    onClick={() => setShowFeed(true)}
                />
                {phase === 'ready' && (
                    <SaveButton
                        slug={slug}
                        dirty={dirty}
                        readOnly={heldByOther}
                        onSaved={async () => {
                            setDirty(false);
                            setVersions(await api.fetchVersions(slug));
                        }}
                    />
                )}
            </CloudHeader>

            {heldByOther && (
                <div className="pb-cloud-locked">
                    <span>
                        Someone else is editing this project, so saving is turned off.
                    </span>
                    <Button
                        small
                        text="Edit anyway"
                        onClick={async () => {
                            try {
                                setLock(
                                    await api.acquireLock(
                                        slug,
                                        getName() ?? 'Someone',
                                        getSessionId(),
                                        true,
                                    ),
                                );
                            } catch {
                                // leaving the banner up is the right outcome
                            }
                        }}
                    />
                </div>
            )}

            {phase === 'loading' && (
                <div style={{ padding: 40, textAlign: 'center' }}>
                    <Spinner />
                </div>
            )}

            {phase === 'ready' && <App />}

            <Dialog
                isOpen={phase === 'confirmSwitch'}
                title="Unsaved changes"
                isCloseButtonShown={false}
            >
                <DialogBody>
                    <p>
                        The editor has changes from another project that were never
                        saved. Opening this project will replace them.
                    </p>
                </DialogBody>
                <DialogFooter
                    actions={
                        <>
                            <Button text="Go back" onClick={() => navigate('/')} />
                            <Button
                                intent="danger"
                                text="Replace them"
                                onClick={async () => {
                                    setPhase('loading');
                                    await loadVersion();
                                    try {
                                        setLock(
                                            await api.acquireLock(
                                                slug,
                                                getName() ?? 'Someone',
                                                getSessionId(),
                                            ),
                                        );
                                    } catch {
                                        setLock(undefined);
                                    }
                                    setPhase('ready');
                                }}
                            />
                        </>
                    }
                />
            </Dialog>

            <Dialog
                isOpen={showFeed}
                title="History"
                onClose={() => setShowFeed(false)}
            >
                <DialogBody>
                    {versions.length === 0 ? (
                        <p>Nothing saved yet.</p>
                    ) : (
                        <div className="pb-cloud-feed">
                            {versions.map((version) => (
                                <div
                                    key={version.id}
                                    className="pb-cloud-feed-item"
                                    onClick={async () => {
                                        setShowFeed(false);
                                        setPhase('loading');
                                        await loadVersion(version.id);
                                        setPhase('ready');
                                    }}
                                >
                                    <span className="pb-cloud-feed-author">
                                        {version.author}
                                    </span>
                                    <span className="pb-cloud-feed-note">
                                        {version.note}
                                    </span>
                                    <span className="pb-cloud-feed-when">
                                        {when(version.savedAt)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </DialogBody>
            </Dialog>
        </>
    );
};

export default ProjectPage;

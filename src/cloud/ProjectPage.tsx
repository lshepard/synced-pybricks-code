// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

import './cloud.scss';
import { Button, Dialog, DialogBody, DialogFooter, Spinner } from '@blueprintjs/core';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import App from '../app/App';
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
import { Lock, ProjectInfo, VersionInfo } from './protocol';
import { useReadProjectFiles, useReplaceProjectFiles } from './useProjectFiles';

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
    const replaceProjectFiles = useReplaceProjectFiles();
    const readProjectFiles = useReadProjectFiles();

    const [phase, setPhase] = useState<Phase>('loading');
    const [project, setProject] = useState<ProjectInfo | undefined>();
    const [versions, setVersions] = useState<VersionInfo[]>([]);
    const [lock, setLock] = useState<Lock | undefined>();
    const [error, setError] = useState<string | undefined>();
    const [dirty, setDirty] = useState(false);
    const [who, setWho] = useState(getName());
    const [askName, setAskName] = useState(getName() === undefined);
    const [showFeed, setShowFeed] = useState(false);

    // which project the unsaved local files belong to, while asking about them
    const [pending, setPending] = useState<string | undefined>();
    const [savingPending, setSavingPending] = useState(false);
    const [saveError, setSaveError] = useState<string | undefined>();

    // guards against loading the project twice under React strict mode
    const loadedFor = useRef<string | undefined>(undefined);

    /** Replaces local files with a version's, and opens one in the editor. */
    const loadVersion = useCallback(
        async (versionId?: number) => {
            const list = await api.fetchVersions(slug);
            setVersions(list);

            const target = versionId ?? list[0]?.id;

            // A project with nothing saved yet starts empty; the explorer's +
            // button is how a first file gets made. What matters is that it
            // does not inherit whatever the last project left behind.
            const files =
                target === undefined
                    ? {}
                    : (await api.fetchVersion(slug, target)).files;

            await replaceProjectFiles(files);

            setCurrentProject(slug);
            markSaved();
            setDirty(false);
        },
        [slug, replaceProjectFiles],
    );

    /** Takes the lock, tolerating someone else already holding it. */
    const takeLock = useCallback(async () => {
        try {
            setLock(
                await api.acquireLock(slug, getName() ?? 'Someone', getSessionId()),
            );
        } catch {
            // someone else is editing; the banner explains and saving is off
            setLock(undefined);
        }
    }, [slug]);

    /** Loads the project, replacing whatever the editor currently holds. */
    const proceedWithLoad = useCallback(async () => {
        setPhase('loading');
        await loadVersion();
        await takeLock();
        setPhase('ready');
    }, [loadVersion, takeLock]);

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

            // Unsaved work is the only reason not to load: replacing the files
            // would throw it away. Ask first, whichever project it belongs to.
            if (current && isDirty()) {
                setPending(current);
                setPhase('confirmSwitch');
                return;
            }

            // Otherwise always load, which clears whatever the last project
            // left behind. Local files are only ever a copy of a saved
            // version, so there is nothing to lose by replacing them.
            await loadVersion();
            await takeLock();

            setPhase('ready');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not open that.');
            setPhase('failed');
        }
    }, [slug, loadVersion, takeLock]);

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
        <div className="pb-cloud-page">
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
                        The editor has changes that were never saved
                        {pending && pending !== slug ? (
                            <>
                                , from <strong>{pending}</strong>
                            </>
                        ) : null}
                        . Opening this project will replace them.
                    </p>
                    {saveError && <div className="pb-cloud-error">{saveError}</div>}
                </DialogBody>
                <DialogFooter
                    actions={
                        <>
                            <Button text="Go back" onClick={() => navigate('/')} />
                            {pending && (
                                <Button
                                    text="Save them first"
                                    loading={savingPending}
                                    onClick={async () => {
                                        setSavingPending(true);
                                        setSaveError(undefined);

                                        try {
                                            // save to wherever the files came
                                            // from, not to the project being
                                            // opened
                                            await api.saveVersion(pending, {
                                                files: await readProjectFiles(),
                                                author: getName() ?? 'Someone',
                                                sessionId: getSessionId(),
                                            });
                                            markSaved();
                                            setSavingPending(false);
                                            await proceedWithLoad();
                                        } catch (err) {
                                            setSaveError(
                                                err instanceof Error
                                                    ? err.message
                                                    : 'Could not save those changes.',
                                            );
                                            setSavingPending(false);
                                        }
                                    }}
                                />
                            )}
                            <Button
                                intent="danger"
                                text="Discard them"
                                disabled={savingPending}
                                onClick={proceedWithLoad}
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
        </div>
    );
};

export default ProjectPage;

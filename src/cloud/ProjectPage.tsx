// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

import './cloud.scss';
import { Button, Dialog, DialogBody, DialogFooter, Spinner } from '@blueprintjs/core';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CloudHeader from './CloudHeader';
import NameGate from './NameGate';
import SaveButton from './SaveButton';
import * as api from './api';
import {
    clearName,
    getCurrentProject,
    getLocalVersion,
    getName,
    getSessionId,
    setCurrentProject,
    setLocalVersion,
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
    const [who, setWho] = useState(getName());
    const [askName, setAskName] = useState(getName() === undefined);
    const [showFeed, setShowFeed] = useState(false);

    // which project the unsaved local files belong to, while asking about them
    const [pending, setPending] = useState<string | undefined>();
    const [savingPending, setSavingPending] = useState(false);
    const [saveError, setSaveError] = useState<string | undefined>();

    // guards against loading the project twice under React strict mode
    const loadedFor = useRef<string | undefined>(undefined);

    /**
     * Replaces local files with a version's, and opens one in the editor.
     *
     * @param versionId The version to load, or undefined for the newest.
     * @param force Load even when local already holds that version. Used when
     * a version is picked from the history, where the point is to go back.
     */
    const loadVersion = useCallback(
        async (versionId?: number, force = false) => {
            console.log('[ProjectPage] loadVersion called, force:', force);
            const list = await api.fetchVersions(slug);
            setVersions(list);

            const target = versionId ?? list[0]?.id;
            const localVersion = getLocalVersion(slug);
            console.log('[ProjectPage] target version:', target, 'local version:', localVersion);

            // Local files are only replaced when the server has something this
            // machine has not seen. Replacing them unconditionally throws away
            // anything not yet saved, which for a project whose first file has
            // just been made is the whole project.
            //
            // A project with no versions therefore leaves local storage alone:
            // there is nothing on the server to reconcile against, and the
            // files here are waiting to become its first save.
            if (target === undefined) {
                console.log('[ProjectPage] no target version, skipping load');
                setCurrentProject(slug);
                return;
            }

            if (!force && localVersion === target) {
                // already have exactly this version
                console.log('[ProjectPage] version match, skipping load');
                return;
            }

            console.log('[ProjectPage] loading version', target);
            const snapshot = await api.fetchVersion(slug, target);
            await replaceProjectFiles(snapshot.files);

            console.log('[ProjectPage] setLocalVersion', slug, target);
            setLocalVersion(slug, target);
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

            // Local files belonging to another project that were never saved
            // would be destroyed by loading this one, so ask first. A project
            // whose files came from a known version has nothing to lose.
            if (current && current !== slug && getLocalVersion(current) === undefined) {
                setPending(current);
                setPhase('confirmSwitch');
                return;
            }

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

    const heldByOther = lock === undefined && phase === 'ready';

    // Neither the name prompt nor a failure returns early: doing so unmounts
    // the editor, and the saga driving it keeps a reference to the widget that
    // unmounting disposed, after which nothing is ever drawn. Both are shown
    // over the editor instead.
    return (
        <div className="pb-cloud-page">
            {askName && (
                <NameGate
                    onDone={(name) => {
                        setWho(name);
                        setAskName(false);
                    }}
                />
            )}

            {phase === 'failed' && (
                <Dialog isOpen={true} title="Cannot open this project">
                    <DialogBody>
                        <div className="pb-cloud-error">{error}</div>
                    </DialogBody>
                    <DialogFooter
                        actions={
                            <Button
                                intent="primary"
                                text="Back to projects"
                                onClick={() => navigate('/')}
                            />
                        }
                    />
                </Dialog>
            )}

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
                        readOnly={heldByOther}
                        onSaved={async (version) => {
                            // the files here are now that version, so opening
                            // this project again will not reload over them
                            setLocalVersion(slug, version.id);
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
                <div className="pb-cloud-loading">
                    <Spinner />
                </div>
            )}

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
                                            const saved = await api.saveVersion(
                                                pending,
                                                {
                                                    files: await readProjectFiles(),
                                                    author: getName() ?? 'Someone',
                                                    sessionId: getSessionId(),
                                                },
                                            );

                                            // those files are now a version of
                                            // the project they came from, so
                                            // nothing is lost by loading over
                                            // them
                                            setLocalVersion(pending, saved.id);
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
                                        // forced: picking a version from the
                                        // history means loading it even if it
                                        // is the one already here
                                        await loadVersion(version.id, true);
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

// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Luke Shepard

import './cloud.scss';
import { Button, Dialog, DialogBody, DialogFooter, Spinner } from '@blueprintjs/core';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../fileStorage/context';
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
 * Opening a project does not touch the files already in the editor. The cloud
 * is only read into local storage when asked: from the banner offering a newer
 * version, from the history feed, or when switching away from another
 * project's files. The one exception is an empty editor, which has nothing to
 * lose.
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

    // a version on the server newer than the one these files came from, until
    // it is either loaded or waved away
    const [available, setAvailable] = useState<VersionInfo | undefined>();

    // which project the unsaved local files belong to, while asking about them
    const [pending, setPending] = useState<string | undefined>();
    const [savingPending, setSavingPending] = useState(false);
    const [saveError, setSaveError] = useState<string | undefined>();

    // guards against loading the project twice under React strict mode
    const loadedFor = useRef<string | undefined>(undefined);

    /**
     * Replaces local files with a version's, and opens one in the editor.
     *
     * Always destructive: whatever is in the editor is thrown away. Only ever
     * called for something the person actually asked for — the update banner,
     * the history feed, or switching projects — never on its own.
     *
     * @param versionId The version to load, or undefined for the newest.
     */
    const loadVersion = useCallback(
        async (versionId?: number) => {
            const list = await api.fetchVersions(slug);
            setVersions(list);

            const target = versionId ?? list[0]?.id;

            // Nothing has ever been saved, so there is nothing to load. The
            // files here are waiting to become the first version.
            if (target === undefined) {
                setCurrentProject(slug);
                return;
            }

            const snapshot = await api.fetchVersion(slug, target);
            await replaceProjectFiles(snapshot.files);

            // Recorded only after the files are actually in place, so a load
            // that fails part way does not claim to hold a version it does
            // not. Without this the banner below has nothing to compare
            // against and offers the same version on every reload.
            setLocalVersion(slug, target);
            setAvailable(undefined);
        },
        [slug, replaceProjectFiles],
    );

    /**
     * Looks for a version newer than the one these files came from.
     *
     * Opening a project does not replace what is in the editor: unsaved work
     * belongs to whoever wrote it, and taking it away because someone else
     * pressed save is not a decision this page gets to make. The exception is
     * an editor with no files, where there is nothing to lose and asking first
     * is pure friction.
     */
    const checkForUpdates = useCallback(async () => {
        const list = await api.fetchVersions(slug);
        setVersions(list);

        const latest = list[0];

        if (latest === undefined) {
            // nothing saved yet; these files are the project
            setCurrentProject(slug);
            return;
        }

        // Counted at the moment the decision is made rather than watched, so
        // that an empty editor cannot be confused with a query that has not
        // come back yet.
        if ((await db.metadata.count()) === 0) {
            await loadVersion(latest.id);
            return;
        }

        if (getLocalVersion(slug) !== latest.id) {
            setAvailable(latest);
        }
    }, [slug, loadVersion]);

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

    /** Keeps the local files and opens the editor on them. */
    const proceedWithoutLoading = useCallback(async () => {
        setPhase('loading');
        // The files are now being edited as this project, so a later save goes
        // here and the switch prompt does not ask again.
        setCurrentProject(slug);
        await takeLock();
        setPhase('ready');
    }, [slug, takeLock]);

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

            // Files from another project are still sitting in the editor.
            // Which one they belong to is not something to guess at, so it is
            // asked rather than resolved by loading over them.
            if (current && current !== slug && (await db.metadata.count()) > 0) {
                setPending(current);
                setVersions(await api.fetchVersions(slug));
                setPhase('confirmSwitch');
                return;
            }

            await checkForUpdates();
            await takeLock();

            setPhase('ready');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not open that.');
            setPhase('failed');
        }
    }, [slug, checkForUpdates, takeLock]);

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

            {available && phase === 'ready' && (
                <div className="pb-cloud-update">
                    <span>
                        {available.author} saved a newer version{' '}
                        {when(available.savedAt)}.
                    </span>
                    <Button
                        small
                        intent="primary"
                        text="Load it"
                        onClick={async () => {
                            setPhase('loading');

                            try {
                                await loadVersion(available.id);
                            } catch (err) {
                                setError(
                                    err instanceof Error
                                        ? err.message
                                        : 'Could not load that version.',
                                );
                            }

                            setPhase('ready');
                        }}
                    />
                    <Button
                        small
                        minimal
                        text="Dismiss"
                        // only for this visit: not loading it now says nothing
                        // about the next time the project is opened
                        onClick={() => setAvailable(undefined)}
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
                title="Files from another project"
                isCloseButtonShown={false}
            >
                <DialogBody>
                    <p>
                        The editor is showing files from <strong>{pending}</strong>.
                        This is <strong>{slug}</strong>.
                    </p>
                    <p>
                        Keeping them leaves the editor as it is, and saving from here
                        saves them to {slug}.
                        {versions.length > 0
                            ? ` Loading ${slug} replaces them with its latest version.`
                            : ''}
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
                                text="Keep them"
                                disabled={savingPending}
                                onClick={proceedWithoutLoading}
                            />
                            {versions.length > 0 && (
                                <Button
                                    intent="danger"
                                    text={`Load ${slug}`}
                                    disabled={savingPending}
                                    onClick={proceedWithLoad}
                                />
                            )}
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

                                        try {
                                            await loadVersion(version.id);
                                        } catch (err) {
                                            setError(
                                                err instanceof Error
                                                    ? err.message
                                                    : 'Could not load that version.',
                                            );
                                        }

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

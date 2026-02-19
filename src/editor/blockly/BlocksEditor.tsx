// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Pybricks Authors

import * as Blockly from 'blockly';
import React, { useCallback, useEffect, useRef } from 'react';
import { registerBlocks } from './blocks';
import { pybricksPythonGenerator } from './generator';
import { encodeBlocksFile } from './serialization';
import { pybricksTheme } from './theme';
import { toolbox } from './toolbox';

// Register custom blocks once at module load time.
registerBlocks();

type BlocksEditorProps = Readonly<{
    /** Initial workspace state to restore (Blockly serialization JSON). */
    initialWorkspaceJson?: object;
    /** Callback fired when the workspace changes. Receives the full file content. */
    onContentChange: (content: string) => void;
}>;

const BlocksEditor: React.FunctionComponent<BlocksEditorProps> = ({
    initialWorkspaceJson,
    onContentChange,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
    const onContentChangeRef = useRef(onContentChange);
    onContentChangeRef.current = onContentChange;

    const handleWorkspaceChange = useCallback(() => {
        const workspace = workspaceRef.current;
        if (!workspace) {
            return;
        }

        const workspaceJson = Blockly.serialization.workspaces.save(workspace);
        const pythonCode = pybricksPythonGenerator.workspaceToCode(workspace);
        const content = encodeBlocksFile(workspaceJson, pythonCode);
        onContentChangeRef.current(content);
    }, []);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        const workspace = Blockly.inject(container, {
            toolbox,
            theme: pybricksTheme,
            renderer: 'zelos',
            move: {
                scrollbars: true,
                drag: true,
                wheel: true,
            },
            zoom: {
                controls: true,
                wheel: true,
                startScale: 1.0,
                maxScale: 3,
                minScale: 0.3,
                scaleSpeed: 1.2,
            },
            trashcan: true,
        });

        workspaceRef.current = workspace;

        // Restore workspace state or create default program block.
        if (initialWorkspaceJson) {
            Blockly.serialization.workspaces.load(
                initialWorkspaceJson as Blockly.serialization.blocks.State,
                workspace,
            );
        } else {
            // Create a default program block.
            const programBlock = workspace.newBlock('pb_program');
            programBlock.setDeletable(false);
            programBlock.initSvg();
            programBlock.render();
            programBlock.moveBy(20, 20);
        }

        workspace.addChangeListener(handleWorkspaceChange);

        // Fire initial content generation.
        handleWorkspaceChange();

        return () => {
            workspace.removeChangeListener(handleWorkspaceChange);
            workspace.dispose();
            workspaceRef.current = null;
        };
        // Only run on mount/unmount - initialWorkspaceJson is captured at mount time
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handleWorkspaceChange]);

    return (
        <div
            ref={containerRef}
            style={{ width: '100%', height: '100%' }}
        />
    );
};

export default BlocksEditor;

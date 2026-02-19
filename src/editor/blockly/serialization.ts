// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Pybricks Authors

/** Marker line that identifies a blocks file. */
export const BLOCKS_MARKER = '# __pybricks_blocks__';

/**
 * Tests whether file contents represent a blocks file.
 * @param contents The file contents string.
 * @returns True if the content starts with the blocks marker.
 */
export function isBlocksFile(contents: string): boolean {
    return contents.startsWith(BLOCKS_MARKER);
}

/**
 * Encodes a Blockly workspace state and generated Python into the
 * stored file format.
 *
 * Format:
 * ```
 * # __pybricks_blocks__
 * # <base64 line 1>
 * # <base64 line 2>
 * <generated python code>
 * ```
 *
 * @param workspaceJson The serialized Blockly workspace JSON object.
 * @param pythonCode The generated Python code.
 * @returns The combined file contents string.
 */
export function encodeBlocksFile(
    workspaceJson: object,
    pythonCode: string,
): string {
    const jsonStr = JSON.stringify(workspaceJson);
    const base64 = btoa(unescape(encodeURIComponent(jsonStr)));

    // Split base64 into 76-char lines (standard line length for base64)
    const lines: string[] = [];
    for (let i = 0; i < base64.length; i += 76) {
        lines.push(`# ${base64.slice(i, i + 76)}`);
    }

    return [BLOCKS_MARKER, ...lines, pythonCode].join('\n');
}

/**
 * Decodes a blocks file into workspace JSON and Python code.
 *
 * @param contents The file contents string.
 * @returns An object with the workspace JSON and the Python code,
 *          or null if the content is not a valid blocks file.
 */
export function decodeBlocksFile(
    contents: string,
): { workspaceJson: object; pythonCode: string } | null {
    if (!isBlocksFile(contents)) {
        return null;
    }

    const lines = contents.split('\n');

    // First line is the marker, skip it
    // Subsequent lines starting with '# ' (that are base64) form the JSON
    const base64Lines: string[] = [];
    let codeStartIndex = 1;

    for (let i = 1; i < lines.length; i++) {
        if (lines[i].startsWith('# ') && !lines[i].startsWith('# __')) {
            // Check if this looks like base64 (only base64 chars after '# ')
            const payload = lines[i].slice(2);
            if (/^[A-Za-z0-9+/=]+$/.test(payload)) {
                base64Lines.push(payload);
                codeStartIndex = i + 1;
                continue;
            }
        }
        break;
    }

    if (base64Lines.length === 0) {
        return null;
    }

    try {
        const base64 = base64Lines.join('');
        const jsonStr = decodeURIComponent(escape(atob(base64)));
        const workspaceJson = JSON.parse(jsonStr) as object;
        const pythonCode = lines.slice(codeStartIndex).join('\n');
        return { workspaceJson, pythonCode };
    } catch {
        return null;
    }
}

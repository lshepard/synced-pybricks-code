// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Pybricks Authors

/** Toolbox definition for the blocks editor. */
export const toolbox = {
    kind: 'categoryToolbox',
    contents: [
        {
            kind: 'category',
            name: 'Output',
            colour: '#4a90d9',
            contents: [
                { kind: 'block', type: 'pb_print' },
                { kind: 'block', type: 'pb_text' },
            ],
        },
    ],
};

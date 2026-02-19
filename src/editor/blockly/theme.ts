// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Pybricks Authors

import * as Blockly from 'blockly';

/** Custom Blockly theme matching the Pybricks style. */
export const pybricksTheme = Blockly.Theme.defineTheme('pybricks', {
    name: 'pybricks',
    base: Blockly.Themes.Classic,
    blockStyles: {
        program_blocks: {
            colourPrimary: '#f5a623',
            colourSecondary: '#e09510',
            colourTertiary: '#c7850e',
        },
        output_blocks: {
            colourPrimary: '#4a90d9',
            colourSecondary: '#3a7bc8',
            colourTertiary: '#2d66aa',
        },
    },
    componentStyles: {
        workspaceBackgroundColour: '#f9f9f9',
        toolboxBackgroundColour: '#e8e8e8',
        flyoutBackgroundColour: '#d8d8d8',
    },
});

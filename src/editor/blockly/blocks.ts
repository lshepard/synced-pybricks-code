// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Pybricks Authors

import * as Blockly from 'blockly';

/** Program start block - top-level container for the program. */
const pbProgram = {
    type: 'pb_program',
    message0: '\u25B6 program %1',
    args0: [{ type: 'input_statement', name: 'BODY' }],
    colour: '#f5a623',
    tooltip: 'The main program.',
    helpUrl: '',
};

/** Print block - outputs a value to the console. */
const pbPrint = {
    type: 'pb_print',
    message0: '\uD83D\uDDA8 print %1',
    args0: [{ type: 'input_value', name: 'TEXT' }],
    previousStatement: null,
    nextStatement: null,
    colour: '#4a90d9',
    tooltip: 'Print a value.',
    helpUrl: '',
};

/** Text literal block - a string value. */
const pbText = {
    type: 'pb_text',
    message0: '" %1 "',
    args0: [{ type: 'field_input', name: 'TEXT', text: 'Hello, Pybricks!' }],
    output: 'String',
    colour: '#4a90d9',
    tooltip: 'A text string.',
    helpUrl: '',
};

/** Registers all custom block definitions. */
export function registerBlocks(): void {
    Blockly.common.defineBlocksWithJsonArray([pbProgram, pbPrint, pbText]);
}

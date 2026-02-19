// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Pybricks Authors

import type { Block } from 'blockly';
import { Order, PythonGenerator } from 'blockly/python';

/** Custom Python generator with Pybricks block support. */
export const pybricksPythonGenerator = new PythonGenerator();

pybricksPythonGenerator.forBlock['pb_program'] = function (
    block: Block,
    generator: PythonGenerator,
): string {
    const body = generator.statementToCode(block, 'BODY');
    return '# The main program starts here.\n' + body;
};

pybricksPythonGenerator.forBlock['pb_print'] = function (
    block: Block,
    generator: PythonGenerator,
): string {
    const value =
        generator.valueToCode(block, 'TEXT', Order.NONE) || "''";
    return `print(${value})\n`;
};

pybricksPythonGenerator.forBlock['pb_text'] = function (
    block: Block,
    _generator: PythonGenerator,
): [string, Order] {
    const text = block.getFieldValue('TEXT') as string;
    const escaped = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return [`'${escaped}'`, Order.ATOMIC];
};

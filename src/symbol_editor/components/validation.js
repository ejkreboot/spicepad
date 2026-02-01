/**
 * @fileoverview Component validation and normalization for the symbol editor.
 * Handles validation of component data and subcircuit definitions.
 */

import { COMPONENT_TYPES } from '../constants.js';
import { getDefaultPrimitivePrefix } from '../elements/primitives.js';
import { normalizeModelsArray } from '../elements/models.js';

/**
 * Normalize a subcircuit descriptor
 * @param {Object} input - Input descriptor
 * @returns {{name: string, definition: string}}
 */
export function normalizeSubcircuitDescriptor(input = {}) {
    return {
        name: typeof input?.name === 'string' ? input.name.trim() : '',
        definition: typeof input?.definition === 'string' ? input.definition : '',
    };
}

/**
 * Parse subcircuit header from definition
 * @param {string} definition - Subcircuit definition
 * @returns {{name: string, ports: string[]}|null}
 */
export function parseSubcircuitHeader(definition = '') {
    if (!definition) return null;

    const lines = definition.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const headerLine = lines.find(line => !line.startsWith('*') && /^\.subckt/i.test(line));
    if (!headerLine) return null;

    const tokens = headerLine.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return { name: '', ports: [] };

    const ports = [];
    for (let i = 2; i < tokens.length; i += 1) {
        const token = tokens[i];
        const lowered = token.toLowerCase();
        // Stop collecting ports once parameters begin (tokens with '=' or params: prefix)
        if (token.includes('=') || lowered === 'params:' || lowered === 'param:' || lowered === 'par:') break;
        ports.push(token);
    }

    return {
        name: tokens[1],
        ports,
    };
}

/**
 * Validate subcircuit descriptor
 * @param {Object} subcircuit - Subcircuit descriptor
 * @param {number} pinCount - Number of pins
 * @returns {{ok: boolean, message?: string}}
 */
export function validateSubcircuitDescriptor(subcircuit, pinCount) {
    const name = (subcircuit?.name || '').trim();
    const definition = (subcircuit?.definition || '').trim();

    if (!name) {
        return { ok: false, message: 'Please provide a subcircuit name.' };
    }
    if (!/^[A-Za-z_][A-Za-z0-9_$.-]*$/.test(name)) {
        return { ok: false, message: 'Subcircuit name must be a valid SPICE identifier (no spaces).' };
    }
    if (!definition) {
        return { ok: false, message: 'Please provide a subcircuit definition.' };
    }

    const header = parseSubcircuitHeader(definition);
    if (!header) {
        return { ok: false, message: 'Subcircuit definition must include a .subckt header line.' };
    }

    if (header.name && header.name !== name) {
        const proceed = confirm(`Subcircuit name "${name}" does not match header "${header.name}". Continue?`);
        if (!proceed) return { ok: false, message: 'Subcircuit name mismatch.' };
    }

    if (header.ports.length && pinCount && header.ports.length !== pinCount) {
        const proceed = confirm(`Pin count (${pinCount}) does not match subcircuit port count (${header.ports.length}). Continue?`);
        if (!proceed) return { ok: false, message: 'Subcircuit port count mismatch.' };
    }

    if (!/\.ends\b/i.test(definition)) {
        const proceed = confirm('Subcircuit definition is missing an .ends terminator. Continue?');
        if (!proceed) return { ok: false, message: 'Subcircuit missing .ends terminator.' };
    }

    return { ok: true };
}

/**
 * Normalize a component record
 * @param {Object} comp - Component to normalize
 * @returns {Object} Normalized component
 */
export function normalizeComponentRecord(comp) {
    if (!comp || typeof comp !== 'object') return comp;

    comp.componentType = comp.componentType === COMPONENT_TYPES.SUBCIRCUIT
        ? COMPONENT_TYPES.SUBCIRCUIT
        : COMPONENT_TYPES.PRIMITIVE;

    if (!comp.designator || typeof comp.designator !== 'object') {
        comp.designator = {
            prefix: getDefaultPrimitivePrefix() || 'U',
            autoIncrement: true,
        };
    }

    if (comp.componentType === COMPONENT_TYPES.SUBCIRCUIT) {
        comp.designator.prefix = 'X';
        comp.subcircuit = normalizeSubcircuitDescriptor(comp.subcircuit);
    }

    comp.models = normalizeModelsArray(comp.models ?? comp.model ?? []);
    if ('model' in comp) delete comp.model;

    return comp;
}

/**
 * Normalize all components in a map
 * @param {Object} map - Component map
 */
export function normalizeComponents(map) {
    if (!map || typeof map !== 'object') return;
    Object.values(map).forEach(comp => normalizeComponentRecord(comp));
}

/**
 * Escape HTML characters in a string
 * @param {*} value - Value to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(value) {
    if (value === undefined || value === null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

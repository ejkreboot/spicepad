/**
 * @fileoverview Primitives catalog and element loading for the symbol editor.
 * Handles loading of primitive component definitions from JSON.
 */

import { COMPONENT_TYPES, DEFAULTS } from '../constants.js';
import { setPrimitiveCatalog, getPrimitiveCatalog } from '../state.js';
import { getPrefixSelect, setCompPrefixValue } from '../dom.js';
import { applyPrimitiveDefaults, populatePrefixOptions } from '../ui/forms.js';

/**
 * Load primitives catalog from JSON file
 * @returns {Promise<void>}
 */
export async function loadPrimitives() {
    try {
        const response = await fetch('./primitives.json');
        if (!response.ok) {
            throw new Error(`Failed to load primitives.json (${response.status})`);
        }
        const data = await response.json();
        setPrimitiveCatalog(data?.primitives || {});
    } catch (err) {
        console.error('Unable to load primitives.json', err);
        setPrimitiveCatalog({});
    }

    populatePrefixOptions();
    applyPrimitiveDefaults(getPrefixSelect()?.value);
}

/**
 * Get the default primitive prefix (first alphabetically)
 * @returns {string}
 */
export function getDefaultPrimitivePrefix() {
    const catalog = getPrimitiveCatalog();
    const keys = Object.keys(catalog);
    if (keys.length === 0) return '';
    const sorted = [...keys].sort();
    return sorted[0];
}

/**
 * Get primitive entry by prefix
 * @param {string} prefix
 * @returns {Object|null}
 */
export function getPrimitiveEntry(prefix) {
    const catalog = getPrimitiveCatalog();
    return catalog[prefix] || null;
}

/**
 * Get all primitive prefixes sorted
 * @returns {string[]}
 */
export function getPrimitivePrefixes() {
    const catalog = getPrimitiveCatalog();
    return Object.keys(catalog).sort();
}

/**
 * Check if a prefix exists in the catalog
 * @param {string} prefix
 * @returns {boolean}
 */
export function hasPrimitivePrefix(prefix) {
    const catalog = getPrimitiveCatalog();
    return prefix in catalog;
}

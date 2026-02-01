/**
 * @fileoverview SPICE model management for the symbol editor.
 * Handles model creation, manipulation, and normalization.
 */

import {
    getModels,
    setModels,
    addModel as addModelToState,
    removeModelAt,
    getModelAt,
    getExpandedModelIndex,
    setExpandedModelIndex,
} from '../state.js';
import { updateModelList } from '../ui/lists.js';
import { markCurrentComponentDirty } from '../ui/forms.js';

/**
 * Extract model name from a SPICE model statement
 * @param {string} statement - Model statement string
 * @returns {string} Extracted name or empty string
 */
export function extractModelName(statement = '') {
    if (typeof statement !== 'string') return '';
    const match = statement.match(/\.model\s+([^\s]+)/i);
    return match ? match[1] : '';
}

/**
 * Normalize a models array from various input formats
 * @param {Array|string|Object} source - Input to normalize
 * @returns {Array<{name: string, model: string}>} Normalized models array
 */
export function normalizeModelsArray(source) {
    const items = [];

    if (Array.isArray(source)) {
        items.push(...source);
    } else if (typeof source === 'string') {
        items.push({ model: source });
    } else if (source && typeof source === 'object' && typeof source.model === 'string') {
        items.push(source);
    }

    return items
        .map((entry, index) => {
            const modelText = typeof entry?.model === 'string' ? entry.model.trim() : '';
            if (!modelText) return null;
            const providedName = typeof entry?.name === 'string' ? entry.name.trim() : '';
            const name = providedName || extractModelName(modelText) || `MODEL${index + 1}`;
            return { name, model: modelText };
        })
        .filter(Boolean);
}

/**
 * Normalize model fields in a component map
 * @param {Object} map - Component map
 */
export function normalizeModelFields(map) {
    if (!map || typeof map !== 'object') return;
    Object.values(map).forEach(comp => {
        if (!comp || typeof comp !== 'object') return;
        const normalized = normalizeModelsArray(comp.models ?? comp.model ?? []);
        comp.models = normalized;
        if ('model' in comp) delete comp.model;
    });
}

/**
 * Add a new model
 */
export function addModel() {
    const models = getModels();
    const nextIndex = models.length + 1;
    addModelToState({ name: `MODEL${nextIndex}`, model: '' });
    setExpandedModelIndex(models.length); // Auto-expand the new model (which is now last)
    updateModelList();
    markCurrentComponentDirty();
}

/**
 * Duplicate a model
 * @param {number} index - Index of model to duplicate
 */
export function duplicateModel(index) {
    const entry = getModelAt(index);
    if (!entry) return;

    const models = getModels();
    const copyName = entry.name ? `${entry.name}_copy` : `MODEL${models.length + 1}`;
    
    // Insert copy after original
    models.splice(index + 1, 0, { name: copyName, model: entry.model || '' });
    setExpandedModelIndex(index + 1); // Auto-expand the duplicated model
    updateModelList();
    markCurrentComponentDirty();
}

/**
 * Remove a model
 * @param {number} index - Index of model to remove
 */
export function removeModel(index) {
    const models = getModels();
    if (index < 0 || index >= models.length) return;
    removeModelAt(index);
    updateModelList();
    markCurrentComponentDirty();
}

/**
 * Update a model field
 * @param {number} index - Model index
 * @param {string} field - Field name ('name' or 'model')
 * @param {string} value - New value
 */
export function updateModelField(index, field, value) {
    const entry = getModelAt(index);
    if (!entry) return;

    if (field === 'name') {
        entry.name = value;
    } else if (field === 'model') {
        entry.model = value;
    }
    markCurrentComponentDirty();
}

/**
 * Toggle model expansion in UI
 * @param {number} index - Model index
 */
export function toggleModel(index) {
    const currentExpanded = getExpandedModelIndex();
    setExpandedModelIndex(currentExpanded === index ? null : index);
    updateModelList();
}

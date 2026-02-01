/**
 * @fileoverview Form input handling for the symbol editor.
 * Manages component type selection, prefix options, dirty state tracking.
 */

import { COMPONENT_TYPES, DEFAULTS, clampZoom } from '../constants.js';
import {
    getCurrentComponentId,
    getIsNewComponentDraft,
    markComponentDirty,
    getDefaultValueIsNull,
    setDefaultValueIsNull,
    getPrimitiveCatalog,
    setZoomLevel,
    getZoomLevel,
} from '../state.js';
import {
    getCompPrefixValue,
    setCompPrefixValue,
    getCompDefaultValue,
    setCompDefaultValue,
    setCompDefaultDisabled,
    setCompDefaultPlaceholder,
    getComponentDimensions,
    updateZoomIndicator,
} from '../dom.js';
import { updateComponentList } from './lists.js';
import { requestLabelPreviewUpdate } from './labels.js';
import { getDefaultPrimitivePrefix } from '../elements/primitives.js';
import { redraw } from '../canvas/drawing.js';
import { getDefinitionValue, setDefinitionValue } from './modals.js';

/**
 * Get the currently selected component type
 * @returns {string} Component type ('primitive' or 'subcircuit')
 */
export function getSelectedComponentType() {
    const selected = document.querySelector('input[name="compType"]:checked');
    return selected?.value === COMPONENT_TYPES.SUBCIRCUIT ? COMPONENT_TYPES.SUBCIRCUIT : COMPONENT_TYPES.PRIMITIVE;
}

/**
 * Set the selected component type
 * @param {string} type - Component type to select
 * @param {Object} options - Options
 * @param {boolean} options.suppressDirty - Don't mark as dirty
 * @param {*} options.componentDefault - Default value for component
 */
export function setSelectedComponentType(type, options = {}) {
    const normalized = type === COMPONENT_TYPES.SUBCIRCUIT ? COMPONENT_TYPES.SUBCIRCUIT : COMPONENT_TYPES.PRIMITIVE;
    const input = document.querySelector(`input[name="compType"][value="${normalized}"]`);
    if (input) input.checked = true;
    updateComponentTypeUI(normalized, options);
}

/**
 * Update the UI based on component type
 * @param {string} type - Component type
 * @param {Object} options - Options
 */
function updateComponentTypeUI(type, options = {}) {
    const normalized = type === COMPONENT_TYPES.SUBCIRCUIT ? COMPONENT_TYPES.SUBCIRCUIT : COMPONENT_TYPES.PRIMITIVE;
    const showSubcircuit = normalized === COMPONENT_TYPES.SUBCIRCUIT;

    const prefixRow = document.getElementById('prefixRow');
    if (prefixRow) {
        prefixRow.style.display = showSubcircuit ? 'none' : 'flex';
    }

    const defaultRow = document.getElementById('defaultRow');
    if (defaultRow) {
        defaultRow.style.display = showSubcircuit ? 'none' : 'flex';
    }

    const subRows = document.querySelectorAll('.subckt-row');
    subRows.forEach(row => {
        row.style.display = showSubcircuit ? 'flex' : 'none';
    });

    const prefixInput = document.getElementById('compPrefix');
    if (prefixInput) {
        prefixInput.disabled = showSubcircuit;
        if (showSubcircuit) {
            prefixInput.value = 'X';
        } else if (!prefixInput.value) {
            prefixInput.value = getDefaultPrimitivePrefix();
        }
    }

    const autoInc = document.getElementById('compAutoInc');
    if (autoInc && showSubcircuit) {
        autoInc.checked = true;
    }

    const defaultInput = document.getElementById('compDefault');
    if (defaultInput && !showSubcircuit) {
        defaultInput.disabled = false;
        defaultInput.placeholder = defaultInput.placeholder || '';
        setDefaultValueIsNull(false);
    }

    if (!showSubcircuit) {
        applyPrimitiveDefaults(document.getElementById('compPrefix')?.value);
    }

    if (!options.suppressDirty && !getIsNewComponentDraft()) {
        markCurrentComponentDirty();
    }
    requestLabelPreviewUpdate({ immediate: true });
}

/**
 * Populate the prefix select options
 * @param {string} selectedPrefix - Prefix to select
 */
export function populatePrefixOptions(selectedPrefix) {
    const select = document.getElementById('compPrefix');
    if (!select) return;

    const primitiveCatalog = getPrimitiveCatalog();
    const keys = Object.keys(primitiveCatalog).sort();
    const previous = selectedPrefix || select.value || '';

    select.innerHTML = keys.map(key => {
        const name = primitiveCatalog[key]?.name;
        const label = name ? `${key} - ${name}` : key;
        return `<option value="${key}">${label}</option>`;
    }).join('');

    if (previous && !keys.includes(previous)) {
        const opt = document.createElement('option');
        opt.value = previous;
        opt.textContent = `${previous} (custom)`;
        select.appendChild(opt);
    }

    const nextValue = previous || keys[0] || '';
    if (nextValue) select.value = nextValue;
}

/**
 * Apply primitive defaults based on prefix selection
 * @param {string} prefix - Prefix to apply defaults for
 * @param {Object} options - Options
 * @param {*} options.componentDefault - Override default value
 */
export function applyPrimitiveDefaults(prefix, options = {}) {
    const defaultInput = document.getElementById('compDefault');
    if (!defaultInput) return;

    const primitiveCatalog = getPrimitiveCatalog();
    const entry = primitiveCatalog[prefix];
    const componentDefault = options.componentDefault;

    setDefaultValueIsNull(false);

    if (entry && entry.defaultValue === null) {
        setDefaultValueIsNull(true);
        defaultInput.value = '';
        defaultInput.disabled = true;
        defaultInput.placeholder = 'No default value';
        return;
    }

    if (componentDefault === null) {
        setDefaultValueIsNull(true);
    }

    defaultInput.disabled = false;
    if (entry && typeof entry.defaultValue === 'string') {
        defaultInput.placeholder = entry.defaultValue;
    } else {
        defaultInput.placeholder = '';
    }

    const resolved = componentDefault !== undefined
        ? componentDefault
        : (entry ? entry.defaultValue ?? '' : defaultInput.value);
    defaultInput.value = resolved ?? '';
    if (resolved === null) setDefaultValueIsNull(true);
}

/**
 * Get the default value null state
 * @returns {boolean} True if default value should be null
 */
export { getDefaultValueIsNull };

/**
 * Mark the current component as dirty
 */
export function markCurrentComponentDirty() {
    const currentId = getCurrentComponentId();
    if (!currentId || getIsNewComponentDraft()) return;
    markComponentDirty(currentId);
    updateComponentList();
}

/**
 * Attach dirty listener to an input element
 * @param {string} id - Element ID
 * @param {Object} options - Options
 * @param {boolean} options.updateDraftList - Update draft list on change
 * @param {string[]} options.events - Events to listen for
 */
export function attachDirtyListenerToInput(id, options = {}) {
    const input = document.getElementById(id);
    if (!input) return;
    const events = options.events || ['input', 'change'];
    const handler = () => {
        if (options.updateDraftList && getIsNewComponentDraft()) {
            updateComponentList();
            return;
        }
        markCurrentComponentDirty();
    };
    events.forEach(evt => input.addEventListener(evt, handler));
}

/**
 * Attach dirty listeners to all component inputs
 */
export function attachComponentInputDirtyListeners() {
    ['compId', 'compName'].forEach(id => attachDirtyListenerToInput(id, { updateDraftList: true }));
    ['compPrefix', 'compDefault', 'compWidth', 'compHeight'].forEach(id => attachDirtyListenerToInput(id));
    attachDirtyListenerToInput('compAutoInc');
    attachDirtyListenerToInput('compSubcktName');
    // Note: compSubcktDefinition is now handled by the modal
}

/**
 * Attach change listeners to component type radio buttons
 */
export function attachComponentTypeListeners() {
    document.querySelectorAll('input[name="compType"]').forEach(input => {
        input.addEventListener('change', () => {
            setSelectedComponentType(input.value);
        });
    });
}

/**
 * Attach listeners to label position inputs
 */
export function attachLabelInputListeners() {
    const ids = [
        'designatorLabel0X', 'designatorLabel0Y',
        'valueLabel0X', 'valueLabel0Y',
        'designatorLabel90X', 'designatorLabel90Y',
        'valueLabel90X', 'valueLabel90Y'
    ];
    ids.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            const trigger = () => {
                if (!getIsNewComponentDraft()) markCurrentComponentDirty();
                requestLabelPreviewUpdate({ immediate: true });
            };
            input.addEventListener('input', trigger);
            input.addEventListener('change', trigger);
        }
    });
    ['compPrefix', 'compDefault'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            const trigger = () => {
                if (id === 'compDefault' && !input.disabled) {
                    setDefaultValueIsNull(false);
                }
                if (!getIsNewComponentDraft()) markCurrentComponentDirty();
                requestLabelPreviewUpdate({ immediate: true });
            };
            input.addEventListener('input', trigger);
            input.addEventListener('change', trigger);
        }
    });
}

/**
 * Handle prefix select change
 */
export function onPrefixChanged() {
    const select = document.getElementById('compPrefix');
    if (!select) return;
    applyPrimitiveDefaults(select.value);
    markCurrentComponentDirty();
    requestLabelPreviewUpdate({ immediate: true });
}

/**
 * Set subcircuit input values
 * @param {Object} subcircuit - Subcircuit descriptor
 */
export function setSubcircuitInputs(subcircuit = {}) {
    const nameInput = document.getElementById('compSubcktName');
    if (nameInput) nameInput.value = subcircuit.name || '';
    setDefinitionValue(subcircuit.definition || '');
}

/**
 * Read subcircuit input values
 * @returns {Object} Subcircuit descriptor
 */
export function readSubcircuitInputs() {
    const nameInput = document.getElementById('compSubcktName');
    return {
        name: (nameInput?.value || '').trim(),
        definition: getDefinitionValue()
    };
}

/**
 * Get default label positions for component dimensions
 * @param {number} width - Component width
 * @param {number} height - Component height
 * @returns {Object} Default label positions
 */
export function getDefaultLabelPositions(width, height) {
    const w = Number.isFinite(width) ? width : DEFAULTS.COMPONENT_WIDTH;
    const h = Number.isFinite(height) ? height : DEFAULTS.COMPONENT_HEIGHT;
    return {
        designator: [
            { x: Math.round(w / 2), y: -12 },
            { x: -12, y: Math.round(h / 2) }
        ],
        value: [
            { x: Math.round(w / 2), y: h + 12 },
            { x: w + 12, y: Math.round(h / 2) }
        ]
    };
}

/**
 * Set label input values
 * @param {Object} labels - Label positions
 * @param {number} width - Component width
 * @param {number} height - Component height
 */
export function setLabelInputs(labels, width, height) {
    const defaults = getDefaultLabelPositions(width, height);
    const designator0 = labels?.designator?.[0] || defaults.designator[0];
    const designator90 = labels?.designator?.[1] || defaults.designator[1];
    const value0 = labels?.value?.[0] || defaults.value[0];
    const value90 = labels?.value?.[1] || defaults.value[1];

    const mappings = [
        { id: 'designatorLabel0X', value: designator0.x },
        { id: 'designatorLabel0Y', value: designator0.y },
        { id: 'valueLabel0X', value: value0.x },
        { id: 'valueLabel0Y', value: value0.y },
        { id: 'designatorLabel90X', value: designator90.x },
        { id: 'designatorLabel90Y', value: designator90.y },
        { id: 'valueLabel90X', value: value90.x },
        { id: 'valueLabel90Y', value: value90.y }
    ];

    mappings.forEach(entry => {
        const input = document.getElementById(entry.id);
        if (input) input.value = entry.value;
    });

    requestLabelPreviewUpdate({ immediate: true });
}

/**
 * Read label input values
 * @param {number} width - Component width
 * @param {number} height - Component height
 * @returns {Object} Label positions
 */
export function readLabelInputs(width, height) {
    const defaults = getDefaultLabelPositions(width, height);
    const getNumber = (id, fallback) => {
        const input = document.getElementById(id);
        if (!input) return fallback;
        const parsed = parseInt(input.value, 10);
        return Number.isFinite(parsed) ? parsed : fallback;
    };

    return {
        designator: [
            {
                x: getNumber('designatorLabel0X', defaults.designator[0].x),
                y: getNumber('designatorLabel0Y', defaults.designator[0].y)
            },
            {
                x: getNumber('designatorLabel90X', defaults.designator[1].x),
                y: getNumber('designatorLabel90Y', defaults.designator[1].y)
            }
        ],
        value: [
            {
                x: getNumber('valueLabel0X', defaults.value[0].x),
                y: getNumber('valueLabel0Y', defaults.value[0].y)
            },
            {
                x: getNumber('valueLabel90X', defaults.value[1].x),
                y: getNumber('valueLabel90Y', defaults.value[1].y)
            }
        ]
    };
}

/**
 * Set zoom level with UI update
 * @param {number} value - New zoom level
 * @param {Object} options - Options
 */
export function setZoomLevelWithUpdate(value, options = {}) {
    const clamped = clampZoom(value);
    if (!options.force && Math.abs(clamped - getZoomLevel()) < 0.001) return;
    setZoomLevel(clamped);
    updateZoomIndicator();
    redraw();
}

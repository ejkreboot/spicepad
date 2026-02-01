/**
 * @fileoverview DOM reference caching and utilities for the symbol editor.
 * Caches DOM element references at initialization for performance.
 */

import { DEFAULTS } from './constants.js';
import { getZoomLevel } from './state.js';

/**
 * Cached DOM references
 * @private
 */
const domRefs = {
    // Main canvas
    canvas: null,
    ctx: null,

    // Component form inputs
    compId: null,
    compName: null,
    compPrefix: null,
    compDefault: null,
    compWidth: null,
    compHeight: null,
    compAutoInc: null,
    compSubcktName: null,

    // Drawing settings
    gridSize: null,
    snapToGrid: null,
    strokeWidth: null,
    filled: null,

    // Containers / lists
    componentList: null,
    elementList: null,
    pinList: null,
    modelList: null,
    jsonOutput: null,

    // Indicators
    modeIndicator: null,
    zoomIndicator: null,
    coordIndicator: null,
    canvasInfo: null,

    // Label position inputs
    designatorLabel0X: null,
    designatorLabel0Y: null,
    valueLabel0X: null,
    valueLabel0Y: null,
    designatorLabel90X: null,
    designatorLabel90Y: null,
    valueLabel90X: null,
    valueLabel90Y: null,

    // Label preview canvases
    labelPreview0: null,
    labelPreview90: null,

    // Component type radios
    compTypeRadios: null,
    prefixRow: null,
    subcktRows: null,
};

/**
 * Initialize DOM references
 * Should be called once at startup after DOM is ready
 */
export function initDOM() {
    // Main canvas
    domRefs.canvas = document.getElementById('canvas');
    domRefs.ctx = domRefs.canvas?.getContext('2d');

    // Component form inputs
    domRefs.compId = document.getElementById('compId');
    domRefs.compName = document.getElementById('compName');
    domRefs.compPrefix = document.getElementById('compPrefix');
    domRefs.compDefault = document.getElementById('compDefault');
    domRefs.compWidth = document.getElementById('compWidth');
    domRefs.compHeight = document.getElementById('compHeight');
    domRefs.compAutoInc = document.getElementById('compAutoInc');
    domRefs.compSubcktName = document.getElementById('compSubcktName');

    // Drawing settings
    domRefs.gridSize = document.getElementById('gridSize');
    domRefs.snapToGrid = document.getElementById('snapToGrid');
    domRefs.strokeWidth = document.getElementById('strokeWidth');
    domRefs.filled = document.getElementById('filled');

    // Containers / lists
    domRefs.componentList = document.getElementById('componentList');
    domRefs.elementList = document.getElementById('elementList');
    domRefs.pinList = document.getElementById('pinList');
    domRefs.modelList = document.getElementById('modelList');
    domRefs.jsonOutput = document.getElementById('jsonOutput');

    // Indicators
    domRefs.modeIndicator = document.getElementById('modeIndicator');
    domRefs.canvasInfo = document.getElementById('canvasInfo');

    // Create dynamic indicators
    domRefs.zoomIndicator = document.createElement('span');
    domRefs.zoomIndicator.className = 'zoom-indicator';

    domRefs.coordIndicator = document.createElement('span');
    domRefs.coordIndicator.className = 'zoom-indicator';
    domRefs.coordIndicator.textContent = 'X: 0.00, Y: 0.00';

    // Append indicators to canvas info if available
    if (domRefs.canvasInfo) {
        domRefs.canvasInfo.innerHTML = '';
        domRefs.canvasInfo.appendChild(domRefs.zoomIndicator);
        domRefs.canvasInfo.appendChild(domRefs.coordIndicator);
    }

    // Label position inputs
    domRefs.designatorLabel0X = document.getElementById('designatorLabel0X');
    domRefs.designatorLabel0Y = document.getElementById('designatorLabel0Y');
    domRefs.valueLabel0X = document.getElementById('valueLabel0X');
    domRefs.valueLabel0Y = document.getElementById('valueLabel0Y');
    domRefs.designatorLabel90X = document.getElementById('designatorLabel90X');
    domRefs.designatorLabel90Y = document.getElementById('designatorLabel90Y');
    domRefs.valueLabel90X = document.getElementById('valueLabel90X');
    domRefs.valueLabel90Y = document.getElementById('valueLabel90Y');

    // Label preview canvases
    domRefs.labelPreview0 = document.getElementById('labelPreview0');
    domRefs.labelPreview90 = document.getElementById('labelPreview90');

    // Component type elements
    domRefs.compTypeRadios = document.querySelectorAll('input[name="compType"]');
    domRefs.prefixRow = document.getElementById('prefixRow');
    domRefs.subcktRows = document.querySelectorAll('.subckt-row');
}

/**
 * Get all DOM references
 * @returns {Object} DOM references object
 */
export function getDOM() {
    return domRefs;
}

/**
 * Get the main canvas element
 * @returns {HTMLCanvasElement|null}
 */
export function getCanvas() {
    return domRefs.canvas;
}

/**
 * Get the canvas 2D context
 * @returns {CanvasRenderingContext2D|null}
 */
export function getContext() {
    return domRefs.ctx;
}

/**
 * Get component dimensions from form inputs
 * @returns {{width: number, height: number}}
 */
export function getComponentDimensions() {
    return {
        width: parseInt(domRefs.compWidth?.value, 10) || DEFAULTS.COMPONENT_WIDTH,
        height: parseInt(domRefs.compHeight?.value, 10) || DEFAULTS.COMPONENT_HEIGHT,
    };
}

/**
 * Get grid settings from form inputs
 * @returns {{size: number, snap: boolean}}
 */
export function getGridSettings() {
    return {
        size: parseInt(domRefs.gridSize?.value, 10) || DEFAULTS.GRID_SIZE,
        snap: domRefs.snapToGrid?.checked ?? true,
    };
}

/**
 * Get stroke settings from form inputs
 * @returns {{width: number, filled: boolean}}
 */
export function getStrokeSettings() {
    return {
        width: parseInt(domRefs.strokeWidth?.value, 10) || DEFAULTS.STROKE_WIDTH,
        filled: domRefs.filled?.checked ?? false,
    };
}

/**
 * Get component ID from form
 * @returns {string}
 */
export function getCompIdValue() {
    return (domRefs.compId?.value || '').trim();
}

/**
 * Set component ID in form
 * @param {string} value
 */
export function setCompIdValue(value) {
    if (domRefs.compId) domRefs.compId.value = value;
}

/**
 * Get component name from form
 * @returns {string}
 */
export function getCompNameValue() {
    return domRefs.compName?.value || '';
}

/**
 * Set component name in form
 * @param {string} value
 */
export function setCompNameValue(value) {
    if (domRefs.compName) domRefs.compName.value = value;
}

/**
 * Get prefix value from form
 * @returns {string}
 */
export function getCompPrefixValue() {
    return domRefs.compPrefix?.value || '';
}

/**
 * Set prefix value in form
 * @param {string} value
 */
export function setCompPrefixValue(value) {
    if (domRefs.compPrefix) domRefs.compPrefix.value = value;
}

/**
 * Get default value from form
 * @returns {string}
 */
export function getCompDefaultValue() {
    return domRefs.compDefault?.value || '';
}

/**
 * Set default value in form
 * @param {string} value
 */
export function setCompDefaultValue(value) {
    if (domRefs.compDefault) domRefs.compDefault.value = value;
}

/**
 * Set default input disabled state
 * @param {boolean} disabled
 */
export function setCompDefaultDisabled(disabled) {
    if (domRefs.compDefault) domRefs.compDefault.disabled = disabled;
}

/**
 * Set default input placeholder
 * @param {string} placeholder
 */
export function setCompDefaultPlaceholder(placeholder) {
    if (domRefs.compDefault) domRefs.compDefault.placeholder = placeholder;
}

/**
 * Get auto-increment checkbox state
 * @returns {boolean}
 */
export function getCompAutoIncValue() {
    return domRefs.compAutoInc?.checked ?? true;
}

/**
 * Set auto-increment checkbox state
 * @param {boolean} value
 */
export function setCompAutoIncValue(value) {
    if (domRefs.compAutoInc) domRefs.compAutoInc.checked = value;
}

/**
 * Set component width in form
 * @param {number|string} value
 */
export function setCompWidthValue(value) {
    if (domRefs.compWidth) domRefs.compWidth.value = value;
}

/**
 * Set component height in form
 * @param {number|string} value
 */
export function setCompHeightValue(value) {
    if (domRefs.compHeight) domRefs.compHeight.value = value;
}

/**
 * Get subcircuit name from form
 * @returns {string}
 */
export function getSubcktNameValue() {
    return (domRefs.compSubcktName?.value || '').trim();
}

/**
 * Set subcircuit name in form
 * @param {string} value
 */
export function setSubcktNameValue(value) {
    if (domRefs.compSubcktName) domRefs.compSubcktName.value = value;
}

/**
 * Update the zoom indicator text
 * Uses zoomLevel from state if not provided
 */
export function updateZoomIndicator() {
    const zoomLevel = getZoomLevel();
    if (domRefs.zoomIndicator) {
        domRefs.zoomIndicator.textContent = `Zoom: ${zoomLevel.toFixed(1)}x`;
    }
}

/**
 * Update the coordinate indicator text
 * @param {number} x
 * @param {number} y
 */
export function updateCoordIndicator(x, y) {
    if (domRefs.coordIndicator) {
        domRefs.coordIndicator.textContent = `X: ${x.toFixed(2)}, Y: ${y.toFixed(2)}`;
    }
}

/**
 * Update the mode indicator
 * @param {string} mode
 */
export function updateModeIndicator(mode) {
    if (domRefs.modeIndicator) {
        domRefs.modeIndicator.textContent = mode.toUpperCase();
        domRefs.modeIndicator.className = `mode-indicator mode-${mode}`;
    }
}

/**
 * Set component list HTML content
 * @param {string} html
 */
export function setComponentListHTML(html) {
    if (domRefs.componentList) domRefs.componentList.innerHTML = html;
}

/**
 * Set element list HTML content
 * @param {string} html
 */
export function setElementListHTML(html) {
    if (domRefs.elementList) domRefs.elementList.innerHTML = html;
}

/**
 * Set pin list HTML content
 * @param {string} html
 */
export function setPinListHTML(html) {
    if (domRefs.pinList) domRefs.pinList.innerHTML = html;
}

/**
 * Set model list HTML content
 * @param {string} html
 */
export function setModelListHTML(html) {
    if (domRefs.modelList) domRefs.modelList.innerHTML = html;
}

/**
 * Set JSON output content
 * @param {string} text
 */
export function setJsonOutputValue(text) {
    if (domRefs.jsonOutput) domRefs.jsonOutput.value = text;
}

/**
 * Get JSON output content
 * @returns {string}
 */
export function getJsonOutputValue() {
    return domRefs.jsonOutput?.value || '';
}

/**
 * Focus on the component ID input
 */
export function focusCompIdInput() {
    domRefs.compId?.focus();
}

/**
 * Get the label input IDs
 * @returns {string[]}
 */
export function getLabelInputIds() {
    return [
        'designatorLabel0X', 'designatorLabel0Y',
        'valueLabel0X', 'valueLabel0Y',
        'designatorLabel90X', 'designatorLabel90Y',
        'valueLabel90X', 'valueLabel90Y',
    ];
}

/**
 * Get a label input value by ID
 * @param {string} id
 * @returns {number|null}
 */
export function getLabelInputValue(id) {
    const input = document.getElementById(id);
    if (!input) return null;
    const parsed = parseInt(input.value, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Set a label input value by ID
 * @param {string} id
 * @param {number} value
 */
export function setLabelInputValue(id, value) {
    const input = document.getElementById(id);
    if (input) input.value = value;
}

/**
 * Get label preview canvas entries
 * @returns {Array<{canvas: HTMLCanvasElement, orientation: number}>}
 */
export function getLabelPreviewCanvasEntries() {
    return [
        { canvas: domRefs.labelPreview0, orientation: 0 },
        { canvas: domRefs.labelPreview90, orientation: 90 },
    ];
}

/**
 * Update toolbar button states for mode
 * @param {string} mode
 */
export function updateToolbarButtons(mode) {
    document.querySelectorAll('.toolbar .btn').forEach(btn => {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
    });
    const btn = document.getElementById('btn-' + mode);
    if (btn) {
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
    }
}

/**
 * Get the prefix select element
 * @returns {HTMLSelectElement|null}
 */
export function getPrefixSelect() {
    return domRefs.compPrefix;
}

/**
 * Set prefix select disabled state
 * @param {boolean} disabled
 */
export function setPrefixDisabled(disabled) {
    if (domRefs.compPrefix) domRefs.compPrefix.disabled = disabled;
}

/**
 * Show/hide prefix row
 * @param {boolean} show
 */
export function showPrefixRow(show) {
    if (domRefs.prefixRow) {
        domRefs.prefixRow.style.display = show ? 'flex' : 'none';
    }
}

/**
 * Show/hide subcircuit rows
 * @param {boolean} show
 */
export function showSubcktRows(show) {
    if (domRefs.subcktRows) {
        domRefs.subcktRows.forEach(row => {
            row.style.display = show ? 'flex' : 'none';
        });
    }
}

/**
 * Get component type radio buttons
 * @returns {NodeList}
 */
export function getCompTypeRadios() {
    return domRefs.compTypeRadios || document.querySelectorAll('input[name="compType"]');
}

/**
 * Get selected component type from radios
 * @returns {string}
 */
export function getSelectedCompTypeValue() {
    const selected = document.querySelector('input[name="compType"]:checked');
    return selected?.value || 'primitive';
}

/**
 * Set selected component type radio
 * @param {string} type
 */
export function setSelectedCompTypeValue(type) {
    const input = document.querySelector(`input[name="compType"][value="${type}"]`);
    if (input) input.checked = true;
}

/**
 * Select all text in JSON output
 */
export function selectJsonOutput() {
    domRefs.jsonOutput?.select();
}

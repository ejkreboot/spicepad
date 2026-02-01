/**
 * @fileoverview Main entry point for the symbol editor.
 * Initializes the editor and exports public API to window.symbolEditor.
 */

import { COMPONENT_TYPES, MODES, clampZoom } from './constants.js';
import {
    setMode as setModeState,
    getMode,
    getZoomLevel,
    setZoomLevel,
    resetArcState,
    setPolygonPoints,
    setPolylinePoints,
    getArcStage,
} from './state.js';
import { initDOM, getCanvas, updateZoomIndicator, updateCoordIndicator } from './dom.js';
import { resizeCanvas, redraw } from './canvas/drawing.js';
import { onMouseDown, onMouseMove, onMouseUp, onDoubleClick, onWheel } from './canvas/interaction.js';
import { loadPrimitives, getDefaultPrimitivePrefix } from './elements/primitives.js';
import { addPinManual, updatePin, removePin } from './elements/pins.js';
import { addModel, duplicateModel, removeModel, updateModelField, toggleModel } from './elements/models.js';
import {
    loadComponentsFromStorage,
    loadComponent,
    updateComponent,
    newComponent,
    duplicateComponent,
    deleteComponent,
    copyJSON,
    downloadJSON,
    newJSON,
    loadFromFile,
} from './components/crud.js';
import {
    updateComponentList,
    updateElementList,
    selectElement,
    removeElement,
    deleteSelected,
    updateSelectedStroke,
    clearDrawing,
} from './ui/lists.js';
import {
    initLabelPreviews,
    requestLabelPreviewUpdate,
    flushLabelPreviewUpdates,
    resizePreviewCanvases,
} from './ui/labels.js';
import {
    openDefinitionModal,
    closeDefinitionModal,
    saveDefinitionModal,
} from './ui/modals.js';
import {
    setSelectedComponentType,
    populatePrefixOptions,
    applyPrimitiveDefaults,
    attachLabelInputListeners,
    attachComponentInputDirtyListeners,
    attachComponentTypeListeners,
    onPrefixChanged,
} from './ui/forms.js';
import { undo } from './undo.js';

/**
 * Set the current drawing mode
 * @param {string} newMode - Mode to set
 */
function setMode(newMode) {
    setModeState(newMode);
    setPolygonPoints([]);
    setPolylinePoints([]);
    resetArcState();

    // Update button states
    document.querySelectorAll('.toolbar .btn').forEach(btn => {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
    });
    const btn = document.getElementById('btn-' + newMode);
    if (btn) {
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
    }

    // Update indicator
    const indicator = document.getElementById('modeIndicator');
    if (indicator) {
        indicator.textContent = newMode.toUpperCase();
        indicator.className = 'mode-indicator mode-' + newMode;
    }

    redraw();
}

/**
 * Handle canvas wheel events for zooming
 * @param {WheelEvent} event - Wheel event
 */
function onCanvasWheel(event) {
    const pinchGesture = event.ctrlKey || event.metaKey;
    const trackpadScrollGesture = !pinchGesture && event.deltaMode === 0;
    if (!pinchGesture && !trackpadScrollGesture) return;
    event.preventDefault();
    const multiplier = pinchGesture ? 0.01 : 0.0025;
    const increment = -event.deltaY * multiplier;
    if (increment === 0) return;

    const newZoom = clampZoom(getZoomLevel() + increment);
    if (Math.abs(newZoom - getZoomLevel()) >= 0.001) {
        setZoomLevel(newZoom);
        updateZoomIndicator();
        redraw();
    }
}

/**
 * Initialize the symbol editor
 * @returns {Promise<void>}
 */
async function init() {
    // Initialize DOM references
    initDOM();
    initLabelPreviews();

    const canvas = getCanvas();

    resizeCanvas();
    resizePreviewCanvases();

    window.addEventListener('resize', () => {
        resizeCanvas();
    });

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('dblclick', onDoubleClick);
    canvas.addEventListener('wheel', onCanvasWheel, { passive: false });

    // Set up canvas info display
    const info = document.getElementById('canvasInfo');
    if (info) {
        const zoomIndicator = document.createElement('span');
        zoomIndicator.id = 'zoomIndicator';
        zoomIndicator.className = 'zoom-indicator';
        const coordIndicator = document.createElement('span');
        coordIndicator.id = 'coordIndicator';
        coordIndicator.className = 'zoom-indicator';
        coordIndicator.textContent = 'X: 0.00, Y: 0.00';
        info.innerHTML = '';
        info.appendChild(zoomIndicator);
        info.appendChild(coordIndicator);
    }

    const prefixSelect = document.getElementById('compPrefix');
    if (prefixSelect) {
        prefixSelect.addEventListener('change', onPrefixChanged);
    }

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
            e.preventDefault();
            undo();
        } else if (e.key === 'Escape') {
            if (getMode() === 'arc' && getArcStage() > 0) {
                resetArcState();
                redraw();
            }
        }
    });

    // Attach input listeners
    attachLabelInputListeners();
    attachComponentInputDirtyListeners();
    attachComponentTypeListeners();
    setSelectedComponentType(COMPONENT_TYPES.PRIMITIVE, { suppressDirty: true });

    window.addEventListener('mouseup', () => flushLabelPreviewUpdates());

    // Load data
    await loadPrimitives();
    await loadComponentsFromStorage();

    requestLabelPreviewUpdate({ immediate: true });
    updateZoomIndicator();
}

/**
 * Public API exported to window for HTML onclick handlers
 */
const symbolEditorGlobals = {
    addPinManual,
    addModel,
    clearDrawing,
    closeDefinitionModal,
    copyJSON,
    deleteComponent,
    deleteSelected,
    downloadJSON,
    duplicateComponent,
    duplicateModel,
    loadComponent,
    loadFromFile,
    newComponent,
    newJSON,
    openDefinitionModal,
    removeElement,
    removePin,
    removeModel,
    resizeCanvas,
    saveDefinitionModal,
    selectElement,
    setMode,
    toggleModel,
    updateComponent,
    updateModelField,
    updatePin,
    updateSelectedStroke,
};

// Export to window for backward compatibility with HTML onclick handlers
Object.assign(window, symbolEditorGlobals);

// Initialize the editor
init()
    .then(() => setMode('select'))
    .catch(err => console.error('Symbol editor failed to initialize', err));

// Export for ES module usage
export {
    init,
    setMode,
    loadComponent,
    updateComponent,
    newComponent,
    duplicateComponent,
    deleteComponent,
    undo,
};

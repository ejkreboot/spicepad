/**
 * @fileoverview Centralized state management for the symbol editor.
 * Consolidates all module-level state variables into organized objects
 * with controlled access through getters and setters.
 */

import { DEFAULTS, MODES, ARC_STAGES, MAX_UNDO_STACK } from './constants.js';

// ============================================================================
// Undo Stack
// ============================================================================

/**
 * Undo stack for recording actions
 * @private
 */
const undoStack = [];

/**
 * Get the undo stack
 * @returns {Array}
 */
export function getUndoStack() {
    return undoStack;
}

/**
 * Push an action to the undo stack
 * @param {Object} action - Action to push
 */
export function pushUndoAction(action) {
    if (undoStack.length >= MAX_UNDO_STACK) {
        undoStack.shift();
    }
    undoStack.push(action);
}

/**
 * Pop an action from the undo stack
 * @returns {Object|undefined} The popped action
 */
export function popUndoAction() {
    return undoStack.pop();
}

/**
 * Clear the undo stack
 */
export function clearUndoStack() {
    undoStack.length = 0;
}

// ============================================================================
// Editor State
// ============================================================================

/**
 * Core editor state
 * @private
 */
const editorState = {
    mode: MODES.SELECT,
    zoomLevel: DEFAULTS.ZOOM.DEFAULT,
};

/**
 * Get the current editor mode
 * @returns {string} Current mode
 */
export function getMode() {
    return editorState.mode;
}

/**
 * Set the editor mode
 * @param {string} mode - New mode to set
 */
export function setModeState(mode) {
    editorState.mode = mode;
}

/**
 * Get the current zoom level
 * @returns {number} Current zoom level
 */
export function getZoomLevel() {
    return editorState.zoomLevel;
}

/**
 * Set the zoom level
 * @param {number} level - New zoom level
 */
export function setZoomLevel(level) {
    editorState.zoomLevel = level;
}

// ============================================================================
// Interaction State
// ============================================================================

/**
 * Mouse/pointer interaction state
 * @private
 */
const interactionState = {
    isDrawing: false,
    isDragging: false,
    isSelecting: false,
    drawStart: null,
    dragStart: null,
    selectionRect: null,
};

/**
 * Get the full interaction state object
 * @returns {Object} Interaction state
 */
export function getInteractionState() {
    return { ...interactionState };
}

/**
 * Check if currently drawing
 * @returns {boolean}
 */
export function isDrawing() {
    return interactionState.isDrawing;
}

/**
 * Set drawing state
 * @param {boolean} value
 */
export function setIsDrawing(value) {
    interactionState.isDrawing = value;
}

/**
 * Check if currently dragging
 * @returns {boolean}
 */
export function isDragging() {
    return interactionState.isDragging;
}

/**
 * Set dragging state
 * @param {boolean} value
 */
export function setIsDragging(value) {
    interactionState.isDragging = value;
}

/**
 * Check if currently selecting (drag-selection)
 * @returns {boolean}
 */
export function isSelecting() {
    return interactionState.isSelecting;
}

/**
 * Set selecting state
 * @param {boolean} value
 */
export function setIsSelecting(value) {
    interactionState.isSelecting = value;
}

/**
 * Get draw start position
 * @returns {{x: number, y: number}|null}
 */
export function getDrawStart() {
    return interactionState.drawStart;
}

/**
 * Set draw start position
 * @param {{x: number, y: number}|null} pos
 */
export function setDrawStart(pos) {
    interactionState.drawStart = pos;
}

/**
 * Get drag start position
 * @returns {{x: number, y: number}|null}
 */
export function getDragStart() {
    return interactionState.dragStart;
}

/**
 * Set drag start position
 * @param {{x: number, y: number}|null} pos
 */
export function setDragStart(pos) {
    interactionState.dragStart = pos;
}

/**
 * Get selection rectangle
 * @returns {{x1: number, y1: number, x2: number, y2: number}|null}
 */
export function getSelectionRect() {
    return interactionState.selectionRect;
}

/**
 * Set selection rectangle
 * @param {{x1: number, y1: number, x2: number, y2: number}|null} rect
 */
export function setSelectionRect(rect) {
    interactionState.selectionRect = rect;
}

// ============================================================================
// Selection State
// ============================================================================

/**
 * Element selection state
 * @private
 */
const selectionState = {
    selectedElement: null,
    selectedElements: new Set(),
    editingVertex: null,
    originalElementState: null,
    originalElementStates: new Map(),
    multiDragReference: null,
};

/**
 * Get the single selected element index
 * @returns {number|null}
 */
export function getSelectedElement() {
    return selectionState.selectedElement;
}

/**
 * Set the single selected element index
 * @param {number|null} index
 */
export function setSelectedElement(index) {
    selectionState.selectedElement = index;
}

/**
 * Get the set of selected element indices
 * @returns {Set<number>}
 */
export function getSelectedElements() {
    return selectionState.selectedElements;
}

/**
 * Clear all selected elements
 */
export function clearSelectedElements() {
    selectionState.selectedElements.clear();
}

/**
 * Add an element to selection
 * @param {number} index
 */
export function addSelectedElement(index) {
    selectionState.selectedElements.add(index);
}

/**
 * Remove an element from selection
 * @param {number} index
 */
export function removeSelectedElement(index) {
    selectionState.selectedElements.delete(index);
}

/**
 * Check if an element is selected
 * @param {number} index
 * @returns {boolean}
 */
export function hasSelectedElement(index) {
    return selectionState.selectedElements.has(index);
}

/**
 * Get the editing vertex info
 * @returns {{elementIndex: number, vertex: string|number}|null}
 */
export function getEditingVertex() {
    return selectionState.editingVertex;
}

/**
 * Set the editing vertex info
 * @param {{elementIndex: number, vertex: string|number}|null} vertex
 */
export function setEditingVertex(vertex) {
    selectionState.editingVertex = vertex;
}

/**
 * Get the original element state (for dragging single element)
 * @returns {Object|null}
 */
export function getOriginalElementState() {
    return selectionState.originalElementState;
}

/**
 * Set the original element state
 * @param {Object|null} state
 */
export function setOriginalElementState(state) {
    selectionState.originalElementState = state;
}

/**
 * Get the map of original element states (for multi-drag)
 * @returns {Map<number, Object>}
 */
export function getOriginalElementStates() {
    return selectionState.originalElementStates;
}

/**
 * Clear original element states
 */
export function clearOriginalElementStates() {
    selectionState.originalElementStates.clear();
}

/**
 * Set an original element state in the map
 * @param {number} index
 * @param {Object} state
 */
export function setOriginalElementStateAt(index, state) {
    selectionState.originalElementStates.set(index, state);
}

/**
 * Get the multi-drag reference info
 * @returns {{index: number, point: {x: number, y: number}}|null}
 */
export function getMultiDragReference() {
    return selectionState.multiDragReference;
}

/**
 * Set the multi-drag reference info
 * @param {{index: number, point: {x: number, y: number}}|null} ref
 */
export function setMultiDragReference(ref) {
    selectionState.multiDragReference = ref;
}

// ============================================================================
// Drawing State (for polygon/polyline/arc construction)
// ============================================================================

/**
 * Drawing construction state
 * @private
 */
const drawingState = {
    polygonPoints: [],
    polylinePoints: [],
    arc: {
        stage: ARC_STAGES.IDLE,
        center: null,
        radius: null,
        startAngle: null,
        previewPoint: null,
    },
};

/**
 * Get polygon points being constructed
 * @returns {Array<{x: number, y: number}>}
 */
export function getPolygonPoints() {
    return drawingState.polygonPoints;
}

/**
 * Set polygon points
 * @param {Array<{x: number, y: number}>} points
 */
export function setPolygonPoints(points) {
    drawingState.polygonPoints = points;
}

/**
 * Add a polygon point
 * @param {{x: number, y: number}} point
 */
export function addPolygonPoint(point) {
    drawingState.polygonPoints.push(point);
}

/**
 * Clear polygon points
 */
export function clearPolygonPoints() {
    drawingState.polygonPoints = [];
}

/**
 * Get polyline points being constructed
 * @returns {Array<{x: number, y: number}>}
 */
export function getPolylinePoints() {
    return drawingState.polylinePoints;
}

/**
 * Set polyline points
 * @param {Array<{x: number, y: number}>} points
 */
export function setPolylinePoints(points) {
    drawingState.polylinePoints = points;
}

/**
 * Add a polyline point
 * @param {{x: number, y: number}} point
 */
export function addPolylinePoint(point) {
    drawingState.polylinePoints.push(point);
}

/**
 * Clear polyline points
 */
export function clearPolylinePoints() {
    drawingState.polylinePoints = [];
}

/**
 * Get the arc construction state
 * @returns {{stage: number, center: {x: number, y: number}|null, radius: number|null, startAngle: number|null, previewPoint: {x: number, y: number}|null}}
 */
export function getArcState() {
    return { ...drawingState.arc };
}

/**
 * Set arc construction stage
 * @param {number} stage
 */
export function setArcStage(stage) {
    drawingState.arc.stage = stage;
}

/**
 * Set arc center
 * @param {{x: number, y: number}|null} center
 */
export function setArcCenter(center) {
    drawingState.arc.center = center;
}

/**
 * Set arc radius
 * @param {number|null} radius
 */
export function setArcRadius(radius) {
    drawingState.arc.radius = radius;
}

/**
 * Set arc start angle
 * @param {number|null} angle
 */
export function setArcStartAngle(angle) {
    drawingState.arc.startAngle = angle;
}

/**
 * Set arc preview point
 * @param {{x: number, y: number}|null} point
 */
export function setArcPreviewPoint(point) {
    drawingState.arc.previewPoint = point;
}

/**
 * Reset arc construction state
 */
export function resetArcState() {
    drawingState.arc.stage = ARC_STAGES.IDLE;
    drawingState.arc.center = null;
    drawingState.arc.radius = null;
    drawingState.arc.startAngle = null;
    drawingState.arc.previewPoint = null;
}

// ============================================================================
// Component State
// ============================================================================

/**
 * Component library state
 * @private
 */
const componentState = {
    components: {},
    currentComponentId: null,
    isNewComponentDraft: false,
    dirtyComponents: new Set(),
    primitiveCatalog: {},
};

/**
 * Get all components
 * @returns {Object}
 */
export function getComponents() {
    return componentState.components;
}

/**
 * Set all components
 * @param {Object} components
 */
export function setComponents(components) {
    componentState.components = components;
}

/**
 * Get a specific component by ID
 * @param {string} id
 * @returns {Object|undefined}
 */
export function getComponent(id) {
    return componentState.components[id];
}

/**
 * Set a specific component
 * @param {string} id
 * @param {Object} component
 */
export function setComponent(id, component) {
    componentState.components[id] = component;
}

/**
 * Delete a component
 * @param {string} id
 */
export function deleteComponentById(id) {
    delete componentState.components[id];
}

/**
 * Get the current component ID
 * @returns {string|null}
 */
export function getCurrentComponentId() {
    return componentState.currentComponentId;
}

/**
 * Set the current component ID
 * @param {string|null} id
 */
export function setCurrentComponentId(id) {
    componentState.currentComponentId = id;
}

/**
 * Check if editing a new component draft
 * @returns {boolean}
 */
export function getIsNewComponentDraft() {
    return componentState.isNewComponentDraft;
}

/**
 * Set new component draft state
 * @param {boolean} value
 */
export function setIsNewComponentDraft(value) {
    componentState.isNewComponentDraft = value;
}

/**
 * Get dirty components set
 * @returns {Set<string>}
 */
export function getDirtyComponents() {
    return componentState.dirtyComponents;
}

/**
 * Check if a component is dirty
 * @param {string} id
 * @returns {boolean}
 */
export function isComponentDirty(id) {
    return componentState.dirtyComponents.has(id);
}

/**
 * Mark a component as dirty
 * @param {string} id
 */
export function markComponentDirty(id) {
    componentState.dirtyComponents.add(id);
}

/**
 * Clear dirty state for a component
 * @param {string} id
 * @returns {boolean} Whether the component was dirty
 */
export function clearComponentDirty(id) {
    return componentState.dirtyComponents.delete(id);
}

/**
 * Clear all dirty states
 */
export function clearAllDirty() {
    componentState.dirtyComponents.clear();
}

/**
 * Get the primitive catalog
 * @returns {Object}
 */
export function getPrimitiveCatalog() {
    return componentState.primitiveCatalog;
}

/**
 * Set the primitive catalog
 * @param {Object} catalog
 */
export function setPrimitiveCatalog(catalog) {
    componentState.primitiveCatalog = catalog;
}

// ============================================================================
// Current Component Data
// ============================================================================

/**
 * Current component's drawing data
 * @private
 */
const currentComponentData = {
    elements: [],
    pins: [],
    models: [],
};

/**
 * Get current component elements
 * @returns {Array}
 */
export function getElements() {
    return currentComponentData.elements;
}

/**
 * Set current component elements
 * @param {Array} elements
 */
export function setElements(elements) {
    currentComponentData.elements = elements;
}

/**
 * Add an element
 * @param {Object} element
 */
export function addElement(element) {
    currentComponentData.elements.push(element);
}

/**
 * Remove an element at index
 * @param {number} index
 * @returns {Object} The removed element
 */
export function removeElement(index) {
    return currentComponentData.elements.splice(index, 1)[0];
}

/**
 * Get element at index
 * @param {number} index
 * @returns {Object}
 */
export function getElement(index) {
    return currentComponentData.elements[index];
}

/**
 * Set element at index
 * @param {number} index
 * @param {Object} element
 */
export function setElementAt(index, element) {
    currentComponentData.elements[index] = element;
}

/**
 * Get current component pins
 * @returns {Array}
 */
export function getPins() {
    return currentComponentData.pins;
}

/**
 * Set current component pins
 * @param {Array} pins
 */
export function setPins(pins) {
    currentComponentData.pins = pins;
}

/**
 * Add a pin
 * @param {Object} pin
 */
export function addPin(pin) {
    currentComponentData.pins.push(pin);
}

/**
 * Remove a pin at index
 * @param {number} index
 * @returns {Object} The removed pin
 */
export function removePinAt(index) {
    return currentComponentData.pins.splice(index, 1)[0];
}

/**
 * Get pin at index
 * @param {number} index
 * @returns {Object}
 */
export function getPin(index) {
    return currentComponentData.pins[index];
}

/**
 * Get current component models
 * @returns {Array}
 */
export function getModels() {
    return currentComponentData.models;
}

/**
 * Set current component models
 * @param {Array} models
 */
export function setModels(models) {
    currentComponentData.models = models;
}

/**
 * Add a model
 * @param {Object} model
 */
export function addModel(model) {
    currentComponentData.models.push(model);
}

/**
 * Remove a model at index
 * @param {number} index
 * @returns {Object} The removed model
 */
export function removeModelAt(index) {
    return currentComponentData.models.splice(index, 1)[0];
}

/**
 * Get model at index
 * @param {number} index
 * @returns {Object}
 */
export function getModelAt(index) {
    return currentComponentData.models[index];
}

// ============================================================================
// Pin Drag State
// ============================================================================

/**
 * Pin dragging state
 * @private
 */
const pinDragState = {
    draggingPinIndex: null,
    pinDragOffset: null,
    draggingPinLabelIndex: null,
    pinLabelDragOffset: null,
};

/**
 * Get dragging pin index
 * @returns {number|null}
 */
export function getDraggingPinIndex() {
    return pinDragState.draggingPinIndex;
}

/**
 * Set dragging pin index
 * @param {number|null} index
 */
export function setDraggingPinIndex(index) {
    pinDragState.draggingPinIndex = index;
}

/**
 * Get pin drag offset
 * @returns {{x: number, y: number}|null}
 */
export function getPinDragOffset() {
    return pinDragState.pinDragOffset;
}

/**
 * Set pin drag offset
 * @param {{x: number, y: number}|null} offset
 */
export function setPinDragOffset(offset) {
    pinDragState.pinDragOffset = offset;
}

/**
 * Get dragging pin label index
 * @returns {number|null}
 */
export function getDraggingPinLabelIndex() {
    return pinDragState.draggingPinLabelIndex;
}

/**
 * Set dragging pin label index
 * @param {number|null} index
 */
export function setDraggingPinLabelIndex(index) {
    pinDragState.draggingPinLabelIndex = index;
}

/**
 * Get pin label drag offset
 * @returns {{x: number, y: number}|null}
 */
export function getPinLabelDragOffset() {
    return pinDragState.pinLabelDragOffset;
}

/**
 * Set pin label drag offset
 * @param {{x: number, y: number}|null} offset
 */
export function setPinLabelDragOffset(offset) {
    pinDragState.pinLabelDragOffset = offset;
}

/**
 * Reset pin drag state
 */
export function resetPinDragState() {
    pinDragState.draggingPinIndex = null;
    pinDragState.pinDragOffset = null;
}

/**
 * Reset pin label drag state
 */
export function resetPinLabelDragState() {
    pinDragState.draggingPinLabelIndex = null;
    pinDragState.pinLabelDragOffset = null;
}

// ============================================================================
// Label Preview State
// ============================================================================

/**
 * Label preview state
 * @private
 */
const labelPreviewState = {
    canvases: [],
    dirty: false,
    dragState: null,
};

/**
 * Get label preview canvases
 * @returns {Array}
 */
export function getLabelPreviewCanvases() {
    return labelPreviewState.canvases;
}

/**
 * Set label preview canvases
 * @param {Array} canvases
 */
export function setLabelPreviewCanvases(canvases) {
    labelPreviewState.canvases = canvases;
}

/**
 * Check if label preview is dirty
 * @returns {boolean}
 */
export function isLabelPreviewDirty() {
    return labelPreviewState.dirty;
}

/**
 * Set label preview dirty state
 * @param {boolean} value
 */
export function setLabelPreviewDirty(value) {
    labelPreviewState.dirty = value;
}

/**
 * Get label drag state
 * @returns {Object|null}
 */
export function getLabelDragState() {
    return labelPreviewState.dragState;
}

/**
 * Set label drag state
 * @param {Object|null} state
 */
export function setLabelDragState(state) {
    labelPreviewState.dragState = state;
}

// ============================================================================
// Form State
// ============================================================================

/**
 * Form-related state
 * @private
 */
const formState = {
    defaultValueIsNull: false,
    expandedModelIndex: null,
};

/**
 * Check if default value is null
 * @returns {boolean}
 */
export function getDefaultValueIsNull() {
    return formState.defaultValueIsNull;
}

/**
 * Set default value is null state
 * @param {boolean} value
 */
export function setDefaultValueIsNull(value) {
    formState.defaultValueIsNull = value;
}

/**
 * Get expanded model index
 * @returns {number|null}
 */
export function getExpandedModelIndex() {
    return formState.expandedModelIndex;
}

/**
 * Set expanded model index
 * @param {number|null} index
 */
export function setExpandedModelIndex(index) {
    formState.expandedModelIndex = index;
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Reset all state to initial values
 */
export function resetAllState() {
    // Reset editor state
    editorState.mode = MODES.SELECT;
    editorState.zoomLevel = DEFAULTS.ZOOM.DEFAULT;

    // Reset interaction state
    interactionState.isDrawing = false;
    interactionState.isDragging = false;
    interactionState.isSelecting = false;
    interactionState.drawStart = null;
    interactionState.dragStart = null;
    interactionState.selectionRect = null;

    // Reset selection state
    selectionState.selectedElement = null;
    selectionState.selectedElements.clear();
    selectionState.editingVertex = null;
    selectionState.originalElementState = null;
    selectionState.originalElementStates.clear();
    selectionState.multiDragReference = null;

    // Reset drawing state
    drawingState.polygonPoints = [];
    drawingState.polylinePoints = [];
    resetArcState();

    // Reset component state
    componentState.components = {};
    componentState.currentComponentId = null;
    componentState.isNewComponentDraft = false;
    componentState.dirtyComponents.clear();
    componentState.primitiveCatalog = {};

    // Reset current component data
    currentComponentData.elements = [];
    currentComponentData.pins = [];
    currentComponentData.models = [];

    // Reset pin drag state
    resetPinDragState();
    resetPinLabelDragState();

    // Reset label preview state
    labelPreviewState.canvases = [];
    labelPreviewState.dirty = false;
    labelPreviewState.dragState = null;

    // Reset form state
    formState.defaultValueIsNull = false;
    formState.expandedModelIndex = null;
}

/**
 * Initialize state (call at startup)
 */
export function initState() {
    // State is already initialized with default values
    // This function can be extended if needed
}

// ============================================================================
// Alias Functions (for compatibility with different module naming)
// ============================================================================

// Interaction state aliases
export const getIsDrawing = isDrawing;
export const getIsDragging = isDragging;
export const getIsSelecting = isSelecting;

// Arc state aliases
export function getArcStage() {
    return drawingState.arc.stage;
}

export function getArcCenter() {
    return drawingState.arc.center;
}

export function getArcRadius() {
    return drawingState.arc.radius;
}

export function getArcStartAngle() {
    return drawingState.arc.startAngle;
}

export function getArcPreviewPoint() {
    return drawingState.arc.previewPoint;
}

// Selection state aliases
export function getSelectedElementsSet() {
    return selectionState.selectedElements;
}

// Label preview aliases
export function getLabelPreviewDirty() {
    return labelPreviewState.dirty;
}

// Mode alias (for setMode vs setModeState naming)
export const setMode = setModeState;

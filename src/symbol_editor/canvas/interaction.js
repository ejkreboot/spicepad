/**
 * @fileoverview Mouse/pointer event handlers for the symbol editor.
 * Uses a dispatch pattern to route events based on current mode.
 */

import { MODES, HIT_DETECTION, ARC_STAGES } from '../constants.js';
import { updateCoordIndicator, getStrokeSettings } from '../dom.js';
import {
    getMode,
    isDrawing,
    setIsDrawing,
    isDragging,
    setIsDragging,
    isSelecting,
    setIsSelecting,
    getDrawStart,
    setDrawStart,
    getDragStart,
    setDragStart,
    getSelectionRect,
    setSelectionRect,
    getSelectedElement,
    setSelectedElement,
    getSelectedElements,
    clearSelectedElements,
    addSelectedElement,
    removeSelectedElement,
    hasSelectedElement,
    getEditingVertex,
    setEditingVertex,
    getOriginalElementState,
    setOriginalElementState,
    getOriginalElementStates,
    clearOriginalElementStates,
    setOriginalElementStateAt,
    getMultiDragReference,
    setMultiDragReference,
    getDraggingPinIndex,
    setDraggingPinIndex,
    getPinDragOffset,
    setPinDragOffset,
    getDraggingPinLabelIndex,
    setDraggingPinLabelIndex,
    getPinLabelDragOffset,
    setPinLabelDragOffset,
    resetPinDragState,
    resetPinLabelDragState,
    getArcState,
    setArcStage,
    setArcCenter,
    setArcRadius,
    setArcStartAngle,
    setArcPreviewPoint,
    resetArcState,
    addPolygonPoint,
    getPolygonPoints,
    clearPolygonPoints,
    addPolylinePoint,
    getPolylinePoints,
    clearPolylinePoints,
    getElements,
    addElement,
    getElement,
    getPins,
    getPin,
    getZoomLevel,
} from '../state.js';
import { getCanvasOffset, canvasToComponent, getCanvasPosition, componentToCanvas } from './transform.js';
import { redraw, drawDrawingPreview } from './drawing.js';
import {
    pointToLineDistance,
    isElementInRect,
    getElementReferencePoint,
    snapToGrid,
} from '../utils/geometry.js';
import { recordAction, getUndoStack, popUndoAction } from '../undo.js';
import { updateElementList } from '../ui/lists.js';
import { markCurrentComponentDirty, setZoomLevelWithUpdate } from '../ui/forms.js';
import {
    addPinAtPosition,
    getPinLabelPosition,
    ensurePinLabelPosition,
    findPinNearPosition,
    findPinLabelNearPosition,
} from '../elements/pins.js';
import { updatePinList } from '../ui/lists.js';
import { getContext, getGridSettings } from '../dom.js';

/**
 * Mode-specific event handlers
 * @private
 */
const modeHandlers = {
    [MODES.SELECT]: {
        mouseDown: handleSelectMouseDown,
        mouseMove: handleSelectMouseMove,
        mouseUp: handleSelectMouseUp,
    },
    [MODES.LINE]: {
        mouseDown: handleDrawingMouseDown,
        mouseMove: handleDrawingMouseMove,
        mouseUp: handleLineMouseUp,
    },
    [MODES.CIRCLE]: {
        mouseDown: handleDrawingMouseDown,
        mouseMove: handleDrawingMouseMove,
        mouseUp: handleCircleMouseUp,
    },
    [MODES.ARC]: {
        mouseDown: handleArcMouseDown,
        mouseMove: handleArcMouseMove,
        mouseUp: null,
    },
    [MODES.POLYGON]: {
        mouseDown: handlePolygonMouseDown,
        mouseMove: null,
        mouseUp: null,
    },
    [MODES.POLYLINE]: {
        mouseDown: handlePolylineMouseDown,
        mouseMove: null,
        mouseUp: null,
    },
    [MODES.PIN]: {
        mouseDown: handlePinMouseDown,
        mouseMove: null,
        mouseUp: null,
    },
};

/**
 * Main mouse down handler
 * @param {MouseEvent} event
 */
export function onMouseDown(event) {
    const { canvasX, canvasY } = getCanvasPosition(event);
    const mode = getMode();
    const shouldSnap = mode !== MODES.SELECT;
    const pos = canvasToComponent(canvasX, canvasY, { snap: shouldSnap });

    setMultiDragReference(null);

    const handler = modeHandlers[mode]?.mouseDown;
    if (handler) {
        handler(pos, event);
    }
}

/**
 * Main mouse move handler
 * @param {MouseEvent} event
 */
export function onMouseMove(event) {
    const { canvasX, canvasY } = getCanvasPosition(event);
    const mode = getMode();
    const shouldSnap = mode !== MODES.SELECT;
    const pos = canvasToComponent(canvasX, canvasY, { snap: shouldSnap });

    updateCoordIndicator(pos.x, pos.y);

    // Handle pin/label dragging first (mode-independent)
    if (getDraggingPinLabelIndex() !== null) {
        applyPinLabelDragPosition(pos);
        return;
    }

    if (getDraggingPinIndex() !== null) {
        applyPinDragPosition(pos);
        return;
    }

    const handler = modeHandlers[mode]?.mouseMove;
    if (handler) {
        handler(pos, event, canvasX, canvasY);
    }
}

/**
 * Main mouse up handler
 * @param {MouseEvent} event
 */
export function onMouseUp(event) {
    const { canvasX, canvasY } = getCanvasPosition(event);
    const mode = getMode();
    const shouldSnap = mode !== MODES.SELECT;
    const pos = canvasToComponent(canvasX, canvasY, { snap: shouldSnap });

    // Handle pin/label drag end first
    if (getDraggingPinLabelIndex() !== null) {
        finishPinLabelDrag();
        return;
    }

    if (getDraggingPinIndex() !== null) {
        finishPinDrag();
        return;
    }

    const handler = modeHandlers[mode]?.mouseUp;
    if (handler) {
        handler(pos, event, canvasX, canvasY);
    }
}

/**
 * Double-click handler
 * @param {MouseEvent} event
 */
export function onDoubleClick(event) {
    const mode = getMode();

    if (mode === MODES.POLYGON) {
        const polygonPoints = getPolygonPoints();
        if (polygonPoints.length >= 3) {
            const { width: strokeWidth, filled } = getStrokeSettings();

            addElement({
                type: 'polygon',
                points: [...polygonPoints],
                strokeWidth,
                filled,
            });
            recordAction({ type: 'create', index: getElements().length - 1 });
            markCurrentComponentDirty();

            clearPolygonPoints();
            updateElementList();
            redraw();
        }
    } else if (mode === MODES.POLYLINE) {
        const polylinePoints = getPolylinePoints();
        if (polylinePoints.length >= 2) {
            const { width: strokeWidth } = getStrokeSettings();

            addElement({
                type: 'polyline',
                points: [...polylinePoints],
                strokeWidth,
            });
            recordAction({ type: 'create', index: getElements().length - 1 });
            markCurrentComponentDirty();

            clearPolylinePoints();
            updateElementList();
            redraw();
        }
    }
}

/**
 * Wheel handler for zooming
 * @param {WheelEvent} event
 */
export function onWheel(event) {
    const pinchGesture = event.ctrlKey || event.metaKey;
    const trackpadScrollGesture = !pinchGesture && event.deltaMode === 0;
    if (!pinchGesture && !trackpadScrollGesture) return;

    event.preventDefault();

    const multiplier = pinchGesture ? 0.01 : 0.0025;
    const increment = -event.deltaY * multiplier;
    if (increment === 0) return;

    setZoomLevelWithUpdate(getZoomLevel() + increment);
}

// ============================================================================
// Select Mode Handlers
// ============================================================================

/**
 * Handle mouse down in select mode
 * @param {{x: number, y: number}} pos
 * @param {MouseEvent} event
 */
function handleSelectMouseDown(pos, event) {
    // Check for pin label first
    const labelIndex = findPinLabelNearPosition(pos);
    if (labelIndex !== -1) {
        setDraggingPinLabelIndex(labelIndex);
        const labelPos = getPinLabelPosition(getPins()[labelIndex]);
        setPinLabelDragOffset({
            x: labelPos.x - pos.x,
            y: labelPos.y - pos.y,
        });
        recordAction({
            type: 'move-pin-label',
            index: labelIndex,
            before: { x: labelPos.x, y: labelPos.y },
        });
        return;
    }

    // Check for pin
    const pinIndex = findPinNearPosition(pos);
    if (pinIndex !== -1) {
        setDraggingPinIndex(pinIndex);
        const pin = getPins()[pinIndex];
        const beforePosition = {
            position: { x: pin.position.x, y: pin.position.y },
            label: getPinLabelPosition(pin),
        };
        setPinDragOffset({
            x: pin.position.x - pos.x,
            y: pin.position.y - pos.y,
        });
        recordAction({
            type: 'move-pin',
            index: pinIndex,
            before: beforePosition,
        });
        return;
    }

    const shiftKey = event.shiftKey;

    // Check for vertex at position
    const vertex = findVertexAt(pos.x, pos.y);
    if (vertex) {
        setEditingVertex(vertex);
        setSelectedElement(vertex.elementIndex);
        clearSelectedElements();
        setIsDragging(true);
        setDragStart(pos);
        recordAction({
            type: 'move',
            index: vertex.elementIndex,
            before: JSON.parse(JSON.stringify(getElements()[vertex.elementIndex])),
        });
    } else {
        // Try to select an element
        const clickedElement = findElementAt(pos.x, pos.y);
        if (clickedElement !== null) {
            if (shiftKey) {
                // Toggle selection with shift
                if (hasSelectedElement(clickedElement)) {
                    removeSelectedElement(clickedElement);
                } else {
                    addSelectedElement(clickedElement);
                }
                setSelectedElement(null);
            } else {
                // Single selection - check if clicking on already selected element(s)
                const selectedElements = getSelectedElements();
                if (selectedElements.size > 0 && selectedElements.has(clickedElement)) {
                    // Start dragging all selected elements
                    setIsDragging(true);
                    setDragStart(pos);
                    setEditingVertex(null);

                    // Save original states for all selected elements
                    clearOriginalElementStates();
                    const elements = getElements();
                    selectedElements.forEach(idx => {
                        setOriginalElementStateAt(idx, JSON.parse(JSON.stringify(elements[idx])));
                    });

                    const originalStates = getOriginalElementStates();
                    const referenceState = originalStates.get(clickedElement);
                    const referencePoint = referenceState
                        ? getElementReferencePoint(referenceState)
                        : getElementReferencePoint(elements[clickedElement]);
                    setMultiDragReference({
                        index: clickedElement,
                        point: referencePoint,
                    });
                } else {
                    // New single selection
                    setSelectedElement(clickedElement);
                    clearSelectedElements();
                    setIsDragging(true);
                    setDragStart(pos);
                    setEditingVertex(null);

                    const originalState = JSON.parse(JSON.stringify(getElements()[clickedElement]));
                    setOriginalElementState(originalState);
                    recordAction({
                        type: 'move',
                        index: clickedElement,
                        before: originalState,
                    });
                }
            }
        } else {
            // Start drag selection if clicking empty space
            if (!shiftKey) {
                setSelectedElement(null);
                clearSelectedElements();
            }
            setIsSelecting(true);
            setSelectionRect({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y });
            setEditingVertex(null);
        }
    }

    updateElementList();
    redraw();
}

/**
 * Handle mouse move in select mode
 * @param {{x: number, y: number}} pos
 * @param {MouseEvent} event
 */
function handleSelectMouseMove(pos, event) {
    if (isSelecting()) {
        const rect = getSelectionRect();
        if (rect) {
            setSelectionRect({ ...rect, x2: pos.x, y2: pos.y });
            redraw();
        }
    } else if (isDragging() && getDragStart()) {
        const editingVertex = getEditingVertex();
        if (editingVertex) {
            handleVertexDrag(pos, editingVertex);
        } else if (getSelectedElements().size > 0 && getOriginalElementStates().size > 0) {
            handleMultiElementDrag(pos);
        } else if (getSelectedElement() !== null && getOriginalElementState()) {
            handleSingleElementDrag(pos);
        }
        redraw();
    }
}

/**
 * Handle mouse up in select mode
 * @param {{x: number, y: number}} pos
 * @param {MouseEvent} event
 */
function handleSelectMouseUp(pos, event) {
    if (isSelecting()) {
        const rect = getSelectionRect();
        if (rect) {
            const minX = Math.min(rect.x1, rect.x2);
            const maxX = Math.max(rect.x1, rect.x2);
            const minY = Math.min(rect.y1, rect.y2);
            const maxY = Math.max(rect.y1, rect.y2);

            const elements = getElements();
            elements.forEach((el, idx) => {
                if (isElementInRect(el, minX, minY, maxX, maxY)) {
                    addSelectedElement(idx);
                }
            });
        }

        setIsSelecting(false);
        setSelectionRect(null);
        updateElementList();
        redraw();
        return;
    }

    if (isDragging()) {
        const selectedElements = getSelectedElements();
        const originalStates = getOriginalElementStates();

        if (selectedElements.size > 0 && originalStates.size > 0) {
            // Save undo for multi-element move
            const beforeStates = new Map();
            originalStates.forEach((state, idx) => {
                beforeStates.set(idx, state);
            });
            recordAction({
                type: 'multi-move',
                states: beforeStates,
                indices: Array.from(selectedElements),
            });
            clearOriginalElementStates();
        } else {
            // Check if single element actually moved
            const undoStack = getUndoStack();
            if (undoStack.length > 0 && undoStack[undoStack.length - 1].type === 'move') {
                const lastAction = undoStack[undoStack.length - 1];
                const current = getElements()[lastAction.index];
                const before = lastAction.before;
                if (JSON.stringify(current) === JSON.stringify(before)) {
                    popUndoAction();
                }
            }
        }

        setIsDragging(false);
        setDragStart(null);
        setEditingVertex(null);
        setOriginalElementState(null);
        setMultiDragReference(null);
        updateElementList();
        redraw();
        markCurrentComponentDirty();
    }
}

// ============================================================================
// Drawing Mode Handlers
// ============================================================================

/**
 * Handle mouse down for line/circle drawing
 * @param {{x: number, y: number}} pos
 * @param {MouseEvent} event
 */
function handleDrawingMouseDown(pos, event) {
    setIsDrawing(true);
    setDrawStart(pos);
}

/**
 * Handle mouse move for line/circle drawing
 * @param {{x: number, y: number}} pos
 * @param {MouseEvent} event
 * @param {number} canvasX
 * @param {number} canvasY
 */
function handleDrawingMouseMove(pos, event, canvasX, canvasY) {
    if (isDrawing() && getDrawStart()) {
        redraw();
        const ctx = getContext();
        const mode = getMode();
        drawDrawingPreview(ctx, mode, getDrawStart(), pos);
    }
}

/**
 * Handle mouse up for line drawing
 * @param {{x: number, y: number}} pos
 * @param {MouseEvent} event
 */
function handleLineMouseUp(pos, event) {
    if (!isDrawing() || !getDrawStart()) return;

    const { width: strokeWidth } = getStrokeSettings();
    const drawStart = getDrawStart();

    addElement({
        type: 'line',
        x1: drawStart.x,
        y1: drawStart.y,
        x2: pos.x,
        y2: pos.y,
        strokeWidth,
    });
    recordAction({ type: 'create', index: getElements().length - 1 });
    markCurrentComponentDirty();

    setIsDrawing(false);
    setDrawStart(null);
    updateElementList();
    redraw();
}

/**
 * Handle mouse up for circle drawing
 * @param {{x: number, y: number}} pos
 * @param {MouseEvent} event
 */
function handleCircleMouseUp(pos, event) {
    if (!isDrawing() || !getDrawStart()) return;

    const { width: strokeWidth, filled } = getStrokeSettings();
    const drawStart = getDrawStart();
    const radius = Math.sqrt(
        Math.pow(pos.x - drawStart.x, 2) +
        Math.pow(pos.y - drawStart.y, 2)
    );

    addElement({
        type: 'circle',
        cx: drawStart.x,
        cy: drawStart.y,
        r: Math.round(radius),
        strokeWidth,
        filled,
    });
    recordAction({ type: 'create', index: getElements().length - 1 });
    markCurrentComponentDirty();

    setIsDrawing(false);
    setDrawStart(null);
    updateElementList();
    redraw();
}

// ============================================================================
// Arc Mode Handlers
// ============================================================================

/**
 * Handle mouse down for arc drawing
 * @param {{x: number, y: number}} pos
 * @param {MouseEvent} event
 */
function handleArcMouseDown(pos, event) {
    handleArcClick(pos);
}

/**
 * Handle mouse move for arc drawing
 * @param {{x: number, y: number}} pos
 * @param {MouseEvent} event
 */
function handleArcMouseMove(pos, event) {
    const arcState = getArcState();
    if (arcState.stage > ARC_STAGES.IDLE) {
        setArcPreviewPoint(pos);
        redraw();
    }
}

/**
 * Handle arc construction click
 * @param {{x: number, y: number}} pos
 */
function handleArcClick(pos) {
    const arcState = getArcState();

    if (arcState.stage === ARC_STAGES.IDLE) {
        setArcCenter(pos);
        setArcStage(ARC_STAGES.CENTER_CHOSEN);
    } else if (arcState.stage === ARC_STAGES.CENTER_CHOSEN) {
        const radius = Math.sqrt(
            Math.pow(pos.x - arcState.center.x, 2) +
            Math.pow(pos.y - arcState.center.y, 2)
        );
        if (radius < 1) return;

        setArcRadius(radius);
        setArcStartAngle(Math.atan2(pos.y - arcState.center.y, pos.x - arcState.center.x));
        setArcStage(ARC_STAGES.RADIUS_CHOSEN);
        setArcPreviewPoint(pos);
    } else if (arcState.stage === ARC_STAGES.RADIUS_CHOSEN) {
        const { width: strokeWidth } = getStrokeSettings();
        const endAngle = Math.atan2(pos.y - arcState.center.y, pos.x - arcState.center.x);

        if (Math.abs(endAngle - arcState.startAngle) < 0.01) {
            setArcPreviewPoint(pos);
            redraw();
            return;
        }

        addElement({
            type: 'arc',
            cx: arcState.center.x,
            cy: arcState.center.y,
            r: Math.max(1, Math.round(arcState.radius)),
            startAngle: arcState.startAngle,
            endAngle,
            strokeWidth,
        });
        recordAction({ type: 'create', index: getElements().length - 1 });
        markCurrentComponentDirty();
        resetArcState();
        updateElementList();
    }

    redraw();
}

// ============================================================================
// Polygon/Polyline Mode Handlers
// ============================================================================

/**
 * Handle mouse down for polygon drawing
 * @param {{x: number, y: number}} pos
 * @param {MouseEvent} event
 */
function handlePolygonMouseDown(pos, event) {
    addPolygonPoint(pos);
    redraw();
}

/**
 * Handle mouse down for polyline drawing
 * @param {{x: number, y: number}} pos
 * @param {MouseEvent} event
 */
function handlePolylineMouseDown(pos, event) {
    addPolylinePoint(pos);
    redraw();
}

// ============================================================================
// Pin Mode Handler
// ============================================================================

/**
 * Handle mouse down for pin placement
 * @param {{x: number, y: number}} pos
 * @param {MouseEvent} event
 */
function handlePinMouseDown(pos, event) {
    addPinAtPosition(pos);
}

// ============================================================================
// Element/Vertex Finding
// ============================================================================

/**
 * Get hit threshold based on zoom level
 * @param {number} [targetPixels=4]
 * @param {Object} [options]
 * @returns {number}
 */
function getHitThreshold(targetPixels = 4, options = {}) {
    const { zoom } = getCanvasOffset();
    const safeZoom = Math.max(zoom, 0.1);
    const minComponentUnits = options.min || HIT_DETECTION.MIN_COMPONENT_UNITS;
    const maxComponentUnits = options.max || HIT_DETECTION.MAX_COMPONENT_UNITS;
    const converted = targetPixels / safeZoom;
    return Math.max(minComponentUnits, Math.min(maxComponentUnits, converted));
}

/**
 * Find element at position
 * @param {number} x
 * @param {number} y
 * @returns {number|null}
 */
function findElementAt(x, y) {
    const threshold = getHitThreshold(HIT_DETECTION.ELEMENT_PIXELS, { min: 1.5 });
    const elements = getElements();

    for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];

        if (el.type === 'line') {
            const dist = pointToLineDistance(x, y, el.x1, el.y1, el.x2, el.y2);
            if (dist < threshold) return i;
        } else if (el.type === 'circle' || el.type === 'arc') {
            const dist = Math.abs(Math.sqrt(Math.pow(x - el.cx, 2) + Math.pow(y - el.cy, 2)) - el.r);
            if (dist < threshold) return i;
        } else if (el.type === 'polygon' && el.points) {
            for (let j = 0; j < el.points.length; j++) {
                const p1 = el.points[j];
                const p2 = el.points[(j + 1) % el.points.length];
                const dist = pointToLineDistance(x, y, p1.x, p1.y, p2.x, p2.y);
                if (dist < threshold) return i;
            }
        } else if (el.type === 'polyline' && el.points) {
            for (let j = 0; j < el.points.length - 1; j++) {
                const p1 = el.points[j];
                const p2 = el.points[j + 1];
                const dist = pointToLineDistance(x, y, p1.x, p1.y, p2.x, p2.y);
                if (dist < threshold) return i;
            }
        }
    }

    return null;
}

/**
 * Find vertex at position
 * @param {number} x
 * @param {number} y
 * @returns {{elementIndex: number, vertex: string|number}|null}
 */
function findVertexAt(x, y) {
    const threshold = getHitThreshold(HIT_DETECTION.VERTEX_PIXELS, { min: HIT_DETECTION.VERTEX_MIN_UNITS });
    const elements = getElements();

    for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];

        if (el.type === 'line') {
            if (Math.sqrt(Math.pow(x - el.x1, 2) + Math.pow(y - el.y1, 2)) < threshold) {
                return { elementIndex: i, vertex: 'start' };
            }
            if (Math.sqrt(Math.pow(x - el.x2, 2) + Math.pow(y - el.y2, 2)) < threshold) {
                return { elementIndex: i, vertex: 'end' };
            }
        } else if (el.type === 'polygon' && el.points) {
            for (let j = 0; j < el.points.length; j++) {
                const p = el.points[j];
                if (Math.sqrt(Math.pow(x - p.x, 2) + Math.pow(y - p.y, 2)) < threshold) {
                    return { elementIndex: i, vertex: j };
                }
            }
        } else if (el.type === 'polyline' && el.points) {
            for (let j = 0; j < el.points.length; j++) {
                const p = el.points[j];
                if (Math.sqrt(Math.pow(x - p.x, 2) + Math.pow(y - p.y, 2)) < threshold) {
                    return { elementIndex: i, vertex: j };
                }
            }
        } else if (el.type === 'circle') {
            const distToCenter = Math.sqrt(Math.pow(x - el.cx, 2) + Math.pow(y - el.cy, 2));
            if (distToCenter < threshold) {
                return { elementIndex: i, vertex: 'center' };
            }
            if (Math.abs(distToCenter - el.r) < threshold) {
                return { elementIndex: i, vertex: 'radius' };
            }
        }
    }

    return null;
}

// ============================================================================
// Drag Handlers
// ============================================================================

/**
 * Handle dragging a vertex
 * @param {{x: number, y: number}} pos
 * @param {{elementIndex: number, vertex: string|number}} editingVertex
 */
function handleVertexDrag(pos, editingVertex) {
    const el = getElement(editingVertex.elementIndex);
    const { snap: snapEnabled, size: gridSize } = getGridSettings();

    const target = {
        x: snapEnabled ? snapToGrid(pos.x, gridSize) : pos.x,
        y: snapEnabled ? snapToGrid(pos.y, gridSize) : pos.y,
    };

    if (el.type === 'line') {
        if (editingVertex.vertex === 'start') {
            el.x1 = target.x;
            el.y1 = target.y;
        } else if (editingVertex.vertex === 'end') {
            el.x2 = target.x;
            el.y2 = target.y;
        }
    } else if (el.type === 'circle') {
        if (editingVertex.vertex === 'center') {
            el.cx = target.x;
            el.cy = target.y;
        } else if (editingVertex.vertex === 'radius') {
            const radius = Math.sqrt(
                Math.pow(target.x - el.cx, 2) + Math.pow(target.y - el.cy, 2)
            );
            el.r = Math.max(1, Math.round(radius));
        }
    } else if ((el.type === 'polygon' || el.type === 'polyline') && el.points) {
        el.points[editingVertex.vertex].x = target.x;
        el.points[editingVertex.vertex].y = target.y;
    }
}

/**
 * Handle dragging multiple elements
 * @param {{x: number, y: number}} pos
 */
function handleMultiElementDrag(pos) {
    const dragStart = getDragStart();
    const { snap: snapEnabled, size: gridSize } = getGridSettings();
    const multiDragRef = getMultiDragReference();
    const originalStates = getOriginalElementStates();
    const selectedElements = getSelectedElements();
    const elements = getElements();

    const rawOffsetX = pos.x - dragStart.x;
    const rawOffsetY = pos.y - dragStart.y;

    let deltaX = rawOffsetX;
    let deltaY = rawOffsetY;

    if (snapEnabled) {
        const referenceState = multiDragRef?.index !== undefined
            ? originalStates.get(multiDragRef.index)
            : null;
        const referencePoint = multiDragRef?.point || (referenceState ? getElementReferencePoint(referenceState) : null);

        if (referencePoint) {
            let targetX = referencePoint.x + rawOffsetX;
            let targetY = referencePoint.y + rawOffsetY;
            targetX = snapToGrid(targetX, gridSize);
            targetY = snapToGrid(targetY, gridSize);
            deltaX = targetX - referencePoint.x;
            deltaY = targetY - referencePoint.y;
        } else {
            deltaX = snapToGrid(rawOffsetX, gridSize);
            deltaY = snapToGrid(rawOffsetY, gridSize);
        }
    }

    selectedElements.forEach(idx => {
        const el = elements[idx];
        const orig = originalStates.get(idx);
        if (!orig) return;

        if (el.type === 'line') {
            el.x1 = orig.x1 + deltaX;
            el.y1 = orig.y1 + deltaY;
            el.x2 = orig.x2 + deltaX;
            el.y2 = orig.y2 + deltaY;
        } else if (el.type === 'circle' || el.type === 'arc') {
            el.cx = orig.cx + deltaX;
            el.cy = orig.cy + deltaY;
        } else if ((el.type === 'polygon' || el.type === 'polyline') && el.points && orig.points) {
            el.points.forEach((p, i) => {
                p.x = orig.points[i].x + deltaX;
                p.y = orig.points[i].y + deltaY;
            });
        }
    });
}

/**
 * Handle dragging a single element
 * @param {{x: number, y: number}} pos
 */
function handleSingleElementDrag(pos) {
    const dragStart = getDragStart();
    const { snap: snapEnabled, size: gridSize } = getGridSettings();
    const selectedIdx = getSelectedElement();
    const orig = getOriginalElementState();
    const el = getElement(selectedIdx);

    const offsetX = pos.x - dragStart.x;
    const offsetY = pos.y - dragStart.y;

    let targetX, targetY;
    if (el.type === 'line') {
        targetX = orig.x1 + offsetX;
        targetY = orig.y1 + offsetY;
    } else if (el.type === 'circle' || el.type === 'arc') {
        targetX = orig.cx + offsetX;
        targetY = orig.cy + offsetY;
    } else if ((el.type === 'polygon' || el.type === 'polyline') && el.points) {
        targetX = orig.points[0].x + offsetX;
        targetY = orig.points[0].y + offsetY;
    }

    if (snapEnabled) {
        targetX = snapToGrid(targetX, gridSize);
        targetY = snapToGrid(targetY, gridSize);
    }

    let dx, dy;
    if (el.type === 'line') {
        dx = targetX - orig.x1;
        dy = targetY - orig.y1;
    } else if (el.type === 'circle' || el.type === 'arc') {
        dx = targetX - orig.cx;
        dy = targetY - orig.cy;
    } else if ((el.type === 'polygon' || el.type === 'polyline') && el.points) {
        dx = targetX - orig.points[0].x;
        dy = targetY - orig.points[0].y;
    }

    if (el.type === 'line') {
        el.x1 = orig.x1 + dx;
        el.y1 = orig.y1 + dy;
        el.x2 = orig.x2 + dx;
        el.y2 = orig.y2 + dy;
    } else if (el.type === 'circle' || el.type === 'arc') {
        el.cx = orig.cx + dx;
        el.cy = orig.cy + dy;
    } else if ((el.type === 'polygon' || el.type === 'polyline') && el.points) {
        el.points.forEach((p, i) => {
            p.x = orig.points[i].x + dx;
            p.y = orig.points[i].y + dy;
        });
    }
}

// ============================================================================
// Pin Drag Helpers
// ============================================================================

/**
 * Apply pin drag position
 * @param {{x: number, y: number}} pos
 */
function applyPinDragPosition(pos) {
    const draggingPinIndex = getDraggingPinIndex();
    if (draggingPinIndex === null) return;

    const pin = getPin(draggingPinIndex);
    if (!pin || !pos) return;

    const { size: gridSize, snap: snapEnabled } = getGridSettings();
    const pinDragOffset = getPinDragOffset();

    let targetX = pos.x + (pinDragOffset?.x || 0);
    let targetY = pos.y + (pinDragOffset?.y || 0);

    if (snapEnabled) {
        targetX = snapToGrid(targetX, gridSize);
        targetY = snapToGrid(targetY, gridSize);
    }

    const deltaX = targetX - pin.position.x;
    const deltaY = targetY - pin.position.y;
    pin.position.x = targetX;
    pin.position.y = targetY;

    const label = ensurePinLabelPosition(pin);
    label.x = Math.round(label.x + deltaX);
    label.y = Math.round(label.y + deltaY);

    updatePinList();
    redraw();
    markCurrentComponentDirty();
}

/**
 * Apply pin label drag position
 * @param {{x: number, y: number}} pos
 */
function applyPinLabelDragPosition(pos) {
    const draggingPinLabelIndex = getDraggingPinLabelIndex();
    if (draggingPinLabelIndex === null) return;

    const pin = getPin(draggingPinLabelIndex);
    if (!pin || !pos) return;

    const { size: gridSize, snap: snapEnabled } = getGridSettings();
    const pinLabelDragOffset = getPinLabelDragOffset();
    const label = ensurePinLabelPosition(pin);

    let targetX = pos.x + (pinLabelDragOffset?.x || 0);
    let targetY = pos.y + (pinLabelDragOffset?.y || 0);

    if (snapEnabled) {
        targetX = snapToGrid(targetX, gridSize);
        targetY = snapToGrid(targetY, gridSize);
    }

    label.x = Math.round(targetX);
    label.y = Math.round(targetY);

    updatePinList();
    redraw();
    markCurrentComponentDirty();
}

/**
 * Finish pin drag operation
 */
function finishPinDrag() {
    const draggingPinIndex = getDraggingPinIndex();
    const pin = getPins()[draggingPinIndex];
    const undoStack = getUndoStack();
    const lastAction = undoStack[undoStack.length - 1];

    if (lastAction && lastAction.type === 'move-pin') {
        const before = lastAction.before;
        if (!pin || (pin.position.x === before.position.x && pin.position.y === before.position.y)) {
            popUndoAction();
        }
    }

    updatePinList();
    redraw();
    resetPinDragState();
}

/**
 * Finish pin label drag operation
 */
function finishPinLabelDrag() {
    const draggingPinLabelIndex = getDraggingPinLabelIndex();
    const pin = getPins()[draggingPinLabelIndex];
    const undoStack = getUndoStack();
    const lastAction = undoStack[undoStack.length - 1];

    if (lastAction && lastAction.type === 'move-pin-label') {
        const before = lastAction.before;
        const labelPos = pin ? getPinLabelPosition(pin) : null;
        if (!labelPos || (labelPos.x === before.x && labelPos.y === before.y)) {
            popUndoAction();
        }
    }

    updatePinList();
    redraw();
    resetPinLabelDragState();
}

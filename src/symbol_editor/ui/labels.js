/**
 * @fileoverview Label preview canvas handling for the symbol editor.
 * Manages the orientation preview canvases with drag support.
 */

import {
    getElements,
    getPins,
    getIsDrawing,
    getIsDragging,
    getIsSelecting,
    getMode,
    getArcStage,
    getLabelDragState,
    setLabelDragState,
    getLabelPreviewDirty,
    setLabelPreviewDirty,
    getDefaultValueIsNull,
} from '../state.js';
import { getComponentDimensions, getCompPrefixValue, getCompDefaultValue } from '../dom.js';
import { getRotatedBounds } from '../utils/geometry.js';
import { createPreviewTransform, projectPointForPreview } from '../canvas/transform.js';
import { getPinLabelPosition } from '../elements/pins.js';
import { readLabelInputs as readLabelInputsFromForms } from './forms.js';

/** @type {Array<{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, orientation: number}>} */
let labelPreviewCanvases = [];

/** Hit radius for label marker drag detection */
const LABEL_MARKER_HIT_RADIUS = 10;

/**
 * Initialize the label preview canvases
 */
export function initLabelPreviews() {
    const canvas0 = document.getElementById('labelPreview0');
    const canvas90 = document.getElementById('labelPreview90');
    labelPreviewCanvases = [
        { canvas: canvas0, ctx: canvas0?.getContext('2d'), orientation: 0 },
        { canvas: canvas90, ctx: canvas90?.getContext('2d'), orientation: 90 },
    ].filter(p => p.canvas && p.ctx);

    // Attach pointer event listeners
    labelPreviewCanvases.forEach(preview => {
        preview.markerTargets = [];
        preview.canvas.addEventListener('pointerdown', e => handleLabelPreviewPointerDown(preview, e));
        preview.canvas.addEventListener('pointermove', e => handleLabelPreviewPointerMove(preview, e));
        preview.canvas.addEventListener('pointerup', e => handleLabelPreviewPointerUp(preview, e));
        preview.canvas.addEventListener('pointercancel', e => handleLabelPreviewPointerUp(preview, e));
    });
}

/**
 * Get the label preview canvases
 * @returns {Array} Preview canvas objects
 */
export function getLabelPreviewCanvases() {
    return labelPreviewCanvases;
}

/**
 * Request a label preview update
 * @param {Object} options - Options
 * @param {boolean} options.immediate - Force immediate update
 */
export function requestLabelPreviewUpdate(options = {}) {
    const immediate = options.immediate || false;
    if (immediate) {
        setLabelPreviewDirty(false);
        updateLabelPreviews();
        return;
    }

    const isDrawing = getIsDrawing();
    const isDragging = getIsDragging();
    const isSelecting = getIsSelecting();
    const mode = getMode();
    const arcStage = getArcStage();

    const shouldDefer = isDrawing || isDragging || isSelecting || (mode === 'arc' && arcStage > 0);
    if (shouldDefer) {
        setLabelPreviewDirty(true);
        return;
    }
    setLabelPreviewDirty(false);
    updateLabelPreviews();
}

/**
 * Flush any pending label preview updates
 */
export function flushLabelPreviewUpdates() {
    if (!getLabelPreviewDirty()) return;
    setLabelPreviewDirty(false);
    updateLabelPreviews();
}

/**
 * Resize preview canvases to match their container
 */
export function resizePreviewCanvases() {
    labelPreviewCanvases.forEach(({ canvas }) => {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
            canvas.width = rect.width;
            canvas.height = rect.height;
        }
    });
}

/**
 * Update all label preview canvases
 */
export function updateLabelPreviews() {
    resizePreviewCanvases();
    const { width: compWidth, height: compHeight } = getComponentDimensions();
    const labels = readLabelInputs(compWidth, compHeight);
    labelPreviewCanvases.forEach(preview => {
        drawLabelPreview(preview, labels, compWidth, compHeight);
    });
}

/**
 * Read label position inputs
 * @param {number} width - Component width
 * @param {number} height - Component height
 * @returns {Object} Label positions
 */
function readLabelInputs(width, height) {
    return readLabelInputsFromForms(width, height);
}

/**
 * Draw a single label preview canvas
 * @param {Object} preview - Preview canvas object
 * @param {Object} labels - Label positions
 * @param {number} compWidth - Component width
 * @param {number} compHeight - Component height
 */
function drawLabelPreview(preview, labels, compWidth, compHeight) {
    const { canvas, ctx, orientation } = preview;
    if (!canvas || !ctx || canvas.width === 0 || canvas.height === 0) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const angle = orientation === 90 ? Math.PI / 2 : 0;
    const designator = orientation === 0 ? labels.designator[0] : labels.designator[1];
    const value = orientation === 0 ? labels.value[0] : labels.value[1];
    const extraPoints = [designator, value]
        .filter(Boolean)
        .map(point => ({ point, rotate: false }));
    
    // Lock transform during drag to prevent viewport from chasing the cursor
    const dragState = getLabelDragState();
    const isDragging = dragState && dragState.preview === preview;
    let transform;
    
    if (isDragging && preview.lockedTransform) {
        // Use locked transform during drag
        transform = preview.lockedTransform;
    } else {
        // Create new transform when not dragging
        transform = createPreviewTransform(
            compWidth,
            compHeight,
            angle,
            canvas.width,
            canvas.height,
            extraPoints
        );
        if (!transform) {
            preview.transform = null;
            preview.lockedTransform = null;
            preview.markerTargets = [];
            return;
        }
    }

    preview.transform = transform;
    preview.markerTargets = [];

    // Draw component boundary
    ctx.save();
    ctx.strokeStyle = '#c2c2c2';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(
        transform.offsetX,
        transform.offsetY,
        transform.bounds.width * transform.scale,
        transform.bounds.height * transform.scale
    );
    ctx.restore();

    drawPreviewOrigin(ctx, transform);
    drawPreviewElements(ctx, transform);
    drawPreviewPins(ctx, transform);

    const prefixText = getCompPrefixValue().trim() || 'DES';
    const defaultText = getCompDefaultValue().trim();
    const defaultField = document.getElementById('compDefault');
    const defaultValueIsNull = getDefaultValueIsNull();
    const hideValueMarker = defaultValueIsNull || defaultField?.disabled || defaultText === '';
    const hideDesignatorMarker = !prefixText || prefixText.toUpperCase() === 'GND';
    const orientationIndex = orientation === 0 ? 0 : 1;

    if (!hideDesignatorMarker) {
        drawLabelMarker(ctx, designator, transform, '#1e88e5', prefixText, {
            preview,
            labelType: 'designator',
            orientationIndex
        });
    }
    if (!hideValueMarker) {
        drawLabelMarker(ctx, value, transform, '#43a047', defaultText, {
            preview,
            labelType: 'value',
            orientationIndex
        });
    }
}

/**
 * Draw origin marker on preview
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} transform - Transform data
 */
function drawPreviewOrigin(ctx, transform) {
    const origin = projectPointForPreview({ x: 0, y: 0 }, transform);
    ctx.save();
    ctx.fillStyle = '#666';
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

/**
 * Draw elements on preview canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} transform - Transform data
 */
function drawPreviewElements(ctx, transform) {
    const elements = getElements();
    ctx.save();
    ctx.strokeStyle = '#444';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    elements.forEach(el => {
        const strokeWidth = Math.max(1, ((el.strokeWidth || 4) * transform.scale));
        ctx.lineWidth = strokeWidth;

        if (el.type === 'line') {
            const start = projectPointForPreview({ x: el.x1, y: el.y1 }, transform);
            const end = projectPointForPreview({ x: el.x2, y: el.y2 }, transform);
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
        } else if (el.type === 'circle') {
            const center = projectPointForPreview({ x: el.cx, y: el.cy }, transform);
            const radius = Math.max(1, el.r * transform.scale);
            ctx.beginPath();
            ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
            if (el.filled) {
                ctx.fillStyle = '#000';
                ctx.fill();
            }
            ctx.stroke();
        } else if (el.type === 'arc') {
            const center = projectPointForPreview({ x: el.cx, y: el.cy }, transform);
            const radius = Math.max(1, el.r * transform.scale);
            ctx.beginPath();
            ctx.arc(
                center.x,
                center.y,
                radius,
                el.startAngle + transform.angle,
                el.endAngle + transform.angle
            );
            ctx.stroke();
        } else if (el.type === 'polygon' && el.points) {
            const pts = el.points.map(pt => projectPointForPreview(pt, transform));
            if (pts.length) {
                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y);
                pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
                ctx.closePath();
                if (el.filled) {
                    ctx.fillStyle = '#000';
                    ctx.fill();
                }
                ctx.stroke();
            }
        } else if (el.type === 'polyline' && el.points) {
            const pts = el.points.map(pt => projectPointForPreview(pt, transform));
            if (pts.length) {
                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y);
                pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
                ctx.stroke();
            }
        }
    });
    ctx.restore();
}

/**
 * Draw pins on preview canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} transform - Transform data
 */
function drawPreviewPins(ctx, transform) {
    const pins = getPins();
    ctx.save();

    pins.forEach(pin => {
        const pos = projectPointForPreview(pin.position, transform);
        const scale = transform?.scale || 1;
        const scaleFactor = 0.6; // shrink preview text ~40%
        const pinRadius = Math.max(3, 4 * scale * scaleFactor);
        const idFontSize = Math.max(6, 10 * scale * scaleFactor);
        const labelFontSize = Math.max(6, 9 * scale * scaleFactor);

        ctx.fillStyle = '#ff6600';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pinRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = `bold ${idFontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pin.id, pos.x, pos.y);

        const labelProjected = projectPointForPreview(getPinLabelPosition(pin), transform);
        ctx.fillStyle = '#111';
        ctx.font = `${labelFontSize}px monospace`;
        const labelDeltaX = labelProjected.x - pos.x;
        if (Math.abs(labelDeltaX) < 1) {
            ctx.textAlign = 'center';
        } else {
            ctx.textAlign = labelDeltaX < 0 ? 'right' : 'left';
        }
        ctx.textBaseline = 'middle';
        ctx.fillText(pin.name || pin.id, labelProjected.x, labelProjected.y);
    });
    ctx.restore();
}

/**
 * Draw a label marker on preview
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} point - Label position
 * @param {Object} transform - Transform data
 * @param {string} color - Marker color
 * @param {string} label - Label text
 * @param {Object} options - Additional options
 */
function drawLabelMarker(ctx, point, transform, color, label, options = {}) {
    if (!point) return;
    const projected = projectPointForPreview(point, transform, false);
    const scale = transform?.scale || 1;
    const scaleFactor = 0.6; // shrink preview text ~40%
    const fontSize = Math.max(6, 10 * scale * scaleFactor);
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Render the label directly at the anchor point (no marker dot).
    ctx.fillText(label, projected.x, projected.y);
    ctx.restore();
    if (options.preview && options.preview.markerTargets) {
        options.preview.markerTargets.push({
            type: options.labelType,
            orientationIndex: options.orientationIndex,
            canvasPosition: { x: projected.x, y: projected.y }
        });
    }
}

/**
 * Get canvas point from mouse event
 * @param {HTMLCanvasElement} canvasElement - Canvas element
 * @param {PointerEvent} event - Pointer event
 * @returns {Object|null} Canvas point
 */
function getPreviewCanvasPoint(canvasElement, event) {
    if (!canvasElement) return null;
    const rect = canvasElement.getBoundingClientRect();
    const scaleX = canvasElement.width / rect.width;
    const scaleY = canvasElement.height / rect.height;
    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
    };
}

/**
 * Convert preview canvas point to component coordinates
 * @param {Object} preview - Preview object
 * @param {Object} point - Canvas point
 * @returns {Object|null} Component point
 */
function previewCanvasPointToComponent(preview, point) {
    if (!preview || !preview.transform || !point) return null;
    const transform = preview.transform;
    if (!transform.scale) return null;
    const normalizedX = (point.x - transform.offsetX) / transform.scale;
    const normalizedY = (point.y - transform.offsetY) / transform.scale;
    return {
        x: Math.round(normalizedX + transform.bounds.minX),
        y: Math.round(normalizedY + transform.bounds.minY)
    };
}

/**
 * Set label position input values from preview drag
 * @param {string} labelType - 'designator' or 'value'
 * @param {number} orientationIndex - 0 or 1
 * @param {Object} position - New position
 */
function setLabelPositionFromPreview(labelType, orientationIndex, position) {
    if (!position) return;
    const prefix = labelType === 'value' ? 'valueLabel' : 'designatorLabel';
    const suffix = orientationIndex === 0 ? '0' : '90';
    const xInput = document.getElementById(prefix + suffix + 'X');
    const yInput = document.getElementById(prefix + suffix + 'Y');
    const roundedX = Math.round(position.x);
    const roundedY = Math.round(position.y);
    if (xInput) xInput.value = roundedX;
    if (yInput) yInput.value = roundedY;
}

/**
 * Update label position from canvas drag
 * @param {Object} preview - Preview object
 * @param {Object} dragState - Drag state
 * @param {Object} canvasPoint - Canvas point
 */
function updateLabelPositionFromCanvasPoint(preview, dragState, canvasPoint) {
    if (!dragState) return;
    const componentPoint = previewCanvasPointToComponent(preview, canvasPoint);
    if (!componentPoint) return;
    setLabelPositionFromPreview(dragState.labelType, dragState.orientationIndex, componentPoint);
    requestLabelPreviewUpdate({ immediate: true });
}

/**
 * Handle pointer down on label preview
 * @param {Object} preview - Preview object
 * @param {PointerEvent} event - Pointer event
 */
function handleLabelPreviewPointerDown(preview, event) {
    if (!preview?.canvas || !preview.markerTargets?.length) return;
    const canvasPoint = getPreviewCanvasPoint(preview.canvas, event);
    if (!canvasPoint) return;
    const hit = preview.markerTargets.find(target => {
        const dx = canvasPoint.x - target.canvasPosition.x;
        const dy = canvasPoint.y - target.canvasPosition.y;
        return Math.hypot(dx, dy) <= LABEL_MARKER_HIT_RADIUS;
    });
    if (!hit) return;
    event.preventDefault();
    
    // Lock the transform when drag starts to prevent viewport changes
    preview.lockedTransform = preview.transform;
    
    setLabelDragState({
        preview,
        pointerId: event.pointerId,
        labelType: hit.type,
        orientationIndex: hit.orientationIndex
    });
    preview.canvas.setPointerCapture(event.pointerId);
    updateLabelPositionFromCanvasPoint(preview, getLabelDragState(), canvasPoint);
}

/**
 * Handle pointer move on label preview
 * @param {Object} preview - Preview object
 * @param {PointerEvent} event - Pointer event
 */
function handleLabelPreviewPointerMove(preview, event) {
    const labelDragState = getLabelDragState();
    if (!labelDragState || labelDragState.preview !== preview || labelDragState.pointerId !== event.pointerId) return;
    event.preventDefault();
    const canvasPoint = getPreviewCanvasPoint(preview.canvas, event);
    if (!canvasPoint) return;
    updateLabelPositionFromCanvasPoint(preview, labelDragState, canvasPoint);
}

/**
 * Handle pointer up on label preview
 * @param {Object} preview - Preview object
 * @param {PointerEvent} event - Pointer event
 */
function handleLabelPreviewPointerUp(preview, event) {
    const labelDragState = getLabelDragState();
    if (!labelDragState || labelDragState.preview !== preview || labelDragState.pointerId !== event.pointerId) return;
    if (preview.canvas?.hasPointerCapture?.(event.pointerId)) {
        preview.canvas.releasePointerCapture(event.pointerId);
    }
    event.preventDefault();
    
    // Clear locked transform when drag ends
    preview.lockedTransform = null;
    
    setLabelDragState(null);
    
    // Redraw with updated transform now that drag is complete
    requestLabelPreviewUpdate({ immediate: true });
}

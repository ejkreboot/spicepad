/**
 * @fileoverview Canvas drawing functions for the symbol editor.
 * Handles all rendering to the main canvas and preview canvases.
 */

import { COLORS, DRAWING, MODES, ARC_STAGES } from '../constants.js';
import { getCanvas, getContext, getComponentDimensions, getGridSettings } from '../dom.js';
import {
    getZoomLevel,
    getMode,
    getElements,
    getPins,
    getSelectedElement,
    getSelectedElements,
    getPolygonPoints,
    getPolylinePoints,
    getArcState,
    isSelecting,
    getSelectionRect,
} from '../state.js';
import { getCanvasOffset, componentToCanvas } from './transform.js';
import { getPinLabelPosition } from '../elements/pins.js';
import { requestLabelPreviewUpdate } from '../ui/labels.js';

/**
 * Main redraw function - renders the entire canvas
 */
export function redraw() {
    const canvas = getCanvas();
    const ctx = getContext();
    if (!canvas || !ctx) return;

    const { x: offsetX, y: offsetY, zoom } = getCanvasOffset();
    const { size: gridSize } = getGridSettings();
    const { width: compWidth, height: compHeight } = getComponentDimensions();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    drawGrid(ctx, canvas.width, canvas.height, offsetX, offsetY, gridSize, zoom);

    // Draw component boundary
    drawBoundary(ctx, offsetX, offsetY, compWidth, compHeight, zoom);

    // Draw anchor marker at bounding box center
    drawAnchorMarker(ctx, offsetX, offsetY, compWidth, compHeight, zoom);

    // Draw origin marker
    drawOriginMarker(ctx, offsetX, offsetY);

    // Draw elements
    const elements = getElements();
    const selectedElement = getSelectedElement();
    const selectedElements = getSelectedElements();

    elements.forEach((el, idx) => {
        const isSelected = selectedElement === idx || selectedElements.has(idx);
        drawElement(ctx, el, isSelected, zoom, offsetX, offsetY);
    });

    // Draw pins
    drawPins(ctx, zoom);

    // Draw polygon in progress
    const mode = getMode();
    const polygonPoints = getPolygonPoints();
    if (mode === MODES.POLYGON && polygonPoints.length > 0) {
        drawPolygonInProgress(ctx, polygonPoints);
    }

    // Draw polyline in progress
    const polylinePoints = getPolylinePoints();
    if (mode === MODES.POLYLINE && polylinePoints.length > 0) {
        drawPolylineInProgress(ctx, polylinePoints);
    }

    // Draw arc construction preview
    drawArcConstructionPreview(ctx);

    // Draw selection rectangle
    if (isSelecting()) {
        const selectionRect = getSelectionRect();
        if (selectionRect) {
            drawSelectionRect(ctx, selectionRect);
        }
    }

    // Request label preview update
    requestLabelPreviewUpdate();
}

/**
 * Draw the grid
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {number} offsetX
 * @param {number} offsetY
 * @param {number} gridSize
 * @param {number} zoom
 */
function drawGrid(ctx, canvasWidth, canvasHeight, offsetX, offsetY, gridSize, zoom) {
    ctx.strokeStyle = COLORS.GRID;
    ctx.lineWidth = DRAWING.GRID_LINE_WIDTH;

    const gridZoom = gridSize * zoom;
    const startX = offsetX % gridZoom;
    const startY = offsetY % gridZoom;

    for (let x = startX; x < canvasWidth; x += gridZoom) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
    }

    for (let y = startY; y < canvasHeight; y += gridZoom) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
        ctx.stroke();
    }
}

/**
 * Draw the component boundary
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} offsetX
 * @param {number} offsetY
 * @param {number} compWidth
 * @param {number} compHeight
 * @param {number} zoom
 */
function drawBoundary(ctx, offsetX, offsetY, compWidth, compHeight, zoom) {
    ctx.strokeStyle = COLORS.BOUNDARY;
    ctx.lineWidth = DRAWING.BOUNDARY_LINE_WIDTH;
    ctx.setLineDash(DRAWING.BOUNDARY_DASH);
    ctx.strokeRect(offsetX, offsetY, compWidth * zoom, compHeight * zoom);
    ctx.setLineDash([]);
}

/**
 * Draw the anchor marker at component center
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} offsetX
 * @param {number} offsetY
 * @param {number} compWidth
 * @param {number} compHeight
 * @param {number} zoom
 */
function drawAnchorMarker(ctx, offsetX, offsetY, compWidth, compHeight, zoom) {
    const anchorX = offsetX + (compWidth * zoom) / 2;
    const anchorY = offsetY + (compHeight * zoom) / 2;
    const anchorHalfSize = Math.max(4, Math.min(12, 6 * zoom)) / 2;

    ctx.strokeStyle = COLORS.ANCHOR_MARKER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(anchorX - anchorHalfSize, anchorY - anchorHalfSize);
    ctx.lineTo(anchorX + anchorHalfSize, anchorY + anchorHalfSize);
    ctx.moveTo(anchorX - anchorHalfSize, anchorY + anchorHalfSize);
    ctx.lineTo(anchorX + anchorHalfSize, anchorY - anchorHalfSize);
    ctx.stroke();
}

/**
 * Draw the origin marker
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} offsetX
 * @param {number} offsetY
 */
function drawOriginMarker(ctx, offsetX, offsetY) {
    ctx.fillStyle = COLORS.ORIGIN_MARKER;
    ctx.beginPath();
    ctx.arc(offsetX, offsetY, DRAWING.ORIGIN_RADIUS, 0, Math.PI * 2);
    ctx.fill();
}

/**
 * Draw a single element
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} element
 * @param {boolean} isSelected
 * @param {number} zoom
 * @param {number} offsetX
 * @param {number} offsetY
 */
export function drawElement(ctx, element, isSelected, zoom, offsetX, offsetY) {
    ctx.strokeStyle = isSelected ? COLORS.ELEMENT_SELECTED : COLORS.ELEMENT;
    ctx.fillStyle = element.filled ? (isSelected ? COLORS.ELEMENT_SELECTED : COLORS.ELEMENT) : 'transparent';
    ctx.lineWidth = (element.strokeWidth || 4) * zoom;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (element.type === 'line') {
        const start = componentToCanvas(element.x1, element.y1);
        const end = componentToCanvas(element.x2, element.y2);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
    } else if (element.type === 'circle') {
        const center = componentToCanvas(element.cx, element.cy);
        ctx.beginPath();
        ctx.arc(center.x, center.y, element.r * zoom, 0, Math.PI * 2);
        if (element.filled) ctx.fill();
        ctx.stroke();
    } else if (element.type === 'arc') {
        const center = componentToCanvas(element.cx, element.cy);
        ctx.beginPath();
        ctx.arc(center.x, center.y, element.r * zoom, element.startAngle, element.endAngle);
        ctx.stroke();
    } else if (element.type === 'polygon' && element.points?.length > 0) {
        ctx.beginPath();
        const first = componentToCanvas(element.points[0].x, element.points[0].y);
        ctx.moveTo(first.x, first.y);
        element.points.forEach(pt => {
            const p = componentToCanvas(pt.x, pt.y);
            ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        if (element.filled) ctx.fill();
        ctx.stroke();
    } else if (element.type === 'polyline' && element.points?.length > 0) {
        ctx.beginPath();
        const first = componentToCanvas(element.points[0].x, element.points[0].y);
        ctx.moveTo(first.x, first.y);
        element.points.forEach(pt => {
            const p = componentToCanvas(pt.x, pt.y);
            ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
    }
}

/**
 * Draw all pins
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} zoom
 */
function drawPins(ctx, zoom) {
    const pins = getPins();

    pins.forEach(pin => {
        const pos = componentToCanvas(pin.position.x, pin.position.y);

        // Pin circle
        ctx.fillStyle = COLORS.PIN;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, DRAWING.PIN_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        // Pin ID
        ctx.fillStyle = COLORS.PIN_TEXT;
        ctx.font = `bold ${DRAWING.PIN_FONT_SIZE}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pin.id, pos.x, pos.y);

        // Pin label
        const labelPos = getPinLabelPosition(pin);
        const labelCanvas = componentToCanvas(labelPos.x, labelPos.y);
        const fontSize = Math.max(9, Math.min(18, 10 + zoom * 1.2));
        ctx.fillStyle = COLORS.PIN_LABEL;
        ctx.font = `${fontSize}px monospace`;
        const labelDeltaX = labelCanvas.x - pos.x;
        if (Math.abs(labelDeltaX) < 1) {
            ctx.textAlign = 'center';
        } else {
            ctx.textAlign = labelDeltaX < 0 ? 'right' : 'left';
        }
        ctx.textBaseline = 'middle';
        ctx.fillText(pin.name || pin.id, labelCanvas.x, labelCanvas.y);
    });
}

/**
 * Draw polygon being constructed
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x: number, y: number}>} points
 */
function drawPolygonInProgress(ctx, points) {
    ctx.strokeStyle = COLORS.ELEMENT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const first = componentToCanvas(points[0].x, points[0].y);
    ctx.moveTo(first.x, first.y);
    points.forEach(pt => {
        const p = componentToCanvas(pt.x, pt.y);
        ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
}

/**
 * Draw polyline being constructed
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x: number, y: number}>} points
 */
function drawPolylineInProgress(ctx, points) {
    ctx.strokeStyle = COLORS.ELEMENT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const first = componentToCanvas(points[0].x, points[0].y);
    ctx.moveTo(first.x, first.y);
    points.forEach(pt => {
        const p = componentToCanvas(pt.x, pt.y);
        ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
}

/**
 * Draw arc construction preview
 * @param {CanvasRenderingContext2D} ctx
 */
function drawArcConstructionPreview(ctx) {
    const mode = getMode();
    const arcState = getArcState();

    if (mode !== MODES.ARC || arcState.stage === ARC_STAGES.IDLE || !arcState.center) return;

    const { zoom } = getCanvasOffset();
    const centerCanvas = componentToCanvas(arcState.center.x, arcState.center.y);

    ctx.save();
    ctx.strokeStyle = COLORS.ARC_PREVIEW;
    ctx.fillStyle = COLORS.ARC_PREVIEW;
    ctx.lineWidth = 1;
    ctx.setLineDash(DRAWING.PREVIEW_DASH);

    // Draw center point
    ctx.beginPath();
    ctx.arc(centerCanvas.x, centerCanvas.y, 3, 0, Math.PI * 2);
    ctx.fill();

    if (arcState.stage === ARC_STAGES.CENTER_CHOSEN && arcState.previewPoint) {
        // Draw radius line
        const previewCanvas = componentToCanvas(arcState.previewPoint.x, arcState.previewPoint.y);
        ctx.beginPath();
        ctx.moveTo(centerCanvas.x, centerCanvas.y);
        ctx.lineTo(previewCanvas.x, previewCanvas.y);
        ctx.stroke();

        // Draw preview circle
        const radius = Math.sqrt(
            Math.pow(arcState.previewPoint.x - arcState.center.x, 2) +
            Math.pow(arcState.previewPoint.y - arcState.center.y, 2)
        );
        if (radius > 0) {
            ctx.beginPath();
            ctx.arc(centerCanvas.x, centerCanvas.y, radius * zoom, 0, Math.PI * 2);
            ctx.stroke();
        }
    } else if (arcState.stage === ARC_STAGES.RADIUS_CHOSEN && arcState.radius) {
        // Draw start radius line
        const startPoint = {
            x: arcState.center.x + Math.cos(arcState.startAngle) * arcState.radius,
            y: arcState.center.y + Math.sin(arcState.startAngle) * arcState.radius,
        };
        const startCanvas = componentToCanvas(startPoint.x, startPoint.y);
        ctx.beginPath();
        ctx.moveTo(centerCanvas.x, centerCanvas.y);
        ctx.lineTo(startCanvas.x, startCanvas.y);
        ctx.stroke();

        // Draw preview arc
        const endAngle = arcState.previewPoint
            ? Math.atan2(arcState.previewPoint.y - arcState.center.y, arcState.previewPoint.x - arcState.center.x)
            : arcState.startAngle;
        ctx.beginPath();
        ctx.arc(centerCanvas.x, centerCanvas.y, arcState.radius * zoom, arcState.startAngle, endAngle);
        ctx.stroke();
    }

    ctx.restore();
}

/**
 * Draw selection rectangle
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x1: number, y1: number, x2: number, y2: number}} rect
 */
function drawSelectionRect(ctx, rect) {
    const start = componentToCanvas(rect.x1, rect.y1);
    const end = componentToCanvas(rect.x2, rect.y2);

    ctx.strokeStyle = COLORS.SELECTION_RECT;
    ctx.fillStyle = COLORS.SELECTION_FILL;
    ctx.lineWidth = 1;
    ctx.setLineDash(DRAWING.BOUNDARY_DASH);
    ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    ctx.setLineDash([]);
}

/**
 * Draw drawing preview (line/circle being drawn)
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} mode
 * @param {{x: number, y: number}} drawStart
 * @param {{x: number, y: number}} currentPos
 */
export function drawDrawingPreview(ctx, mode, drawStart, currentPos) {
    const { zoom } = getCanvasOffset();
    const start = componentToCanvas(drawStart.x, drawStart.y);
    const end = componentToCanvas(currentPos.x, currentPos.y);

    ctx.strokeStyle = COLORS.PREVIEW_STROKE;
    ctx.lineWidth = 2;
    ctx.setLineDash(DRAWING.BOUNDARY_DASH);

    if (mode === MODES.LINE) {
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
    } else if (mode === MODES.CIRCLE) {
        const radius = Math.sqrt(
            Math.pow(currentPos.x - drawStart.x, 2) +
            Math.pow(currentPos.y - drawStart.y, 2)
        );
        ctx.beginPath();
        ctx.arc(start.x, start.y, radius * zoom, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.setLineDash([]);
}

/**
 * Resize the canvas to fit its container
 */
export function resizeCanvas() {
    const canvas = getCanvas();
    if (!canvas) return;

    const wrapper = canvas.parentElement;
    canvas.width = wrapper.clientWidth;
    canvas.height = wrapper.clientHeight;
    redraw();
}

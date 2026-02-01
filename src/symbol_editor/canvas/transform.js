/**
 * @fileoverview Coordinate transform functions for the symbol editor.
 * Handles conversion between canvas and component coordinate spaces.
 */

import { getCanvas, getComponentDimensions, getGridSettings } from '../dom.js';
import { getZoomLevel } from '../state.js';
import { getRotatedBounds, rotatePointAroundCenter } from '../utils/geometry.js';

/**
 * Get the canvas offset and zoom for rendering
 * @returns {{x: number, y: number, zoom: number}}
 */
export function getCanvasOffset() {
    const canvas = getCanvas();
    const zoom = getZoomLevel();
    const { width: compWidth, height: compHeight } = getComponentDimensions();

    // Center the component with some padding
    const offsetX = (canvas.width - compWidth * zoom) / 2;
    const offsetY = (canvas.height - compHeight * zoom) / 2;

    return { x: offsetX, y: offsetY, zoom };
}

/**
 * Convert canvas coordinates to component coordinates
 * @param {number} canvasX - X coordinate in canvas space
 * @param {number} canvasY - Y coordinate in canvas space
 * @param {Object} [options]
 * @param {boolean} [options.snap] - Whether to snap to grid (uses settings if undefined)
 * @returns {{x: number, y: number}} Coordinates in component space
 */
export function canvasToComponent(canvasX, canvasY, options = {}) {
    const { x: offsetX, y: offsetY, zoom } = getCanvasOffset();
    const { size: gridSize, snap: snapSetting } = getGridSettings();
    const shouldSnap = options.snap !== undefined ? options.snap : snapSetting;

    let compX = (canvasX - offsetX) / zoom;
    let compY = (canvasY - offsetY) / zoom;

    // Snap to grid if enabled
    if (shouldSnap) {
        compX = Math.round(compX / gridSize) * gridSize;
        compY = Math.round(compY / gridSize) * gridSize;
    }

    return { x: compX, y: compY };
}

/**
 * Convert component coordinates to canvas coordinates
 * @param {number} compX - X coordinate in component space
 * @param {number} compY - Y coordinate in component space
 * @returns {{x: number, y: number}} Coordinates in canvas space
 */
export function componentToCanvas(compX, compY) {
    const { x: offsetX, y: offsetY, zoom } = getCanvasOffset();
    return {
        x: compX * zoom + offsetX,
        y: compY * zoom + offsetY,
    };
}

/**
 * Get canvas position from a mouse event
 * @param {MouseEvent} event - Mouse event
 * @returns {{canvasX: number, canvasY: number}}
 */
export function getCanvasPosition(event) {
    const canvas = getCanvas();
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        canvasX: (event.clientX - rect.left) * scaleX,
        canvasY: (event.clientY - rect.top) * scaleY,
    };
}

/**
 * Get component position from a mouse event
 * @param {MouseEvent} event - Mouse event
 * @param {Object} [options]
 * @param {boolean} [options.snap] - Whether to snap to grid
 * @returns {{x: number, y: number}}
 */
export function getComponentPosition(event, options = {}) {
    const { canvasX, canvasY } = getCanvasPosition(event);
    return canvasToComponent(canvasX, canvasY, options);
}

/**
 * Create a preview transform for label preview canvases
 * @param {number} width - Component width
 * @param {number} height - Component height
 * @param {number} angle - Rotation angle
 * @param {number} canvasWidth - Canvas width
 * @param {number} canvasHeight - Canvas height
 * @param {Array<{point: {x: number, y: number}, rotate?: boolean}>} [extraPoints=[]] - Extra points to include in bounds
 * @returns {{angle: number, width: number, height: number, bounds: Object, scale: number, offsetX: number, offsetY: number}|null}
 */
export function createPreviewTransform(width, height, angle, canvasWidth, canvasHeight, extraPoints = []) {
    if (!width || !height || !canvasWidth || !canvasHeight) return null;

    const bounds = getRotatedBounds(width, height, angle, extraPoints);
    
    // Expand bounds by 25% in each direction (results in 150% total size)
    const expandX = bounds.width * 0.25;
    const expandY = bounds.height * 0.25;
    const expandedBounds = {
        minX: bounds.minX - expandX,
        minY: bounds.minY - expandY,
        maxX: bounds.maxX + expandX,
        maxY: bounds.maxY + expandY,
        width: bounds.width + expandX * 2,
        height: bounds.height + expandY * 2,
    };
    
    const padding = 12;
    const usableWidth = Math.max(canvasWidth - padding * 2, 10);
    const usableHeight = Math.max(canvasHeight - padding * 2, 10);
    const scale = Math.min(
        usableWidth / (expandedBounds.width || 1),
        usableHeight / (expandedBounds.height || 1)
    );
    const offsetX = (canvasWidth - expandedBounds.width * scale) / 2;
    const offsetY = (canvasHeight - expandedBounds.height * scale) / 2;

    return { angle, width, height, bounds: expandedBounds, scale, offsetX, offsetY };
}

/**
 * Project a point for preview rendering
 * @param {{x: number, y: number}} point - Point to project
 * @param {Object} transform - Transform from createPreviewTransform
 * @param {boolean} [rotatePoint=true] - Whether to rotate the point
 * @returns {{x: number, y: number}}
 */
export function projectPointForPreview(point, transform, rotatePoint = true) {
    if (!point) return { x: 0, y: 0 };

    const source = rotatePoint
        ? rotatePointAroundCenter(point, transform.angle, transform.width, transform.height)
        : { x: point.x, y: point.y };

    const normalizedX = source.x - transform.bounds.minX;
    const normalizedY = source.y - transform.bounds.minY;

    return {
        x: transform.offsetX + normalizedX * transform.scale,
        y: transform.offsetY + normalizedY * transform.scale,
    };
}

/**
 * Get preview canvas point from pointer event
 * @param {HTMLCanvasElement} canvasElement - Canvas element
 * @param {PointerEvent} event - Pointer event
 * @returns {{x: number, y: number}|null}
 */
export function getPreviewCanvasPoint(canvasElement, event) {
    if (!canvasElement) return null;
    const rect = canvasElement.getBoundingClientRect();
    const scaleX = canvasElement.width / rect.width;
    const scaleY = canvasElement.height / rect.height;
    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY,
    };
}

/**
 * Convert preview canvas point to component coordinates
 * @param {Object} preview - Preview canvas object with transform
 * @param {{x: number, y: number}} point - Canvas point
 * @returns {{x: number, y: number}|null}
 */
export function previewCanvasPointToComponent(preview, point) {
    if (!preview || !preview.transform || !point) return null;

    const transform = preview.transform;
    if (!transform.scale) return null;

    const normalizedX = (point.x - transform.offsetX) / transform.scale;
    const normalizedY = (point.y - transform.offsetY) / transform.scale;

    return {
        x: Math.round(normalizedX + transform.bounds.minX),
        y: Math.round(normalizedY + transform.bounds.minY),
    };
}

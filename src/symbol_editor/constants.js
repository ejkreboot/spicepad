/**
 * @fileoverview Constants and configuration values for the symbol editor.
 * Centralizes all magic numbers, colors, and default settings.
 */

/**
 * Default component and canvas dimensions
 * @constant
 */
export const DEFAULTS = {
    COMPONENT_WIDTH: 80,
    COMPONENT_HEIGHT: 40,
    STROKE_WIDTH: 4,
    GRID_SIZE: 10,
    ZOOM: {
        MIN: 1,
        MAX: 10,
        DEFAULT: 3,
    },
};

/**
 * Color palette for canvas drawing
 * @constant
 */
export const COLORS = {
    GRID: '#d1fae5',
    BOUNDARY: '#999',
    BOUNDARY_PREVIEW: '#c2c2c2',
    ELEMENT: '#333',
    ELEMENT_SELECTED: '#ff0000',
    PIN: '#ff6600',
    PIN_TEXT: '#fff',
    PIN_LABEL: '#111',
    SELECTION_RECT: '#0066ff',
    SELECTION_FILL: 'rgba(0, 102, 255, 0.1)',
    PREVIEW_STROKE: '#666',
    ARC_PREVIEW: '#0066ff',
    ORIGIN_MARKER: '#666',
    ANCHOR_MARKER: '#888',
    PREVIEW_ELEMENT: '#444',
    LABEL_DESIGNATOR: '#1e88e5',
    LABEL_VALUE: '#43a047',
};

/**
 * Component type identifiers
 * @constant
 */
export const COMPONENT_TYPES = {
    PRIMITIVE: 'primitive',
    SUBCIRCUIT: 'subcircuit',
};

/**
 * Hit detection thresholds in pixels and component units
 * @constant
 */
export const HIT_DETECTION = {
    DEFAULT_PIXELS: 4,
    MIN_COMPONENT_UNITS: 1.5,
    MAX_COMPONENT_UNITS: 8,
    PIN_PIXELS: 8,
    PIN_LABEL_PIXELS: 6,
    ELEMENT_PIXELS: 3,
    VERTEX_PIXELS: 4,
    VERTEX_MIN_UNITS: 2,
};

/**
 * Pin label positioning constants
 * @constant
 */
export const PIN_LABEL = {
    DEFAULT_OFFSET: { x: 12, y: -12 },
    BASE_OFFSET: 3,
};

/**
 * Label marker constants for preview canvases
 * @constant
 */
export const LABEL_MARKER = {
    HIT_RADIUS: 10,
    SCALE_FACTOR: 0.6,
};

/**
 * Drawing constants
 * @constant
 */
export const DRAWING = {
    GRID_LINE_WIDTH: 0.25,
    BOUNDARY_LINE_WIDTH: 1,
    BOUNDARY_DASH: [5, 5],
    PREVIEW_DASH: [4, 4],
    ORIGIN_RADIUS: 4,
    PIN_RADIUS: 6,
    PIN_FONT_SIZE: 10,
    PREVIEW_PIN_RADIUS: 4,
    PREVIEW_PIN_FONT_SIZE: 10,
    PREVIEW_LABEL_FONT_SIZE: 9,
    PREVIEW_PADDING: 12,
};

/**
 * Editor modes
 * @constant
 */
export const MODES = {
    SELECT: 'select',
    LINE: 'line',
    CIRCLE: 'circle',
    ARC: 'arc',
    POLYGON: 'polygon',
    POLYLINE: 'polyline',
    PIN: 'pin',
};

/**
 * Arc construction stages
 * @constant
 */
export const ARC_STAGES = {
    IDLE: 0,
    CENTER_CHOSEN: 1,
    RADIUS_CHOSEN: 2,
};

/**
 * Maximum undo stack size
 * @constant
 */
export const MAX_UNDO_STACK = 50;

/**
 * Clamp zoom level to valid range
 * @param {number} value - Zoom level to clamp
 * @returns {number} Clamped zoom level
 */
export function clampZoom(value) {
    return Math.min(DEFAULTS.ZOOM.MAX, Math.max(DEFAULTS.ZOOM.MIN, value));
}

/**
 * Undo action types
 * @constant
 */
export const UNDO_TYPES = {
    CREATE: 'create',
    DELETE: 'delete',
    MOVE: 'move',
    MULTI_MOVE: 'multi-move',
    MOVE_PIN: 'move-pin',
    MOVE_PIN_LABEL: 'move-pin-label',
};

/**
 * Preview canvas orientations
 * @constant
 */
export const ORIENTATIONS = {
    HORIZONTAL: 0,
    VERTICAL: 90,
};

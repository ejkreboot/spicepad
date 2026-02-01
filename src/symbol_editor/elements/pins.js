/**
 * @fileoverview Pin management for the symbol editor.
 * Handles pin creation, manipulation, and normalization.
 */

import { PIN_LABEL, HIT_DETECTION } from '../constants.js';
import { getPins, addPin as addPinToState, removePinAt, getPin } from '../state.js';
import { getComponentDimensions, getGridSettings } from '../dom.js';
import { getCanvasOffset } from '../canvas/transform.js';
import { updatePinList } from '../ui/lists.js';
import { redraw } from '../canvas/drawing.js';
import { markCurrentComponentDirty } from '../ui/forms.js';

/**
 * Get pin label offset based on pin position relative to component center
 * @param {Object} pin - Pin object with position
 * @returns {{x: number, y: number}}
 */
export function getPinLabelOffset(pin) {
    const px = pin?.position?.x ?? 0;
    const py = pin?.position?.y ?? 0;
    const { width: compWidth, height: compHeight } = getComponentDimensions();
    const centerX = compWidth / 2;
    const centerY = compHeight / 2;

    const deltaX = centerX - px;
    const deltaY = centerY - py;

    const offsetX = Math.abs(deltaX) < PIN_LABEL.BASE_OFFSET
        ? PIN_LABEL.BASE_OFFSET
        : (deltaX > 0 ? PIN_LABEL.BASE_OFFSET : -PIN_LABEL.BASE_OFFSET);

    const offsetY = Math.abs(deltaY) < PIN_LABEL.BASE_OFFSET
        ? -PIN_LABEL.BASE_OFFSET
        : (deltaY > 0 ? PIN_LABEL.BASE_OFFSET : -PIN_LABEL.BASE_OFFSET);

    return { x: offsetX, y: offsetY };
}

/**
 * Get default pin label position based on pin position
 * @param {Object} pin - Pin object with position
 * @returns {{x: number, y: number}}
 */
export function getDefaultPinLabelPosition(pin) {
    const source = pin?.position || { x: 0, y: 0 };
    const offset = getPinLabelOffset(pin);
    return {
        x: Math.round(source.x + offset.x),
        y: Math.round(source.y + offset.y),
    };
}

/**
 * Ensure pin has a valid label position, creating one if needed
 * @param {Object} pin - Pin object
 * @returns {{x: number, y: number}} Label position
 */
export function ensurePinLabelPosition(pin) {
    if (!pin) return { x: 0, y: 0 };
    if (!pin.labelPosition || !Number.isFinite(pin.labelPosition.x) || !Number.isFinite(pin.labelPosition.y)) {
        pin.labelPosition = getDefaultPinLabelPosition(pin);
    }
    return pin.labelPosition;
}

/**
 * Get pin label position
 * @param {Object} pin - Pin object
 * @returns {{x: number, y: number}}
 */
export function getPinLabelPosition(pin) {
    const label = ensurePinLabelPosition(pin);
    return { x: label.x, y: label.y };
}

/**
 * Normalize a pin object to ensure all required fields are present
 * @param {Object} pin - Pin to normalize
 * @param {number} index - Pin index (used for default ID)
 * @returns {Object} Normalized pin
 */
export function normalizePin(pin, index) {
    const baseId = pin?.id || String(index + 1);
    const x = Number.isFinite(pin?.position?.x) ? pin.position.x : 0;
    const y = Number.isFinite(pin?.position?.y) ? pin.position.y : 0;

    const normalized = {
        id: baseId,
        name: pin?.name || baseId,
        position: { x, y },
    };

    const labelSource = pin?.labelPosition;
    const defaultOffset = getPinLabelOffset({ position: { x, y } });
    const labelX = Number.isFinite(labelSource?.x) ? labelSource.x : x + defaultOffset.x;
    const labelY = Number.isFinite(labelSource?.y) ? labelSource.y : y + defaultOffset.y;
    normalized.labelPosition = { x: Math.round(labelX), y: Math.round(labelY) };

    return normalized;
}

/**
 * Normalize an array of pins
 * @param {Array} pinList - Array of pins
 * @returns {Array} Normalized pins
 */
export function normalizePins(pinList) {
    if (!Array.isArray(pinList)) return [];
    return pinList.map((pin, index) => normalizePin(pin, index));
}

/**
 * Add a pin at a specific position
 * @param {{x: number, y: number}} pos - Position to add pin
 */
export function addPinAtPosition(pos) {
    const pins = getPins();
    const id = (pins.length + 1).toString();
    addPinToState(normalizePin({
        id,
        name: id,
        position: { x: pos.x, y: pos.y },
    }, pins.length));
    updatePinList();
    redraw();
    markCurrentComponentDirty();
}

/**
 * Add a pin manually (at origin)
 */
export function addPinManual() {
    const pins = getPins();
    const id = (pins.length + 1).toString();
    addPinToState(normalizePin({
        id,
        name: id,
        position: { x: 0, y: 0 },
    }, pins.length));
    updatePinList();
    redraw();
    markCurrentComponentDirty();
}

/**
 * Update a pin property
 * @param {number} idx - Pin index
 * @param {string} prop - Property to update ('name', 'x', 'y', 'labelX', 'labelY')
 * @param {string|number} value - New value
 */
export function updatePin(idx, prop, value) {
    const pin = getPin(idx);
    if (!pin) return;

    if (prop === 'name') {
        pin.name = value;
    } else if (prop === 'x' || prop === 'y') {
        const parsed = parseInt(value, 10);
        if (!Number.isFinite(parsed)) return;
        const axis = prop === 'x' ? 'x' : 'y';
        const delta = parsed - pin.position[axis];
        pin.position[axis] = parsed;
        const label = ensurePinLabelPosition(pin);
        label[axis] = Math.round(label[axis] + delta);
    } else if (prop === 'labelX' || prop === 'labelY') {
        const parsed = parseInt(value, 10);
        if (!Number.isFinite(parsed)) return;
        const label = ensurePinLabelPosition(pin);
        if (prop === 'labelX') {
            label.x = parsed;
        } else {
            label.y = parsed;
        }
    }

    updatePinList();
    redraw();
    markCurrentComponentDirty();
}

/**
 * Remove a pin at index
 * @param {number} idx - Pin index
 */
export function removePin(idx) {
    removePinAt(idx);
    // Renumber pins
    const pins = getPins();
    pins.forEach((p, i) => {
        p.id = (i + 1).toString();
    });
    updatePinList();
    redraw();
    markCurrentComponentDirty();
}

/**
 * Get hit threshold based on zoom level
 * @param {number} [targetPixels=8]
 * @param {Object} [options]
 * @returns {number}
 */
function getHitThreshold(targetPixels = 8, options = {}) {
    const { zoom } = getCanvasOffset();
    const safeZoom = Math.max(zoom, 0.1);
    const minComponentUnits = options.min || 2;
    const maxComponentUnits = options.max || 12;
    const converted = targetPixels / safeZoom;
    return Math.max(minComponentUnits, Math.min(maxComponentUnits, converted));
}

/**
 * Find pin near a position
 * @param {{x: number, y: number}} pos
 * @returns {number} Pin index or -1 if not found
 */
export function findPinNearPosition(pos) {
    if (!pos) return -1;
    const pins = getPins();
    if (!pins.length) return -1;

    const threshold = getHitThreshold(HIT_DETECTION.PIN_PIXELS, { min: 2, max: 12 });

    for (let i = pins.length - 1; i >= 0; i--) {
        const pinPos = pins[i]?.position;
        if (!pinPos) continue;
        const dist = Math.hypot(pinPos.x - pos.x, pinPos.y - pos.y);
        if (dist <= threshold) {
            return i;
        }
    }
    return -1;
}

/**
 * Find pin label near a position
 * @param {{x: number, y: number}} pos
 * @returns {number} Pin index or -1 if not found
 */
export function findPinLabelNearPosition(pos) {
    if (!pos) return -1;
    const pins = getPins();
    if (!pins.length) return -1;

    const threshold = getHitThreshold(HIT_DETECTION.PIN_LABEL_PIXELS, { min: 2, max: 12 });

    for (let i = pins.length - 1; i >= 0; i--) {
        const labelPos = getPinLabelPosition(pins[i]);
        const dist = Math.hypot(labelPos.x - pos.x, labelPos.y - pos.y);
        if (dist <= threshold) {
            return i;
        }
    }
    return -1;
}

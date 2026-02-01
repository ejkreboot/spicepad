/**
 * @fileoverview Undo/redo stack management for the symbol editor.
 * Provides action recording and history navigation.
 */

import { MAX_UNDO_STACK, UNDO_TYPES } from './constants.js';
import {
    getUndoStack,
    popUndoAction,
    pushUndoAction,
    clearUndoStack,
    getElements,
    setElements,
    getPins,
    setPins,
    getSelectedElementsSet,
    clearSelectedElements,
    setSelectedElement,
} from './state.js';
import { redraw } from './canvas/drawing.js';
import { updateElementList, updatePinList } from './ui/lists.js';

/**
 * Record an action to the undo stack
 * @param {string} type - The type of action (from UNDO_TYPES)
 * @param {Object} data - Action-specific data for undoing
 */
export function recordAction(type, data) {
    const stack = getUndoStack();
    if (stack.length >= MAX_UNDO_STACK) {
        stack.shift();
    }
    pushUndoAction({ type, data });
}

/**
 * Undo the last action
 */
export function undo() {
    const action = popUndoAction();
    if (!action) return;

    switch (action.type) {
        case UNDO_TYPES.ADD_ELEMENT:
            // Remove the added element
            setElements(getElements().filter(el => el !== action.data.element));
            updateElementList();
            break;

        case UNDO_TYPES.DELETE_ELEMENTS: {
            // Restore deleted elements at their original indices
            const elements = getElements().slice();
            action.data.items.forEach(({ element, index }) => {
                elements.splice(index, 0, element);
            });
            setElements(elements);
            updateElementList();
            break;
        }

        case UNDO_TYPES.MOVE_ELEMENT:
            // Restore previous position
            action.data.element.x1 = action.data.prevX1;
            action.data.element.y1 = action.data.prevY1;
            if (action.data.prevX2 !== undefined) {
                action.data.element.x2 = action.data.prevX2;
                action.data.element.y2 = action.data.prevY2;
            }
            break;

        case UNDO_TYPES.MOVE_MULTIPLE: {
            // Restore all elements to previous positions
            action.data.items.forEach(item => {
                item.element.x1 = item.prevX1;
                item.element.y1 = item.prevY1;
                if (item.prevX2 !== undefined) {
                    item.element.x2 = item.prevX2;
                    item.element.y2 = item.prevY2;
                }
            });
            break;
        }

        case UNDO_TYPES.RESIZE_ELEMENT:
            action.data.element.x1 = action.data.prevX1;
            action.data.element.y1 = action.data.prevY1;
            action.data.element.x2 = action.data.prevX2;
            action.data.element.y2 = action.data.prevY2;
            if (action.data.element.type === 'circle') {
                action.data.element.radius = action.data.prevRadius;
            }
            break;

        case UNDO_TYPES.ADD_VERTEX:
            // Remove the added vertex
            if (action.data.element.points && action.data.vertexIndex !== undefined) {
                action.data.element.points.splice(action.data.vertexIndex, 1);
            }
            break;

        case UNDO_TYPES.MOVE_VERTEX:
            // Restore previous vertex position
            if (action.data.element.points && action.data.vertexIndex !== undefined) {
                action.data.element.points[action.data.vertexIndex] = { ...action.data.prevPosition };
            }
            break;

        case UNDO_TYPES.DELETE_VERTEX:
            // Re-insert the deleted vertex
            if (action.data.element.points && action.data.vertexIndex !== undefined) {
                action.data.element.points.splice(action.data.vertexIndex, 0, { ...action.data.prevPosition });
            }
            break;

        case UNDO_TYPES.ADD_PIN:
            // Remove the added pin
            setPins(getPins().filter(p => p !== action.data.pin));
            updatePinList();
            break;

        case UNDO_TYPES.DELETE_PIN:
            // Restore the deleted pin
            const pins = getPins().slice();
            pins.splice(action.data.index, 0, action.data.pin);
            setPins(pins);
            updatePinList();
            break;

        case UNDO_TYPES.MOVE_PIN:
            action.data.pin.position.x = action.data.prevX;
            action.data.pin.position.y = action.data.prevY;
            updatePinList();
            break;

        default:
            console.warn('Unknown undo action type:', action.type);
            return;
    }

    // Clear selection and redraw
    clearSelectedElements();
    setSelectedElement(null);
    redraw();
}

/**
 * Check if undo is available
 * @returns {boolean} True if there are actions to undo
 */
export function canUndo() {
    return getUndoStack().length > 0;
}

/**
 * Get the current undo stack length
 * @returns {number} Number of actions in undo stack
 */
export function getUndoStackLength() {
    return getUndoStack().length;
}

/**
 * Clear all undo history
 */
export function clearHistory() {
    clearUndoStack();
}

// Re-export for modules that need direct stack access
export { getUndoStack, popUndoAction, clearUndoStack };
export { UNDO_TYPES };

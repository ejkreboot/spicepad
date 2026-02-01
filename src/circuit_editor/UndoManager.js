/**
 * @fileoverview Undo/redo stack management for the circuit editor.
 * Provides action recording and history navigation.
 */

const MAX_UNDO_STACK = 50;

export const UNDO_TYPES = {
    ADD_COMPONENT: 'add_component',
    DELETE_COMPONENT: 'delete_component',
    MOVE_COMPONENT: 'move_component',
    EDIT_COMPONENT: 'edit_component',
    ADD_WIRE_SEGMENT: 'add_wire_segment',
    DELETE_WIRE_SEGMENT: 'delete_wire_segment',
    ADD_PROBE: 'add_probe',
    DELETE_PROBE: 'delete_probe',
    MOVE_PROBE: 'move_probe',
    FULL_STATE: 'full_state', // For complex operations, store entire state
};

export class UndoManager {
    constructor() {
        this.undoStack = [];
        this.redoStack = [];
        this.enabled = true;
    }

    /**
     * Record an action to the undo stack
     * @param {string} type - The type of action (from UNDO_TYPES)
     * @param {Object} data - Action-specific data for undoing
     */
    recordAction(type, data) {
        if (!this.enabled) return;

        // Clear redo stack when new action is recorded
        this.redoStack = [];

        // Limit stack size
        if (this.undoStack.length >= MAX_UNDO_STACK) {
            this.undoStack.shift();
        }

        this.undoStack.push({ type, data, timestamp: Date.now() });
    }

    /**
     * Temporarily disable recording (useful during undo/redo operations)
     */
    disable() {
        this.enabled = false;
    }

    /**
     * Re-enable recording
     */
    enable() {
        this.enabled = true;
    }

    /**
     * Perform undo with a callback
     * @param {Function} callback - Receives (action) and should return true if successful
     */
    undo(callback) {
        const action = this.undoStack.pop();
        if (!action) return false;

        this.disable();
        const success = callback(action);
        this.enable();

        if (success) {
            this.redoStack.push(action);
            return true;
        } else {
            // Put it back if undo failed
            this.undoStack.push(action);
            return false;
        }
    }

    /**
     * Perform redo with a callback
     * @param {Function} callback - Receives (action) and should return true if successful
     */
    redo(callback) {
        const action = this.redoStack.pop();
        if (!action) return false;

        this.disable();
        const success = callback(action);
        this.enable();

        if (success) {
            this.undoStack.push(action);
            return true;
        } else {
            // Put it back if redo failed
            this.redoStack.push(action);
            return false;
        }
    }

    /**
     * Check if undo is available
     */
    canUndo() {
        return this.undoStack.length > 0;
    }

    /**
     * Check if redo is available
     */
    canRedo() {
        return this.redoStack.length > 0;
    }

    /**
     * Clear all history
     */
    clear() {
        this.undoStack = [];
        this.redoStack = [];
    }

    /**
     * Get stack lengths (for debugging/UI)
     */
    getStackLengths() {
        return {
            undo: this.undoStack.length,
            redo: this.redoStack.length
        };
    }
}

/**
 * @fileoverview UI list update functions for the symbol editor.
 * Handles rendering of component, element, pin, and model lists.
 */

import {
    getComponents,
    getComponent,
    getCurrentComponentId,
    getIsNewComponentDraft,
    isComponentDirty,
    getElements,
    getPins,
    getModels,
    getSelectedElement,
    getSelectedElementsSet,
    setSelectedElement,
    clearSelectedElements,
    getExpandedModelIndex,
    setExpandedModelIndex,
    setElements,
    setPins,
    resetArcState,
} from '../state.js';
import { getDOM, getCompIdValue, getCompNameValue } from '../dom.js';
import { getPinLabelPosition } from '../elements/pins.js';
import { escapeHtml } from '../components/validation.js';
import { redraw } from '../canvas/drawing.js';
import { recordAction } from '../undo.js';
import { UNDO_TYPES } from '../constants.js';
import { markCurrentComponentDirty } from './forms.js';

/**
 * Update the component list sidebar
 */
export function updateComponentList() {
    const container = document.getElementById('componentList');
    if (!container) return;

    const items = [];
    const components = getComponents();
    const currentComponentId = getCurrentComponentId();
    const isNewComponentDraft = getIsNewComponentDraft();

    if (isNewComponentDraft) {
        const draftId = getCompIdValue();
        const draftName = getCompNameValue();
        const label = draftId || draftName || 'New Component';
        items.push(`
            <div class="component-item draft selected">
                <span class="draft-label">${escapeHtml(label)}</span>
                <span class="draft-subtext">Unsaved</span>
            </div>
        `);
    }

    items.push(...Object.entries(components).map(([id, comp]) => {
        const isSelected = !isNewComponentDraft && currentComponentId === id;
        const isDirty = isComponentDirty(id);
        const classes = ['component-item'];
        if (isSelected) classes.push('selected');
        if (isDirty) classes.push('dirty');
        return `
        <div class="${classes.join(' ')}" onclick="loadComponent('${escapeHtml(id)}')">
            ${comp.svg || '<svg></svg>'}
            <span class="component-name">${escapeHtml(comp.name)}</span>
        </div>
    `;
    }));

    container.innerHTML = items.join('');
}

/**
 * Update the element list panel
 */
export function updateElementList() {
    const container = document.getElementById('elementList');
    if (!container) return;

    const elements = getElements();
    const selectedElement = getSelectedElement();
    const selectedElements = getSelectedElementsSet();

    container.innerHTML = elements.map((el, idx) => {
        const isSelected = selectedElement === idx || selectedElements.has(idx);
        return `
        <div class="element-item ${isSelected ? 'selected' : ''}" onclick="selectElement(${idx}, event)">
            <div class="element-header">
                <span>${el.type}</span>
                <button class="btn btn-danger small-btn" onclick="removeElement(${idx}); event.stopPropagation();">×</button>
            </div>
            <div style="font-size: 10px; color: #888;">
                ${formatElementInfo(el)}
            </div>
        </div>
    `}).join('');
}

/**
 * Format element information for display
 * @param {Object} el - Element to format
 * @returns {string} Formatted info string
 */
function formatElementInfo(el) {
    if (el.type === 'line') return `(${el.x1},${el.y1}) → (${el.x2},${el.y2})`;
    if (el.type === 'circle') return `center: (${el.cx},${el.cy}), r: ${el.r}`;
    if (el.type === 'arc') return `center: (${el.cx},${el.cy}), r: ${el.r}`;
    if (el.type === 'polygon') return `${el.points?.length || 0} points (closed)`;
    if (el.type === 'polyline') return `${el.points?.length || 0} points (open)`;
    return '';
}

/**
 * Update the pin list panel
 */
export function updatePinList() {
    const container = document.getElementById('pinList');
    if (!container) return;

    const pins = getPins();

    container.innerHTML = pins.map((pin, idx) => {
        const labelPos = getPinLabelPosition(pin);
        return `
        <div class="pin-item">
            <div class="pin-header">
                <span>Pin ${escapeHtml(pin.id)}: ${escapeHtml(pin.name)}</span>
                <button class="btn btn-danger small-btn" onclick="removePin(${idx})">×</button>
            </div>
            <div class="pin-coords">
                <input type="text" value="${escapeHtml(pin.name)}" placeholder="Name" onchange="updatePin(${idx}, 'name', this.value)"> 
                <input type="number" value="${pin.position.x}" onchange="updatePin(${idx}, 'x', this.value)">
                <input type="number" value="${pin.position.y}" onchange="updatePin(${idx}, 'y', this.value)">
            </div>
            <div class="pin-label-coords">
                <span>Label</span>
                <input type="number" value="${labelPos.x}" onchange="updatePin(${idx}, 'labelX', this.value)">
                <input type="number" value="${labelPos.y}" onchange="updatePin(${idx}, 'labelY', this.value)">
            </div>
        </div>
    `;
    }).join('');
}

/**
 * Update the model list panel
 */
export function updateModelList() {
    const container = document.getElementById('modelList');
    if (!container) return;

    const models = getModels();
    const expandedModelIndex = getExpandedModelIndex();

    if (!Array.isArray(models) || models.length === 0) {
        container.innerHTML = '<div class="model-empty">No model statements</div>';
        return;
    }

    container.innerHTML = models.map((entry, idx) => {
        const isExpanded = expandedModelIndex === idx;
        const modelName = escapeHtml(entry?.name || `Model ${idx + 1}`);
        const modelStatement = escapeHtml(entry?.model || '');

        return `
        <div class="model-item ${isExpanded ? 'model-item-expanded' : ''}">
            <div class="model-header" onclick="toggleModel(${idx})">
                <div class="model-header-left">
                    <span class="model-expand-icon">${isExpanded ? '▼' : '▶'}</span>
                    <span class="model-name-display">${modelName}</span>
                </div>
                <div class="model-actions" onclick="event.stopPropagation()">
                    <button class="btn btn-danger small-btn" onclick="removeModel(${idx})" title="Remove">×</button>
                </div>
            </div>
            ${isExpanded ? `
            <div class="model-details">
                <div class="model-field">
                    <label>Name:</label>
                    <input type="text" value="${escapeHtml(entry?.name || '')}" placeholder="Model name" onchange="updateModelField(${idx}, 'name', this.value)">
                </div>
                <div class="model-field">
                    <label>Statement:</label>
                    <textarea rows="3" placeholder=".model NAME TYPE (params)" onchange="updateModelField(${idx}, 'model', this.value)">${modelStatement}</textarea>
                </div>
            </div>
            ` : ''}
        </div>
    `;
    }).join('');
}

/**
 * Select an element in the element list
 * @param {number} idx - Element index
 * @param {Event} event - Click event
 */
export function selectElement(idx, event) {
    const selectedElements = getSelectedElementsSet();

    if (event && event.shiftKey) {
        // Toggle selection with shift
        if (selectedElements.has(idx)) {
            selectedElements.delete(idx);
        } else {
            selectedElements.add(idx);
        }
        setSelectedElement(null);
    } else {
        // Single selection
        setSelectedElement(idx);
        clearSelectedElements();
    }
    updateElementList();
    redraw();
}

/**
 * Remove an element from the drawing
 * @param {number} idx - Element index to remove
 */
export function removeElement(idx) {
    const elements = getElements();
    const element = elements[idx];
    recordAction(UNDO_TYPES.DELETE_ELEMENTS, {
        items: [{ element: JSON.parse(JSON.stringify(element)), index: idx }]
    });

    elements.splice(idx, 1);
    setSelectedElement(null);
    clearSelectedElements();
    updateElementList();
    redraw();
    markCurrentComponentDirty();
}

/**
 * Delete all selected elements
 */
export function deleteSelected() {
    const elements = getElements();
    const selectedElements = getSelectedElementsSet();
    const selectedElement = getSelectedElement();

    let removedAny = false;
    if (selectedElements.size > 0) {
        // Delete multiple selected elements (from highest index to lowest)
        const indices = Array.from(selectedElements).sort((a, b) => b - a);
        const items = indices.map(idx => ({
            element: JSON.parse(JSON.stringify(elements[idx])),
            index: idx
        }));
        recordAction(UNDO_TYPES.DELETE_ELEMENTS, { items });

        indices.forEach(idx => {
            elements.splice(idx, 1);
        });
        clearSelectedElements();
        removedAny = true;
    } else if (selectedElement !== null) {
        removeElement(selectedElement);
        return;
    }
    updateElementList();
    redraw();
    if (removedAny) {
        markCurrentComponentDirty();
    }
}

/**
 * Update stroke width for selected elements
 */
export function updateSelectedStroke() {
    const elements = getElements();
    const selectedElements = getSelectedElementsSet();
    const selectedElement = getSelectedElement();

    const strokeWidth = parseInt(document.getElementById('strokeWidth').value);
    let changed = false;

    if (selectedElements.size > 0) {
        selectedElements.forEach(idx => {
            if (elements[idx].strokeWidth !== strokeWidth) {
                elements[idx].strokeWidth = strokeWidth;
                changed = true;
            }
        });
    } else if (selectedElement !== null) {
        if (elements[selectedElement].strokeWidth !== strokeWidth) {
            elements[selectedElement].strokeWidth = strokeWidth;
            changed = true;
        }
    }

    if (changed) {
        markCurrentComponentDirty();
    }
    redraw();
}

/**
 * Clear all drawing elements
 */
export function clearDrawing() {
    if (confirm('Clear all drawing elements?')) {
        setElements([]);
        setSelectedElement(null);
        clearSelectedElements();
        resetArcState();
        updateElementList();
        redraw();
        markCurrentComponentDirty();
    }
}

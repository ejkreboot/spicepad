/**
 * @fileoverview Modal dialog handling for the symbol editor.
 * Manages the subcircuit definition editor modal.
 */

import { markCurrentComponentDirty } from '../ui/forms.js';
import { getIsNewComponentDraft } from '../state.js';
import { updateComponentList } from './lists.js';

/**
 * Open the definition editor modal
 */
export function openDefinitionModal() {
    const modal = document.getElementById('definitionModal');
    const editor = document.getElementById('definitionEditor');
    const preview = document.getElementById('definitionPreview');
    
    if (!modal || !editor) return;
    
    // Get current definition from the hidden state or from preview
    const currentDef = preview.dataset.definition || '';
    editor.value = currentDef;
    
    // Show modal
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    
    // Focus the editor
    setTimeout(() => editor.focus(), 100);
    
    // Add escape key handler
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeDefinitionModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
    
    // Store handler for cleanup
    modal.dataset.escHandler = 'attached';
}

/**
 * Close the definition editor modal
 */
export function closeDefinitionModal() {
    const modal = document.getElementById('definitionModal');
    if (!modal) return;
    
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
}

/**
 * Save the definition from the modal
 */
export function saveDefinitionModal() {
    const editor = document.getElementById('definitionEditor');
    const preview = document.getElementById('definitionPreview');
    
    if (!editor || !preview) return;
    
    const definition = editor.value.trim();
    
    // Store the definition in the preview's data attribute
    preview.dataset.definition = definition;
    
    // Update the preview text
    if (definition) {
        preview.textContent = 'Click to Edit';
        preview.classList.remove('empty');
    } else {
        preview.textContent = 'Click to Edit';
        preview.classList.add('empty');
    }
    
    // Mark as dirty if not a new draft
    if (!getIsNewComponentDraft()) {
        markCurrentComponentDirty();
    } else {
        updateComponentList();
    }
    
    closeDefinitionModal();
}

/**
 * Get the current definition value
 * @returns {string} The current definition
 */
export function getDefinitionValue() {
    const preview = document.getElementById('definitionPreview');
    return preview?.dataset.definition || '';
}

/**
 * Set the definition value
 * @param {string} definition - The definition to set
 */
export function setDefinitionValue(definition) {
    const preview = document.getElementById('definitionPreview');
    if (!preview) return;
    
    const def = (definition || '').trim();
    preview.dataset.definition = def;
    
    if (def) {
        preview.textContent = 'Click to Edit';
        preview.classList.remove('empty');
    } else {
        preview.textContent = 'Click to Edit';
        preview.classList.add('empty');
    }
}

/**
 * Close modal when clicking outside
 */
function handleModalBackdropClick(event) {
    const modal = document.getElementById('definitionModal');
    if (event.target === modal) {
        closeDefinitionModal();
    }
}

// Set up backdrop click handler when modal exists
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        const modal = document.getElementById('definitionModal');
        if (modal) {
            modal.addEventListener('click', handleModalBackdropClick);
        }
    });
}

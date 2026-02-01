/**
 * @fileoverview Component CRUD operations for the symbol editor.
 * Handles loading, saving, deleting, and duplicating components.
 */

import { deleteSymbol as deleteSymbolFromStore, loadLibrary, replaceLibrary, saveSymbol } from '../../common/storage/library.js';
import { getDefaultComponents } from '../../common/defaultComponents.js';
import { COMPONENT_TYPES, DEFAULTS } from '../constants.js';
import {
    getComponents,
    setComponents,
    getComponent,
    setComponent,
    deleteComponentById,
    getCurrentComponentId,
    setCurrentComponentId,
    getIsNewComponentDraft,
    setIsNewComponentDraft,
    clearAllDirty,
    clearComponentDirty,
    isComponentDirty,
    markComponentDirty,
    getElements,
    setElements,
    getPins,
    setPins,
    getModels,
    setModels,
    setSelectedElement,
    clearSelectedElements,
    resetArcState,
    setDefaultValueIsNull,
} from '../state.js';
import {
    getDOM,
    setCompIdValue,
    setCompNameValue,
    setCompPrefixValue,
    setCompAutoIncValue,
    setCompWidthValue,
    setCompHeightValue,
    focusCompIdInput,
    getCompIdValue,
    getCompNameValue,
    getCompPrefixValue,
    getCompDefaultValue,
    getCompAutoIncValue,
    getComponentDimensions,
    setJsonOutputValue,
    setCompDefaultValue,
    setCompDefaultDisabled,
    setCompDefaultPlaceholder,
    selectJsonOutput,
    getJsonOutputValue,
} from '../dom.js';
import { normalizeComponents, normalizeComponentRecord, validateSubcircuitDescriptor } from './validation.js';
import { parseSVGToElements, elementsToSVG } from './serialize.js';
import { normalizePins, ensurePinLabelPosition } from '../elements/pins.js';
import { normalizeModelsArray } from '../elements/models.js';
import { getDefaultPrimitivePrefix } from '../elements/primitives.js';
import {
    updateComponentList,
    updatePinList,
    updateModelList,
    updateElementList,
} from '../ui/lists.js';
import {
    setSelectedComponentType,
    setSubcircuitInputs,
    readSubcircuitInputs,
    getSelectedComponentType,
    applyPrimitiveDefaults,
    populatePrefixOptions,
    setLabelInputs,
    readLabelInputs,
    getDefaultLabelPositions,
    getDefaultValueIsNull,
} from '../ui/forms.js';
import { resizeCanvas } from '../canvas/drawing.js';
import { requestLabelPreviewUpdate } from '../ui/labels.js';

/**
 * Apply components to state and update UI
 * @param {Object} nextComponents - Components to apply
 */
export function applyComponentsToState(nextComponents) {
    setComponents(nextComponents || {});
    normalizeComponents(getComponents());
    clearAllDirty();
    setCurrentComponentId(null);
    setIsNewComponentDraft(false);

    updateComponentList();
    updateJSON();
    setModels([]);
    updateModelList();

    const { width: defaultWidth, height: defaultHeight } = getComponentDimensions();
    setLabelInputs(getDefaultLabelPositions(defaultWidth, defaultHeight), defaultWidth, defaultHeight);
}

/**
 * Load components from IndexedDB storage
 * @returns {Promise<void>}
 */
export async function loadComponentsFromStorage() {
    const seedLibrary = getDefaultComponents();
    try {
        const library = await loadLibrary({ seedLibrary });
        const hasData = library && Object.keys(library).length > 0;
        applyComponentsToState(hasData ? library : seedLibrary);
        if (!hasData) {
            await replaceLibrary(seedLibrary).catch(err => console.warn('Failed to seed IndexedDB library', err));
        }
    } catch (err) {
        console.warn('Unable to load library from IndexedDB, using defaults instead', err);
        applyComponentsToState(seedLibrary);
    }
}

/**
 * Load default components (resetting library)
 */
export function loadDefaultComponents() {
    const defaults = getDefaultComponents();
    applyComponentsToState(defaults);
}

/**
 * Load a specific component by ID
 * @param {string} id - Component ID to load
 */
export function loadComponent(id) {
    setIsNewComponentDraft(false);
    setCurrentComponentId(id);

    const comp = normalizeComponentRecord(getComponent(id));
    const compType = comp?.componentType || COMPONENT_TYPES.PRIMITIVE;
    const compWidthValue = comp.size?.width || DEFAULTS.COMPONENT_WIDTH;
    const compHeightValue = comp.size?.height || DEFAULTS.COMPONENT_HEIGHT;

    setCompIdValue(id);
    setCompNameValue(comp.name || '');
    setSelectedComponentType(compType, { suppressDirty: true, componentDefault: comp.defaultValue });
    populatePrefixOptions(comp.designator?.prefix || getDefaultPrimitivePrefix());
    setCompPrefixValue(compType === COMPONENT_TYPES.SUBCIRCUIT ? 'X' : comp.designator?.prefix || getDefaultPrimitivePrefix());
    setCompAutoIncValue(comp.designator?.autoIncrement !== false);

    if (compType === COMPONENT_TYPES.PRIMITIVE) {
        applyPrimitiveDefaults(getCompPrefixValue(), { componentDefault: comp.defaultValue });
    } else {
        setCompDefaultDisabled(false);
        setCompDefaultPlaceholder('');
        setCompDefaultValue(comp.defaultValue ?? '');
        setDefaultValueIsNull(comp.defaultValue === null);
    }

    if (compType === COMPONENT_TYPES.SUBCIRCUIT) {
        setSubcircuitInputs(comp.subcircuit);
    } else {
        setSubcircuitInputs({ name: '', definition: '' });
    }

    setCompWidthValue(compWidthValue);
    setCompHeightValue(compHeightValue);

    setPins(normalizePins(comp.pins));
    setElements(parseSVGToElements(comp.svg));
    setLabelInputs(comp.labels, compWidthValue, compHeightValue);
    setModels(normalizeModelsArray(comp.models ?? comp.model ?? []));
    setSelectedElement(null);
    clearSelectedElements();
    resetArcState();

    updateComponentList();
    updatePinList();
    updateModelList();
    updateElementList();
    resizeCanvas();
    requestLabelPreviewUpdate({ immediate: true });
}

/**
 * Save/update the current component
 * @returns {Promise<void>}
 */
export async function updateComponent() {
    const id = getCompIdValue();
    if (!id) {
        alert('Please enter a component ID');
        return;
    }

    const { width: compWidth, height: compHeight } = getComponentDimensions();
    const labels = readLabelInputs(compWidth, compHeight);
    const componentType = getSelectedComponentType();
    const subcircuitDescriptor = componentType === COMPONENT_TYPES.SUBCIRCUIT ? readSubcircuitInputs() : null;

    if (componentType === COMPONENT_TYPES.SUBCIRCUIT) {
        const validation = validateSubcircuitDescriptor(subcircuitDescriptor, getPins().length);
        if (!validation.ok) {
            alert(validation.message);
            return;
        }
    }

    const normalizedModels = normalizeModelsArray(getModels());

    const prefixValue = componentType === COMPONENT_TYPES.SUBCIRCUIT
        ? 'X'
        : getCompPrefixValue() || id[0].toUpperCase();
    const defaultValueIsNull = getDefaultValueIsNull();
    const defaultValue = defaultValueIsNull ? null : getCompDefaultValue();

    const comp = {
        name: getCompNameValue() || id,
        description: getComponent(getCurrentComponentId())?.description || '',
        componentType,
        defaultValue,
        designator: {
            prefix: prefixValue,
            autoIncrement: getCompAutoIncValue(),
        },
        size: {
            width: compWidth,
            height: compHeight,
        },
        models: normalizedModels,
        pins: getPins().map(p => {
            const label = ensurePinLabelPosition(p);
            return {
                id: p.id,
                name: p.name,
                position: { x: p.position.x, y: p.position.y },
                labelPosition: { x: Math.round(label.x), y: Math.round(label.y) },
            };
        }),
        labels,
        svg: elementsToSVG(getElements()),
    };

    if (componentType === COMPONENT_TYPES.SUBCIRCUIT) {
        comp.designator.prefix = 'X';
        comp.subcircuit = subcircuitDescriptor;
    }

    // Preserve special flags
    const currentComp = getComponent(getCurrentComponentId());
    if (currentComp?.isGround) {
        comp.isGround = true;
    }

    // If ID changed, remove old and add new
    const currentId = getCurrentComponentId();
    if (currentId && currentId !== id) {
        clearComponentDirty(currentId);
        deleteComponentById(currentId);
        try {
            await deleteSymbolFromStore(currentId);
        } catch (err) {
            console.warn('Failed to remove renamed component from IndexedDB', err);
        }
    }

    setComponent(id, comp);
    clearComponentDirty(id);
    setIsNewComponentDraft(false);
    setCurrentComponentId(id);

    try {
        await saveSymbol(id, comp);
    } catch (err) {
        console.warn('Failed to persist component to IndexedDB', err);
    }

    updateComponentList();
    updateJSON();
}

/**
 * Create a new component draft
 */
export function newComponent() {
    setCurrentComponentId(null);
    setIsNewComponentDraft(true);
    setElements([]);
    setPins([]);
    setModels([]);
    setSelectedElement(null);
    resetArcState();

    setCompIdValue('');
    setCompNameValue('');
    setSelectedComponentType(COMPONENT_TYPES.PRIMITIVE, { suppressDirty: true });
    const defaultPrefix = getDefaultPrimitivePrefix();
    populatePrefixOptions(defaultPrefix);
    setCompPrefixValue(defaultPrefix);
    setCompAutoIncValue(true);
    applyPrimitiveDefaults(defaultPrefix);
    setCompWidthValue('80');
    setCompHeightValue('40');

    const { width: defaultWidth, height: defaultHeight } = getComponentDimensions();
    setLabelInputs(getDefaultLabelPositions(defaultWidth, defaultHeight), defaultWidth, defaultHeight);
    setSubcircuitInputs({ name: '', definition: '' });

    updateComponentList();
    updatePinList();
    updateModelList();
    updateElementList();
    resizeCanvas();
    requestLabelPreviewUpdate({ immediate: true });

    focusCompIdInput();
}

/**
 * Duplicate the current component
 * @returns {Promise<void>}
 */
export async function duplicateComponent() {
    const currentId = getCurrentComponentId();
    if (!currentId) return;

    const newId = currentId + '_copy';
    const clone = JSON.parse(JSON.stringify(getComponent(currentId)));
    setComponent(newId, normalizeComponentRecord(clone));
    getComponent(newId).name += ' (Copy)';

    setCurrentComponentId(newId);
    setIsNewComponentDraft(false);
    clearComponentDirty(newId);
    setCompIdValue(newId);

    try {
        await saveSymbol(newId, getComponent(newId));
    } catch (err) {
        console.warn('Failed to persist duplicated component', err);
    }

    updateComponentList();
    updateJSON();
}

/**
 * Delete the current component
 * @returns {Promise<void>}
 */
export async function deleteComponent() {
    const currentId = getCurrentComponentId();
    if (!currentId) return;
    if (!confirm(`Delete component "${currentId}"?`)) return;

    deleteComponentById(currentId);
    clearComponentDirty(currentId);

    try {
        await deleteSymbolFromStore(currentId);
    } catch (err) {
        console.warn('Failed to delete component from IndexedDB', err);
    }

    setCurrentComponentId(null);
    newComponent();
    updateJSON();
}

/**
 * Update JSON output display
 */
export function updateJSON() {
    normalizeComponents(getComponents());
    setJsonOutputValue(JSON.stringify(getComponents(), null, '\t'));
}

/**
 * Copy JSON to clipboard
 */
export function copyJSON() {
    selectJsonOutput();
    document.execCommand('copy');
    alert('JSON copied to clipboard!');
}

/**
 * Download JSON as file
 */
export function downloadJSON() {
    const data = getJsonOutputValue() || JSON.stringify(getComponents(), null, '\t');
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'components.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Create new empty JSON library
 * @returns {Promise<void>}
 */
export async function newJSON() {
    if (!confirm('Start a new JSON library? This will remove all existing components.')) return;

    setComponents({});
    setCurrentComponentId(null);
    clearAllDirty();

    try {
        await replaceLibrary({});
    } catch (err) {
        console.warn('Failed to reset IndexedDB library', err);
    }

    newComponent();
    updateJSON();
}

/**
 * Load components from file
 * @param {Event} event - File input change event
 */
export function loadFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const components = JSON.parse(e.target.result);
            normalizeComponents(components);
            setComponents(components);
            setCurrentComponentId(null);
            clearAllDirty();

            try {
                await replaceLibrary(components);
            } catch (err) {
                console.warn('Failed to persist imported components to IndexedDB', err);
            }

            newComponent();
            updateComponentList();
            updateJSON();
            alert('Components loaded successfully!');
        } catch (err) {
            alert('Error parsing JSON: ' + err.message);
        }
    };
    reader.readAsText(file);
}

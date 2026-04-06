/**
 * LibraryManager - Manages the component library: loading, importing,
 * panel rendering, and component selection state.
 */

import { loadLibrary, replaceLibrary } from '../common/storage/library.js';
import { DEFAULT_COMPONENT_LIBRARY } from '../common/defaultComponents.js';

export class LibraryManager {
    constructor({ onSelectionChange, onToolChange }) {
        this.componentLibrary = {};
        this.selectedComponentId = null;
        this.onSelectionChange = onSelectionChange;
        this.onToolChange = onToolChange;
    }

    async loadComponentLibrary() {
        try {
            this.componentLibrary = await loadLibrary({ seedLibrary: DEFAULT_COMPONENT_LIBRARY });
        } catch (error) {
            console.error('Failed to load component library', error);
            this.componentLibrary = { ...DEFAULT_COMPONENT_LIBRARY };
        }
        this._ensureSubcircuitPlaceholder();
        this.renderComponentPanel();
    }

    _ensureSubcircuitPlaceholder() {
        const id = 'custom_subcircuit';
        if (this.componentLibrary[id]) return;
        const fallback = DEFAULT_COMPONENT_LIBRARY[id];
        if (fallback) {
            try {
                this.componentLibrary[id] = JSON.parse(JSON.stringify(fallback));
            } catch (error) {
                this.componentLibrary[id] = { ...fallback };
            }
        }
    }

    setupLibraryImport() {
        const importBtn = document.getElementById('import-library-btn');
        const fileInput = document.getElementById('library-file-input');
        importBtn?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', (event) => this._importLibraryFromFile(event));
    }

    async _importLibraryFromFile(event) {
        const inputEl = event?.target;
        const file = inputEl?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    throw new Error('Library JSON must be an object map of components');
                }

                this.componentLibrary = parsed;

                await replaceLibrary(parsed);

                this._ensureSubcircuitPlaceholder();
                this.renderComponentPanel();
                const firstId = Object.keys(parsed)[0] ?? null;
                if (firstId) {
                    this.setSelectedComponent(firstId);
                } else {
                    this.clearSelection();
                }

                alert('Symbol library imported. New components are available in the panel.');
            } catch (error) {
                console.error('Failed to import library', error);
                alert('Failed to import library. Please choose a JSON exported from the Symbol Editor.');
            } finally {
                if (inputEl) inputEl.value = '';
            }
        };

        reader.readAsText(file);
    }

    renderComponentPanel() {
        const list = document.getElementById('componentList');
        if (!list) return;
        const entries = Object.entries(this.componentLibrary);
        entries.sort((a, b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0]));

        list.innerHTML = '';

        const wireTool = document.createElement('div');
        wireTool.className = 'component-item tool-item tool-btn active';
        wireTool.dataset.tool = 'wire';
        wireTool.title = 'Wire Tool (W)';
        wireTool.innerHTML = `
            <div class="component-thumb">
                <span class="material-symbols-outlined">timeline</span>
            </div>
            <div class="component-meta">
                <div class="component-name">Wire Tool</div>
            </div>
        `;
        wireTool.addEventListener('click', () => {
            this.onToolChange?.('wire');
        });
        list.appendChild(wireTool);

        const textTool = document.createElement('div');
        textTool.className = 'component-item tool-item tool-btn';
        textTool.dataset.tool = 'text';
        textTool.title = 'Text Tool (T)';
        textTool.innerHTML = `
            <div class="component-thumb">
                <span class="material-symbols-outlined">text_fields</span>
            </div>
            <div class="component-meta">
                <div class="component-name">Text Tool</div>
            </div>
        `;
        textTool.addEventListener('click', () => {
            this.onToolChange?.('text');
        });
        list.appendChild(textTool);

        for (const [id, definition] of entries) {
            const item = document.createElement('div');
            item.className = 'component-item';
            item.dataset.componentId = id;
            item.title = definition.name || id;

            const svgMarkup = definition.svg ?? '';
            item.innerHTML = `
                <div class="component-thumb">${svgMarkup}</div>
            `;

            item.addEventListener('click', () => {
                this.setSelectedComponent(id);
            });

            list.appendChild(item);
        }
    }

    setSelectedComponent(componentId) {
        this.selectedComponentId = componentId;
        const list = document.getElementById('componentList');
        if (!list) return;
        list.querySelectorAll('.component-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.componentId === componentId);
        });
        this.onSelectionChange?.(componentId);
    }

    clearSelection() {
        this.selectedComponentId = null;
        const list = document.getElementById('componentList');
        if (list) {
            list.querySelectorAll('.component-item').forEach(item => {
                item.classList.remove('selected');
            });
        }
    }
}

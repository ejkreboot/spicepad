/**
 * ComponentEditorModal - Handles the component editor modal and probe editor modal.
 *
 * Manages double-click-to-edit flow for components (label, value, model,
 * custom SPICE, subcircuit args/body) and probes (label, type, color).
 */

export class ComponentEditorModal {
    constructor({ canvas, componentManager, probeManager, subcircuitManager, onSave }) {
        this.canvas = canvas;
        this.componentManager = componentManager;
        this.probeManager = probeManager;
        this.subcircuitManager = subcircuitManager;
        this.onSave = onSave;

        this._modalOpen = false;
        this._editingComponent = null;
        this._editingProbe = null;
    }

    get isModalOpen() {
        return this._modalOpen;
    }

    setupComponentEditor() {
        const overlay = document.getElementById('component-modal');
        const closeBtn = document.querySelector('#component-modal .modal-close');
        const cancelBtn = document.getElementById('component-cancel-btn');
        const saveBtn = document.getElementById('component-save-btn');

        if (overlay) {
            overlay.addEventListener('click', (event) => {
                if (event.target === overlay) {
                    this.closeComponentModal();
                }
            });
        }

        closeBtn?.addEventListener('click', () => this.closeComponentModal());
        cancelBtn?.addEventListener('click', () => this.closeComponentModal());
        saveBtn?.addEventListener('click', () => this.saveComponentModal());

        const probeOverlay = document.getElementById('probe-modal');
        const probeCloseBtn = document.querySelector('#probe-modal .modal-close');
        const probeCancelBtn = document.getElementById('probe-modal-cancel');
        const probeSaveBtn = document.getElementById('probe-modal-save');

        if (probeOverlay) {
            probeOverlay.addEventListener('click', (event) => {
                if (event.target === probeOverlay) {
                    this.closeProbeModal();
                }
            });
        }

        probeCloseBtn?.addEventListener('click', () => this.closeProbeModal());
        probeCancelBtn?.addEventListener('click', () => this.closeProbeModal());
        probeSaveBtn?.addEventListener('click', () => this.saveProbeModal());

        this.canvas.addEventListener('dblclick', (event) => {
            if (this._modalOpen) return;
            const rect = this.canvas.getBoundingClientRect();
            const screenX = event.clientX - rect.left;
            const screenY = event.clientY - rect.top;
            // We need the viewport reference for screenToWorld — use componentManager's viewport
            const world = this.componentManager.viewport.screenToWorld(screenX, screenY);

            const probe = this.probeManager.getProbeAt(world.x, world.y);
            if (probe) {
                event.preventDefault();
                this.openProbeModal(probe);
                return;
            }

            const hit = this.componentManager.getComponentAt(world.x, world.y);
            if (!hit) return;
            event.preventDefault();
            this.openComponentModal(hit);
        });
    }

    openProbeModal(probe) {
        const modal = document.getElementById('probe-modal');
        const input = document.getElementById('probe-label-input');
        const typeSelect = document.getElementById('probe-type-select');
        const colorInput = document.getElementById('probe-color-input');
        if (!modal || !input || !typeSelect || !colorInput) return;

        this._editingProbe = probe;
        input.value = probe.label;
        typeSelect.value = probe.type || 'voltage';
        colorInput.value = probe.color || '#3b82f6';

        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        this._modalOpen = true;

        setTimeout(() => {
            input.focus();
            input.select();
        }, 100);

        const handleEnter = (e) => {
            if (e.key === 'Enter') {
                this.saveProbeModal();
                input.removeEventListener('keydown', handleEnter);
            }
        };
        input.addEventListener('keydown', handleEnter);
    }

    closeProbeModal() {
        const modal = document.getElementById('probe-modal');
        if (modal) {
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
        }
        this._modalOpen = false;
        this._editingProbe = null;
    }

    saveProbeModal() {
        const input = document.getElementById('probe-label-input');
        const typeSelect = document.getElementById('probe-type-select');
        const colorInput = document.getElementById('probe-color-input');
        if (!input || !typeSelect || !colorInput || !this._editingProbe) {
            this.closeProbeModal();
            return;
        }

        const newLabel = input.value.trim();
        if (newLabel === '') {
            alert('Probe name cannot be empty.');
            return;
        }

        if (!this.probeManager.isProbeLabelUnique(newLabel, this._editingProbe.id)) {
            alert(`The name "${newLabel}" is already in use. Please choose a unique name.`);
            return;
        }

        const newType = typeSelect.value;
        const newColor = colorInput.value;

        this.probeManager.updateProbeLabel(this._editingProbe.id, newLabel);
        this.probeManager.updateProbeType(this._editingProbe.id, newType);
        this.probeManager.updateProbeColor(this._editingProbe.id, newColor);
        this.onSave?.();
        this.closeProbeModal();
    }

    _normalizeDefinitionModels(definition) {
        const list = Array.isArray(definition?.models) ? definition.models : [];
        return list
            .map((entry, index) => {
                const modelText = typeof entry?.model === 'string' ? entry.model.trim() : '';
                if (!modelText) return null;
                const name = (typeof entry?.name === 'string' && entry.name.trim())
                    ? entry.name.trim()
                    : this._extractModelName(modelText) || `Model ${index + 1}`;
                return { name, model: modelText };
            })
            .filter(Boolean);
    }

    _extractModelName(statement = '') {
        if (typeof statement !== 'string') return '';
        const match = statement.match(/\.model\s+([^\s]+)/i);
        return match ? match[1] : '';
    }

    openComponentModal(component) {
        const overlay = document.getElementById('component-modal');
        const labelInput = document.getElementById('component-label-input');
        const modelField = document.getElementById('component-model-field');
        const modelSelect = document.getElementById('component-model-select');
        const valueField = document.getElementById('component-value-field');
        const valueInput = document.getElementById('component-value-input');
        const subcktArgsField = document.getElementById('component-subcircuit-args-field');
        const subcktArgsContainer = document.getElementById('component-subcircuit-args-container');
        const subcktBodyField = document.getElementById('component-subcircuit-body-field');
        const subcktBodyInput = document.getElementById('component-subcircuit-body');
        const customModelInput = document.getElementById('component-custom-model-input');
        const customModelField = customModelInput?.closest('.modal-field');

        if (!overlay || !labelInput || !modelField || !modelSelect || !valueField || !valueInput || !customModelInput || !subcktArgsField || !subcktArgsContainer) return;

        const definition = component.meta?.definition;
        const isSubcircuit = definition?.componentType === 'subcircuit';
        const models = this._normalizeDefinitionModels(definition);
        const defaultValue = definition?.defaultValue;
        const hasValue =
            component.meta?.valueText !== null &&
            component.meta?.valueText !== undefined ||
            (defaultValue !== null && defaultValue !== undefined);

        labelInput.value = component.meta?.designatorText ?? component.name ?? component.id ?? '';

        if (isSubcircuit) {
            modelField.style.display = 'none';
            modelSelect.innerHTML = '';
            if (customModelField) customModelField.style.display = 'none';
        } else if (models.length > 0) {
            modelField.style.display = 'flex';
            modelSelect.innerHTML = '';
            models.forEach(entry => {
                const option = document.createElement('option');
                option.value = entry.name;
                option.textContent = entry.name;
                modelSelect.appendChild(option);
            });
            const preferred = component.meta?.selectedModelName;
            const fallback = models[0]?.name;
            if (preferred && models.some(m => m.name === preferred)) {
                modelSelect.value = preferred;
            } else if (fallback) {
                modelSelect.value = fallback;
            }
        } else {
            modelField.style.display = 'none';
            modelSelect.innerHTML = '';
            if (customModelField) customModelField.style.display = 'flex';
        }

        if (!isSubcircuit && customModelField) {
            customModelField.style.display = 'flex';
        }

        const customModel = component.meta?.customModelStatement?.trim() ||
            (typeof component.meta?.spiceModel === 'string' && component.meta.spiceModel.trim().toLowerCase().startsWith('.model')
                ? component.meta.spiceModel.trim()
                : '');
        customModelInput.value = customModel;

        if (!isSubcircuit && hasValue) {
            valueField.style.display = 'flex';
            valueInput.disabled = false;
            valueInput.value = component.meta?.valueText ?? defaultValue ?? '';
        } else {
            valueField.style.display = 'none';
            valueInput.disabled = true;
            valueInput.value = '';
        }

        if (isSubcircuit) {
            const parsed = this.subcircuitManager.parseSubcircuitHeader(definition?.subcircuit?.definition || '');
            const args = parsed.params;
            const existingArgs = component.meta?.subcircuitArgs || {};
            subcktArgsContainer.innerHTML = '';
            if (args.length > 0) {
                args.forEach(arg => {
                    const row = document.createElement('div');
                    row.className = 'modal-field subckt-arg-row';

                    const label = document.createElement('label');
                    label.textContent = arg.name;
                    label.htmlFor = `subckt-arg-${arg.name}`;

                    const input = document.createElement('input');
                    input.type = 'text';
                    input.id = `subckt-arg-${arg.name}`;
                    input.dataset.argName = arg.name;
                    input.value = existingArgs[arg.name] ?? '';
                    if (arg.defaultValue) {
                        input.placeholder = arg.defaultValue;
                    }

                    row.appendChild(label);
                    row.appendChild(input);
                    subcktArgsContainer.appendChild(row);
                });
                subcktArgsField.style.display = 'flex';
            } else {
                subcktArgsField.style.display = 'none';
                subcktArgsContainer.innerHTML = '';
            }
        } else {
            subcktArgsField.style.display = 'none';
            subcktArgsContainer.innerHTML = '';
        }

        if (isSubcircuit && subcktBodyField && subcktBodyInput) {
            const baseDefinition = definition?.subcircuit?.definition || '';
            const overrideDefinition = component.meta?.customSubcircuitDefinition || '';
            const effectiveDefinition = overrideDefinition || baseDefinition;
            const split = this.subcircuitManager.splitSubcircuitDefinition(effectiveDefinition, definition?.subcircuit?.name || 'SUBCKT');
            subcktBodyField.style.display = 'flex';
            subcktBodyInput.value = split.bodyLines.join('\n');
        } else if (subcktBodyField && subcktBodyInput) {
            subcktBodyField.style.display = 'none';
            subcktBodyInput.value = '';
        }

        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');
        this._modalOpen = true;
        this._editingComponent = component;
        labelInput.focus();
        labelInput.select();
    }

    closeComponentModal() {
        const overlay = document.getElementById('component-modal');
        if (overlay) {
            overlay.classList.remove('is-open');
            overlay.setAttribute('aria-hidden', 'true');
        }
        this._modalOpen = false;
        this._editingComponent = null;
    }

    saveComponentModal() {
        if (!this._editingComponent) {
            this.closeComponentModal();
            return;
        }

        const labelInput = document.getElementById('component-label-input');
        const modelField = document.getElementById('component-model-field');
        const modelSelect = document.getElementById('component-model-select');
        const valueField = document.getElementById('component-value-field');
        const valueInput = document.getElementById('component-value-input');
        const subcktArgsContainer = document.getElementById('component-subcircuit-args-container');
        const subcktBodyInput = document.getElementById('component-subcircuit-body');
        const customModelInput = document.getElementById('component-custom-model-input');

        if (!labelInput || !modelField || !modelSelect || !valueField || !valueInput || !customModelInput) {
            this.closeComponentModal();
            return;
        }

        const label = labelInput.value.trim();
        const value = valueInput.value.trim();
        const customModel = customModelInput.value.trim();
        const isSubcircuit = this._editingComponent.meta?.definition?.componentType === 'subcircuit';

        const models = this._normalizeDefinitionModels(this._editingComponent.meta?.definition);
        if (models.length > 0 && modelField.style.display !== 'none') {
            const selectedName = modelSelect.value || models[0]?.name || null;
            this._editingComponent.meta.selectedModelName = selectedName || null;
        } else {
            this._editingComponent.meta.selectedModelName = null;
        }

        this._editingComponent.meta.designatorText = label;
        if (!isSubcircuit && valueField.style.display !== 'none') {
            this._editingComponent.meta.valueText = value;
        } else if (isSubcircuit) {
            this._editingComponent.meta.valueText = null;
        }
        const customModelStatement = customModel.toLowerCase().startsWith('.model') ? customModel : '';

        this._editingComponent.meta.customModelStatement = customModelStatement || null;
        this._editingComponent.meta.spiceModel = null;

        if (subcktArgsContainer && isSubcircuit) {
            const entries = Array.from(subcktArgsContainer.querySelectorAll('input[data-arg-name]'));
            const argMap = {};
            entries.forEach(input => {
                const name = input.dataset.argName;
                const val = input.value.trim();
                if (name && val) {
                    argMap[name] = val;
                }
            });
            this._editingComponent.meta.subcircuitArgs = Object.keys(argMap).length > 0 ? argMap : null;
        } else {
            this._editingComponent.meta.subcircuitArgs = null;
        }

        if (isSubcircuit && subcktBodyInput) {
            const baseDefinition = this._editingComponent.meta?.definition?.subcircuit?.definition || '';
            const parsed = this.subcircuitManager.parseSubcircuitHeader(baseDefinition);
            const split = this.subcircuitManager.splitSubcircuitDefinition(baseDefinition, parsed.name || this._editingComponent.meta?.definition?.subcircuit?.name || 'SUB');
            const sanitizedBody = subcktBodyInput.value
                .split(/\r?\n/)
                .map(line => line.replace(/\s+$/u, ''))
                .filter(line => line && !/^\.subckt/i.test(line.trim()) && !/^\.ends\b/i.test(line.trim()));

            if (sanitizedBody.length > 0) {
                const rebuilt = [
                    ...split.prefix,
                    split.header,
                    ...sanitizedBody,
                    split.ends,
                    ...split.suffix
                ].filter(Boolean).join('\n');
                this._editingComponent.meta.customSubcircuitDefinition = rebuilt;
            } else {
                this._editingComponent.meta.customSubcircuitDefinition = null;
            }
        } else {
            this._editingComponent.meta.customSubcircuitDefinition = null;
        }

        this.componentManager.viewport.render();
        this.closeComponentModal();
    }
}

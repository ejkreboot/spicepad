/**
 * Circuit Editor - Main Entry Point
 * 
 * Initializes the circuit editor components and wires them together.
 * Sets up the clean architecture:
 * - CanvasViewport: owns transforms and rendering infrastructure
 * - WireGraph: owns wire topology data
 * - WireEditor: owns user interaction state
 */

import '../style.css';
import { CanvasViewport } from './CanvasViewport.js';
import { WireGraph } from './WireGraph.js';
import { WireEditor } from './WireEditor.js';
import { ComponentManager } from './ComponentManager.js';
import { SelectionManager } from './SelectionManager.js';
import { NetlistGenerator } from './NetlistGenerator.js';
import { loadLibrary } from '../common/storage/library.js';
import { DEFAULT_COMPONENT_LIBRARY } from '../common/defaultComponents.js';
import { createComponentFromDefinition, Component } from './Component.js';

class CircuitEditorApp {
    constructor() {
        this.canvas = document.getElementById('circuit-canvas');
        if (!this.canvas) {
            console.error('Canvas element not found');
            return;
        }
        
        // Initialize core components
        this.viewport = new CanvasViewport(this.canvas, {
            gridSize: 10,
            backgroundColor: '#fdfdfd'
        });
        
        this.wireGraph = new WireGraph();
        
        this.wireEditor = new WireEditor(this.viewport, this.wireGraph);
        this.componentManager = new ComponentManager(this.viewport, this.wireGraph);
        this.selectionManager = new SelectionManager({
            viewport: this.viewport,
            wireGraph: this.wireGraph,
            componentManager: this.componentManager,
            wireEditor: this.wireEditor,
            isSelectionEnabled: () => !this.wireEditor.isActive && !this.selectedComponentId
        });
        this.netlistGenerator = new NetlistGenerator(this.componentManager, this.wireGraph);
        this._componentCounter = 1;
        this._designatorCounters = new Map();
        this.componentLibrary = {};
        this.selectedComponentId = null;
        this._ghostComponent = null;
        this._ghostDefinitionId = null;
        this._ghostDefinition = null;
        this._modalOpen = false;
        this._editingComponent = null;
        this._autoSaveInterval = null;
        
        // Simulation directives
        this.simulationDirectives = [];
        this.spiceWorker = null;
        this.spiceRunBtn = null;
        this.spiceStatusEl = null;
        this.spiceOutputEl = null;
        this.spicePlotEl = null;
        this.spinitContent = null;
        
        // Wire up UI elements
        this._setupUI();

        // Component placement
        this._setupPlacement();

        // Ghost preview
        this._setupGhostPreview();

        // Component editor modal
        this._setupComponentEditor();
        
        // Netlist modal
        this._setupNetlistModal();
        
        // Simulation modal
        this._setupSimulationModal();

        // Ngspice runner
        this._setupSimulationRunner();
        
        // Save/Load functionality
        this._setupSaveLoad();

        // Load component library
        this._loadComponentLibrary();
        
        // Keyboard handling
        this._setupKeyboard();
        
        // Load saved circuit from localStorage
        this._loadFromLocalStorage();
        
        // Setup auto-save
        this._setupAutoSave();
        
        // Initial render
        this.viewport.render();
        
        console.log('Circuit Editor initialized');
    }
    
    _setupUI() {
        // Zoom indicator
        const zoomIndicator = document.getElementById('zoom-indicator');
        if (zoomIndicator) {
            this.viewport.onZoomChange = (zoom) => {
                zoomIndicator.textContent = `${Math.round(zoom * 100)}%`;
            };
        }
        
        // Coordinate display
        const coordDisplay = document.getElementById('coord-display');
        if (coordDisplay) {
            const originalOnMouseMove = this.viewport.onMouseMove;
            this.viewport.onMouseMove = (worldX, worldY, event) => {
                const snapped = this.viewport.snapToGrid(worldX, worldY);
                coordDisplay.textContent = `X: ${snapped.x} Y: ${snapped.y}`;
                originalOnMouseMove?.(worldX, worldY, event);
            };
        }
        
        // Status message
        const statusMessage = document.getElementById('status-message');
        if (statusMessage) {
            this.wireEditor.onStatusChange = (message) => {
                statusMessage.textContent = message;
            };
        }
        
        // Clear button
        const clearBtn = document.getElementById('clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (confirm('Clear all components and wires?')) {
                    this.wireEditor.clear();
                    this.componentManager.components = [];
                    this.componentManager.pinNodeIdsByComponent.clear();
                    this._componentCounter = 1;
                    this._designatorCounters.clear();
                    this._saveToLocalStorage();
                    this.viewport.render();
                }
            });
        }
        
        // Tool buttons
        const toolButtons = document.querySelectorAll('.tool-btn');
        toolButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;
                this._setTool(tool);
                
                // Update active state
                toolButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    async _loadComponentLibrary() {
        try {
            this.componentLibrary = await loadLibrary({ seedLibrary: DEFAULT_COMPONENT_LIBRARY });
        } catch (error) {
            console.error('Failed to load component library', error);
            this.componentLibrary = { ...DEFAULT_COMPONENT_LIBRARY };
        }
        this._renderComponentPanel();
        const firstId = Object.keys(this.componentLibrary)[0] ?? null;
        if (firstId) {
            this._setSelectedComponent(firstId);
        }
    }

    _renderComponentPanel() {
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
            this._setTool('wire');
            this._updateToolButtons('wire');
        });
        list.appendChild(wireTool);

        for (const [id, definition] of entries) {
            const item = document.createElement('div');
            item.className = 'component-item';
            item.dataset.componentId = id;

            const svgMarkup = definition.svg ?? '';
            item.innerHTML = `
                <div class="component-thumb">${svgMarkup}</div>
                <div class="component-meta">
                    <div class="component-name">${definition.name || id}</div>
                    <div class="component-desc">${definition.description || ''}</div>
                </div>
            `;

            item.addEventListener('click', () => {
                this._setSelectedComponent(id);
            });

            list.appendChild(item);
        }
    }

    _setSelectedComponent(componentId) {
        this.selectionManager?.clearSelection();
        this.selectedComponentId = componentId;
        const list = document.getElementById('componentList');
        if (!list) return;
        list.querySelectorAll('.component-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.componentId === componentId);
        });

        if (componentId) {
            this._setTool('select');
            this._updateToolButtons('select');
        }
    }

    _clearSelection() {
        this.selectionManager?.clearSelection();
        this.selectedComponentId = null;
        const list = document.getElementById('componentList');
        if (list) {
            list.querySelectorAll('.component-item').forEach(item => {
                item.classList.remove('selected');
            });
        }
        this._ghostComponent = null;
        this._ghostDefinitionId = null;
        this._ghostDefinition = null;
    }
    
    _setTool(toolName) {
        switch (toolName) {
            case 'wire':
                this._clearSelection();
                this.wireEditor.setActive(true);
                this.canvas.style.cursor = 'crosshair';
                break;
            case 'select':
                this.wireEditor.setActive(false);
                this.canvas.style.cursor = 'default';
                break;
        }
    }
    
    _setupKeyboard() {
        document.addEventListener('keydown', (event) => {
            if (this._modalOpen && event.key === 'Escape') {
                this._closeComponentModal();
                return;
            }
            if (event.key === 'Escape') {
                this.wireEditor.handleKeyDown(event);
                this._clearSelection();
                this._setTool('select');
                this._updateToolButtons('select');
                this.viewport.render();
                return;
            }
            // Let wire editor handle first
            if (this.wireEditor.handleKeyDown(event)) {
                this.viewport.render();
                return;
            }
            
            // Global shortcuts
            switch (event.key.toLowerCase()) {
                case 'c':
                    if (!event.ctrlKey && !event.metaKey) {
                        const mouse = this.viewport.getMouseWorld();
                        const snapped = this.viewport.snapToGrid(mouse.x, mouse.y);
                        this._placeSelectedComponent(snapped);
                    }
                    break;
                case 'w':
                    if (!event.ctrlKey && !event.metaKey) {
                        this._setTool('wire');
                        this._updateToolButtons('wire');
                    }
                    break;
                case 's':
                    if (!event.ctrlKey && !event.metaKey) {
                        this._setTool('select');
                        this._updateToolButtons('select');
                    }
                    break;
                case 'r':
                    if (!event.ctrlKey && !event.metaKey) {
                        // Rotate ghost component during placement
                        if (this._ghostComponent && this.selectedComponentId) {
                            this._ghostComponent.rotate();
                            this.viewport.render();
                        } else {
                            // Rotate component under mouse cursor
                            const mouse = this.viewport.getMouseWorld();
                            const hit = this.componentManager.getComponentAt(mouse.x, mouse.y);
                            if (hit) {
                                hit.rotate();
                                this.viewport.render();
                            } else {
                                // Reset view if no component is under cursor and not in placement mode
                                this.viewport.resetView();
                            }
                        }
                    }
                    break;
            }
        });
    }

    _setupComponentEditor() {
        const overlay = document.getElementById('component-modal');
        const closeBtn = document.querySelector('.modal-close');
        const cancelBtn = document.getElementById('component-modal-cancel');
        const saveBtn = document.getElementById('component-modal-save');

        if (overlay) {
            overlay.addEventListener('click', (event) => {
                if (event.target === overlay) {
                    this._closeComponentModal();
                }
            });
        }

        closeBtn?.addEventListener('click', () => this._closeComponentModal());
        cancelBtn?.addEventListener('click', () => this._closeComponentModal());
        saveBtn?.addEventListener('click', () => this._saveComponentModal());

        this.canvas.addEventListener('dblclick', (event) => {
            if (this._modalOpen) return;
            const rect = this.canvas.getBoundingClientRect();
            const screenX = event.clientX - rect.left;
            const screenY = event.clientY - rect.top;
            const world = this.viewport.screenToWorld(screenX, screenY);
            const hit = this.componentManager.getComponentAt(world.x, world.y);
            if (!hit) return;
            event.preventDefault();
            this._openComponentModal(hit);
        });
    }

    _openComponentModal(component) {
        const overlay = document.getElementById('component-modal');
        const labelInput = document.getElementById('component-label-input');
        const valueField = document.getElementById('component-value-field');
        const valueInput = document.getElementById('component-value-input');
        const spiceInput = document.getElementById('component-spice-input');

        if (!overlay || !labelInput || !valueField || !valueInput || !spiceInput) return;

        const definition = component.meta?.definition;
        const defaultValue = definition?.defaultValue;
        const hasValue =
            component.meta?.valueText !== null &&
            component.meta?.valueText !== undefined ||
            (defaultValue !== null && defaultValue !== undefined);

        labelInput.value = component.meta?.designatorText ?? component.name ?? component.id ?? '';
        spiceInput.value = component.meta?.spiceModel ?? '';

        if (hasValue) {
            valueField.style.display = 'flex';
            valueInput.disabled = false;
            valueInput.value = component.meta?.valueText ?? defaultValue ?? '';
        } else {
            valueField.style.display = 'none';
            valueInput.disabled = true;
            valueInput.value = '';
        }

        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');
        this._modalOpen = true;
        this._editingComponent = component;
        labelInput.focus();
        labelInput.select();
    }

    _closeComponentModal() {
        const overlay = document.getElementById('component-modal');
        if (overlay) {
            overlay.classList.remove('is-open');
            overlay.setAttribute('aria-hidden', 'true');
        }
        this._modalOpen = false;
        this._editingComponent = null;
    }

    _saveComponentModal() {
        if (!this._editingComponent) {
            this._closeComponentModal();
            return;
        }

        const labelInput = document.getElementById('component-label-input');
        const valueField = document.getElementById('component-value-field');
        const valueInput = document.getElementById('component-value-input');
        const spiceInput = document.getElementById('component-spice-input');

        if (!labelInput || !valueField || !valueInput || !spiceInput) {
            this._closeComponentModal();
            return;
        }

        const label = labelInput.value.trim();
        const value = valueInput.value.trim();
        const spice = spiceInput.value.trim();

        this._editingComponent.meta.designatorText = label;
        if (valueField.style.display !== 'none') {
            this._editingComponent.meta.valueText = value;
        }
        this._editingComponent.meta.spiceModel = spice || null;

        this.viewport.render();
        this._closeComponentModal();
    }

    _setupPlacement() {
        const originalOnClick = this.viewport.onClick;
        this.viewport.onClick = (worldX, worldY, event) => {
            if (this.wireEditor.isActive) {
                originalOnClick?.(worldX, worldY, event);
                return;
            }

            if (!this.selectedComponentId) {
                originalOnClick?.(worldX, worldY, event);
                return;
            }

            const snapped = this.viewport.snapToGrid(worldX, worldY);
            const hit = this.componentManager.getComponentAt(snapped.x, snapped.y);
            if (!hit) {
                this._placeSelectedComponent(snapped);
            }

            originalOnClick?.(worldX, worldY, event);
        };
    }

    _setupGhostPreview() {
        const originalOnRender = this.viewport.onRender;
        this.viewport.onRender = (ctx, viewport) => {
            originalOnRender?.(ctx, viewport);
            this._renderGhostPreview(ctx, viewport);
        };
    }

    _renderGhostPreview(ctx, viewport) {
        if (this.wireEditor.isActive) return;
        if (!this.selectedComponentId) return;
        if (!viewport.showCrosshair) return;
        if (this.componentManager.isDragging) return;

        const definition = this.componentLibrary[this.selectedComponentId];
        if (!definition) return;

        const mouse = viewport.getMouseWorld();
        const snapped = viewport.snapToGrid(mouse.x, mouse.y);
        const ghost = this._getGhostComponent(definition, snapped);
        if (!ghost) return;

        this.componentManager.renderGhostComponent(ctx, viewport, ghost);
    }

    _getGhostComponent(definition, position) {
        const definitionId = this.selectedComponentId;
        const shouldRebuild =
            !this._ghostComponent ||
            this._ghostDefinitionId !== definitionId ||
            this._ghostDefinition !== definition;

        if (shouldRebuild) {
            this._ghostComponent = createComponentFromDefinition({
                instanceId: `ghost-${definitionId}`,
                definitionId,
                definition,
                position,
                designatorText: '',
                valueText: null
            });
            this._ghostDefinitionId = definitionId;
            this._ghostDefinition = definition;
        } else {
            this._ghostComponent.x = position.x;
            this._ghostComponent.y = position.y;
        }

        return this._ghostComponent;
    }

    _placeSelectedComponent(position) {
        const definitionId = this.selectedComponentId;
        const definition = this.componentLibrary[definitionId];
        if (!definition) return;

        const instanceId = `${definitionId}-${this._componentCounter++}`;
        const designatorText = this._nextDesignator(definition.designator);
        const valueText = definition.defaultValue ?? null;

        const component = createComponentFromDefinition({
            instanceId,
            definitionId,
            definition,
            position,
            designatorText,
            valueText
        });
        
        // Inherit rotation from ghost component if present
        if (this._ghostComponent) {
            component.rotation = this._ghostComponent.rotation || 0;
        }
        
        this.componentManager.addComponent(component);
    }

    _nextDesignator(designator) {
        if (!designator) return '';
        const prefix = designator.prefix ?? '';
        if (!designator.autoIncrement) return prefix;
        const next = (this._designatorCounters.get(prefix) ?? 0) + 1;
        this._designatorCounters.set(prefix, next);
        return `${prefix}${next}`;
    }
    
    _updateToolButtons(activeTool) {
        const toolButtons = document.querySelectorAll('.tool-btn');
        toolButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === activeTool);
        });
    }
    
    // ==================== Netlist Modal ====================
    
    _setupNetlistModal() {
        const netlistBtn = document.getElementById('netlist-btn');
        const netlistModal = document.getElementById('netlist-modal');
        const closeBtn = document.getElementById('netlist-modal-close');
        const copyBtn = document.getElementById('netlist-copy-btn');
        const downloadBtn = document.getElementById('netlist-download-btn');
        
        netlistBtn?.addEventListener('click', () => this._showNetlistModal());
        closeBtn?.addEventListener('click', () => this._closeNetlistModal());
        copyBtn?.addEventListener('click', () => this._copyNetlistToClipboard());
        downloadBtn?.addEventListener('click', () => this._downloadNetlist());
    }
    
    _showNetlistModal() {
        const modal = document.getElementById('netlist-modal');
        const content = document.getElementById('netlist-content');
        if (!modal || !content) return;
        
        try {
            const netlist = this.netlistGenerator.generate(this.simulationDirectives);
            content.textContent = netlist;
            modal.classList.add('is-open');
            modal.setAttribute('aria-hidden', 'false');
            this._modalOpen = true;
        } catch (error) {
            console.error('Failed to generate netlist:', error);
            content.textContent = `Error generating netlist:\n${error.message}`;
            modal.classList.add('is-open');
            modal.setAttribute('aria-hidden', 'false');
            this._modalOpen = true;
        }
    }
    
    _closeNetlistModal() {
        const modal = document.getElementById('netlist-modal');
        if (modal) {
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
        }
        this._modalOpen = false;
    }
    
    _copyNetlistToClipboard() {
        const content = document.getElementById('netlist-content');
        if (!content) return;
        
        navigator.clipboard.writeText(content.textContent)
            .then(() => {
                const btn = document.getElementById('netlist-copy-btn');
                const originalText = btn.innerHTML;
                btn.innerHTML = '<span class="material-symbols-outlined">check</span>Copied!';
                setTimeout(() => {
                    btn.innerHTML = originalText;
                }, 2000);
            })
            .catch(err => console.error('Failed to copy:', err));
    }
    
    _downloadNetlist() {
        const content = document.getElementById('netlist-content');
        if (!content) return;
        
        const blob = new Blob([content.textContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'circuit.cir';
        a.click();
        URL.revokeObjectURL(url);
    }
    
    // ==================== Simulation Modal ====================
    
    _setupSimulationModal() {
        const simBtn = document.getElementById('simulation-btn');
        const simBadge = document.getElementById('simulation-badge');
        const modal = document.getElementById('simulation-modal');
        const closeBtn = document.getElementById('simulation-modal-close');
        const doneBtn = document.getElementById('simulation-done-btn');
        const clearBtn = document.getElementById('simulation-clear-btn');
        
        simBtn?.addEventListener('click', () => this._showSimulationModal());
        simBadge?.addEventListener('click', () => this._showSimulationModal());
        closeBtn?.addEventListener('click', () => this._closeSimulationModal());
        doneBtn?.addEventListener('click', () => this._closeSimulationModal());
        clearBtn?.addEventListener('click', () => this._clearAllDirectives());
        
        // Tab switching
        const tabs = document.querySelectorAll('.sim-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetPanel = tab.dataset.tab;
                this._switchSimTab(targetPanel);
            });
        });
        
        // Add directive buttons
        document.getElementById('add-dc-btn')?.addEventListener('click', () => this._addDcDirective());
        document.getElementById('add-ac-btn')?.addEventListener('click', () => this._addAcDirective());
        document.getElementById('add-tran-btn')?.addEventListener('click', () => this._addTranDirective());
        document.getElementById('add-op-btn')?.addEventListener('click', () => this._addOpDirective());
        document.getElementById('add-custom-btn')?.addEventListener('click', () => this._addCustomDirective());
    }
    
    _showSimulationModal() {
        const modal = document.getElementById('simulation-modal');
        if (!modal) return;
        
        this._updateDirectivesList();
        this._updateSimulationPreview();
        
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        this._modalOpen = true;
    }
    
    _closeSimulationModal() {
        const modal = document.getElementById('simulation-modal');
        if (modal) {
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
        }
        this._modalOpen = false;
        this._updateSimulationBadge();
    }
    
    _switchSimTab(tabName) {
        // Update tabs
        document.querySelectorAll('.sim-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        // Update panels
        document.querySelectorAll('.sim-panel').forEach(panel => {
            panel.classList.toggle('active', panel.dataset.panel === tabName);
        });
    }
    
    _addDcDirective() {
        const source = document.getElementById('dc-source').value.trim();
        const start = document.getElementById('dc-start').value.trim();
        const stop = document.getElementById('dc-stop').value.trim();
        const step = document.getElementById('dc-step').value.trim();
        
        if (!source || !start || !stop || !step) {
            alert('Please fill in all DC sweep parameters');
            return;
        }
        
        const directive = {
            type: 'dc',
            text: `.dc ${source} ${start} ${stop} ${step}`,
            params: { source, start, stop, step }
        };
        
        this.simulationDirectives.push(directive);
        this._updateDirectivesList();
        this._updateSimulationPreview();
        
        // Clear inputs
        document.getElementById('dc-source').value = '';
        document.getElementById('dc-start').value = '';
        document.getElementById('dc-stop').value = '';
        document.getElementById('dc-step').value = '';
    }
    
    _addAcDirective() {
        const type = document.getElementById('ac-type').value;
        const points = document.getElementById('ac-points').value.trim();
        const fstart = document.getElementById('ac-fstart').value.trim();
        const fstop = document.getElementById('ac-fstop').value.trim();
        
        if (!points || !fstart || !fstop) {
            alert('Please fill in all AC analysis parameters');
            return;
        }
        
        const directive = {
            type: 'ac',
            text: `.ac ${type} ${points} ${fstart} ${fstop}`,
            params: { type, points, fstart, fstop }
        };
        
        this.simulationDirectives.push(directive);
        this._updateDirectivesList();
        this._updateSimulationPreview();
        
        // Clear inputs
        document.getElementById('ac-points').value = '';
        document.getElementById('ac-fstart').value = '';
        document.getElementById('ac-fstop').value = '';
    }
    
    _addTranDirective() {
        const tstep = document.getElementById('tran-tstep').value.trim();
        const tstop = document.getElementById('tran-tstop').value.trim();
        const tstart = document.getElementById('tran-tstart').value.trim();
        const tmax = document.getElementById('tran-tmax').value.trim();
        
        if (!tstep || !tstop) {
            alert('Please fill in required transient parameters (tstep and tstop)');
            return;
        }
        
        let text = `.tran ${tstep} ${tstop}`;
        if (tstart) text += ` ${tstart}`;
        if (tmax) text += ` ${tmax}`;
        
        const directive = {
            type: 'tran',
            text,
            params: { tstep, tstop, tstart, tmax }
        };
        
        this.simulationDirectives.push(directive);
        this._updateDirectivesList();
        this._updateSimulationPreview();
        
        // Clear inputs
        document.getElementById('tran-tstep').value = '';
        document.getElementById('tran-tstop').value = '';
        document.getElementById('tran-tstart').value = '';
        document.getElementById('tran-tmax').value = '';
    }
    
    _addOpDirective() {
        const directive = {
            type: 'op',
            text: '.op',
            params: {}
        };
        
        this.simulationDirectives.push(directive);
        this._updateDirectivesList();
        this._updateSimulationPreview();
    }
    
    _addCustomDirective() {
        const text = document.getElementById('custom-directive').value.trim();
        
        if (!text) {
            alert('Please enter custom directive text');
            return;
        }
        
        const directive = {
            type: 'custom',
            text,
            params: {}
        };
        
        this.simulationDirectives.push(directive);
        this._updateDirectivesList();
        this._updateSimulationPreview();
        
        // Clear input
        document.getElementById('custom-directive').value = '';
    }
    
    _clearAllDirectives() {
        if (this.simulationDirectives.length === 0) return;
        
        if (confirm('Clear all simulation directives?')) {
            this.simulationDirectives = [];
            this._updateDirectivesList();
            this._updateSimulationPreview();
            this._updateSimulationBadge();
        }
    }
    
    _removeDirective(index) {
        this.simulationDirectives.splice(index, 1);
        this._updateDirectivesList();
        this._updateSimulationPreview();
        this._updateSimulationBadge();
    }
    
    _updateDirectivesList() {
        const container = document.getElementById('active-directives');
        if (!container) return;
        
        if (this.simulationDirectives.length === 0) {
            container.innerHTML = '<div style=\"color: #94a3b8; font-size: 12px; padding: 12px; text-align: center;\">No directives added yet</div>';
            return;
        }
        
        container.innerHTML = this.simulationDirectives.map((dir, idx) => `
            <div class="directive-item">
                <span>${dir.text}</span>
                <div class="directive-item-actions">
                    <button onclick="window.circuitEditor._removeDirective(${idx})">Remove</button>
                </div>
            </div>
        `).join('');
    }
    
    _updateSimulationPreview() {
        const preview = document.getElementById('sim-preview');
        if (!preview) return;
        
        if (this.simulationDirectives.length === 0) {
            preview.textContent = '* No directives';
            return;
        }
        
        const lines = this.simulationDirectives.map(dir => dir.text);
        preview.textContent = lines.join('\n');
    }
    
    _updateSimulationBadge() {
        const badge = document.getElementById('simulation-badge');
        const badgeText = document.getElementById('simulation-badge-text');
        if (!badge || !badgeText) return;
        
        if (this.simulationDirectives.length === 0) {
            badge.classList.remove('active');
            badgeText.textContent = 'No Sim';
        } else {
            badge.classList.add('active');
            const types = [...new Set(this.simulationDirectives.map(d => d.type.toUpperCase()))];
            badgeText.textContent = types.join(', ');
        }
    }

    // ==================== Ngspice Runner ====================

    _setupSimulationRunner() {
        this.spiceRunBtn = document.getElementById('sim-run-btn');
        this.spiceStatusEl = document.getElementById('sim-status');
        this.spiceOutputEl = document.getElementById('sim-log');
        this.spicePlotEl = document.getElementById('sim-plot');

        if (this.spiceRunBtn) {
            this.spiceRunBtn.addEventListener('click', () => this._runNgspiceSimulation());
        }

        // Show initial status
        this._setRunStatus('ready', 'Ready to simulate');

        this._loadSpinitFile();
    }

    async _loadSpinitFile() {
        try {
            const res = await fetch('/spinit');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            this.spinitContent = await res.text();
            console.log('Loaded spinit');
        } catch (error) {
            console.warn('Could not load spinit:', error.message || error);
        }
    }

    _runNgspiceSimulation() {
        if (!this.spiceRunBtn || !this.spiceStatusEl || !this.spiceOutputEl) return;
        
        let netlistData;
        try {
            netlistData = this.netlistGenerator.generateWithMetadata(this.simulationDirectives, {
                includeControlBlock: true
            });
        } catch (error) {
            this._setRunStatus('error', 'Failed to generate netlist');
            this._appendRunOutput(`[error] ${error.message}`);
            return;
        }

        const { netlist } = netlistData;

        this.spiceOutputEl.textContent = 'Starting simulation...';
        this._clearPlot();
        this._appendRunOutput('');
        this._appendRunOutput('* --- Netlist sent to ngspice ---');
        this._appendRunOutput(netlist);
        this._appendRunOutput('* --------------------------------');

        this._setRunStatus('running', 'Running simulation...');
        this.spiceRunBtn.disabled = true;

        if (this.spiceWorker) {
            this.spiceWorker.terminate();
            this.spiceWorker = null;
        }

        this.spiceWorker = new Worker('/ngspice-worker.js');
        const worker = this.spiceWorker;

        worker.onmessage = (e) => {
            const { type, text, message, outputData, stdout, stderr, stack } = e.data;
            switch (type) {
                case 'ready':
                    worker.postMessage({ 
                        type: 'run', 
                        netlist,
                        spinit: this.spinitContent
                    });
                    break;
                case 'status':
                    this._appendRunOutput(`[status] ${text}`);
                    break;
                case 'stdout':
                    this._appendRunOutput(text);
                    break;
                case 'stderr':
                    this._appendRunOutput(`[stderr] ${text}`);
                    break;
                case 'complete':
                    this._setRunStatus('ready', 'Simulation complete');
                    this.spiceRunBtn.disabled = false;
                    if (outputData) {
                        this._appendRunOutput('--- output.txt ---');
                        this._appendRunOutput(outputData);
                        this._plotResults(outputData);
                    } else {
                        this._appendRunOutput('[note] No output.txt file generated');
                        if (stdout) {
                            this._appendRunOutput(stdout);
                            this._tryParsePrintOutput(stdout);
                        }
                        if (stderr) this._appendRunOutput(stderr);
                    }
                    worker.terminate();
                    this.spiceWorker = null;
                    break;
                case 'error':
                    this._setRunStatus('error', 'Simulation failed');
                    this.spiceRunBtn.disabled = false;
                    this._appendRunOutput(`[error] ${message}`);
                    if (stack) this._appendRunOutput(stack);
                    worker.terminate();
                    this.spiceWorker = null;
                    break;
                default:
                    break;
            }
        };

        worker.onerror = (err) => {
            this._setRunStatus('error', 'Worker error');
            this.spiceRunBtn.disabled = false;
            this._appendRunOutput(`[worker] ${err.message}`);
            worker.terminate();
            this.spiceWorker = null;
        };
    }

    _setRunStatus(state, text) {
        if (!this.spiceStatusEl) return;
        this.spiceStatusEl.textContent = text;
        this.spiceStatusEl.classList.remove('run-ready', 'run-running', 'run-error');
        switch (state) {
            case 'running':
                this.spiceStatusEl.classList.add('run-running');
                break;
            case 'error':
                this.spiceStatusEl.classList.add('run-error');
                break;
            default:
                this.spiceStatusEl.classList.add('run-ready');
        }
    }

    _appendRunOutput(line) {
        if (!this.spiceOutputEl) return;
        const current = this.spiceOutputEl.textContent || '';
        const next = current ? `${current}\n${line}` : line;
        this.spiceOutputEl.textContent = next;
        this.spiceOutputEl.scrollTop = this.spiceOutputEl.scrollHeight;
    }

    _clearPlot() {
        if (!this.spicePlotEl) return;
        if (window.Plotly) {
            try { window.Plotly.purge(this.spicePlotEl); } catch (_) {}
        }
        this.spicePlotEl.innerHTML = '<div style="color: #94a3b8; font-size: 12px;">No data yet</div>';
    }

    _tryParsePrintOutput(stdout) {
        if (!stdout) return;
        const lines = stdout.split('\n');
        const dataLines = lines.filter(line => {
            const trimmed = line.trim();
            return /^\d/.test(trimmed) || /^-?\d*\.\d+/.test(trimmed);
        });
        if (dataLines.length > 0) {
            this._plotResults(dataLines.join('\n'));
        }
    }

    _plotResults(data) {
        if (!this.spicePlotEl) return;
        if (!data || !data.trim()) return;
        if (!window.Plotly) {
            this._appendRunOutput('[note] Plotly not loaded; cannot plot results');
            return;
        }

        const lines = data.trim().split('\n').filter(l => {
            if (!l) return false;
            if (l.startsWith('#') || l.startsWith('N')) return false;
            if (l.includes('Index') || l.toLowerCase().includes('time')) return false;
            return true;
        });

        if (lines.length === 0) {
            this._appendRunOutput('[note] No plottable data found');
            return;
        }

        const time = [];
        const signals = {};

        lines.forEach((line) => {
            const parts = line.trim().split(/\s+/).map(Number);
            if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
                time.push(parts[0]);
                parts.slice(1).forEach((val, i) => {
                    const sigName = i === 0 ? 'V(in)' : i === 1 ? 'V(out)' : `Signal ${i + 1}`;
                    if (!signals[sigName]) signals[sigName] = [];
                    signals[sigName].push(val);
                });
            }
        });

        if (time.length === 0) {
            this._appendRunOutput('[note] Unable to parse data for plotting');
            return;
        }

        const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b'];
        const traces = Object.entries(signals).map(([name, values], i) => ({
            x: time,
            y: values,
            type: 'scatter',
            mode: 'lines',
            name,
            line: { color: colors[i % colors.length], width: 2 }
        }));

        const layout = {
            paper_bgcolor: '#0d1b2a',
            plot_bgcolor: '#0d1b2a',
            font: { color: '#e2e8f0' },
            xaxis: {
                title: 'Time (s)',
                gridcolor: '#1f2937',
                zerolinecolor: '#1f2937'
            },
            yaxis: {
                title: 'Voltage (V)',
                gridcolor: '#1f2937',
                zerolinecolor: '#1f2937'
            },
            margin: { t: 30, r: 20, b: 50, l: 55 },
            legend: {
                x: 1,
                xanchor: 'right',
                y: 1,
                bgcolor: 'rgba(13, 27, 42, 0.85)'
            }
        };

        window.Plotly.newPlot(this.spicePlotEl, traces, layout, { responsive: true });
    }
    
    // ==================== Save/Load ====================
    
    _setupSaveLoad() {
        const saveBtn = document.getElementById('save-btn');
        const loadBtn = document.getElementById('load-btn');
        const fileInput = document.getElementById('file-input');
        
        saveBtn?.addEventListener('click', () => this._saveToFile());
        loadBtn?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', (e) => this._loadFromFile(e));
    }
    
    _serialize() {
        return {
            version: 1,
            components: this.componentManager.components.map(comp => ({
                id: comp.id,
                name: comp.name,
                x: comp.x,
                y: comp.y,
                width: comp.width,
                height: comp.height,
                rotation: comp.rotation,
                pins: comp.pins,
                meta: comp.meta
            })),
            wires: this.wireGraph.toJSON(),
            simulation: this.simulationDirectives,
            counters: {
                component: this._componentCounter,
                designators: Array.from(this._designatorCounters.entries())
            }
        };
    }
    
    _deserialize(data) {
        // Clear current circuit
        this.componentManager.components = [];
        this.componentManager.pinNodeIdsByComponent.clear();
        this.wireGraph.clear();
        this.simulationDirectives = [];
        
        // Restore wires first
        if (data.wires) {
            this.wireGraph.fromJSON(data.wires);
        }
        
        // Restore components
        if (data.components) {
            for (const compData of data.components) {
                const component = new Component({
                    id: compData.id,
                    name: compData.name,
                    x: compData.x,
                    y: compData.y,
                    width: compData.width,
                    height: compData.height,
                    pins: compData.pins,
                    meta: compData.meta,
                    rotation: compData.rotation || 0
                });
                this.componentManager.components.push(component);
                this.componentManager._registerComponentPins(component);
            }
        }
        
        // Restore counters
        if (data.counters) {
            this._componentCounter = data.counters.component || 1;
            this._designatorCounters = new Map(data.counters.designators || []);
        }
        
        // Restore simulation directives
        if (data.simulation) {
            this.simulationDirectives = data.simulation;
            this._updateSimulationBadge();
        }
        
        this.viewport.render();
    }
    
    _saveToFile() {
        const data = this._serialize();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'circuit.spicepad';
        a.click();
        URL.revokeObjectURL(url);
    }
    
    _loadFromFile(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                this._deserialize(data);
            } catch (error) {
                console.error('Failed to load circuit:', error);
                alert('Failed to load circuit file. Please check the file format.');
            }
        };
        reader.readAsText(file);
        
        // Reset file input
        event.target.value = '';
    }
    
    _saveToLocalStorage() {
        try {
            const data = this._serialize();
            localStorage.setItem('spicepad_circuit', JSON.stringify(data));
        } catch (error) {
            console.error('Failed to save to localStorage:', error);
        }
    }
    
    _loadFromLocalStorage() {
        try {
            const stored = localStorage.getItem('spicepad_circuit');
            if (stored) {
                const data = JSON.parse(stored);
                this._deserialize(data);
                console.log('Loaded circuit from localStorage');
            }
        } catch (error) {
            console.error('Failed to load from localStorage:', error);
        }
    }
    
    _setupAutoSave() {
        // Save to localStorage every 5 seconds
        this._autoSaveInterval = setInterval(() => {
            this._saveToLocalStorage();
        }, 5000);
        
        // Also save on window unload
        window.addEventListener('beforeunload', () => {
            this._saveToLocalStorage();
        });
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.circuitEditor = new CircuitEditorApp();
});

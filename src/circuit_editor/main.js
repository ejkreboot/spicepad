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
import { ProbeManager } from './ProbeManager.js';
import { UndoManager, UNDO_TYPES } from './UndoManager.js';
import { loadLibrary, replaceLibrary } from '../common/storage/library.js';
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
            isSelectionEnabled: () => !this.wireEditor.isActive && !this.selectedComponentId && this._currentTool !== 'probe',
            onGroupDragComplete: (moveData) => this._onGroupDragComplete(moveData)
        });
        this.netlistGenerator = new NetlistGenerator(this.componentManager, this.wireGraph);
        this.probeManager = new ProbeManager(this.viewport, this.wireGraph, this.componentManager);
        this.netlistGenerator.setProbeManager(this.probeManager);
        this.undoManager = new UndoManager();
        this._componentCounter = 1;
        this._designatorCounters = new Map();
        this.componentLibrary = {};
        this.selectedComponentId = null;
        this._ghostComponent = null;
        this._ghostDefinitionId = null;
        this._ghostDefinition = null;
        this._modalOpen = false;
        this._editingComponent = null;
        this._subcircuitModalResolver = null;
        this._subcircuitModalEls = null;
        this._autoSaveInterval = null;
        this._currentTool = 'select'; // Track current tool: 'select', 'wire', 'probe'
        this._plotCounter = 0; // Unique plot IDs
        
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
        
        // Component drag end callback for auto-connection
        this.componentManager.onComponentDragEnd = (component) => {
            this._autoConnectPinsToWires(component);
        };

        // Ghost preview
        this._setupGhostPreview();

        // Component editor modal
        this._setupComponentEditor();

        // Subcircuit entry modal
        this._setupSubcircuitModal();
        
        // Netlist modal
        this._setupNetlistModal();
        
        // Simulation modal
        this._setupSimulationModal();

        // Ngspice runner
        this._setupSimulationRunner();
        
        // Save/Load functionality
        this._setupSaveLoad();

        // Library import/export
        this._setupLibraryImport();

        // Load component library
        this._loadComponentLibrary();
        
        // Keyboard handling
        this._setupKeyboard();
        
        // Load saved circuit from localStorage
        this._loadFromLocalStorage();
        
        // Setup auto-save
        this._setupAutoSave();
        
        // Setup results panel resize
        this._setupResultsPanelResize();
        
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
                    this.probeManager.clear();
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
                
                // Show/hide probe type selector based on tool
                this._updateProbeTypeSelector(tool);
            });
        });
        
        // Probe type selector buttons
        const probeTypeButtons = document.querySelectorAll('.probe-type-btn');
        probeTypeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const probeType = btn.dataset.probeType;
                this.probeManager.setProbeType(probeType);
                
                // Update active state
                this._setActiveProbeTypeButton(probeType);
                
                // Re-render to show updated ghost preview
                this.viewport.render();
            });
        });

        // Sync initial state
        this._setActiveProbeTypeButton(this.probeManager.getProbeType());
    }
    
    /**
     * Show/hide the probe type selector based on the current tool
     * @param {string} tool - The current tool name
     */
    _updateProbeTypeSelector(tool) {
        const probeTypeSelector = document.getElementById('probe-type-selector');
        if (probeTypeSelector) {
            probeTypeSelector.style.display = tool === 'probe' ? 'inline-flex' : 'none';
        }
    }

    _setActiveProbeTypeButton(probeType) {
        const buttons = document.querySelectorAll('.probe-type-btn');
        buttons.forEach(b => b.classList.toggle('active', b.dataset.probeType === probeType));
    }

    async _loadComponentLibrary() {
        try {
            this.componentLibrary = await loadLibrary({ seedLibrary: DEFAULT_COMPONENT_LIBRARY });
        } catch (error) {
            console.error('Failed to load component library', error);
            this.componentLibrary = { ...DEFAULT_COMPONENT_LIBRARY };
        }
        this._ensureSubcircuitPlaceholder();
        this._renderComponentPanel();
        // Start with select tool active and no component selected
        // Need to call _setTool to properly initialize tool state, but without clearing selection
        this.wireEditor.setActive(false);
        this.probeManager.setGhostPosition(null);
        this.canvas.style.cursor = 'default';
        this._updateToolButtons('select');
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

    _setupLibraryImport() {
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
                this._ghostComponent = null;
                this._ghostDefinitionId = null;
                this._ghostDefinition = null;

                await replaceLibrary(parsed);

                this._ensureSubcircuitPlaceholder();
                this._renderComponentPanel();
                const firstId = Object.keys(parsed)[0] ?? null;
                if (firstId) {
                    this._setSelectedComponent(firstId);
                } else {
                    this._clearSelection();
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
            item.title = definition.name || id; // Tooltip on hover

            const svgMarkup = definition.svg ?? '';
            item.innerHTML = `
                <div class="component-thumb">${svgMarkup}</div>
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
        
        // Deselect all tool buttons (action buttons) when a component is selected
        const toolButtons = document.querySelectorAll('.tool-btn');
        toolButtons.forEach(btn => btn.classList.remove('active'));
        
        // Clear the current tool to indicate component placement mode
        this._currentTool = null;
        this.wireEditor.setActive(false);
        this.probeManager.setGhostPosition(null);
        this.canvas.style.cursor = 'crosshair';
        
        // Hide probe type selector since we're in component placement mode
        this._updateProbeTypeSelector(null);
    }

    _clearSelection() {
        this.selectionManager?.clearSelection();
        this.selectedComponentId = null;
        this.probeManager.selectedProbeId = null;
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
        this._currentTool = toolName;
        switch (toolName) {
            case 'wire':
                this._clearSelection();
                this.wireEditor.setActive(true);
                this.probeManager.setGhostPosition(null);
                this.canvas.style.cursor = 'crosshair';
                break;
            case 'probe':
                this._clearSelection();
                this.wireEditor.setActive(false);
                this.canvas.style.cursor = 'crosshair';
                this._setActiveProbeTypeButton(this.probeManager.getProbeType());
                break;
            case 'delete':
                this._clearSelection();
                this.wireEditor.setActive(false);
                this.probeManager.setGhostPosition(null);
                this.canvas.style.cursor = 'not-allowed';
                break;
            case 'select':
                this._clearSelection();
                this.wireEditor.setActive(false);
                this.probeManager.setGhostPosition(null);
                this.canvas.style.cursor = 'default';
                break;
        }
        
        // Update probe type selector visibility
        this._updateProbeTypeSelector(toolName);
    }
    
    _setupKeyboard() {
        document.addEventListener('keydown', (event) => {
            const isFormField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName) || event.target?.isContentEditable;

            // If any modal is open, only allow Escape to close the component modal; let other keys through to inputs.
            if (this._modalOpen) {
                if (event.key === 'Escape') {
                    this._closeComponentModal();
                    this._cancelSubcircuitModal();
                }
                return;
            }

            // When typing in inputs outside modals, avoid stealing keys like Delete/Backspace.
            if (isFormField) return;
            if (event.key === 'Escape') {
                this.wireEditor.handleKeyDown(event);
                this._clearSelection();
                this._setTool('select');
                this._updateToolButtons('select');
                this.viewport.render();
                return;
            }
            
            // Cmd/Ctrl + Enter to run simulation
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                this._runNgspiceSimulation();
                return;
            }
            
            // Cmd/Ctrl + Z for undo, Cmd/Ctrl + Shift + Z for redo
            if (event.key === 'z' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                if (event.shiftKey) {
                    this._redo();
                } else {
                    this._undo();
                }
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
					void this._placeSelectedComponent(snapped);
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
                case 'p':
                    if (!event.ctrlKey && !event.metaKey) {
                        this._setTool('probe');
                        this._updateToolButtons('probe');
                    }
                    break;
                case 'd':
                    if (!event.ctrlKey && !event.metaKey) {
                        this._setTool('delete');
                        this._updateToolButtons('delete');
                    }
                    break;
                case 'r':
                    if (!event.ctrlKey && !event.metaKey) {
                        // Rotate ghost component during placement
                        if (this._ghostComponent && this.selectedComponentId) {
                            this._ghostComponent.rotate();
                            this.viewport.render();
                        } else if (this._currentTool === 'probe') {
                            // Rotate probe ghost or selected probe
                            if (this.probeManager.selectedProbeId) {
                                this.probeManager.rotateProbe(this.probeManager.selectedProbeId);
                            } else {
                                this.probeManager.rotateGhost();
                            }
                        } else {
                            // Rotate component under mouse cursor
                            const mouse = this.viewport.getMouseWorld();
                            const hit = this.componentManager.getComponentAt(mouse.x, mouse.y);
                            if (hit) {
                                hit.rotate();
                                this.viewport.render();
                            } else {
                                // Check for probe under cursor
                                const probe = this.probeManager.getProbeAt(mouse.x, mouse.y);
                                if (probe) {
                                    this.probeManager.rotateProbe(probe.id);
                                } else {
                                    // Reset view if nothing is under cursor
                                    this.viewport.resetView();
                                }
                            }
                        }
                    }
                    break;
                case 'delete':
                case 'backspace':
                    if (!event.ctrlKey && !event.metaKey) {
                        this._deleteSelected();
                        event.preventDefault();
                    }
                    break;
            }
        });
    }
    
    /**
     * Delete all selected items (components, wires, and probes)
     */
    _deleteSelected() {
        let deleted = false;
        
        // Delete selected probe
        if (this.probeManager.selectedProbeId) {
            const probe = this.probeManager.probes.find(p => p.id === this.probeManager.selectedProbeId);
            if (probe) {
                this.undoManager.recordAction(UNDO_TYPES.DELETE_PROBE, {
                    probe: { ...probe }
                });
                this.probeManager.removeProbe(probe.id);
                deleted = true;
            }
        }
        
        // Delete selected components and wires via SelectionManager
        if (this.selectionManager.deleteSelected()) {
            deleted = true;
        }
        
        if (deleted) {
            this._saveToLocalStorage();
            this.viewport.render();
        }
    }
    
    /**
     * Delete item at the given world position (for delete tool)
     * @param {number} worldX
     * @param {number} worldY
     */
    _deleteItemAt(worldX, worldY) {
        let deleted = false;
        
        // Check for probe first
        const probe = this.probeManager.getProbeAt(worldX, worldY);
        if (probe) {
            this.undoManager.recordAction(UNDO_TYPES.DELETE_PROBE, {
                probe: { ...probe }
            });
            this.probeManager.removeProbe(probe.id);
            deleted = true;
        }
        
        // Check for component
        if (!deleted) {
            const component = this.componentManager.getComponentAt(worldX, worldY);
            if (component) {
                // Record full state before deletion to preserve wire connections
                this.undoManager.recordAction(UNDO_TYPES.FULL_STATE, {
                    stateBefore: this._serialize(),
                    description: 'Delete component'
                });
                this.componentManager.removeComponent(component.id);
                // Record state after for redo
                const lastAction = this.undoManager.undoStack[this.undoManager.undoStack.length - 1];
                if (lastAction) {
                    lastAction.data.stateAfter = this._serialize();
                }
                deleted = true;
            }
        }
        
        // Check for wire segment
        if (!deleted) {
            const segmentHit = this.wireGraph.getSegmentAt(worldX, worldY, this.wireEditor.segmentHitTolerance ?? 5);
            if (segmentHit) {
                const segment = segmentHit.segment;
                const node1 = this.wireGraph.getNode(segment.nodeId1);
                const node2 = this.wireGraph.getNode(segment.nodeId2);
                this.undoManager.recordAction(UNDO_TYPES.DELETE_WIRE_SEGMENT, {
                    segment: {
                        nodeId1: segment.nodeId1,
                        nodeId2: segment.nodeId2,
                        node1: { x: node1?.x, y: node1?.y },
                        node2: { x: node2?.x, y: node2?.y }
                    }
                });
                this.wireGraph.removeSegment(segmentHit.segment.nodeId1, segmentHit.segment.nodeId2);
                this.wireGraph.cleanup();
                deleted = true;
            }
        }
        
        if (deleted) {
            this._saveToLocalStorage();
            this.viewport.render();
        }
    }

    _setupComponentEditor() {
        // Component modal
        const overlay = document.getElementById('component-modal');
        const closeBtn = document.querySelector('#component-modal .modal-close');
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
        
        // Probe modal
        const probeOverlay = document.getElementById('probe-modal');
        const probeCloseBtn = document.querySelector('#probe-modal .modal-close');
        const probeCancelBtn = document.getElementById('probe-modal-cancel');
        const probeSaveBtn = document.getElementById('probe-modal-save');
        
        if (probeOverlay) {
            probeOverlay.addEventListener('click', (event) => {
                if (event.target === probeOverlay) {
                    this._closeProbeModal();
                }
            });
        }
        
        probeCloseBtn?.addEventListener('click', () => this._closeProbeModal());
        probeCancelBtn?.addEventListener('click', () => this._closeProbeModal());
        probeSaveBtn?.addEventListener('click', () => this._saveProbeModal());

        this.canvas.addEventListener('dblclick', (event) => {
            if (this._modalOpen) return;
            const rect = this.canvas.getBoundingClientRect();
            const screenX = event.clientX - rect.left;
            const screenY = event.clientY - rect.top;
            const world = this.viewport.screenToWorld(screenX, screenY);
            
            // Check for probe first
            const probe = this.probeManager.getProbeAt(world.x, world.y);
            if (probe) {
                event.preventDefault();
                this._editProbeLabel(probe);
                return;
            }
            
            const hit = this.componentManager.getComponentAt(world.x, world.y);
            if (!hit) return;
            event.preventDefault();
            this._openComponentModal(hit);
        });
    }
    
    _editProbeLabel(probe) {
        this._openProbeModal(probe);
    }
    
    _openProbeModal(probe) {
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
        
        // Focus input and select text
        setTimeout(() => {
            input.focus();
            input.select();
        }, 100);
        
        // Allow Enter key to save
        const handleEnter = (e) => {
            if (e.key === 'Enter') {
                this._saveProbeModal();
                input.removeEventListener('keydown', handleEnter);
            }
        };
        input.addEventListener('keydown', handleEnter);
    }
    
    _closeProbeModal() {
        const modal = document.getElementById('probe-modal');
        if (modal) {
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
        }
        this._modalOpen = false;
        this._editingProbe = null;
    }
    
    _saveProbeModal() {
        const input = document.getElementById('probe-label-input');
        const typeSelect = document.getElementById('probe-type-select');
        const colorInput = document.getElementById('probe-color-input');
        if (!input || !typeSelect || !colorInput || !this._editingProbe) {
            this._closeProbeModal();
            return;
        }
        
        const newLabel = input.value.trim();
        if (newLabel === '') {
            alert('Probe name cannot be empty.');
            return;
        }
        
        // Check if the new label is unique
        if (!this.probeManager.isProbeLabelUnique(newLabel, this._editingProbe.id)) {
            alert(`The name "${newLabel}" is already in use. Please choose a unique name.`);
            return;
        }
        
        const newType = typeSelect.value;
        const newColor = colorInput.value;
        
        this.probeManager.updateProbeLabel(this._editingProbe.id, newLabel);
        this.probeManager.updateProbeType(this._editingProbe.id, newType);
        this.probeManager.updateProbeColor(this._editingProbe.id, newColor);
        this._saveToLocalStorage();
        this._closeProbeModal();
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

    _parseSubcircuitHeader(definition = '') {
        const params = [];
        if (typeof definition !== 'string' || !definition.trim()) {
            return { name: '', params };
        }

        const headerLine = definition
            .split(/\r?\n/)
            .map(line => line.trim())
            .find(line => line && !line.startsWith('*') && /^\.subckt/i.test(line));

        if (!headerLine) return { name: '', params };

        const tokens = headerLine.split(/\s+/).filter(Boolean);
        if (tokens.length < 2) return { name: '', params };

        let collectingParams = false;
        for (let i = 2; i < tokens.length; i += 1) {
            const token = tokens[i];
            const lowered = token.toLowerCase();

            if (lowered === 'params:' || lowered === 'param:' || lowered === 'par:') {
                collectingParams = true;
                continue;
            }

            const hasEquals = token.includes('=');
            if (hasEquals || collectingParams) {
                const [namePart, ...rest] = token.split('=');
                const name = namePart?.trim();
                if (!name) continue;
                const defaultValue = rest.join('=').trim();
                params.push({ name, defaultValue });
                collectingParams = true;
            }
        }

        return { name: tokens[1], params };
    }

    _splitSubcircuitDefinition(definition = '', fallbackName = 'SUB') {
        const lines = (typeof definition === 'string' ? definition : '').split(/\r?\n/);
        const trimmed = lines.map(line => line.replace(/\s+$/u, ''));
        const headerIndex = trimmed.findIndex(line => line && !line.startsWith('*') && /^\.subckt/i.test(line));
        const endsIndex = (() => {
            for (let i = trimmed.length - 1; i >= 0; i -= 1) {
                if (/^\.ends\b/i.test(trimmed[i].trim())) return i;
            }
            return -1;
        })();

        const headerName = this._parseSubcircuitHeader(definition).name || fallbackName;
        const headerLine = headerIndex >= 0 ? trimmed[headerIndex] : `.subckt ${headerName}`;
        const endsLine = endsIndex >= 0 ? trimmed[endsIndex] : `.ends ${headerName}`;

        const bodyStart = headerIndex >= 0 ? headerIndex + 1 : 0;
        const bodyEnd = endsIndex >= 0 ? endsIndex : trimmed.length;
        const bodyLines = trimmed
            .slice(bodyStart, bodyEnd)
            .filter(line => line && !/^\.subckt/i.test(line.trim()) && !/^\.ends\b/i.test(line.trim()));

        const prefix = headerIndex > 0 ? trimmed.slice(0, headerIndex).filter(Boolean) : [];
        const suffix = endsIndex >= 0 && endsIndex < trimmed.length - 1
            ? trimmed.slice(endsIndex + 1).filter(Boolean)
            : [];

        return {
            header: headerLine,
            ends: endsLine,
            bodyLines,
            prefix,
            suffix,
            name: headerName
        };
    }

    _setupSubcircuitModal() {
        const modal = document.getElementById('subcircuit-modal');
        const textarea = document.getElementById('subcircuit-text');
        const okBtn = document.getElementById('subcircuit-modal-ok');
        const cancelBtn = document.getElementById('subcircuit-modal-cancel');
        const closeBtn = modal?.querySelector('.modal-close');
        const errorEl = document.getElementById('subcircuit-modal-error');

        if (!modal || !textarea || !okBtn || !cancelBtn || !errorEl) return;

        this._subcircuitModalEls = { modal, textarea, okBtn, cancelBtn, errorEl };

        okBtn.addEventListener('click', () => this._handleSubcircuitSubmit());
        cancelBtn.addEventListener('click', () => this._cancelSubcircuitModal());
        closeBtn?.addEventListener('click', () => this._cancelSubcircuitModal());
    }

    _promptSubcircuitDefinition() {
        if (!this._subcircuitModalEls) {
            // Fallback for environments where the modal markup is unavailable
            const text = window.prompt('Paste a .subckt definition to create this subcircuit:');
            if (!text) return Promise.resolve(null);
            try {
                const parsed = this._parseUserSubcircuitInput(text);
                return Promise.resolve(parsed);
            } catch (error) {
                alert(error?.message || 'Invalid subcircuit definition.');
                return Promise.resolve(null);
            }
        }

        this._subcircuitModalEls.textarea.value = '';
        this._setSubcircuitError('');
        this._subcircuitModalEls.modal.classList.add('is-open');
        this._subcircuitModalEls.modal.setAttribute('aria-hidden', 'false');
        this._modalOpen = true;

        return new Promise((resolve) => {
            this._subcircuitModalResolver = resolve;
            setTimeout(() => this._subcircuitModalEls?.textarea?.focus(), 0);
        });
    }

    _handleSubcircuitSubmit() {
        if (!this._subcircuitModalEls) return;
        const raw = this._subcircuitModalEls.textarea.value;
        try {
            const parsed = this._parseUserSubcircuitInput(raw);
            this._finishSubcircuitModal(parsed);
        } catch (error) {
            this._setSubcircuitError(error?.message || 'Invalid subcircuit definition.');
        }
    }

    _finishSubcircuitModal(result) {
        if (this._subcircuitModalEls?.modal) {
            this._subcircuitModalEls.modal.classList.remove('is-open');
            this._subcircuitModalEls.modal.setAttribute('aria-hidden', 'true');
        }
        this._modalOpen = false;
        const resolver = this._subcircuitModalResolver;
        this._subcircuitModalResolver = null;
        resolver?.(result || null);
    }

    _cancelSubcircuitModal() {
        if (this._subcircuitModalResolver) {
            this._finishSubcircuitModal(null);
        } else if (this._subcircuitModalEls?.modal?.classList.contains('is-open')) {
            this._finishSubcircuitModal(null);
        }
    }

    _setSubcircuitError(message = '') {
        if (!this._subcircuitModalEls?.errorEl) return;
        if (message) {
            this._subcircuitModalEls.errorEl.textContent = message;
            this._subcircuitModalEls.errorEl.style.display = 'block';
        } else {
            this._subcircuitModalEls.errorEl.textContent = '';
            this._subcircuitModalEls.errorEl.style.display = 'none';
        }
    }

    _parseUserSubcircuitInput(text = '') {
        const trimmed = (text || '').trim();
        if (!trimmed) {
            throw new Error('Paste a .subckt definition to continue.');
        }

        const lines = trimmed.split(/\r?\n/).map((line) => line.replace(/\s+$/u, ''));
        const headerLine = lines
            .map(line => line.trim())
            .find(line => line && !line.startsWith('*') && /^\.subckt/i.test(line));

        if (!headerLine) {
            throw new Error('Missing .subckt line. Start your block with ".subckt NAME pin1 pin2 ...".');
        }

        const tokens = headerLine.split(/\s+/).filter(Boolean);
        if (tokens.length < 3) {
            throw new Error('The .subckt line must include a name and at least one pin.');
        }

        const name = tokens[1];
        const pins = [];
        let collectingParams = false;
        for (let i = 2; i < tokens.length; i += 1) {
            const token = tokens[i];
            const lowered = token.toLowerCase();
            if (lowered === 'params:' || lowered === 'param:' || lowered === 'par:') {
                collectingParams = true;
                continue;
            }
            if (collectingParams || token.includes('=')) {
                collectingParams = true;
                continue;
            }
            pins.push({ id: String(pins.length + 1), name: token });
        }

        if (pins.length === 0) {
            throw new Error('No pins were detected on the .subckt line. Add pins after the name.');
        }

        const hasEnds = lines.some(line => /^\.ends\b/i.test(line.trim()));
        if (!hasEnds) {
            lines.push(`.ends ${name}`);
        }

        return {
            name,
            pins,
            definitionText: lines.join('\n')
        };
    }

    _ensureUniqueSubcircuitName(name, definitionText = '') {
        const baseName = name && name.trim() ? name.trim() : 'SUB';
        const normalizedDefinition = (definitionText || '').trim().toLowerCase().replace(/\s+/g, ' ');

        const existingNames = new Set();
        let needsRename = false;
        let sameDefinitionExists = false;

        const checkEntry = (entryName, entryDefinition) => {
            if (!entryName) return;
            const key = entryName.toLowerCase();
            existingNames.add(key);
            if (key === baseName.toLowerCase()) {
                const normalized = (entryDefinition || '').trim().toLowerCase().replace(/\s+/g, ' ');
                if (normalized === normalizedDefinition) {
                    sameDefinitionExists = true;
                } else {
                    needsRename = true;
                }
            }
        };

        // Existing placed components
        for (const component of this.componentManager.components) {
            const sub = component.meta?.definition?.subcircuit;
            if (sub?.name) {
                checkEntry(sub.name, sub.definition);
            }
        }

        // Definitions in the library
        Object.values(this.componentLibrary || {}).forEach(def => {
            if (def?.componentType === 'subcircuit' && def.subcircuit?.name) {
                checkEntry(def.subcircuit.name, def.subcircuit.definition);
            }
        });

        if (!needsRename) {
            if (sameDefinitionExists || !existingNames.has(baseName.toLowerCase())) {
                return { name: baseName, definitionText };
            }
        }

        let suffix = 1;
        let candidate = `${baseName}_${suffix}`;
        while (existingNames.has(candidate.toLowerCase())) {
            suffix += 1;
            candidate = `${baseName}_${suffix}`;
        }

        const rewritten = this._rewriteSubcircuitName(definitionText, candidate);
        return { name: candidate, definitionText: rewritten };
    }

    _rewriteSubcircuitName(definitionText = '', newName) {
        if (!definitionText || !newName) return definitionText;
        const lines = definitionText.split(/\r?\n/);
        let hasEnds = false;
        const rewritten = lines.map((line) => {
            const trimmed = line.trim();
            if (/^\.subckt/i.test(trimmed)) {
				const leading = line.match(/^\s*/)?.[0] ?? '';
				const parts = trimmed.split(/\s+/);
				if (parts.length >= 2) {
					parts[1] = newName;
				}
				return `${leading}${parts.join(' ')}`;
            }
            if (/^\.ends/i.test(trimmed)) {
                hasEnds = true;
                return `.ends ${newName}`;
            }
            return line;
        });
        if (!hasEnds) {
            rewritten.push(`.ends ${newName}`);
        }
        return rewritten.join('\n');
    }

    _buildDynamicSubcircuitDefinition({ name, pins, definitionText }) {
        const grid = this.viewport?.gridSize ?? 10;
        const pinSpacing = Math.ceil(Math.max(grid * 2, 20) / grid) * grid;
        const leftCount = Math.ceil(pins.length / 2);
        const rightCount = Math.floor(pins.length / 2);
        const maxSide = Math.max(leftCount, rightCount, 1);

        let height = Math.max(grid * 4, pinSpacing * (maxSide - 1) + grid * 2);
        height = Math.ceil(height / grid) * grid;
        const available = height - pinSpacing * (maxSide - 1);
        const topPadding = Math.max(grid, Math.round((available / 2) / grid) * grid);

        const labelInset = Math.max(4, Math.round(grid * 0.6));
        const pinRegionStart = topPadding;
        const pinRegionEnd = topPadding + pinSpacing * (maxSide - 1);
        const pinRegionCenter = pinRegionStart + (pinRegionEnd - pinRegionStart) / 2;
        const valueLabelYOffset = Math.min(Math.round(grid * 1.2), Math.round(pinSpacing * 0.35));

        let width = Math.max(80, grid * 6);
        width = Math.ceil(width / grid) * grid;
        const pinDefs = [];
        let idx = 0;
        for (let i = 0; i < leftCount; i += 1) {
            const pin = pins[idx++];
            const y = topPadding + i * pinSpacing;
            pinDefs.push({
                id: pin.id || String(idx),
                name: pin.name,
                position: { x: 0, y },
                labelPosition: { x: labelInset, y }
            });
        }
        for (let i = 0; i < rightCount; i += 1) {
            const pin = pins[idx++];
            const y = topPadding + i * pinSpacing;
            pinDefs.push({
                id: pin.id || String(idx),
                name: pin.name,
                position: { x: width, y },
                labelPosition: { x: width - labelInset, y }
            });
        }

        const definitionId = `custom_subcircuit:${name}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;

        return {
            definitionId,
            definition: {
                name,
                description: 'User-defined subcircuit',
                componentType: 'subcircuit',
                dynamicSubcircuit: true,
                allowRotation: false,
                designator: { prefix: 'X', autoIncrement: true },
                size: { width, height },
                pins: pinDefs,
                labels: {
                    designator: [
                        { x: width / 2, y: height + 8 },
                        { x: width / 2, y: height + 8 }
                    ],
                    value: [
                        { x: width / 2, y: pinRegionCenter - valueLabelYOffset },
                        { x: width / 2, y: pinRegionCenter - valueLabelYOffset }
                    ]
                },
                svg: null,
                subcircuit: {
                    name,
                    definition: definitionText
                }
            }
        };
    }

    _openComponentModal(component) {
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
            const parsed = this._parseSubcircuitHeader(definition?.subcircuit?.definition || '');
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
            const split = this._splitSubcircuitDefinition(effectiveDefinition, definition?.subcircuit?.name || 'SUBCKT');
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
        const modelField = document.getElementById('component-model-field');
        const modelSelect = document.getElementById('component-model-select');
        const valueField = document.getElementById('component-value-field');
        const valueInput = document.getElementById('component-value-input');
        const subcktArgsContainer = document.getElementById('component-subcircuit-args-container');
        const subcktBodyInput = document.getElementById('component-subcircuit-body');
        const customModelInput = document.getElementById('component-custom-model-input');

        if (!labelInput || !modelField || !modelSelect || !valueField || !valueInput || !customModelInput) {
            this._closeComponentModal();
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
            const parsed = this._parseSubcircuitHeader(baseDefinition);
            const split = this._splitSubcircuitDefinition(baseDefinition, parsed.name || this._editingComponent.meta?.definition?.subcircuit?.name || 'SUB');
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

            if (this._modalOpen) {
                originalOnClick?.(worldX, worldY, event);
                return;
            }

            const snapped = this.viewport.snapToGrid(worldX, worldY);

            // Handle delete tool
            if (this._currentTool === 'delete') {
                this._deleteItemAt(snapped.x, snapped.y);
                originalOnClick?.(worldX, worldY, event);
                return;
            }

            // Handle probe tool
            if (this._currentTool === 'probe') {
                // Check if clicking on existing probe
                const existingProbe = this.probeManager.getProbeAt(snapped.x, snapped.y);
                if (existingProbe) {
                    this.probeManager.selectedProbeId = existingProbe.id;
                    this.viewport.render();
                } else {
                    // Place new probe
                    this.probeManager.addProbe(snapped.x, snapped.y, null, this.probeManager.getGhostRotation());
                }
                originalOnClick?.(worldX, worldY, event);
                return;
            }

            if (!this.selectedComponentId) {
                originalOnClick?.(worldX, worldY, event);
                return;
            }

            const hit = this.componentManager.getComponentAt(snapped.x, snapped.y);
            if (!hit) {
                void this._placeSelectedComponent(snapped);
            }

            originalOnClick?.(worldX, worldY, event);
        };

        // Set up probe mouse move for ghost preview
        const originalOnMouseMove = this.viewport.onMouseMove;
        this.viewport.onMouseMove = (worldX, worldY, event) => {
            originalOnMouseMove?.(worldX, worldY, event);
            
            if (this._currentTool === 'probe') {
                const snapped = this.viewport.snapToGrid(worldX, worldY);
                this.probeManager.setGhostPosition(snapped);
            }
        };

        // Set up probe dragging
        const originalOnMouseDown = this.viewport.onMouseDown;
        this.viewport.onMouseDown = (worldX, worldY, event) => {
            // Let probe manager handle first if not in probe placement mode
            if (this._currentTool !== 'probe' && !this.wireEditor.isActive) {
                if (this.probeManager.onMouseDown(worldX, worldY, event)) {
                    event.__probeHandled = true;
                    return;
                }
            }
            originalOnMouseDown?.(worldX, worldY, event);
        };

        const originalOnMouseUp = this.viewport.onMouseUp;
        this.viewport.onMouseUp = (worldX, worldY, event) => {
            if (this.probeManager.onMouseUp(worldX, worldY, event)) {
                event.__probeHandled = true;
            }
            originalOnMouseUp?.(worldX, worldY, event);
        };

        // Hook into mouse move for probe dragging
        const existingOnMouseMove = this.viewport.onMouseMove;
        this.viewport.onMouseMove = (worldX, worldY, event) => {
            if (this.probeManager.onMouseMove(worldX, worldY, event)) {
                event.__probeHandled = true;
            }
            existingOnMouseMove?.(worldX, worldY, event);
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

    async _placeSelectedComponent(position) {
        const definitionId = this.selectedComponentId;
        const baseDefinition = this.componentLibrary[definitionId];
        if (!baseDefinition) return;

        let resolvedDefinition = baseDefinition;
        let resolvedDefinitionId = definitionId;

        if (baseDefinition.dynamicSubcircuit) {
            const userInput = await this._promptSubcircuitDefinition();
            if (!userInput) return;
            const { name, pins, definitionText } = userInput;
            const uniqueness = this._ensureUniqueSubcircuitName(name, definitionText);
            const built = this._buildDynamicSubcircuitDefinition({
                name: uniqueness.name,
                pins,
                definitionText: uniqueness.definitionText
            });
            resolvedDefinition = built.definition;
            resolvedDefinitionId = built.definitionId;
        }

        const instanceId = `${resolvedDefinitionId}-${this._componentCounter++}`;
        const designatorTemplate = resolvedDefinition.designator
            || baseDefinition.designator
            || (resolvedDefinition.componentType === 'subcircuit' ? { prefix: 'X', autoIncrement: true } : null);
        const designatorText = this._nextDesignator(designatorTemplate);
        const valueText = resolvedDefinition.componentType === 'subcircuit' ? null : resolvedDefinition.defaultValue ?? null;

        const component = createComponentFromDefinition({
            instanceId,
            definitionId: resolvedDefinitionId,
            definition: resolvedDefinition,
            position,
            designatorText,
            valueText
        });
		
        // Inherit rotation from ghost component if present
        if (this._ghostComponent) {
            component.rotation = this._ghostComponent.rotation || 0;
        }

        // Dynamic subcircuits should not rotate
        if (resolvedDefinition.dynamicSubcircuit) {
            component.meta.dynamicSubcircuit = true;
            component.meta.allowRotation = resolvedDefinition.allowRotation ?? false;
            component.rotation = 0;
        }
		
        // Record full state before adding component
        this.undoManager.recordAction(UNDO_TYPES.FULL_STATE, {
            stateBefore: this._serialize(),
            description: 'Add component'
        });
		
        this.componentManager.addComponent(component);
        
        // Auto-connect pins to wires if they land on wire segments
        this._autoConnectPinsToWires(component);
		
        // Record state after for redo
        const lastAction = this.undoManager.undoStack[this.undoManager.undoStack.length - 1];
        if (lastAction) {
            lastAction.data.stateAfter = this._serialize();
        }
    }

    _nextDesignator(designator) {
        if (!designator) return '';
        const prefix = designator.prefix ?? '';
        if (!designator.autoIncrement) return prefix;
        const next = (this._designatorCounters.get(prefix) ?? 0) + 1;
        this._designatorCounters.set(prefix, next);
        return `${prefix}${next}`;
    }
    
    /**
     * Auto-connect component pins to existing wires when a component is placed
     * @param {import('./Component.js').Component} component 
     */
    _autoConnectPinsToWires(component) {
        const pinMap = this.componentManager.pinNodeIdsByComponent.get(component.id);
        if (!pinMap) return;
        
        const tolerance = 3; // Tolerance for detecting if pin is on a wire
        
        for (const pin of component.pins) {
            const pinPos = component.getPinWorldPosition(pin);
            const pinNodeId = pinMap.get(pin.id);
            if (!pinNodeId) continue;
            
            // Check if there's a wire segment at this pin's position
            const segmentHit = this.wireGraph.getSegmentAt(pinPos.x, pinPos.y, tolerance);
            if (!segmentHit) continue;
            
            const segment = segmentHit.segment;
            const node1 = this.wireGraph.getNode(segment.nodeId1);
            const node2 = this.wireGraph.getNode(segment.nodeId2);
            if (!node1 || !node2) continue;
            
            // Don't connect if either end of the segment is already this pin's node
            if (segment.nodeId1 === pinNodeId || segment.nodeId2 === pinNodeId) continue;
            
            // Check if there's already a node at the pin position (might be from a wire vertex)
            const existingNode = this.wireGraph.getNodeAt(pinPos.x, pinPos.y, tolerance);
            
            if (existingNode && existingNode.id !== pinNodeId) {
                // There's an existing wire node at this position
                // Merge the pin node with the existing node by transferring connections
                
                // Get all segments connected to the existing node
                const connectedSegments = this.wireGraph.getSegmentsForNode(existingNode.id);
                
                // Remove the existing node (this will remove its segments)
                this.wireGraph.removeNode(existingNode.id);
                
                // Reconnect all segments to the pin node instead
                for (const seg of connectedSegments) {
                    const otherId = seg.nodeId1 === existingNode.id ? seg.nodeId2 : seg.nodeId1;
                    if (otherId !== pinNodeId) {
                        this.wireGraph.addSegment(pinNodeId, otherId);
                    }
                }
            } else {
                // No existing node, split the segment at the pin position
                const segmentId = this.wireGraph._makeSegmentId(segment.nodeId1, segment.nodeId2);
                
                // Remove the segment
                this.wireGraph.segments.delete(segmentId);
                
                // Update the pin node to the exact position on the wire (snap to wire)
                let snapX = pinPos.x;
                let snapY = pinPos.y;
                
                if (node1.x === node2.x) {
                    // Vertical segment - snap X to segment
                    snapX = node1.x;
                } else if (node1.y === node2.y) {
                    // Horizontal segment - snap Y to segment
                    snapY = node1.y;
                }
                
                this.wireGraph.updateNode(pinNodeId, snapX, snapY);
                
                // Connect the pin to both ends of the original segment
                this.wireGraph.addSegment(segment.nodeId1, pinNodeId);
                this.wireGraph.addSegment(pinNodeId, segment.nodeId2);
            }
        }
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
        this.spicePlotsEl = document.getElementById('results-plots');
        
        // Console toggle
        const consoleToggle = document.getElementById('console-toggle');
        const consolePanel = document.getElementById('console-panel');
        if (consoleToggle && consolePanel) {
            consoleToggle.addEventListener('click', () => {
                consolePanel.classList.toggle('collapsed');
            });
        }

        // Console copy button
        const consoleCopyBtn = document.getElementById('console-copy-btn');
        if (consoleCopyBtn) {
            consoleCopyBtn.addEventListener('click', () => {
                const consoleOutput = document.getElementById('sim-log');
                if (consoleOutput) {
                    navigator.clipboard.writeText(consoleOutput.textContent).then(() => {
                        const icon = consoleCopyBtn.querySelector('.material-symbols-outlined');
                        const originalIcon = icon.textContent;
                        icon.textContent = 'check';
                        setTimeout(() => {
                            icon.textContent = originalIcon;
                        }, 1500);
                    }).catch(err => {
                        console.error('Failed to copy:', err);
                    });
                }
            });
        }

        if (this.spiceRunBtn) {
            this.spiceRunBtn.addEventListener('click', () => this._runNgspiceSimulation());
        }

        // Show initial status
        this._setRunStatus('ready', 'Ready');

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

        const probeCount = this.probeManager?.probes?.length ?? 0;
        if (probeCount === 0) {
            const message = 'Place at least one probe before running the simulation.';
            this._setRunStatus('error', message);
            this._appendRunOutput(`[note] ${message}`);
            alert(message);
            return;
        }

        const directives = (this.simulationDirectives && this.simulationDirectives.length > 0)
            ? this.simulationDirectives
            : [{ type: 'op', text: '.op', params: {} }];

        // Build one netlist per directive so we can render a plot for each
        let jobs;
        try {
            jobs = directives.map((dir, idx) => {
                const { netlist, probeInfo, analysisType } = this.netlistGenerator.generateWithMetadata([dir], {
                    includeControlBlock: true
                });
                return {
                    idx,
                    label: dir.text || dir.type || `Directive ${idx + 1}`,
                    netlist,
                    probeInfo,
                    analysisType
                };
            });
        } catch (error) {
            this._setRunStatus('error', 'Failed to generate netlist');
            this._appendRunOutput(`[error] ${error.message}`);
            return;
        }

        this.spiceOutputEl.textContent = '';
        this._clearPlot();
        this._appendRunOutput('* --- Starting simulations ---');

        this._setRunStatus('running', 'Running simulation...');
        this.spiceRunBtn.disabled = true;

        if (this.spiceWorker) {
            this.spiceWorker.terminate();
            this.spiceWorker = null;
        }

        this._pendingSimJobs = jobs;
        this._simResults = [];

        let currentJobIndex = -1;

        const startWorkerForJob = (index) => {
            // Always start a fresh worker to fully reinitialize ngspice between jobs
            if (this.spiceWorker) {
                try { this.spiceWorker.terminate(); } catch (_) {}
                this.spiceWorker = null;
            }

            const job = jobs[index];
            const worker = new Worker('/ngspice-worker.js');
            this.spiceWorker = worker;

            const sendRun = () => {
                this._appendRunOutput(`* [${index + 1}/${jobs.length}] ${job.label}`);
                this._appendRunOutput('* --- Netlist sent to ngspice ---');
                this._appendRunOutput(job.netlist);
                this._appendRunOutput('* --------------------------------');
                worker.postMessage({
                    type: 'run',
                    netlist: job.netlist,
                    spinit: this.spinitContent
                });
            };

            worker.onmessage = (e) => {
                const { type, text, message, outputData, stdout, stderr, stack } = e.data;
                switch (type) {
                    case 'ready': {
                        currentJobIndex = index;
                        sendRun();
                        break;
                    }
                    case 'status': {
                        this._appendRunOutput(`[status] ${text}`);
                        break;
                    }
                    case 'stdout': {
                        this._appendRunOutput(text);
                        break;
                    }
                    case 'stderr': {
                        this._appendRunOutput(`[stderr] ${text}`);
                        break;
                    }
                    case 'complete': {
                        const jobDone = jobs[currentJobIndex];
                        this._simResults.push({
                            ...jobDone,
                            outputData,
                            stdout,
                            stderr
                        });

                        try { worker.terminate(); } catch (_) {}
                        this.spiceWorker = null;

                        const nextIndex = currentJobIndex + 1;
                        if (nextIndex < jobs.length) {
                            startWorkerForJob(nextIndex);
                        } else {
                            finishAll();
                        }
                        break;
                    }
                    case 'error': {
                        this._setRunStatus('error', 'Simulation failed');
                        this.spiceRunBtn.disabled = false;
                        this._appendRunOutput(`[error] ${message}`);
                        if (stack) this._appendRunOutput(stack);
                        this._showErrorPlaceholder(message);
                        try { worker.terminate(); } catch (_) {}
                        this.spiceWorker = null;
                        break;
                    }
                    default:
                        break;
                }
            };

            worker.onerror = (err) => {
                this._setRunStatus('error', 'Worker error');
                this.spiceRunBtn.disabled = false;
                this._appendRunOutput(`[worker] ${err.message}`);
                this._showErrorPlaceholder(err.message);
                try { worker.terminate(); } catch (_) {}
                this.spiceWorker = null;
            };
        };

        const finishAll = () => {
            this._setRunStatus('ready', 'Simulation complete');
            this.spiceRunBtn.disabled = false;

            // Render plots for each completed job
            this._simResults.forEach((result) => {
                if (result.outputData) {
                    this._appendRunOutput(`--- output (${result.label}) ---`);
                    this._appendRunOutput(result.outputData);
                    const plotId = `${result.analysisType || 'plot'}-${result.idx + 1}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
                    this._plotResults(result.outputData, result.probeInfo, result.analysisType, plotId);
                } else if (result.stdout) {
                    this._appendRunOutput(`[note] No output.txt for ${result.label}`);
                    this._appendRunOutput(result.stdout);
                    const plotId = `${result.analysisType || 'plot'}-${result.idx + 1}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
                    this._tryParsePrintOutput(result.stdout, result.probeInfo, result.analysisType, plotId);
                } else if (result.stderr) {
                    this._appendRunOutput(result.stderr);
                }
            });

            worker.terminate();
            this.spiceWorker = null;
        };

        // Kick off the first job
        startWorkerForJob(0);
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
        if (!this.spicePlotsEl) return;
        // Clear all existing plot containers
        this.spicePlotsEl.querySelectorAll('.plot-container').forEach(container => {
            const plotArea = container.querySelector('.plot-area');
            if (plotArea && window.Plotly) {
                try { window.Plotly.purge(plotArea); } catch (_) {}
            }
        });
        this.spicePlotsEl.innerHTML = `
            <div class="plot-placeholder running">
                <span class="material-symbols-outlined">autorenew</span>
                <span>Running simulation...</span>
            </div>
        `;
        this._plotCounter = 0;
    }
    
    /**
     * Show the default placeholder in results panel
     */
    _showPlotPlaceholder() {
        if (!this.spicePlotsEl) return;
        this.spicePlotsEl.innerHTML = `
            <div class="plot-placeholder">
                <span class="material-symbols-outlined">show_chart</span>
                <span>Add probes to your circuit and run<br/>a simulation to see results here</span>
            </div>
        `;
    }
    
    /**
     * Show error placeholder in results panel
     */
    _showErrorPlaceholder(message) {
        if (!this.spicePlotsEl) return;
        this.spicePlotsEl.innerHTML = `
            <div class="plot-placeholder error">
                <span class="material-symbols-outlined">error_outline</span>
                <span>Simulation failed<br/><small>Check the console for details</small></span>
            </div>
        `;
        // Expand console to show error details
        const consolePanel = document.getElementById('console-panel');
        if (consolePanel) consolePanel.classList.remove('collapsed');
    }
    
    /**
     * Create a new plot container for a specific analysis
     * @param {string} analysisType - Type of analysis for the title
     * @param {string} id - Unique ID for this plot
     * @returns {HTMLElement} The plot area element to render into
     */
    _createPlotContainer(analysisType, id) {
        if (!this.spicePlotsEl) return null;
        
        // Remove placeholder if present
        const placeholder = this.spicePlotsEl.querySelector('.plot-placeholder');
        if (placeholder) placeholder.remove();
        
        const container = document.createElement('div');
        container.className = 'plot-container';
        container.id = `plot-${id}`;
        
        const titleText = {
            'ac': 'AC Analysis (Frequency Response)',
            'tran': 'Transient Analysis',
            'dc': 'DC Sweep',
            'op': 'Operating Point'
        }[analysisType] || 'Simulation Results';
        
        // Add scale toggle for AC analysis
        const scaleToggle = analysisType === 'ac' ? `
            <div class="plot-scale-toggle">
                <button class="scale-btn active" data-scale="db">dB</button>
                <button class="scale-btn" data-scale="v">V</button>
                <button class="scale-btn" data-scale="phase">Phase</button>
            </div>
        ` : '';
        
        // Add X-Y plot mode toggle for transient and DC analyses
        const showXYMode = (analysisType === 'tran' || analysisType === 'dc');
        const xyModeToggle = showXYMode ? `
            <div class="plot-mode-toggle">
                <button class="mode-btn active" data-mode="standard">Standard</button>
                <button class="mode-btn" data-mode="xy">X-Y</button>
            </div>
        ` : '';
        
        const xySelectors = showXYMode ? `
            <div class="plot-xy-selectors" style="display: none;">
                <span class="xy-selector-label">X-axis:</span>
                <select class="xy-axis-select" data-axis="x" title="X-axis signal">
                    <option value="">Select signal...</option>
                </select>
                <span class="xy-selector-label">Y-axis:</span>
                <select class="xy-axis-select" data-axis="y" title="Y-axis signal">
                    <option value="">Select signal...</option>
                </select>
            </div>
        ` : '';
        
        container.innerHTML = `
            <div class="plot-header">
                <div class="plot-title">${titleText}</div>
                <div class="plot-actions">
                    ${scaleToggle}
                    ${xyModeToggle}
                    <button class="plot-export-btn" title="Download as PNG">
                        <span class="material-symbols-outlined">download</span>
                    </button>
                </div>
            </div>
            ${xySelectors}
            <div class="plot-area" id="plot-area-${id}"></div>
        `;
        
        // Setup export button
        const exportBtn = container.querySelector('.plot-export-btn');
        exportBtn?.addEventListener('click', () => {
            const plotAreaEl = container.querySelector('.plot-area');
            if (plotAreaEl && window.Plotly) {
                window.Plotly.downloadImage(plotAreaEl, {
                    format: 'png',
                    width: 800,
                    height: 400,
                    filename: `spicepad-${analysisType}-${Date.now()}`
                });
            }
        });
        
        // Setup X-Y mode toggle
        if (showXYMode) {
            const modeButtons = container.querySelectorAll('.mode-btn');
            const xySelectors = container.querySelector('.plot-xy-selectors');
            
            modeButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    modeButtons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const mode = btn.dataset.mode;
                    
                    if (mode === 'xy') {
                        xySelectors.style.display = 'flex';
                        // Re-render in X-Y mode if data is available
                        if (container._signalData) {
                            this._updateXYPlot(container);
                        }
                    } else {
                        xySelectors.style.display = 'none';
                        // Re-render in standard mode
                        if (container._signalData) {
                            this._renderStandardPlot(
                                container.querySelector('.plot-area'),
                                container._signalData,
                                container._analysisType
                            );
                        }
                    }
                });
            });
            
            // Setup axis selector change handlers
            const axisSelects = container.querySelectorAll('.xy-axis-select');
            axisSelects.forEach(select => {
                select.addEventListener('change', () => {
                    this._updateXYPlot(container);
                });
            });
        }
        
        this.spicePlotsEl.appendChild(container);
        return container.querySelector('.plot-area');
    }

    _tryParsePrintOutput(stdout, probeInfo = [], analysisType = 'tran', plotId = null) {
        if (!stdout) return;
        const lines = stdout.split('\n');
        const dataLines = lines.filter(line => {
            const trimmed = line.trim();
            return /^\d/.test(trimmed) || /^-?\d*\.\d+/.test(trimmed);
        });
        if (dataLines.length > 0) {
            this._plotResults(dataLines.join('\n'), probeInfo, analysisType, plotId);
        }
    }

    /**
     * Plot simulation results with support for different analysis types
     * @param {string} data - Raw output data
     * @param {Array<{label: string, node: string}>} probeInfo - Probe metadata
     * @param {string} analysisType - Type of analysis ('ac', 'tran', 'dc', 'op')
     */
    _plotResults(data, probeInfo = [], analysisType = 'tran', plotId = null) {
        if (!this.spicePlotsEl) return;
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

        // Create a plot container for this analysis
        const plotArea = this._createPlotContainer(analysisType, plotId || ++this._plotCounter);
        console.log('[_plotResults] created plotArea:', plotArea);
        if (!plotArea) return;

        // Parse based on analysis type
        if (analysisType === 'ac') {
            this._plotAcResults(lines, probeInfo, plotArea);
        } else {
            this._plotTimeDomainResults(lines, probeInfo, analysisType, plotArea);
        }
    }

    /**
     * Plot AC analysis results (frequency domain with complex numbers)
     * wrdata format for AC: freq v(1)_real v(1)_imag freq v(2)_real v(2)_imag ...
     * @param {Array<string>} lines - Data lines
     * @param {Array} probeInfo - Probe metadata
     * @param {HTMLElement} plotArea - The element to render the plot into
     */
    _plotAcResults(lines, probeInfo, plotArea) {
        const colsPerSignal = 3; // freq, real, imag
        
        // Infer number of signals from data columns (more reliable than probeInfo.length)
        const firstLine = lines.find(l => l.trim().length > 0);
        if (!firstLine) {
            this._appendRunOutput('[note] No AC data to plot');
            return;
        }
        const firstParts = firstLine.trim().split(/\s+/);
        const numSignals = Math.floor(firstParts.length / colsPerSignal);
        
        if (numSignals === 0) {
            this._appendRunOutput('[note] Invalid AC data format');
            return;
        }
        
        // Default colors for signals without probe colors
        const defaultColors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
        
        const signals = [];
        for (let i = 0; i < numSignals; i++) {
            signals.push({
                label: probeInfo[i]?.label || `Signal ${i + 1}`,
                color: probeInfo[i]?.color || defaultColors[i % defaultColors.length],
                freq: [],
                magnitude: [],
                phase: []
            });
        }

        lines.forEach((line) => {
            const parts = line.trim().split(/\s+/).map(Number);
            if (parts.length < colsPerSignal) return;
            
            // Parse each signal's data (freq, real, imag triplets)
            for (let i = 0; i < numSignals; i++) {
                const baseIdx = i * colsPerSignal;
                if (baseIdx + 2 >= parts.length) break;
                
                const freq = parts[baseIdx];
                const real = parts[baseIdx + 1];
                const imag = parts[baseIdx + 2];
                
                if (!Number.isFinite(freq) || !Number.isFinite(real) || !Number.isFinite(imag)) continue;
                
                // Calculate magnitude and phase
                const magnitude = Math.sqrt(real * real + imag * imag);
                const phase = Math.atan2(imag, real) * (180 / Math.PI);
                
                signals[i].freq.push(freq);
                signals[i].magnitude.push(magnitude);
                signals[i].phase.push(phase);
            }
        });

        // Filter out signals with no data
        const validSignals = signals.filter(s => s.freq.length > 0);
        
        if (validSignals.length === 0) {
            this._appendRunOutput('[note] Unable to parse AC data for plotting');
            return;
        }

        const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
        
        // Store signal data on the plot container for scale toggling
        const plotContainer = plotArea.closest('.plot-container');
        plotContainer._acSignalData = validSignals;
        plotContainer._acProbeColors = colors;
        
        // Setup scale toggle buttons
        const scaleButtons = plotContainer.querySelectorAll('.scale-btn');
        scaleButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                scaleButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._renderAcPlot(plotArea, plotContainer._acSignalData, plotContainer._acProbeColors, btn.dataset.scale);
            });
        });
        
        // Initial render in dB
        this._renderAcPlot(plotArea, validSignals, colors, 'db');
    }
    
    /**
     * Render AC plot with specified scale (dB or V)
     */
    _renderAcPlot(plotArea, validSignals, colors, scale) {
        const isDb = scale === 'db';
        const isPhase = scale === 'phase';
        
        let yData, yLabel, traceSuffix;
        if (isPhase) {
            yData = sig => sig.phase;
            yLabel = 'Phase (°)';
            traceSuffix = '°';
        } else if (isDb) {
            yData = sig => sig.magnitude.map(m => 20 * Math.log10(Math.max(m, 1e-12)));
            yLabel = 'Magnitude (dB)';
            traceSuffix = 'dB';
        } else {
            yData = sig => sig.magnitude;
            yLabel = 'Magnitude (V)';
            traceSuffix = 'V';
        }
        
        const traces = validSignals.map((sig, i) => ({
            x: sig.freq,
            y: yData(sig),
            type: 'scatter',
            mode: 'lines',
            name: `${sig.label} (${traceSuffix})`,
            line: { color: sig.color || colors[i % colors.length], width: 2 }
        }));

        const layout = {
            paper_bgcolor: '#0d1b2a',
            plot_bgcolor: '#0d1b2a',
            font: { color: '#e2e8f0', size: 10 },
            xaxis: {
                title: { text: 'Frequency (Hz)', font: { size: 11 } },
                type: 'log',
                gridcolor: '#334155',
                zerolinecolor: '#334155',
                linecolor: '#475569',
                linewidth: 1,
                mirror: true,
                tickfont: { size: 9 }
            },
            yaxis: {
                title: { text: yLabel, font: { size: 11 } },
                gridcolor: '#334155',
                zerolinecolor: '#334155',
                linecolor: '#475569',
                linewidth: 1,
                mirror: true,
                tickfont: { size: 9 }
            },
            margin: { t: 20, r: 20, b: 45, l: 50 },
            legend: {
                x: 1,
                xanchor: 'right',
                y: 1,
                bgcolor: 'rgba(15, 23, 42, 0.85)',
                font: { size: 10 }
            }
        };
        
        // Use requestAnimationFrame to ensure DOM is ready and get actual dimensions
        requestAnimationFrame(() => {
            const rect = plotArea.getBoundingClientRect();
            layout.width = rect.width || 340;
            layout.height = rect.height || 260;
            
            try {
                window.Plotly.newPlot(plotArea, traces, layout, { 
                    responsive: true,
                    modeBarButtonsToRemove: ['pan2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d']
                });
            } catch (err) {
                console.error('[AC Plot] Plotly.newPlot error:', err);
            }
        });
    }

    /**
     * Plot time-domain results (transient, DC sweep)
     * @param {Array<string>} lines - Data lines
     * @param {Array} probeInfo - Probe metadata
     * @param {string} analysisType - Type of analysis
     * @param {HTMLElement} plotArea - The element to render the plot into
     */
    _plotTimeDomainResults(lines, probeInfo, analysisType, plotArea) {
        const xValues = [];
        const signals = {};
        const signalMeta = [];
        const signalColors = {};

        const firstLine = lines.find(l => l.trim().length > 0);
        if (!firstLine) {
            this._appendRunOutput('[note] Unable to parse data for plotting');
            return;
        }

        const firstParts = firstLine.trim().split(/\s+/).map(Number);
        if (firstParts.length < 2 || !Number.isFinite(firstParts[0])) {
            this._appendRunOutput('[note] Unable to parse data for plotting');
            return;
        }

        // Detect whether wrdata produced paired time/value columns (time, v1, time, v2, ...)
        const evenIndexedTimes = [];
        for (let i = 0; i < firstParts.length; i += 2) {
            evenIndexedTimes.push(firstParts[i]);
        }
        const timesConsistent = evenIndexedTimes.every(t => Number.isFinite(t) && Math.abs(t - evenIndexedTimes[0]) <= 1e-12);
        const usePairedFormat = (firstParts.length % 2 === 0) && timesConsistent;

        const inferredSignalCount = usePairedFormat ? Math.floor(firstParts.length / 2) : (firstParts.length - 1);
        const signalCount = probeInfo?.length > 0 ? Math.max(probeInfo.length, inferredSignalCount) : inferredSignalCount;

        for (let i = 0; i < signalCount; i++) {
            const label = probeInfo?.[i]?.label || `Signal ${i + 1}`;
            const type = probeInfo?.[i]?.type || 'voltage';
            const color = probeInfo?.[i]?.color;
            signalMeta.push({ label, type, color });
            if (color) {
                signalColors[label] = color;
            }
        }

        lines.forEach((line) => {
            const parts = line.trim().split(/\s+/).map(Number);
            if (parts.length < 2 || !Number.isFinite(parts[0])) return;

            const availableSignals = usePairedFormat ? Math.floor(parts.length / 2) : (parts.length - 1);
            const lineSignalCount = Math.min(signalCount, availableSignals);

            const timeValue = parts[0];
            if (!Number.isFinite(timeValue)) return;
            xValues.push(timeValue);

            for (let i = 0; i < lineSignalCount; i++) {
                const valIdx = usePairedFormat ? (i * 2) + 1 : i + 1;
                if (valIdx >= parts.length) continue;
                const val = parts[valIdx];
                if (!Number.isFinite(val)) continue;

                const sigName = signalMeta[i]?.label || `Signal ${i + 1}`;
                if (!signals[sigName]) signals[sigName] = [];
                signals[sigName].push(val);
            }
        });

        if (xValues.length === 0 || Object.keys(signals).length === 0) {
            this._appendRunOutput('[note] Unable to parse data for plotting');
            return;
        }

        const defaultColors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
        
        // Store parsed signal data on the container for X-Y mode switching
        const plotContainer = plotArea.closest('.plot-container');
        plotContainer._signalData = {
            xValues,
            signals,
            signalMeta,
            signalColors,
            defaultColors
        };
        plotContainer._analysisType = analysisType;
        
        // Populate X-Y selector dropdowns if they exist
        this._populateXYSelectors(plotContainer, signalMeta);
        
        // Render in standard mode by default
        this._renderStandardPlot(plotArea, plotContainer._signalData, analysisType);
    }
    
    /**
     * Render a standard time-domain plot
     * @param {HTMLElement} plotArea - Plot area element
     * @param {Object} signalData - Signal data with xValues, signals, signalMeta, signalColors
     * @param {string} analysisType - Analysis type
     */
    _renderStandardPlot(plotArea, signalData, analysisType) {
        const { xValues, signals, signalMeta, signalColors, defaultColors } = signalData;

        // Keep voltage/current separated to allow dual axes
        let hasVoltage = false;
        let hasCurrent = false;
        const traces = [];

        signalMeta.forEach((meta, i) => {
            const values = signals[meta.label];
            if (!values) return;
            const isCurrent = meta.type === 'current';
            hasCurrent = hasCurrent || isCurrent;
            hasVoltage = hasVoltage || !isCurrent;
            traces.push({
                x: xValues,
                y: values,
                type: 'scatter',
                mode: 'lines',
                name: meta.label,
                yaxis: isCurrent ? 'y2' : 'y',
                line: { color: signalColors[meta.label] || defaultColors[i % defaultColors.length], width: 2 }
            });
        });

        // Determine axis labels based on analysis type
        let xAxisTitle = 'Time (s)';
        if (analysisType === 'dc') {
            xAxisTitle = 'Voltage (V)';
        }

        // Choose primary Y title based on present signals
        let yAxisTitle = 'Voltage (V)';
        if (hasCurrent && !hasVoltage) {
            yAxisTitle = 'Current (A)';
        }

        const layout = {
            paper_bgcolor: '#0d1b2a',
            plot_bgcolor: '#0d1b2a',
            font: { color: '#e2e8f0', size: 10 },
            xaxis: {
                title: { text: xAxisTitle, font: { size: 11 } },
                gridcolor: '#334155',
                zerolinecolor: '#334155',
                linecolor: '#475569',
                linewidth: 1,
                mirror: true,
                tickfont: { size: 9 }
            },
            yaxis: {
                title: { text: yAxisTitle, font: { size: 11 } },
                gridcolor: '#334155',
                zerolinecolor: '#334155',
                linecolor: '#475569',
                linewidth: 1,
                mirror: true,
                tickfont: { size: 9 }
            },
            margin: { t: 20, r: 20, b: 45, l: 50 },
            legend: {
                x: 1,
                xanchor: 'right',
                y: 1,
                bgcolor: 'rgba(15, 23, 42, 0.85)',
                font: { size: 10 }
            }
        };

        if (hasCurrent && hasVoltage) {
            // Secondary axis for current traces
            layout.yaxis2 = {
                title: { text: 'Current (A)', font: { size: 11 }, standoff: 20 },
                overlaying: 'y',
                side: 'right',
                gridcolor: '#334155',
                zerolinecolor: '#334155',
                linecolor: '#475569',
                linewidth: 1,
                mirror: true,
                tickfont: { size: 9 }
            };
            // Increase right margin to accommodate secondary y-axis
            layout.margin.r = 60;
        }

        // Use requestAnimationFrame to ensure DOM is ready and get actual dimensions
        requestAnimationFrame(() => {
            const rect = plotArea.getBoundingClientRect();
            layout.width = rect.width || 340;
            layout.height = rect.height || 260;
            window.Plotly.newPlot(plotArea, traces, layout, { 
                responsive: true,
                modeBarButtonsToRemove: ['pan2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d']
            });
        });
    }
    
    /**
     * Populate X-Y axis selector dropdowns
     * @param {HTMLElement} plotContainer - Plot container element
     * @param {Array} signalMeta - Signal metadata array
     */
    _populateXYSelectors(plotContainer, signalMeta) {
        const xSelect = plotContainer.querySelector('.xy-axis-select[data-axis="x"]');
        const ySelect = plotContainer.querySelector('.xy-axis-select[data-axis="y"]');
        
        if (!xSelect || !ySelect || signalMeta.length < 2) return;
        
        // Clear existing options except the first placeholder
        xSelect.innerHTML = '<option value="">Select X...</option>';
        ySelect.innerHTML = '<option value="">Select Y...</option>';
        
        // Add signal options
        signalMeta.forEach((meta, index) => {
            const xOption = document.createElement('option');
            xOption.value = index;
            xOption.textContent = meta.label;
            xSelect.appendChild(xOption);
            
            const yOption = document.createElement('option');
            yOption.value = index;
            yOption.textContent = meta.label;
            ySelect.appendChild(yOption);
        });
        
        // Auto-select first two signals as defaults
        if (signalMeta.length >= 2) {
            xSelect.value = '0';
            ySelect.value = '1';
        }
    }
    
    /**
     * Update X-Y plot based on current selector values
     * @param {HTMLElement} plotContainer - Plot container element
     */
    _updateXYPlot(plotContainer) {
        const xSelect = plotContainer.querySelector('.xy-axis-select[data-axis="x"]');
        const ySelect = plotContainer.querySelector('.xy-axis-select[data-axis="y"]');
        const plotArea = plotContainer.querySelector('.plot-area');
        
        if (!xSelect || !ySelect || !plotArea || !plotContainer._signalData) return;
        
        const xIndex = parseInt(xSelect.value);
        const yIndex = parseInt(ySelect.value);
        
        if (!Number.isFinite(xIndex) || !Number.isFinite(yIndex)) {
            // Show message if selections are incomplete
            plotArea.innerHTML = '<div style=\"display: flex; align-items: center; justify-content: center; height: 100%; color: #94a3b8; font-size: 12px;\">Select X and Y signals to plot</div>';
            return;
        }
        
        if (xIndex === yIndex) {
            // Show warning if same signal selected for both axes
            plotArea.innerHTML = '<div style=\"display: flex; align-items: center; justify-content: center; height: 100%; color: #f59e0b; font-size: 12px;\">Please select different signals for X and Y axes</div>';
            return;
        }
        
        this._renderXYPlot(plotArea, plotContainer._signalData, xIndex, yIndex);
    }
    
    /**
     * Render an X-Y plot (one signal vs another)
     * @param {HTMLElement} plotArea - Plot area element
     * @param {Object} signalData - Signal data with signals, signalMeta, signalColors
     * @param {number} xIndex - Index of signal to use for X axis
     * @param {number} yIndex - Index of signal to use for Y axis
     */
    _renderXYPlot(plotArea, signalData, xIndex, yIndex) {
        const { signals, signalMeta, signalColors, defaultColors } = signalData;
        
        const xMeta = signalMeta[xIndex];
        const yMeta = signalMeta[yIndex];
        
        if (!xMeta || !yMeta) return;
        
        const xValues = signals[xMeta.label];
        const yValues = signals[yMeta.label];
        
        if (!xValues || !yValues) return;
        
        // Ensure both arrays have the same length
        const minLength = Math.min(xValues.length, yValues.length);
        const xData = xValues.slice(0, minLength);
        const yData = yValues.slice(0, minLength);
        
        const trace = {
            x: xData,
            y: yData,
            type: 'scatter',
            mode: 'lines',
            name: `${yMeta.label} vs ${xMeta.label}`,
            line: { 
                color: signalColors[yMeta.label] || defaultColors[yIndex % defaultColors.length], 
                width: 2 
            }
        };
        
        // Determine axis labels based on signal types
        const xUnit = xMeta.type === 'current' ? 'A' : 'V';
        const yUnit = yMeta.type === 'current' ? 'A' : 'V';
        
        const layout = {
            paper_bgcolor: '#0d1b2a',
            plot_bgcolor: '#0d1b2a',
            font: { color: '#e2e8f0', size: 10 },
            xaxis: {
                title: { text: `${xMeta.label} (${xUnit})`, font: { size: 11 } },
                gridcolor: '#334155',
                zerolinecolor: '#334155',
                linecolor: '#475569',
                linewidth: 1,
                mirror: true,
                tickfont: { size: 9 }
            },
            yaxis: {
                title: { text: `${yMeta.label} (${yUnit})`, font: { size: 11 } },
                gridcolor: '#334155',
                zerolinecolor: '#334155',
                linecolor: '#475569',
                linewidth: 1,
                mirror: true,
                tickfont: { size: 9 }
            },
            margin: { t: 20, r: 20, b: 45, l: 50 },
            showlegend: false
        };
        
        // Use requestAnimationFrame to ensure DOM is ready and get actual dimensions
        requestAnimationFrame(() => {
            const rect = plotArea.getBoundingClientRect();
            layout.width = rect.width || 340;
            layout.height = rect.height || 260;
            
            try {
                window.Plotly.newPlot(plotArea, [trace], layout, { 
                    responsive: true,
                    modeBarButtonsToRemove: ['pan2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d']
                });
            } catch (err) {
                console.error('[X-Y Plot] Plotly.newPlot error:', err);
            }
        });
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
            probes: this.probeManager.toJSON(),
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
        this.probeManager.clear();
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
        
        // Restore probes
        if (data.probes) {
            this.probeManager.fromJSON(data.probes);
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
    
    // ==================== Results Panel Resize ====================
    
    _setupResultsPanelResize() {
        const resizeHandle = document.getElementById('results-resize-handle');
        const resultsPanel = document.getElementById('results-panel');
        
        if (!resizeHandle || !resultsPanel) return;
        
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;
        let resizeTimeout = null;
        
        const resizePlots = () => {
            if (window.Plotly) {
                const plotAreas = resultsPanel.querySelectorAll('.plot-area');
                plotAreas.forEach(plotArea => {
                    try {
                        // Force Plotly to recalculate dimensions
                        const update = {
                            width: plotArea.offsetWidth,
                            height: plotArea.offsetHeight
                        };
                        window.Plotly.relayout(plotArea, update);
                    } catch (err) {
                        // Plot may not be initialized yet
                    }
                });
            }
        };
        
        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = resultsPanel.offsetWidth;
            resizeHandle.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            const deltaX = startX - e.clientX; // Subtract because panel grows to the left
            const newWidth = Math.max(280, Math.min(800, startWidth + deltaX));
            resultsPanel.style.width = `${newWidth}px`;
            
            // Debounce resize during drag for better performance
            if (resizeTimeout) clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(resizePlots, 50);
        });
        
        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                resizeHandle.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                
                // Final resize when drag completes
                if (resizeTimeout) clearTimeout(resizeTimeout);
                resizePlots();
            }
        });
    }
    
    // ==================== Undo/Redo ====================
    
    _onGroupDragComplete(moveData) {
        // Record move operation using full state snapshot
        // This is simpler than tracking individual component/node movements
        // Future optimization: track individual moves for better granularity
        // For now, we don't record moves to keep it simple and avoid too many undo entries
    }
    
    _serializeComponent(component) {
        return {
            id: component.id,
            name: component.name,
            x: component.x,
            y: component.y,
            width: component.width,
            height: component.height,
            rotation: component.rotation,
            pins: component.pins,
            meta: component.meta
        };
    }
    
    _undo() {
        const success = this.undoManager.undo((action) => {
            try {
                switch (action.type) {
                    case UNDO_TYPES.ADD_COMPONENT:
                        // Remove the component that was added
                        this.componentManager.removeComponent(action.data.component.id);
                        break;
                        
                    case UNDO_TYPES.DELETE_COMPONENT: {
                        // Restore the component that was deleted
                        const comp = action.data.component;
                        const component = new Component({
                            id: comp.id,
                            name: comp.name,
                            x: comp.x,
                            y: comp.y,
                            width: comp.width,
                            height: comp.height,
                            rotation: comp.rotation,
                            pins: comp.pins,
                            meta: comp.meta
                        });
                        this.componentManager.addComponent(component);
                        break;
                    }
                    
                    case UNDO_TYPES.DELETE_WIRE_SEGMENT: {
                        // Restore the wire segment
                        const { segment } = action.data;
                        const nodeId1 = this.wireGraph.addNode(segment.node1.x, segment.node1.y);
                        const nodeId2 = this.wireGraph.addNode(segment.node2.x, segment.node2.y);
                        this.wireGraph.addSegment(nodeId1, nodeId2);
                        break;
                    }
                    
                    case UNDO_TYPES.DELETE_PROBE: {
                        // Restore the probe
                        const { probe } = action.data;
                        this.probeManager.restoreProbe(probe, { render: false });
                        break;
                    }
                    
                    case UNDO_TYPES.FULL_STATE: {
                        // Restore entire state
                        this._deserialize(action.data.stateBefore);
                        break;
                    }
                    
                    default:
                        console.warn('Unknown undo action type:', action.type);
                        return false;
                }
                
                this._saveToLocalStorage();
                this.viewport.render();
                return true;
            } catch (error) {
                console.error('Undo failed:', error);
                return false;
            }
        });
        
        if (!success && this.undoManager.canUndo()) {
            console.log('Nothing to undo');
        }
    }
    
    _redo() {
        const success = this.undoManager.redo((action) => {
            try {
                switch (action.type) {
                    case UNDO_TYPES.ADD_COMPONENT: {
                        // Re-add the component
                        const comp = action.data.component;
                        const component = new Component({
                            id: comp.id,
                            name: comp.name,
                            x: comp.x,
                            y: comp.y,
                            width: comp.width,
                            height: comp.height,
                            rotation: comp.rotation,
                            pins: comp.pins,
                            meta: comp.meta
                        });
                        this.componentManager.addComponent(component);
                        break;
                    }
                    
                    case UNDO_TYPES.DELETE_COMPONENT:
                        // Re-delete the component
                        this.componentManager.removeComponent(action.data.component.id);
                        break;
                        
                    case UNDO_TYPES.DELETE_WIRE_SEGMENT: {
                        // Re-delete the wire segment
                        const { segment } = action.data;
                        this.wireGraph.removeSegment(segment.nodeId1, segment.nodeId2);
                        this.wireGraph.cleanup();
                        break;
                    }
                    
                    case UNDO_TYPES.DELETE_PROBE: {
                        // Re-delete the probe
                        this.probeManager.removeProbe(action.data.probe.id);
                        break;
                    }
                    
                    case UNDO_TYPES.FULL_STATE: {
                        // Restore state after
                        this._deserialize(action.data.stateAfter);
                        break;
                    }
                    
                    default:
                        console.warn('Unknown redo action type:', action.type);
                        return false;
                }
                
                this._saveToLocalStorage();
                this.viewport.render();
                return true;
            } catch (error) {
                console.error('Redo failed:', error);
                return false;
            }
        });
        
        if (!success && this.undoManager.canRedo()) {
            console.log('Nothing to redo');
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.circuitEditor = new CircuitEditorApp();
});

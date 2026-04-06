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
import { TextManager } from './TextManager.js';
import { TextEditor } from './TextEditor.js';
import { SimulationRuntimeManager } from './SimulationRuntime.js';

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
        this.componentManager = new ComponentManager(this.viewport, this.wireGraph, {
            isComponentInteractionEnabled: () => this._currentTool === 'select' && !this.wireEditor.isActive
        });
        this.selectionManager = new SelectionManager({
            viewport: this.viewport,
            wireGraph: this.wireGraph,
            componentManager: this.componentManager,
            wireEditor: this.wireEditor,
            isSelectionEnabled: () => !this.wireEditor.isActive && !this.selectedComponentId && this._currentTool !== 'probe' && this._currentTool !== 'text',
            onGroupDragComplete: (moveData) => this._onGroupDragComplete(moveData)
        });
        this.netlistGenerator = new NetlistGenerator(this.componentManager, this.wireGraph);
        this.probeManager = new ProbeManager(this.viewport, this.wireGraph, this.componentManager);
        this.netlistGenerator.setProbeManager(this.probeManager);
        this.textManager = new TextManager(this.viewport, {
            isTextDragEnabled: () => this._currentTool !== 'text'
        });
        this.textEditor = new TextEditor(this.viewport, this.textManager);
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
        this._currentTool = 'select'; // Track current tool: 'select', 'wire', 'probe', 'text'
        this._plotCounter = 0; // Unique plot IDs
        
        // Simulation directives
        this.spiceWorker = null;
        this.spiceRunBtn = null;
        this.spiceCancelBtn = null;
        this.spiceStatusEl = null;
        this.spiceStatusDetailEl = null;
        this.spiceProgressEl = null;
        this.spiceProgressBarEl = null;
        this.spiceProgressLabelEl = null;
        this.spicePlotEl = null;
        this.spiceDebugOutputEl = null;
        this.spiceDebugContainerEl = null;
        this.debugConsoleEnabled = false;
        this.simulationRuntime = new SimulationRuntimeManager();
        this._isSimulationRunning = false;
        this._simulationCancelled = false;
        
        // Wire up UI elements
        this._setupUI();

        // Component placement
        this._setupPlacement();

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
            this.textEditor.onStatusChange = (message) => {
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
                    this.textManager.clear();
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
                probeTypeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Re-render to show updated ghost preview
                this.viewport.render();
            });
        });
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
            this._setTool('text');
            this._updateToolButtons('text');
        });
        list.appendChild(textTool);

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
                this.textEditor.setActive(false);
                this.probeManager.setGhostPosition(null);
                this.canvas.style.cursor = 'crosshair';
                break;
            case 'probe':
                this._clearSelection();
                this.wireEditor.setActive(false);
                this.textEditor.setActive(false);
                this.canvas.style.cursor = 'crosshair';
                break;
            case 'text':
                this._clearSelection();
                this.wireEditor.setActive(false);
                this.textEditor.setActive(true);
                this.probeManager.setGhostPosition(null);
                this.canvas.style.cursor = 'text';
                break;
            case 'delete':
                this._clearSelection();
                this.wireEditor.setActive(false);
                this.textEditor.setActive(false);
                this.probeManager.setGhostPosition(null);
                this.canvas.style.cursor = 'not-allowed';
                break;
            case 'select':
                this._clearSelection();
                this.wireEditor.setActive(false);
                this.textEditor.setActive(false);
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
            
            // Let text editor handle first when editing
            if (this.textEditor.handleKeyDown(event)) {
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
                case 't':
                    if (!event.ctrlKey && !event.metaKey) {
                        this._setTool('text');
                        this._updateToolButtons('text');
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
        
        // Delete selected text
        if (this.textManager.selectedTextIds.size > 0) {
            for (const textId of this.textManager.selectedTextIds) {
                const text = this.textManager.getText(textId);
                if (text) {
                    this.undoManager.recordAction(UNDO_TYPES.FULL_STATE, {
                        stateBefore: this._serialize(),
                        description: 'Delete text'
                    });
                    this.textManager.removeText(textId);
                    const lastAction = this.undoManager.undoStack[this.undoManager.undoStack.length - 1];
                    if (lastAction) {
                        lastAction.data.stateAfter = this._serialize();
                    }
                    deleted = true;
                }
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
        
        // Check for text
        if (!deleted) {
            const text = this.textManager.getTextAt(worldX, worldY);
            if (text) {
                this.undoManager.recordAction(UNDO_TYPES.FULL_STATE, {
                    stateBefore: this._serialize(),
                    description: 'Delete text'
                });
                this.textManager.removeText(text.id);
                const lastAction = this.undoManager.undoStack[this.undoManager.undoStack.length - 1];
                if (lastAction) {
                    lastAction.data.stateAfter = this._serialize();
                }
                deleted = true;
            }
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
        const cancelBtn = document.getElementById('component-cancel-btn');
        const saveBtn = document.getElementById('component-save-btn');

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

        let width = Math.max(80, grid * 6);
        width = Math.ceil(width / grid) * grid;
        const labelInset = Math.min(Math.max(10, Math.round(width * 0.2)), Math.max(grid, width / 2 - grid));

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
                    value: []
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

            // Handle text tool
            if (this._currentTool === 'text') {
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
        const closeBtn = netlistModal?.querySelector('.modal-close');
        const copyBtn = document.getElementById('copy-netlist-btn');
        const downloadBtn = document.getElementById('download-netlist-btn');
        
        netlistBtn?.addEventListener('click', () => this._showNetlistModal());
        closeBtn?.addEventListener('click', () => this._closeNetlistModal());
        copyBtn?.addEventListener('click', () => this._copyNetlistToClipboard());
        downloadBtn?.addEventListener('click', () => this._downloadNetlist());
    }
    
    _showNetlistModal() {
        const modal = document.getElementById('netlist-modal');
        const content = document.getElementById('netlist-output');
        if (!modal || !content) return;
        
        try {
            const rawText = (document.getElementById('simulation-preview')?.value || '').trim() || 'op';
            const netlist = this.netlistGenerator.generate([{ type: 'custom', text: rawText }]);
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
    
    async _copyNetlistToClipboard() {
        const content = document.getElementById('netlist-output');
        const btn = document.getElementById('copy-netlist-btn');
        if (!content || !btn) return;

        const netlistText = content.textContent || '';
        const originalText = btn.textContent;

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(netlistText);
            } else {
                this._copyTextFallback(netlistText);
            }

            btn.textContent = 'Copied';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        } catch (error) {
            console.error('Failed to copy netlist:', error);
            btn.textContent = 'Copy Failed';
            setTimeout(() => {
                btn.textContent = originalText;
            }, 2000);
        }
    }

    _copyTextFallback(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }
    
    _downloadNetlist() {
        const content = document.getElementById('netlist-output');
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
        
        simBtn?.addEventListener('click', () => this._showSimulationModal());
        simBadge?.addEventListener('click', () => this._showSimulationModal());
        document.getElementById('close-sim-btn')?.addEventListener('click', () => this._closeSimulationModal());
        document.getElementById('clear-sim-btn')?.addEventListener('click', () => this._clearAllDirectives());

        // Live badge update as user edits the commands textarea
        document.getElementById('simulation-preview')?.addEventListener('input', () => this._updateSimulationBadge());
        
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
        
        this._appendToSimTextarea(`dc ${source} ${start} ${stop} ${step}`);
        
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
        
        this._appendToSimTextarea(`ac ${type} ${points} ${fstart} ${fstop}`);
        
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
        
        let line = `tran ${tstep} ${tstop}`;
        if (tstart) line += ` ${tstart}`;
        if (tmax) line += ` ${tmax}`;
        
        this._appendToSimTextarea(line);
        
        document.getElementById('tran-tstep').value = '';
        document.getElementById('tran-tstop').value = '';
        document.getElementById('tran-tstart').value = '';
        document.getElementById('tran-tmax').value = '';
    }
    
    _addOpDirective() {
        this._appendToSimTextarea('op');
    }
    
    _addCustomDirective() {
        const text = document.getElementById('custom-directive').value.trim();
        
        if (!text) {
            alert('Please enter custom directive text');
            return;
        }
        
        this._appendToSimTextarea(text);
        document.getElementById('custom-directive').value = '';
    }

    _appendToSimTextarea(text) {
        const ta = document.getElementById('simulation-preview');
        if (!ta) return;
        const current = ta.value;
        ta.value = current ? `${current.trimEnd()}
${text}` : text;
        this._updateSimulationBadge();
    }
    
    _clearAllDirectives() {
        const ta = document.getElementById('simulation-preview');
        if (!ta || !ta.value.trim()) return;
        
        if (confirm('Clear all simulation commands?')) {
            ta.value = '';
            this._updateSimulationBadge();
        }
    }
    
    _updateDirectivesList() {
        // Active-directives list removed; textarea is the editable source of truth.
    }
    
    _updateSimulationPreview() {
        // The simulation-preview textarea is the live editable source of truth;
        // nothing to push into it from here.
    }
    
    _updateSimulationBadge() {
        const badge = document.getElementById('simulation-badge');
        const badgeText = document.getElementById('simulation-badge-text');
        if (!badge || !badgeText) return;
        
        const text = (document.getElementById('simulation-preview')?.value || '').trim();
        if (!text) {
            badge.classList.remove('active');
            badgeText.textContent = 'No Sim';
        } else {
            const types = new Set();
            text.split('\n').forEach(line => {
                const l = line.trim().toLowerCase();
                if (l.startsWith('ac ') || l === 'ac' || l.startsWith('.ac')) types.add('AC');
                else if (l.startsWith('tran ') || l === 'tran' || l.startsWith('.tran')) types.add('TRAN');
                else if (l.startsWith('dc ') || l === 'dc' || l.startsWith('.dc')) types.add('DC');
                else if (l === 'op' || l.startsWith('op ') || l === '.op' || l.startsWith('.op ')) types.add('OP');
            });
            badge.classList.add('active');
            badgeText.textContent = types.size > 0 ? [...types].join(', ') : 'Custom';
        }
    }

    // ==================== Ngspice Runner ====================

    _setupSimulationRunner() {
        this.spiceRunBtn = document.getElementById('sim-run-btn');
        this.spiceCancelBtn = document.getElementById('sim-cancel-btn');
        this.spiceStatusEl = document.getElementById('sim-status');
        this.spiceStatusDetailEl = document.getElementById('sim-status-detail');
        this.spiceProgressEl = document.getElementById('sim-progress');
        this.spiceProgressBarEl = document.getElementById('sim-progress-bar');
        this.spiceProgressLabelEl = document.getElementById('sim-progress-label');
        this.spicePlotsEl = document.getElementById('results-plots');
        this.spiceDebugOutputEl = document.getElementById('sim-debug-output');
        this.spiceDebugContainerEl = document.getElementById('results-debug');

        const debugToggleEl = document.getElementById('debug-console-toggle');
        if (debugToggleEl) {
            debugToggleEl.addEventListener('change', () => {
                this.debugConsoleEnabled = debugToggleEl.checked;
                if (this.spiceDebugContainerEl) {
                    this.spiceDebugContainerEl.classList.toggle('is-visible', this.debugConsoleEnabled);
                }
            });
        }

        if (this.spiceRunBtn) {
            this.spiceRunBtn.addEventListener('click', () => this._runNgspiceSimulation());
        }
        if (this.spiceCancelBtn) {
            this.spiceCancelBtn.addEventListener('click', () => this._cancelNgspiceSimulation());
            this.spiceCancelBtn.disabled = true;
        }

        // Show initial status
        this._setRunStatus('ready', 'Ready');
        this._setRunProgress('none');
        this._clearDebugConsole();

    }

    _clearDebugConsole() {
        if (!this.spiceDebugOutputEl) return;
        this.spiceDebugOutputEl.textContent = 'Waiting for simulation output...';
    }

    _appendDebugConsole(text, prefix = '') {
        if (!this.debugConsoleEnabled || !this.spiceDebugOutputEl || !text) return;

        const entry = `${prefix}${text}`.replace(/\n?$/, '\n');
        if (this.spiceDebugOutputEl.textContent === 'Waiting for simulation output...') {
            this.spiceDebugOutputEl.textContent = '';
        }
        this.spiceDebugOutputEl.textContent += entry;
        this.spiceDebugOutputEl.scrollTop = this.spiceDebugOutputEl.scrollHeight;
    }

    async _runNgspiceSimulation() {
        if (!this.spiceRunBtn || !this.spiceStatusEl) return;
        if (this._isSimulationRunning) return;

        const probeCount = this.probeManager?.probes?.length ?? 0;
        if (probeCount === 0) {
            const message = 'Place at least one probe before running the simulation.';
            this._setRunStatus('error', message);
            alert(message);
            return;
        }

        const rawText = (document.getElementById('simulation-preview')?.value || '').trim();
        const simText = rawText || 'op';

        // Build a single job for the whole textarea content
        let jobs;
        try {
            const { netlist, probeInfo, analysisType, runtimeSignals } =
                this.netlistGenerator.generateWithMetadata([{ type: 'custom', text: simText }]);
            jobs = [{
                idx: 0,
                label: rawText || 'Operating Point',
                netlist,
                probeInfo,
                analysisType,
                runtimeSignals
            }];
        } catch (error) {
            this._setRunStatus('error', 'Failed to generate netlist');
            return;
        }

        this._clearPlot();
    this._clearDebugConsole();
    this._appendDebugConsole(`Queued ${jobs.length} analysis${jobs.length === 1 ? '' : 'es'}`);

        this._simulationCancelled = false;
        this._isSimulationRunning = true;
        this._setRunStatus('running', 'Initializing simulation...', `Queued ${jobs.length} analysis${jobs.length === 1 ? '' : 'es'}`);
        this._setRunProgress('indeterminate', null, 'Preparing ngspice runtime');
        this.spiceRunBtn.disabled = true;
        if (this.spiceCancelBtn) {
            this.spiceCancelBtn.disabled = false;
        }

        this._pendingSimJobs = jobs;
        this._simResults = [];

        try {
            for (let index = 0; index < jobs.length; index += 1) {
                if (this._simulationCancelled) break;

                const job = jobs[index];
                const result = await this.simulationRuntime.runJob(job, {
                    onStatus: (status) => this._handleSimulationStatus(status, job, index, jobs.length),
                    onProgress: (progress) => this._handleSimulationProgress(progress, job, index, jobs.length),
                    onStdout: (text) => this._appendDebugConsole(text, '[stdout] '),
                    onStderr: (text) => this._appendDebugConsole(text, '[stderr] '),
                });

                this._simResults.push({ ...job, ...result });
            }

            if (this._simulationCancelled) {
                this._setRunStatus('ready', 'Simulation cancelled', 'Run aborted before completion');
                this._setRunProgress('none');
            } else {
                this._finishSimulationRun();
            }
        } catch (error) {
            if (error?.cancelled || this._simulationCancelled) {
                this._setRunStatus('ready', 'Simulation cancelled', 'Run aborted before completion');
                this._setRunProgress('none');
            } else {
                this._setRunStatus('error', 'Simulation failed', error.message);
                this._showErrorPlaceholder(error.message);
            }
        } finally {
            this._isSimulationRunning = false;
            this.spiceRunBtn.disabled = false;
            if (this.spiceCancelBtn) {
                this.spiceCancelBtn.disabled = true;
            }
        }
    }

    async _cancelNgspiceSimulation() {
        if (!this._isSimulationRunning) return;
        this._simulationCancelled = true;
        this._setRunStatus('running', 'Cancelling simulation...', 'Stopping active ngspice worker');
        this._setRunProgress('indeterminate', null, 'Cancelling active analysis');
        await this.simulationRuntime.cancel();
    }

    _handleSimulationStatus(status, job, index, totalJobs) {
        const lifecycle = status.lifecycle || 'running';
        const summary = lifecycle === 'loading-assets'
            ? 'Loading ngspice assets...'
            : lifecycle === 'parsing-netlist'
                ? 'Submitting circuit...'
                : 'Running simulation...';

        this._setRunStatus('running', summary, `[${index + 1}/${totalJobs}] ${job.label}`);
        this._appendDebugConsole(`${status.message || summary}`, `[status ${index + 1}/${totalJobs}] `);

        if (lifecycle !== 'running') {
            this._setRunProgress('indeterminate', null, status.message);
        }
    }

    _handleSimulationProgress(progress, job, index, totalJobs) {
        if (progress.mode === 'determinate' && Number.isFinite(progress.progress)) {
            const percent = Math.max(0, Math.min(progress.progress, 1));
            const label = `${Math.round(percent * 100)}% • ${this._formatProgressTimes(progress.currentTime, progress.finalTime)}`;
            //this._setRunStatus('running', 'Running transient analysis...', `[${index + 1}/${totalJobs}] ${job.label}`);
            this._setRunProgress('determinate', percent, label);
            return;
        }

        this._setRunProgress('indeterminate', null, `[${index + 1}/${totalJobs}] ${job.label}`);
    }

    _finishSimulationRun() {
        let failedCount = 0;
        console.log('Simulation results:', this._simResults);
        this._simResults.forEach((result) => {
            const plotId = `${result.analysisType || 'plot'}-${result.idx + 1}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
            this._appendDebugConsole(`\n=== ${result.label} (${result.analysisType}) ===`);
            if (result.stdout) {
                this._appendDebugConsole(result.stdout, '[stdout dump]\n');
            }
            if (result.stderr) {
                this._appendDebugConsole(result.stderr, '[stderr dump]\n');
            }
            if (result.success === false) {
                failedCount += 1;
                const message = result.failureMessage || 'Analysis failed before any plot data was produced.';
                this._showAnalysisFailure(result.analysisType, result.label, message, plotId);
            } else if (result.analyses && result.analyses.length > 0) {
                // Use the runtimeSignals from the job to filter vectors
                this._plotAnalyses(result.analyses, result.probeInfo, result.runtimeSignals, plotId);
            } else {
                failedCount += 1;
                const message = result.failureMessage || 'Analysis completed without producing usable results.';
                this._showAnalysisFailure(result.analysisType, result.label, message, plotId);
            }
        });

        if (failedCount === 0) {
            this._setRunStatus('ready', 'Simulation complete', `Completed ${this._simResults.length} analys${this._simResults.length === 1 ? 'is' : 'es'}`);
        } else if (failedCount === this._simResults.length) {
            this._setRunStatus('error', 'All analyses failed', 'See console for ngspice diagnostics');
        } else {
            this._setRunStatus('error', `${failedCount} of ${this._simResults.length} analyses failed`, 'Completed with partial failures');
        }

        this._setRunProgress('none');
    }

    _inferAnalysisType(text) {
        const normalized = String(text || '').trim().toLowerCase();
        if (normalized.startsWith('.tran') || normalized.startsWith('tran')) return 'tran';
        if (normalized.startsWith('.ac') || normalized.startsWith('ac')) return 'ac';
        if (normalized.startsWith('.dc') || normalized.startsWith('dc')) return 'dc';
        if (normalized.startsWith('.op') || normalized.startsWith('op')) return 'op';
        return 'op';
    }

    _formatProgressTimes(currentTime, finalTime) {
        if (!Number.isFinite(currentTime) || !Number.isFinite(finalTime) || finalTime <= 0) {
            return 'Running';
        }
        return `${currentTime.toExponential(3)} / ${finalTime.toExponential(3)} s`;
    }

    _setRunStatus(state, text, detail = '') {
        if (!this.spiceStatusEl) return;
        this.spiceStatusEl.textContent = text;
        if (this.spiceStatusDetailEl) {
            this.spiceStatusDetailEl.textContent = detail || '';
        }
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

    _setRunProgress(mode, value = null, label = '') {
        if (!this.spiceProgressEl || !this.spiceProgressBarEl || !this.spiceProgressLabelEl) return;

        this.spiceProgressEl.classList.remove('is-hidden', 'is-indeterminate');

        if (mode === 'none') {
            this.spiceProgressEl.classList.add('is-hidden');
            this.spiceProgressBarEl.style.width = '0%';
            this.spiceProgressLabelEl.textContent = '';
            return;
        }

        if (mode === 'indeterminate') {
            this.spiceProgressEl.classList.add('is-indeterminate');
            this.spiceProgressBarEl.style.width = '35%';
            this.spiceProgressLabelEl.textContent = label || 'Running analysis';
            return;
        }

        const percent = Math.max(0, Math.min(Number(value) || 0, 1));
        this.spiceProgressBarEl.style.width = `${percent * 100}%`;
        this.spiceProgressLabelEl.textContent = label || `${Math.round(percent * 100)}%`;
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
                <span>Simulation failed<br/><small>Review the status and analysis cards for details</small></span>
            </div>
        `;
    }

    _getAnalysisTitle(analysisType) {
        return {
            'ac': 'AC Analysis (Frequency Response)',
            'tran': 'Transient Analysis',
            'dc': 'DC Sweep',
            'op': 'Operating Point'
        }[analysisType] || 'Simulation Results';
    }

    _showAnalysisFailure(analysisType, label, message, id) {
        if (!this.spicePlotsEl) return;

        const placeholder = this.spicePlotsEl.querySelector('.plot-placeholder');
        if (placeholder) placeholder.remove();

        const container = document.createElement('div');
        container.className = 'plot-container plot-container-error';
        container.id = `plot-${id}`;

        const header = document.createElement('div');
        header.className = 'plot-header';

        const title = document.createElement('div');
        title.className = 'plot-title';
        title.textContent = this._getAnalysisTitle(analysisType);
        header.appendChild(title);

        const body = document.createElement('div');
        body.className = 'plot-message error';

        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined';
        icon.textContent = 'error_outline';

        const copy = document.createElement('div');
        copy.className = 'plot-message-copy';

        const heading = document.createElement('strong');
        heading.textContent = label;

        const detail = document.createElement('span');
        detail.textContent = message;

        copy.appendChild(heading);
        copy.appendChild(detail);
        body.appendChild(icon);
        body.appendChild(copy);

        container.appendChild(header);
        container.appendChild(body);
        this.spicePlotsEl.appendChild(container);
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
        
        const titleText = this._getAnalysisTitle(analysisType);
        
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
            <div class="plot-yrange-controls"></div>
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

    /**
     * Plot all analyses from a simulation result, filtering vectors to match probed signals.
     * @param {Array} analyses - NormalizedResult[] from the new ngspice client
     * @param {Array} probeInfo - Probe metadata from NetlistGenerator
     * @param {string[]} runtimeSignals - Signal names we care about (e.g. "v(3)", "i(V_IPROBE_I1)")
     * @param {string} plotId - Base plot ID
     */
    _plotAnalyses(analyses, probeInfo = [], runtimeSignals = [], plotId = null) {
        if (!this.spicePlotsEl) return;

        // Build a set of wanted signal names (lowercased) for filtering
        const wantedSet = new Set(runtimeSignals.map(s => s.toLowerCase()));

        analyses.forEach((analysis, i) => {
            const id = plotId ? `${plotId}-${i}` : `analysis-${++this._plotCounter}`;
            const aType = analysis.type || 'unknown';

            if (aType === 'op' || aType === 'tf' || aType === 'sens') {
                this._plotOpAnalysis(analysis, probeInfo, wantedSet, id);
                return;
            }

            if (!analysis.sweep) return;
            if (!window.Plotly) return;

            const plotArea = this._createPlotContainer(aType, id);
            if (!plotArea) return;

            if (aType === 'ac') {
                this._plotAcAnalysis(analysis, probeInfo, wantedSet, plotArea);
            } else {
                this._plotSweepAnalysis(analysis, probeInfo, wantedSet, aType, plotArea);
            }
        });
    }

    /**
     * Filter vectors from an analysis to only those matching probed signals.
     * Returns an array of { vector, probeMatch } objects.
     */
    _filterVectors(vectors, probeInfo, wantedSet) {
        const defaultColors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

        return vectors
            .filter(v => wantedSet.size === 0 || wantedSet.has(v.name.toLowerCase()))
            .map((v, i) => {
                // Try to match vector to a probe for label/color
                const probe = probeInfo.find(p => {
                    if (p.type === 'current' && p.sourceName) {
                        return v.name.toLowerCase() === `i(${p.sourceName.toLowerCase()})`;
                    }
                    return v.name.toLowerCase() === `v(${(p.node || '').toLowerCase()})`;
                });
                return {
                    vector: v,
                    label: probe?.label || v.name,
                    color: probe?.color || defaultColors[i % defaultColors.length],
                    type: probe?.type || (v.name.toLowerCase().startsWith('i(') ? 'current' : 'voltage')
                };
            });
    }

    /**
     * Render an operating point / scalar analysis as a table.
     */
    _plotOpAnalysis(analysis, probeInfo, wantedSet, plotId) {
        const plotArea = this._createPlotContainer(analysis.type || 'op', plotId);
        if (!plotArea) return;

        const fmt = (v) => {
            const abs = Math.abs(v);
            if (abs === 0) return '0';
            if (abs >= 1e3) return (v / 1e3).toPrecision(5) + ' k';
            if (abs >= 1) return v.toPrecision(5);
            if (abs >= 1e-3) return (v * 1e3).toPrecision(5) + ' m';
            if (abs >= 1e-6) return (v * 1e6).toPrecision(5) + ' µ';
            return v.toExponential(4);
        };

        const scalars = analysis.scalars || {};
        const entries = Object.entries(scalars)
            .filter(([name]) => wantedSet.size === 0 || wantedSet.has(name.toLowerCase()));

        if (entries.length === 0) {
            plotArea.innerHTML = '<div class="op-table-empty">No operating point data</div>';
            return;
        }

        let rows = '';
        for (const [name, value] of entries) {
            const probe = probeInfo.find(p => {
                if (p.type === 'current' && p.sourceName) {
                    return name.toLowerCase() === `i(${p.sourceName.toLowerCase()})`;
                }
                return name.toLowerCase() === `v(${(p.node || '').toLowerCase()})`;
            });
            const label = probe?.label || name;
            const unit = name.toLowerCase().startsWith('i(') ? 'A' : 'V';
            rows += `<tr><td class="op-probe">${label}</td><td class="op-value">${fmt(value)} ${unit}</td></tr>`;
        }

        plotArea.innerHTML = `
            <table class="op-table">
                <thead><tr><th>Probe</th><th>Value</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    /**
     * Plot AC analysis from a NormalizedResult with complex vectors.
     */
    _plotAcAnalysis(analysis, probeInfo, wantedSet, plotArea) {
        const filtered = this._filterVectors(analysis.vectors, probeInfo, wantedSet);
        if (filtered.length === 0) return;

        const freqValues = analysis.sweep.values;

        const signals = filtered.map(f => {
            const v = f.vector;
            const mag = [];
            const phase = [];
            for (let i = 0; i < v.real.length; i++) {
                const re = v.real[i];
                const im = v.imag ? v.imag[i] : 0;
                mag.push(Math.sqrt(re * re + im * im));
                phase.push(Math.atan2(im, re) * (180 / Math.PI));
            }
            return {
                label: f.label,
                color: f.color,
                freq: freqValues,
                magnitude: mag,
                phase
            };
        });

        const plotContainer = plotArea.closest('.plot-container');
        plotContainer._acSignalData = signals;

        const scaleButtons = plotContainer.querySelectorAll('.scale-btn');
        scaleButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                scaleButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._renderAcPlot(plotArea, plotContainer._acSignalData, btn.dataset.scale);
            });
        });

        this._renderAcPlot(plotArea, signals, 'db');
    }

    /**
     * Render AC plot with specified scale (dB, V, or phase).
     */
    _renderAcPlot(plotArea, signals, scale) {
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

        const traces = signals.map(sig => ({
            x: Array.from(sig.freq),
            y: yData(sig),
            type: 'scatter',
            mode: 'lines',
            name: `${sig.label} (${traceSuffix})`,
            line: { color: sig.color, width: 2 }
        }));

        const layout = {
            paper_bgcolor: '#ffffff',
            plot_bgcolor: '#f8fafc',
            font: { color: '#0f172a', size: 10 },
            xaxis: {
                title: { text: 'Frequency (Hz)', font: { size: 11 } },
                type: 'log',
                gridcolor: '#e2e8f0',
                zerolinecolor: '#e2e8f0',
                linecolor: '#cbd5e1',
                linewidth: 1,
                mirror: true,
                tickfont: { size: 9 }
            },
            yaxis: {
                title: { text: yLabel, font: { size: 11 } },
                gridcolor: '#e2e8f0',
                zerolinecolor: '#e2e8f0',
                linecolor: '#cbd5e1',
                linewidth: 1,
                mirror: true,
                tickfont: { size: 9 }
            },
            margin: { t: 20, r: 20, b: 45, l: 50 },
            legend: {
                x: 1, xanchor: 'right', y: 1,
                bgcolor: 'rgba(255, 255, 255, 0.92)',
                bordercolor: '#dbe2ea', borderwidth: 1,
                font: { size: 10 }
            }
        };

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

        const container = plotArea.closest('.plot-container');
        if (container) {
            this._setupYRangeControls(container, { hasDualAxis: false, y1Label: yLabel });
        }
    }

    /**
     * Plot time-domain / DC sweep analysis from a NormalizedResult.
     */
    _plotSweepAnalysis(analysis, probeInfo, wantedSet, analysisType, plotArea) {
        const filtered = this._filterVectors(analysis.vectors, probeInfo, wantedSet);
        if (filtered.length === 0) return;

        const xValues = Array.from(analysis.sweep.values);
        const signals = {};
        const signalMeta = [];
        const signalColors = {};
        const defaultColors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

        filtered.forEach((f, i) => {
            const label = f.label;
            signalMeta.push({ label, type: f.type, color: f.color });
            signalColors[label] = f.color;
            signals[label] = Array.from(f.vector.real);
        });

        const plotContainer = plotArea.closest('.plot-container');
        plotContainer._signalData = { xValues, signals, signalMeta, signalColors, defaultColors };
        plotContainer._analysisType = analysisType;

        this._populateXYSelectors(plotContainer, signalMeta);
        this._renderStandardPlot(plotArea, plotContainer._signalData, analysisType);
    }

    /**
     * Render a standard time-domain plot.
     */
    _renderStandardPlot(plotArea, signalData, analysisType) {
        const { xValues, signals, signalMeta, signalColors, defaultColors } = signalData;

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

        let xAxisTitle = 'Time (s)';
        if (analysisType === 'dc') xAxisTitle = 'Voltage (V)';

        let yAxisTitle = 'Voltage (V)';
        if (hasCurrent && !hasVoltage) yAxisTitle = 'Current (A)';

        const layout = {
            paper_bgcolor: '#ffffff',
            plot_bgcolor: '#f8fafc',
            font: { color: '#0f172a', size: 10 },
            xaxis: {
                title: { text: xAxisTitle, font: { size: 11 } },
                gridcolor: '#e2e8f0',
                zerolinecolor: '#e2e8f0',
                linecolor: '#cbd5e1',
                linewidth: 1,
                mirror: true,
                tickfont: { size: 9 }
            },
            yaxis: {
                title: { text: yAxisTitle, font: { size: 11 } },
                gridcolor: '#e2e8f0',
                zerolinecolor: '#e2e8f0',
                linecolor: '#cbd5e1',
                linewidth: 1,
                mirror: true,
                tickfont: { size: 9 }
            },
            margin: { t: 20, r: 20, b: 45, l: 50 },
            legend: {
                x: 1, xanchor: 'right', y: 1,
                bgcolor: 'rgba(255, 255, 255, 0.92)',
                bordercolor: '#dbe2ea', borderwidth: 1,
                font: { size: 10 }
            }
        };

        if (hasCurrent && hasVoltage) {
            layout.yaxis2 = {
                title: { text: 'Current (A)', font: { size: 11 }, standoff: 20 },
                overlaying: 'y',
                side: 'right',
                gridcolor: '#e2e8f0',
                zerolinecolor: '#e2e8f0',
                linecolor: '#cbd5e1',
                linewidth: 1,
                mirror: true,
                tickfont: { size: 9 }
            };
            layout.margin.r = 60;
        }

        requestAnimationFrame(() => {
            const rect = plotArea.getBoundingClientRect();
            layout.width = rect.width || 340;
            layout.height = rect.height || 260;
            window.Plotly.newPlot(plotArea, traces, layout, {
                responsive: true,
                modeBarButtonsToRemove: ['pan2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d']
            });
        });

        const container = plotArea.closest('.plot-container');
        if (container) {
            const y2Label = 'Current (A)';
            this._setupYRangeControls(container, {
                hasDualAxis: hasCurrent && hasVoltage,
                y1Label: yAxisTitle,
                y2Label
            });
        }
    }

    /**
     * Populate X-Y axis selector dropdowns.
     */
    _populateXYSelectors(plotContainer, signalMeta) {
        const xSelect = plotContainer.querySelector('.xy-axis-select[data-axis="x"]');
        const ySelect = plotContainer.querySelector('.xy-axis-select[data-axis="y"]');

        if (!xSelect || !ySelect || signalMeta.length < 2) return;

        xSelect.innerHTML = '<option value="">Select X...</option>';
        ySelect.innerHTML = '<option value="">Select Y...</option>';

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

        if (signalMeta.length >= 2) {
            xSelect.value = '0';
            ySelect.value = '1';
        }
    }

    /**
     * Update X-Y plot based on current selector values.
     */
    _updateXYPlot(plotContainer) {
        const xSelect = plotContainer.querySelector('.xy-axis-select[data-axis="x"]');
        const ySelect = plotContainer.querySelector('.xy-axis-select[data-axis="y"]');
        const plotArea = plotContainer.querySelector('.plot-area');

        if (!xSelect || !ySelect || !plotArea || !plotContainer._signalData) return;

        const xIndex = parseInt(xSelect.value);
        const yIndex = parseInt(ySelect.value);

        if (!Number.isFinite(xIndex) || !Number.isFinite(yIndex)) {
            plotArea.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #94a3b8; font-size: 12px;">Select X and Y signals to plot</div>';
            return;
        }

        if (xIndex === yIndex) {
            plotArea.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #f59e0b; font-size: 12px;">Please select different signals for X and Y axes</div>';
            return;
        }

        this._renderXYPlot(plotArea, plotContainer._signalData, xIndex, yIndex);
    }

    /**
     * Set up Y-axis range controls for a plot container.
     * @param {HTMLElement} container - The .plot-container element
     * @param {object} opts
     * @param {boolean} opts.hasDualAxis - Whether a second Y axis (yaxis2) exists
     * @param {string}  opts.y1Label    - Short label for YAxis 1
     * @param {string}  opts.y2Label    - Short label for YAxis 2
     */
    _setupYRangeControls(container, { hasDualAxis = false, y1Label = 'Y', y2Label = 'Y2' } = {}) {
        const el = container.querySelector('.plot-yrange-controls');
        if (!el) return;

        const makeRow = (axisKey, labelText) => {
            const row = document.createElement('div');
            row.className = 'yrange-row';

            const label = document.createElement('span');
            label.className = 'yrange-label';
            label.textContent = labelText;
            label.title = labelText;

            const minInput = document.createElement('input');
            minInput.type = 'number';
            minInput.className = 'yrange-input';
            minInput.placeholder = 'min';
            minInput.step = 'any';

            const sep = document.createElement('span');
            sep.className = 'yrange-sep';
            sep.textContent = '–';

            const maxInput = document.createElement('input');
            maxInput.type = 'number';
            maxInput.className = 'yrange-input';
            maxInput.placeholder = 'max';
            maxInput.step = 'any';

            const autoBtn = document.createElement('button');
            autoBtn.className = 'yrange-auto-btn';
            autoBtn.textContent = 'Auto';

            row.appendChild(label);
            row.appendChild(minInput);
            row.appendChild(sep);
            row.appendChild(maxInput);
            row.appendChild(autoBtn);

            const apply = () => {
                const plotArea = container.querySelector('.plot-area');
                if (!plotArea || !window.Plotly) return;
                const minVal = minInput.value !== '' ? parseFloat(minInput.value) : null;
                const maxVal = maxInput.value !== '' ? parseFloat(maxInput.value) : null;
                const update = {};
                if (minVal !== null && maxVal !== null && isFinite(minVal) && isFinite(maxVal)) {
                    update[`${axisKey}.range`] = [minVal, maxVal];
                    update[`${axisKey}.autorange`] = false;
                } else {
                    update[`${axisKey}.autorange`] = true;
                }
                window.Plotly.relayout(plotArea, update);
            };

            minInput.addEventListener('blur', apply);
            maxInput.addEventListener('blur', apply);
            minInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.target.blur(); } });
            maxInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.target.blur(); } });

            autoBtn.addEventListener('click', () => {
                minInput.value = '';
                maxInput.value = '';
                apply();
            });

            return row;
        };

        el.innerHTML = '';
        el.appendChild(makeRow('yaxis', y1Label));
        if (hasDualAxis) {
            el.appendChild(makeRow('yaxis2', y2Label));
        }
    }

    /**
     * Render an X-Y plot (one signal vs another).
     */
    _renderXYPlot(plotArea, signalData, xIndex, yIndex) {
        const { signals, signalMeta, signalColors, defaultColors } = signalData;

        const xMeta = signalMeta[xIndex];
        const yMeta = signalMeta[yIndex];
        if (!xMeta || !yMeta) return;

        const xValues = signals[xMeta.label];
        const yValues = signals[yMeta.label];
        if (!xValues || !yValues) return;

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

        const xUnit = xMeta.type === 'current' ? 'A' : 'V';
        const yUnit = yMeta.type === 'current' ? 'A' : 'V';

        const layout = {
            paper_bgcolor: '#ffffff',
            plot_bgcolor: '#f8fafc',
            font: { color: '#0f172a', size: 10 },
            xaxis: {
                title: { text: `${xMeta.label} (${xUnit})`, font: { size: 11 } },
                gridcolor: '#e2e8f0',
                zerolinecolor: '#e2e8f0',
                linecolor: '#cbd5e1',
                linewidth: 1,
                mirror: true,
                tickfont: { size: 9 }
            },
            yaxis: {
                title: { text: `${yMeta.label} (${yUnit})`, font: { size: 11 } },
                gridcolor: '#e2e8f0',
                zerolinecolor: '#e2e8f0',
                linecolor: '#cbd5e1',
                linewidth: 1,
                mirror: true,
                tickfont: { size: 9 }
            },
            margin: { t: 20, r: 20, b: 45, l: 50 },
            showlegend: false
        };

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

        const container = plotArea.closest('.plot-container');
        if (container) {
            this._setupYRangeControls(container, { hasDualAxis: false, y1Label: `${yMeta.label} (${yUnit})` });
        }
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
            texts: this.textManager.toJSON(),
            simulation: document.getElementById('simulation-preview')?.value || '',
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
        this.textManager.clear();
        const previewTa = document.getElementById('simulation-preview');
        if (previewTa) previewTa.value = '';
        
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
        
        // Restore texts
        if (data.texts) {
            this.textManager.fromJSON(data.texts);
        }
        
        // Restore counters
        if (data.counters) {
            this._componentCounter = data.counters.component || 1;
            this._designatorCounters = new Map(data.counters.designators || []);
        }
        
        // Restore simulation directives
        // Restore simulation commands
        if (data.simulation !== undefined) {
            const ta = document.getElementById('simulation-preview');
            if (ta) {
                // Backward compat: old format was an array of directive objects
                if (Array.isArray(data.simulation)) {
                    ta.value = data.simulation.map(d => {
                        const t = (d.text || d).trim().replace(/^\.(?=ac |tran |dc |op[ \b]|op$)/i, '');
                        return t;
                    }).join('\n');
                } else {
                    ta.value = data.simulation;
                }
            }
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

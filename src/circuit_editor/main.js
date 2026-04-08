/**
 * Circuit Editor - Main Entry Point
 * 
 * Thin orchestrator that initializes subsystems and wires them together.
 * Domain logic lives in dedicated modules:
 *   - CanvasViewport: transforms and rendering infrastructure
 *   - WireGraph / WireEditor: wire topology and drawing
 *   - ComponentManager / SelectionManager: component lifecycle and selection
 *   - NetlistGenerator: SPICE netlist generation
 *   - ProbeManager: measurement probes
 *   - TextManager / TextEditor: text annotations
 *   - UndoManager: history tracking
 *   - LibraryManager: component library panel
 *   - SubcircuitManager: subcircuit parsing and modal
 *   - ComponentEditorModal: component/probe editing modals
 *   - SimulationController: simulation directives and runner
 *   - ResultsPlotter: Plotly-based result visualization
 *   - CircuitPersistence: save/load/autosave
 *   - KeyboardHandler: keyboard shortcut routing
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
import { createComponentFromDefinition, Component } from './Component.js';
import { TextManager } from './TextManager.js';
import { TextEditor } from './TextEditor.js';
import { SimulationRuntimeManager } from './SimulationRuntime.js';

import { ResultsPlotter } from './ResultsPlotter.js';
import { SimulationController } from './SimulationController.js';
import { SubcircuitManager } from './SubcircuitManager.js';
import { CircuitPersistence } from './CircuitPersistence.js';
import { ComponentEditorModal } from './ComponentEditorModal.js';
import { LibraryManager } from './LibraryManager.js';
import { KeyboardHandler } from './KeyboardHandler.js';

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
            isSelectionEnabled: () => !this.wireEditor.isActive && !this.libraryManager.selectedComponentId && this._currentTool !== 'probe' && this._currentTool !== 'text',
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
        this._ghostComponent = null;
        this._ghostDefinitionId = null;
        this._ghostDefinition = null;
        this._currentTool = 'select';

        // Initialize extracted modules
        this.libraryManager = new LibraryManager({
            onSelectionChange: (componentId) => {
                this.selectionManager?.clearSelection();
                this.probeManager.selectedProbeId = null;
                if (this._currentTool === 'delete') {
                    this._setTool('select');
                    this._updateToolButtons('select');
                }
            },
            onToolChange: (tool) => {
                const effectiveTool = this._currentTool === 'delete' ? 'select' : tool;
                this._setTool(effectiveTool);
                this._updateToolButtons(effectiveTool);
            }
        });

        this.subcircuitManager = new SubcircuitManager({
            componentManager: this.componentManager,
            getComponentLibrary: () => this.libraryManager.componentLibrary
        });

        this.componentEditorModal = new ComponentEditorModal({
            canvas: this.canvas,
            componentManager: this.componentManager,
            probeManager: this.probeManager,
            subcircuitManager: this.subcircuitManager,
            onSave: () => this._saveToLocalStorage()
        });

        const plotsContainer = document.getElementById('results-plots');
        this.resultsPlotter = new ResultsPlotter(plotsContainer);

        this.simulationController = new SimulationController({
            netlistGenerator: this.netlistGenerator,
            simulationRuntime: new SimulationRuntimeManager(),
            probeManager: this.probeManager,
            resultsPlotter: this.resultsPlotter,
            onSave: () => this._saveToLocalStorage()
        });

        this.persistence = new CircuitPersistence({
            componentManager: this.componentManager,
            wireGraph: this.wireGraph,
            probeManager: this.probeManager,
            textManager: this.textManager,
            viewport: this.viewport,
            getSimDirectives: () => document.getElementById('simulation-preview')?.value || '',
            setSimDirectives: (text) => {
                const ta = document.getElementById('simulation-preview');
                if (ta) ta.value = text;
            },
            onUpdateSimBadge: () => this.simulationController.updateSimulationBadge()
        });

        this.keyboardHandler = new KeyboardHandler(this);
        
        // Wire up UI elements
        this._setupUI();

        // Component placement
        this._setupPlacement();

        // Ghost preview
        this._setupGhostPreview();

        // Component editor modal
        this.componentEditorModal.setupComponentEditor();

        // Subcircuit entry modal
        this.subcircuitManager.setupSubcircuitModal();
        
        // Netlist modal
        this._setupNetlistModal();
        
        // Simulation modal
        this.simulationController.setupSimulationModal();

        // Compare analyses modal
        this.simulationController.setupCompareModal();

        // Ngspice runner
        this.simulationController.setupSimulationRunner();
        
        // Save/Load functionality
        this.persistence.setupSaveLoad(() => ({
            componentCounter: this._componentCounter,
            designatorCounters: this._designatorCounters
        }));

        // Library import/export
        this.libraryManager.setupLibraryImport();

        // Load component library
        this._loadComponentLibrary();
        
        // Keyboard handling
        this.keyboardHandler.setupKeyboard();
        
        // Load saved circuit from localStorage
        this.persistence.loadFromLocalStorage((counters) => {
            this._componentCounter = counters.componentCounter;
            this._designatorCounters = counters.designatorCounters;
        });
        
        // Setup auto-save
        this.persistence.setupAutoSave(() => ({
            componentCounter: this._componentCounter,
            designatorCounters: this._designatorCounters
        }));
        
        // Setup results panel resize
        this._setupResultsPanelResize();
        
        // Initial render
        this.viewport.render();
        
        console.log('Circuit Editor initialized');
    }

    // ==================== Modal State ====================

    _isModalOpen() {
        return this.componentEditorModal.isModalOpen
            || this.subcircuitManager.isModalOpen
            || this.simulationController.isModalOpen
            || this._netlistModalOpen;
    }

    // ==================== UI Setup ====================
    
    _setupUI() {
        this._netlistModalOpen = false;

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
        
        // New (clear) button
        const clearBtn = document.getElementById('clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', async () => {
                const answer = confirm('Save the current circuit before creating a new one?');
                if (answer) {
                    await this.persistence.saveToFile(this._componentCounter, this._designatorCounters);
                }
                this.wireEditor.clear();
                this.componentManager.components = [];
                this.componentManager.pinNodeIdsByComponent.clear();
                this.probeManager.clear();
                this.textManager.clear();
                this._componentCounter = 1;
                this._designatorCounters.clear();
                // Clear simulation directives
                const simTA = document.getElementById('simulation-preview');
                if (simTA) simTA.value = '';
                this.simulationController.updateSimulationBadge();
                // Clear simulation results
                this.resultsPlotter.clearPlot();
                this._saveToLocalStorage();
                this.viewport.render();
            });
        }
        
        // Tool buttons
        const toolButtons = document.querySelectorAll('.tool-btn');
        toolButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;
                this._setTool(tool);
                
                toolButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                this._updateProbeTypeSelector(tool);
            });
        });
        
        // Probe type selector buttons
        const probeTypeButtons = document.querySelectorAll('.probe-type-btn');
        probeTypeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const probeType = btn.dataset.probeType;
                this.probeManager.setProbeType(probeType);
                
                probeTypeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                this.viewport.render();
            });
        });
    }
    
    _updateProbeTypeSelector(tool) {
        const probeTypeSelector = document.getElementById('probe-type-selector');
        if (probeTypeSelector) {
            probeTypeSelector.style.display = tool === 'probe' ? 'inline-flex' : 'none';
        }
    }

    async _loadComponentLibrary() {
        await this.libraryManager.loadComponentLibrary();
        // Start with select tool active
        this.wireEditor.setActive(false);
        this.probeManager.setGhostPosition(null);
        this.canvas.style.cursor = 'default';
        this._updateToolButtons('select');
    }
    
    // ==================== Tool State ====================

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
        
        this._updateProbeTypeSelector(toolName);
    }

    _clearSelection() {
        this.selectionManager?.clearSelection();
        this.libraryManager.selectedComponentId = null;
        this.libraryManager.clearSelection();
        this.probeManager.selectedProbeId = null;
        this._ghostComponent = null;
        this._ghostDefinitionId = null;
        this._ghostDefinition = null;
    }
    
    _updateToolButtons(activeTool) {
        const toolButtons = document.querySelectorAll('.tool-btn');
        toolButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === activeTool);
        });
    }

    // ==================== Deletion ====================

    _deleteSelected() {
        let deleted = false;
        
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
        
        if (this.selectionManager.deleteSelected()) {
            deleted = true;
        }
        
        if (deleted) {
            this._saveToLocalStorage();
            this.viewport.render();
        }
    }
    
    _deleteItemAt(worldX, worldY) {
        let deleted = false;
        
        const probe = this.probeManager.getProbeAt(worldX, worldY);
        if (probe) {
            this.undoManager.recordAction(UNDO_TYPES.DELETE_PROBE, {
                probe: { ...probe }
            });
            this.probeManager.removeProbe(probe.id);
            deleted = true;
        }
        
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
        
        if (!deleted) {
            const component = this.componentManager.getComponentAt(worldX, worldY);
            if (component) {
                this.undoManager.recordAction(UNDO_TYPES.FULL_STATE, {
                    stateBefore: this._serialize(),
                    description: 'Delete component'
                });
                this.componentManager.removeComponent(component.id);
                const lastAction = this.undoManager.undoStack[this.undoManager.undoStack.length - 1];
                if (lastAction) {
                    lastAction.data.stateAfter = this._serialize();
                }
                deleted = true;
            }
        }
        
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

    // ==================== Component Placement & Ghost Preview ====================

    _setupPlacement() {
        const originalOnClick = this.viewport.onClick;
        this.viewport.onClick = (worldX, worldY, event) => {
            if (this.wireEditor.isActive) {
                originalOnClick?.(worldX, worldY, event);
                return;
            }

            if (this._isModalOpen()) {
                originalOnClick?.(worldX, worldY, event);
                return;
            }

            const snapped = this.viewport.snapToGrid(worldX, worldY);

            if (this._currentTool === 'delete') {
                this._deleteItemAt(snapped.x, snapped.y);
                originalOnClick?.(worldX, worldY, event);
                return;
            }

            if (this._currentTool === 'probe') {
                const existingProbe = this.probeManager.getProbeAt(snapped.x, snapped.y);
                if (existingProbe) {
                    this.probeManager.selectedProbeId = existingProbe.id;
                    this.viewport.render();
                } else {
                    this.probeManager.addProbe(snapped.x, snapped.y, null, this.probeManager.getGhostRotation());
                }
                originalOnClick?.(worldX, worldY, event);
                return;
            }

            if (this._currentTool === 'text') {
                originalOnClick?.(worldX, worldY, event);
                return;
            }

            if (!this.libraryManager.selectedComponentId) {
                originalOnClick?.(worldX, worldY, event);
                return;
            }

            const hit = this.componentManager.getComponentAt(snapped.x, snapped.y);
            if (!hit) {
                void this._placeSelectedComponent(snapped);
            }

            originalOnClick?.(worldX, worldY, event);
        };

        const originalOnMouseMove = this.viewport.onMouseMove;
        this.viewport.onMouseMove = (worldX, worldY, event) => {
            originalOnMouseMove?.(worldX, worldY, event);
            
            if (this._currentTool === 'probe') {
                const snapped = this.viewport.snapToGrid(worldX, worldY);
                this.probeManager.setGhostPosition(snapped);
            }
        };

        const originalOnMouseDown = this.viewport.onMouseDown;
        this.viewport.onMouseDown = (worldX, worldY, event) => {
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
        if (!this.libraryManager.selectedComponentId) return;
        if (!viewport.showCrosshair) return;
        if (this.componentManager.isDragging) return;

        const definition = this.libraryManager.componentLibrary[this.libraryManager.selectedComponentId];
        if (!definition) return;

        const mouse = viewport.getMouseWorld();
        const snapped = viewport.snapToGrid(mouse.x, mouse.y);
        const ghost = this._getGhostComponent(definition, snapped);
        if (!ghost) return;

        this.componentManager.renderGhostComponent(ctx, viewport, ghost);
    }

    _getGhostComponent(definition, position) {
        const definitionId = this.libraryManager.selectedComponentId;
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
        const definitionId = this.libraryManager.selectedComponentId;
        const baseDefinition = this.libraryManager.componentLibrary[definitionId];
        if (!baseDefinition) return;

        let resolvedDefinition = baseDefinition;
        let resolvedDefinitionId = definitionId;

        if (baseDefinition.dynamicSubcircuit) {
            const userInput = await this.subcircuitManager.promptSubcircuitDefinition();
            if (!userInput) return;
            const { name, pins, definitionText } = userInput;
            const uniqueness = this.subcircuitManager.ensureUniqueSubcircuitName(name, definitionText);
            const built = this.subcircuitManager.buildDynamicSubcircuitDefinition(
                { name: uniqueness.name, pins, definitionText: uniqueness.definitionText },
                this.viewport?.gridSize ?? 10
            );
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
		
        if (this._ghostComponent) {
            component.rotation = this._ghostComponent.rotation || 0;
        }

        if (resolvedDefinition.dynamicSubcircuit) {
            component.meta.dynamicSubcircuit = true;
            component.meta.allowRotation = resolvedDefinition.allowRotation ?? false;
            component.rotation = 0;
        }
		
        this.undoManager.recordAction(UNDO_TYPES.FULL_STATE, {
            stateBefore: this._serialize(),
            description: 'Add component'
        });
		
        this.componentManager.addComponent(component);
		
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
            this._netlistModalOpen = true;
        } catch (error) {
            console.error('Failed to generate netlist:', error);
            content.textContent = `Error generating netlist:\n${error.message}`;
            modal.classList.add('is-open');
            modal.setAttribute('aria-hidden', 'false');
            this._netlistModalOpen = true;
        }
    }
    
    _closeNetlistModal() {
        const modal = document.getElementById('netlist-modal');
        if (modal) {
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
        }
        this._netlistModalOpen = false;
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

    // ==================== Persistence Helpers ====================

    _serialize() {
        return this.persistence.serialize(this._componentCounter, this._designatorCounters);
    }

    _saveToLocalStorage() {
        this.persistence.saveToLocalStorage(this._componentCounter, this._designatorCounters);
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
            
            const deltaX = startX - e.clientX;
            const newWidth = Math.max(280, Math.min(800, startWidth + deltaX));
            resultsPanel.style.width = `${newWidth}px`;
            
            if (resizeTimeout) clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(resizePlots, 50);
        });
        
        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                resizeHandle.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                
                if (resizeTimeout) clearTimeout(resizeTimeout);
                resizePlots();
            }
        });
    }
    
    // ==================== Undo/Redo ====================
    
    _onGroupDragComplete(moveData) {
        // Placeholder for future undo recording of group moves
    }
    
    _undo() {
        const success = this.undoManager.undo((action) => {
            try {
                switch (action.type) {
                    case UNDO_TYPES.ADD_COMPONENT:
                        this.componentManager.removeComponent(action.data.component.id);
                        break;
                        
                    case UNDO_TYPES.DELETE_COMPONENT: {
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
                        const { segment } = action.data;
                        const nodeId1 = this.wireGraph.addNode(segment.node1.x, segment.node1.y);
                        const nodeId2 = this.wireGraph.addNode(segment.node2.x, segment.node2.y);
                        this.wireGraph.addSegment(nodeId1, nodeId2);
                        break;
                    }
                    
                    case UNDO_TYPES.DELETE_PROBE: {
                        const { probe } = action.data;
                        this.probeManager.restoreProbe(probe, { render: false });
                        break;
                    }
                    
                    case UNDO_TYPES.FULL_STATE: {
                        const counters = this.persistence.deserialize(action.data.stateBefore);
                        this._componentCounter = counters.componentCounter;
                        this._designatorCounters = counters.designatorCounters;
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
                        this.componentManager.removeComponent(action.data.component.id);
                        break;
                        
                    case UNDO_TYPES.DELETE_WIRE_SEGMENT: {
                        const { segment } = action.data;
                        this.wireGraph.removeSegment(segment.nodeId1, segment.nodeId2);
                        this.wireGraph.cleanup();
                        break;
                    }
                    
                    case UNDO_TYPES.DELETE_PROBE: {
                        this.probeManager.removeProbe(action.data.probe.id);
                        break;
                    }
                    
                    case UNDO_TYPES.FULL_STATE: {
                        const counters = this.persistence.deserialize(action.data.stateAfter);
                        this._componentCounter = counters.componentCounter;
                        this._designatorCounters = counters.designatorCounters;
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

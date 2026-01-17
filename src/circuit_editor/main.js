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
        
        // Wire up UI elements
        this._setupUI();
        
        // Keyboard handling
        this._setupKeyboard();
        
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
            const originalOnMouseMove = this.wireEditor._onMouseMove.bind(this.wireEditor);
            this.viewport.onMouseMove = (worldX, worldY, event) => {
                const snapped = this.viewport.snapToGrid(worldX, worldY);
                coordDisplay.textContent = `X: ${snapped.x} Y: ${snapped.y}`;
                originalOnMouseMove(worldX, worldY, event);
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
                this.wireEditor.clear();
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
    
    _setTool(toolName) {
        switch (toolName) {
            case 'wire':
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
            // Let wire editor handle first
            if (this.wireEditor.handleKeyDown(event)) {
                this.viewport.render();
                return;
            }
            
            // Global shortcuts
            switch (event.key.toLowerCase()) {
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
                        this.viewport.resetView();
                    }
                    break;
            }
        });
    }
    
    _updateToolButtons(activeTool) {
        const toolButtons = document.querySelectorAll('.tool-btn');
        toolButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === activeTool);
        });
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.circuitEditor = new CircuitEditorApp();
});

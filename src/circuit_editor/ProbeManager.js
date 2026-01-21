/**
 * ProbeManager - Manages voltage probe instances, rendering, and interaction
 * 
 * Probes are distinct from components - they attach to wire nodes to specify
 * which signals should be included in simulation output.
 */

export class ProbeManager {
    /**
     * @param {import('./CanvasViewport.js').CanvasViewport} viewport
     * @param {import('./WireGraph.js').WireGraph} wireGraph
     * @param {import('./ComponentManager.js').ComponentManager} [componentManager]
     */
    constructor(viewport, wireGraph, componentManager = null) {
        this.viewport = viewport;
        this.wireGraph = wireGraph;
        this.componentManager = componentManager;
        
        /** @type {Array<Probe>} */
        this.probes = [];
        
        // Counter for auto-generating labels
        this._probeCounter = 1;
        
        // Color palette for probes - cycles through these colors
        this.colorPalette = [
            { stroke: '#3b82f6', fill: '#dbeafe', label: '#1e40af' },  // Blue
            { stroke: '#ef4444', fill: '#fee2e2', label: '#991b1b' },  // Red
            { stroke: '#10b981', fill: '#d1fae5', label: '#065f46' },  // Emerald
            { stroke: '#f59e0b', fill: '#fef3c7', label: '#92400e' },  // Amber
            { stroke: '#8b5cf6', fill: '#ede9fe', label: '#5b21b6' },  // Violet
            { stroke: '#ec4899', fill: '#fce7f3', label: '#9d174d' },  // Pink
            { stroke: '#06b6d4', fill: '#cffafe', label: '#155e75' },  // Cyan
            { stroke: '#84cc16', fill: '#ecfccb', label: '#3f6212' },  // Lime
        ];
        this._colorIndex = 0;
        
        // Grayed out colors for ground probes
        this.groundProbeStyle = {
            stroke: '#9ca3af',  // Gray-400
            fill: '#f3f4f6',    // Gray-100
            label: '#6b7280'    // Gray-500
        };
        
        // Appearance defaults
        this.probeRadius = 6;
        this.tailLength = 12;
        this.hitTolerance = 8;
        
        // Ghost preview state
        this._ghostPosition = null;
        this._ghostRotation = 0;
        
        // Dragging state
        this.isDragging = false;
        this.dragProbe = null;
        this.dragStartWorld = null;
        this.dragStartPos = null;
        
        // Selected probe for editing
        this.selectedProbeId = null;
        
        this._setupRendering();
    }
    
    // ==================== Public API ====================
    
    /**
     * Add a probe at the given position
     * @param {number} x - World X coordinate
     * @param {number} y - World Y coordinate
     * @param {string} [label] - Optional label, auto-generated if not provided
     * @param {number} [rotation] - Rotation in degrees (0, 90, 180, 270)
     * @returns {Probe}
     */
    addProbe(x, y, label, rotation = 0) {
        const id = `probe-${Date.now()}-${this._probeCounter}`;
        const probeLabel = label || `Probe${this._probeCounter}`;
        
        // Assign color from palette (cycling)
        const colorSet = this.colorPalette[this._colorIndex % this.colorPalette.length];
        this._colorIndex++;
        this._probeCounter++;
        
        const probe = {
            id,
            x,
            y,
            label: probeLabel,
            rotation: rotation,
            nodeId: null, // Will be set when connected to a wire
            color: colorSet.stroke,
            fillColor: colorSet.fill,
            labelColor: colorSet.label
        };
        
        // Try to connect to nearest wire node
        this._connectProbeToNode(probe);
        
        this.probes.push(probe);
        this.viewport.render();
        return probe;
    }
    
    /**
     * Remove a probe by ID
     * @param {string} probeId
     */
    removeProbe(probeId) {
        const index = this.probes.findIndex(p => p.id === probeId);
        if (index !== -1) {
            this.probes.splice(index, 1);
            if (this.selectedProbeId === probeId) {
                this.selectedProbeId = null;
            }
            this.viewport.render();
        }
    }
    
    /**
     * Get probe at world position
     * @param {number} worldX
     * @param {number} worldY
     * @returns {Probe | null}
     */
    getProbeAt(worldX, worldY) {
        for (const probe of this.probes) {
            const tipPos = this._getProbeTipPosition(probe);
            const dx = tipPos.x - worldX;
            const dy = tipPos.y - worldY;
            if (Math.sqrt(dx * dx + dy * dy) <= this.hitTolerance) {
                return probe;
            }
        }
        return null;
    }
    
    /**
     * Update probe label
     * @param {string} probeId
     * @param {string} newLabel
     */
    updateProbeLabel(probeId, newLabel) {
        const probe = this.probes.find(p => p.id === probeId);
        if (probe) {
            probe.label = newLabel;
            this.viewport.render();
        }
    }
    
    /**
     * Rotate a probe 90 degrees clockwise
     * @param {string} probeId
     */
    rotateProbe(probeId) {
        const probe = this.probes.find(p => p.id === probeId);
        if (probe) {
            probe.rotation = (probe.rotation + 90) % 360;
            this.viewport.render();
        }
    }
    
    /**
     * Get all probes with their connected node information
     * @returns {Array<{id: string, label: string, nodeId: number | null, x: number, y: number}>}
     */
    getProbeData() {
        return this.probes.map(probe => ({
            id: probe.id,
            label: probe.label,
            nodeId: probe.nodeId,
            x: probe.x,
            y: probe.y,
            color: probe.color || '#3b82f6'
        }));
    }
    
    /**
     * Clear all probes
     */
    clear() {
        this.probes = [];
        this._probeCounter = 1;
        this.selectedProbeId = null;
        this.viewport.render();
    }
    
    /**
     * Refresh all probe connections to wires
     * Call this before generating netlist to ensure probes are connected
     */
    refreshConnections() {
        for (const probe of this.probes) {
            this._connectProbeToNode(probe);
        }
    }
    
    /**
     * Set ghost preview position for probe placement
     * @param {{x: number, y: number} | null} position
     */
    setGhostPosition(position) {
        this._ghostPosition = position;
        this.viewport.render();
    }
    
    /**
     * Rotate the ghost probe preview
     */
    rotateGhost() {
        this._ghostRotation = (this._ghostRotation + 90) % 360;
        this.viewport.render();
    }
    
    /**
     * Get the current ghost rotation
     * @returns {number}
     */
    getGhostRotation() {
        return this._ghostRotation;
    }
    
    /**
     * Serialize probes for save/load
     * @returns {Array}
     */
    toJSON() {
        return this.probes.map(p => ({
            id: p.id,
            x: p.x,
            y: p.y,
            label: p.label,
            rotation: p.rotation,
            nodeId: p.nodeId,
            color: p.color,
            fillColor: p.fillColor,
            labelColor: p.labelColor
        }));
    }
    
    /**
     * Restore probes from serialized data
     * @param {Array} data
     */
    fromJSON(data) {
        this.probes = [];
        if (!Array.isArray(data)) return;
        
        let maxCounter = 0;
        let maxColorIndex = 0;
        
        for (const item of data) {
            // If no color saved, assign one from palette
            let color = item.color;
            let fillColor = item.fillColor;
            let labelColor = item.labelColor;
            
            if (!color) {
                const colorSet = this.colorPalette[this._colorIndex % this.colorPalette.length];
                color = colorSet.stroke;
                fillColor = colorSet.fill;
                labelColor = colorSet.label;
                this._colorIndex++;
            } else {
                // Track which color index this corresponds to for future probes
                const colorIdx = this.colorPalette.findIndex(c => c.stroke === color);
                if (colorIdx >= 0) {
                    maxColorIndex = Math.max(maxColorIndex, colorIdx + 1);
                }
            }
            
            const probe = {
                id: item.id,
                x: item.x,
                y: item.y,
                label: item.label || 'Probe',
                rotation: item.rotation || 0,
                nodeId: item.nodeId || null,
                color,
                fillColor,
                labelColor
            };
            
            // Re-connect to wire node at current position
            this._connectProbeToNode(probe);
            
            this.probes.push(probe);
            
            // Track highest probe number for counter
            const match = probe.label.match(/^Probe(\d+)$/);
            if (match) {
                maxCounter = Math.max(maxCounter, parseInt(match[1], 10));
            }
        }
        
        this._probeCounter = maxCounter + 1;
        // Set color index to continue from where we left off
        if (maxColorIndex > 0) {
            this._colorIndex = maxColorIndex;
        }
    }
    
    // ==================== Event Handling ====================
    
    /**
     * Handle mouse down for probe dragging
     * @param {number} worldX
     * @param {number} worldY
     * @param {MouseEvent} event
     * @returns {boolean} Whether the event was handled
     */
    onMouseDown(worldX, worldY, event) {
        if (event.button !== 0) return false;
        
        const snapped = this.viewport.snapToGrid(worldX, worldY);
        const hit = this.getProbeAt(snapped.x, snapped.y);
        
        if (!hit) return false;
        
        this.isDragging = true;
        this.dragProbe = hit;
        this.dragStartWorld = { x: snapped.x, y: snapped.y };
        this.dragStartPos = { x: hit.x, y: hit.y };
        this.selectedProbeId = hit.id;
        
        return true;
    }
    
    /**
     * Handle mouse move for probe dragging
     * @param {number} worldX
     * @param {number} worldY
     * @param {MouseEvent} event
     * @returns {boolean}
     */
    onMouseMove(worldX, worldY, event) {
        if (!this.isDragging || !this.dragProbe) return false;
        
        const snapped = this.viewport.snapToGrid(worldX, worldY);
        const dx = snapped.x - this.dragStartWorld.x;
        const dy = snapped.y - this.dragStartWorld.y;
        
        this.dragProbe.x = this.dragStartPos.x + dx;
        this.dragProbe.y = this.dragStartPos.y + dy;
        
        // Re-connect to nearest wire node
        this._connectProbeToNode(this.dragProbe);
        
        this.viewport.render();
        return true;
    }
    
    /**
     * Handle mouse up for probe dragging
     * @param {number} worldX
     * @param {number} worldY
     * @param {MouseEvent} event
     * @returns {boolean}
     */
    onMouseUp(worldX, worldY, event) {
        if (!this.isDragging) return false;
        
        this.isDragging = false;
        this.dragProbe = null;
        this.dragStartWorld = null;
        this.dragStartPos = null;
        
        this.viewport.render();
        return true;
    }
    
    // ==================== Private Methods ====================
    
    /**
     * Connect probe to nearest wire node within tolerance
     * If not directly on a node, check if on a wire segment and use one of its nodes
     * @param {Probe} probe
     */
    _connectProbeToNode(probe) {
        const tipPos = this._getProbeTipPosition(probe);
        
        // First try to find a node directly at the tip position
        const node = this.wireGraph.getNodeAt(tipPos.x, tipPos.y, this.hitTolerance);
        if (node) {
            probe.nodeId = node.id;
            return;
        }
        
        // If no direct node, check if on a wire segment
        const segmentResult = this.wireGraph.getSegmentAt(tipPos.x, tipPos.y, this.hitTolerance);
        if (segmentResult) {
            // Use one of the segment's nodes (they're on the same net)
            probe.nodeId = segmentResult.segment.nodeId1;
            return;
        }
        
        probe.nodeId = null;
    }
    
    /**
     * Check if a probe is connected to the ground net
     * @param {Probe} probe
     * @returns {boolean}
     */
    _isProbeOnGround(probe) {
        if (probe.nodeId === null || !this.componentManager) return false;
        
        // Get all nodes connected to this probe's node
        const connectedNodes = this._getConnectedNodeIds(probe.nodeId);
        
        // Check if any connected node belongs to a ground component
        for (const nodeId of connectedNodes) {
            for (const component of this.componentManager.components) {
                if (component.meta?.isGround) {
                    const pinMap = this.componentManager.pinNodeIdsByComponent.get(component.id);
                    if (pinMap) {
                        for (const pinNodeId of pinMap.values()) {
                            if (connectedNodes.has(pinNodeId)) {
                                return true;
                            }
                        }
                    }
                }
            }
        }
        
        return false;
    }
    
    /**
     * Get all node IDs connected to a starting node via wire segments
     * @param {number} startNodeId
     * @returns {Set<number>}
     */
    _getConnectedNodeIds(startNodeId) {
        const connected = new Set();
        const queue = [startNodeId];
        
        while (queue.length > 0) {
            const nodeId = queue.shift();
            if (connected.has(nodeId)) continue;
            
            connected.add(nodeId);
            
            const segments = this.wireGraph.getSegmentsForNode(nodeId);
            for (const segment of segments) {
                const otherId = segment.nodeId1 === nodeId ? segment.nodeId2 : segment.nodeId1;
                if (!connected.has(otherId)) {
                    queue.push(otherId);
                }
            }
        }
        
        return connected;
    }
    
    /**
     * Get the tip position of a probe (where it connects to wire)
     * @param {Probe} probe
     * @returns {{x: number, y: number}}
     */
    _getProbeTipPosition(probe) {
        // The probe tip is at probe.x, probe.y
        // The body extends in the direction based on rotation
        return { x: probe.x, y: probe.y };
    }
    
    /**
     * Get the body center position based on rotation
     * @param {Probe} probe
     * @returns {{x: number, y: number}}
     */
    _getProbeBodyCenter(probe) {
        const rotation = probe.rotation || 0;
        const offset = this.probeRadius + this.tailLength;
        
        switch (rotation) {
            case 0: // Tail points up
                return { x: probe.x, y: probe.y - offset };
            case 90: // Tail points right
                return { x: probe.x + offset, y: probe.y };
            case 180: // Tail points down
                return { x: probe.x, y: probe.y + offset };
            case 270: // Tail points left
                return { x: probe.x - offset, y: probe.y };
            default:
                return { x: probe.x, y: probe.y - offset };
        }
    }
    
    // ==================== Rendering ====================
    
    _setupRendering() {
        const originalOnRender = this.viewport.onRender;
        this.viewport.onRender = (ctx, viewport) => {
            originalOnRender?.(ctx, viewport);
            this._renderProbes(ctx, viewport);
            this._renderGhostProbe(ctx, viewport);
        };
    }
    
    _renderProbes(ctx, viewport) {
        for (const probe of this.probes) {
            const isSelected = probe.id === this.selectedProbeId;
            this._renderProbe(ctx, viewport, probe, isSelected);
        }
    }
    
    _renderProbe(ctx, viewport, probe, isSelected = false) {
        const tipPos = this._getProbeTipPosition(probe);
        const bodyCenter = this._getProbeBodyCenter(probe);
        const rotation = probe.rotation || 0;
        
        // Check if probe is on ground net
        const isOnGround = this._isProbeOnGround(probe);
        
        // Use grayed colors for ground probes, otherwise use probe's assigned color
        let strokeColor, fillColor, labelColor;
        if (isOnGround) {
            strokeColor = this.groundProbeStyle.stroke;
            fillColor = this.groundProbeStyle.fill;
            labelColor = this.groundProbeStyle.label;
        } else {
            strokeColor = probe.color || '#3b82f6';
            fillColor = probe.fillColor || '#dbeafe';
            labelColor = probe.labelColor || '#1e40af';
        }
        
        const hoverStroke = this._darkenColor(strokeColor);
        const hoverFill = '#fecdd3';
        
        ctx.save();
        
        // Convert world coordinates to screen coordinates
        const tipScreen = viewport.worldToScreen(tipPos.x, tipPos.y);
        const bodyScreen = viewport.worldToScreen(bodyCenter.x, bodyCenter.y);
        
        // Draw connecting line (tail)
        ctx.strokeStyle = isSelected ? hoverStroke : strokeColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tipScreen.x, tipScreen.y);
        ctx.lineTo(bodyScreen.x, bodyScreen.y);
        ctx.stroke();
        
        // Draw probe circle (body)
        const radius = this.probeRadius * viewport.zoom;
        ctx.beginPath();
        ctx.arc(bodyScreen.x, bodyScreen.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? hoverFill : fillColor;
        ctx.fill();
        ctx.strokeStyle = isSelected ? hoverStroke : strokeColor;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Draw tip dot
        ctx.beginPath();
        ctx.arc(tipScreen.x, tipScreen.y, 3 * viewport.zoom, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? hoverStroke : strokeColor;
        ctx.fill();
        
        // Draw label (use the labelColor determined earlier based on ground status)
        ctx.fillStyle = labelColor;
        ctx.font = `bold ${10 * viewport.zoom}px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Position label based on rotation
        let labelX = bodyScreen.x;
        let labelY = bodyScreen.y;
        const labelOffset = (this.probeRadius + 10) * viewport.zoom;
        
        switch (rotation) {
            case 0: // Label above
                labelY = bodyScreen.y - labelOffset;
                break;
            case 90: // Label to right
                labelX = bodyScreen.x + labelOffset;
                ctx.textAlign = 'left';
                break;
            case 180: // Label below
                labelY = bodyScreen.y + labelOffset;
                break;
            case 270: // Label to left
                labelX = bodyScreen.x - labelOffset;
                ctx.textAlign = 'right';
                break;
        }
        
        // Add "(GND)" suffix for ground probes to indicate they'll be ignored
        const displayLabel = isOnGround ? `${probe.label} (GND)` : probe.label;
        ctx.fillText(displayLabel, labelX, labelY);
        
        // Draw connection indicator if connected to a node
        if (probe.nodeId !== null) {
            ctx.beginPath();
            ctx.arc(tipScreen.x, tipScreen.y, 5 * viewport.zoom, 0, Math.PI * 2);
            // Use orange for ground connection, green for normal
            ctx.strokeStyle = isOnGround ? '#f59e0b' : '#10b981';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    _renderGhostProbe(ctx, viewport) {
        if (!this._ghostPosition) return;
        
        // Use the next color from palette for ghost preview
        const colorSet = this.colorPalette[this._colorIndex % this.colorPalette.length];
        
        const ghostProbe = {
            x: this._ghostPosition.x,
            y: this._ghostPosition.y,
            label: `Probe${this._probeCounter}`,
            rotation: this._ghostRotation,
            nodeId: null,
            color: colorSet.stroke,
            fillColor: colorSet.fill,
            labelColor: colorSet.label
        };
        
        // Check if ghost would connect to a node
        const tipPos = this._getProbeTipPosition(ghostProbe);
        const node = this.wireGraph.getNodeAt(tipPos.x, tipPos.y, this.hitTolerance);
        if (!node) {
            // Also check wire segments
            const segmentResult = this.wireGraph.getSegmentAt(tipPos.x, tipPos.y, this.hitTolerance);
            ghostProbe.nodeId = segmentResult ? segmentResult.segment.nodeId1 : null;
        } else {
            ghostProbe.nodeId = node.id;
        }
        
        ctx.save();
        ctx.globalAlpha = 0.5;
        this._renderProbe(ctx, viewport, ghostProbe, false);
        ctx.restore();
    }
    
    /**
     * Darken a hex color for hover/selected states
     * @param {string} hex
     * @returns {string}
     */
    _darkenColor(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const factor = 0.7;
        return `#${Math.round(r * factor).toString(16).padStart(2, '0')}${Math.round(g * factor).toString(16).padStart(2, '0')}${Math.round(b * factor).toString(16).padStart(2, '0')}`;
    }
}

/**
 * @typedef {Object} Probe
 * @property {string} id - Unique identifier
 * @property {number} x - World X coordinate (tip position)
 * @property {number} y - World Y coordinate (tip position)  
 * @property {string} label - User-defined label
 * @property {number} rotation - Rotation in degrees (0, 90, 180, 270)
 * @property {number | null} nodeId - Connected wire node ID, or null if not connected
 * @property {string} color - Stroke color for the probe
 * @property {string} fillColor - Fill color for the probe body
 * @property {string} labelColor - Color for the label text
 */

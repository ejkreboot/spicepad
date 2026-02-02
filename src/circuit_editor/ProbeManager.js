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
            { stroke: '#2563eb', fill: '#60a5fa', label: '#1e3a8a' },  // Blue - vibrant and visible
            { stroke: '#dc2626', fill: '#f87171', label: '#7f1d1d' },  // Red - bold and clear
            { stroke: '#059669', fill: '#34d399', label: '#064e3b' },  // Emerald - bright green
            { stroke: '#d97706', fill: '#fbbf24', label: '#78350f' },  // Amber - golden yellow
            { stroke: '#7c3aed', fill: '#a78bfa', label: '#4c1d95' },  // Violet - rich purple
            { stroke: '#db2777', fill: '#f472b6', label: '#831843' },  // Pink - hot pink
            { stroke: '#0891b2', fill: '#22d3ee', label: '#164e63' },  // Cyan - bright aqua
            { stroke: '#65a30d', fill: '#a3e635', label: '#365314' },  // Lime - vivid lime
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
        this._probeType = 'voltage';
        this.probeIconScale = 0.6; // Scale factor from SVG units to screen
        
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
            connectedSegmentId: null, // Track which segment we snapped to for current probes
            color: colorSet.stroke,
            fillColor: colorSet.fill,
            labelColor: colorSet.label,
            type: this._probeType
        };
        
        // Try to connect to nearest wire node
        this._connectProbeToNode(probe);
        
        this.probes.push(probe);
        this.viewport.render();
        return probe;
    }

    getProbeType() {
        return this._probeType;
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
            // Check if click is within the entire probe body
            // The probe icon is approximately 24x48 units in SVG space, scaled by probeIconScale
            const tipPos = this._getProbeTipPosition(probe);
            const rotation = probe.rotation || 0;
            const scale = this.probeIconScale;
            
            // Probe dimensions in world space (approximate bounding box)
            const width = 24 * scale;  // SVG width is 24
            const height = 46 * scale; // SVG height from tip to top is 46
            
            // Calculate the probe's bounding box center and dimensions based on rotation
            let centerX, centerY, halfWidth, halfHeight;
            
            switch (rotation) {
                case 0: // Tip points down, body extends up
                    centerX = tipPos.x;
                    centerY = tipPos.y - height / 2;
                    halfWidth = width / 2;
                    halfHeight = height / 2;
                    break;
                case 90: // Tip points left, body extends right
                    centerX = tipPos.x + height / 2;
                    centerY = tipPos.y;
                    halfWidth = height / 2;
                    halfHeight = width / 2;
                    break;
                case 180: // Tip points up, body extends down
                    centerX = tipPos.x;
                    centerY = tipPos.y + height / 2;
                    halfWidth = width / 2;
                    halfHeight = height / 2;
                    break;
                case 270: // Tip points right, body extends left
                    centerX = tipPos.x - height / 2;
                    centerY = tipPos.y;
                    halfWidth = height / 2;
                    halfHeight = width / 2;
                    break;
                default:
                    centerX = tipPos.x;
                    centerY = tipPos.y - height / 2;
                    halfWidth = width / 2;
                    halfHeight = height / 2;
            }
            
            // Check if point is within the bounding box
            const dx = Math.abs(worldX - centerX);
            const dy = Math.abs(worldY - centerY);
            
            if (dx <= halfWidth && dy <= halfHeight) {
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
            segmentId: probe.connectedSegmentId || null,
            x: probe.x,
            y: probe.y,
            rotation: probe.rotation || 0,
            color: probe.color || '#3b82f6',
            type: probe.type || 'voltage'
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
            labelColor: p.labelColor,
            type: p.type || 'voltage'
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
                labelColor,
                type: item.type || 'voltage'
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

    setProbeType(type) {
        this._probeType = type === 'current' ? 'current' : 'voltage';
        this.viewport.render();
    }

    updateProbeType(probeId, type) {
        const probe = this.probes.find(p => p.id === probeId);
        if (!probe) return;
        probe.type = type === 'current' ? 'current' : 'voltage';
        this.viewport.render();
    }

    updateProbeColor(probeId, color) {
        const probe = this.probes.find(p => p.id === probeId);
        if (!probe || !color) return;
        probe.color = color;
        probe.fillColor = this._tintColor(color, 0.82);
        probe.labelColor = this._darkenColor(color, 0.55);
        this.viewport.render();
    }

    isProbeLabelUnique(label, excludeId = null) {
        const target = label.trim().toLowerCase();
        return !this.probes.some(p => p.id !== excludeId && (p.label || '').trim().toLowerCase() === target);
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
            probe.connectedSegmentId = null;
            return;
        }
        
        // If no direct node, check if on a wire segment
        const segmentResult = this.wireGraph.getSegmentAt(tipPos.x, tipPos.y, this.hitTolerance);
        if (segmentResult) {
            // Use one of the segment's nodes (they're on the same net)
            probe.nodeId = segmentResult.segment.nodeId1;
            probe.connectedSegmentId = segmentResult.segment.id;
            return;
        }
        
        probe.nodeId = null;
        probe.connectedSegmentId = null;
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
        const rotation = probe.rotation || 0;
        const isOnGround = this._isProbeOnGround(probe);
        const type = probe.type || 'voltage';

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

        const tipScreen = viewport.worldToScreen(tipPos.x, tipPos.y);
        const scale = this.probeIconScale * viewport.zoom;
        const stroke = isSelected ? hoverStroke : strokeColor;
        const fill = isSelected ? hoverFill : fillColor;

        ctx.translate(tipScreen.x, tipScreen.y);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale(scale, scale);
        ctx.translate(-12, -46); // Align SVG coordinate system so tip lands at origin

        this._drawProbeIcon(ctx, type, stroke, fill);

        ctx.restore();

        // Labels are drawn in screen space for consistency with previous behavior
        ctx.save();
        ctx.fillStyle = labelColor;
        ctx.font = `bold ${10 * viewport.zoom}px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let labelX = tipScreen.x;
        let labelY = tipScreen.y;
        const labelOffset = 34 * viewport.zoom;

        switch (rotation) {
            case 0:
                labelY = tipScreen.y - labelOffset;
                break;
            case 90:
                labelX = tipScreen.x + labelOffset;
                ctx.textAlign = 'left';
                break;
            case 180:
                labelY = tipScreen.y + labelOffset;
                break;
            case 270:
                labelX = tipScreen.x - labelOffset;
                ctx.textAlign = 'right';
                break;
        }

        const displayLabel = isOnGround ? `${probe.label} (GND)` : probe.label;
        ctx.fillText(displayLabel, labelX, labelY);

        // Connection indicator ring around the contact point
        if (probe.nodeId !== null) {
            ctx.beginPath();
            ctx.arc(tipScreen.x, tipScreen.y, 6 * viewport.zoom, 0, Math.PI * 2);
            ctx.strokeStyle = isOnGround ? '#f59e0b' : '#3b82f6';
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
            labelColor: colorSet.label,
            type: this._probeType
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
    _darkenColor(hex, factor = 0.7) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `#${Math.round(r * factor).toString(16).padStart(2, '0')}${Math.round(g * factor).toString(16).padStart(2, '0')}${Math.round(b * factor).toString(16).padStart(2, '0')}`;
    }

    _tintColor(hex, factor = 0.85) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const mix = (v) => Math.min(255, Math.round(v + (255 - v) * (1 - factor)));
        return `#${mix(r).toString(16).padStart(2, '0')}${mix(g).toString(16).padStart(2, '0')}${mix(b).toString(16).padStart(2, '0')}`;
    }

    _roundedRectPath(x, y, w, h, r) {
        const p = new Path2D();
        const rr = Math.min(r, w / 2, h / 2);
        p.moveTo(x + rr, y);
        p.lineTo(x + w - rr, y);
        p.quadraticCurveTo(x + w, y, x + w, y + rr);
        p.lineTo(x + w, y + h - rr);
        p.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        p.lineTo(x + rr, y + h);
        p.quadraticCurveTo(x, y + h, x, y + h - rr);
        p.lineTo(x, y + rr);
        p.quadraticCurveTo(x, y, x + rr, y);
        p.closePath();
        return p;
    }

    _drawProbeIcon(ctx, type, stroke, fill) {
        if (type === 'current') {
            this._drawCurrentProbeIcon(ctx, stroke, fill);
        } else {
            this._drawVoltageProbeIcon(ctx, stroke, fill);
        }
    }

    _drawVoltageProbeIcon(ctx, stroke, fill) {
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // Upper handle outline
        const handle = new Path2D('M7 6 L7 12.25 L17 12.25 L17 6 Q17 0 12 0 Q7 0 7 6 Z');
        ctx.strokeStyle = stroke;
        ctx.stroke(handle);

        // Lever (rounded rect)
        const lever = this._roundedRectPath(2.5, 7.75, 19, 4.5, 2.25);
        ctx.fillStyle = stroke;
        ctx.fill(lever);

        // Short barrel below lever
        ctx.beginPath();
        ctx.moveTo(7, 12.25);
        ctx.lineTo(7, 18);
        ctx.moveTo(17, 12.25);
        ctx.lineTo(17, 18);
        ctx.stroke();

        // Convex taper narrowing to shaft
        ctx.beginPath();
        ctx.moveTo(7, 18);
        ctx.bezierCurveTo(7, 21, 10, 23, 10, 24);
        ctx.moveTo(17, 18);
        ctx.bezierCurveTo(17, 21, 14, 23, 14, 24);
        ctx.stroke();

        // Straight shaft down
        ctx.beginPath();
        ctx.moveTo(10, 24);
        ctx.lineTo(10, 39.5);
        ctx.moveTo(14, 24);
        ctx.lineTo(14, 39.5);
        ctx.stroke();

        // Shaft edges angle in to meet pin
        ctx.beginPath();
        ctx.moveTo(10, 39.5);
        ctx.lineTo(12, 41);
        ctx.moveTo(14, 39.5);
        ctx.lineTo(12, 41);
        ctx.stroke();

        // Short pin to dot
        ctx.beginPath();
        ctx.moveTo(12, 41);
        ctx.lineTo(12, 44);
        ctx.stroke();

        // Contact dot
        ctx.beginPath();
        ctx.arc(12, 46, 2, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
    }

    _drawCurrentProbeIcon(ctx, stroke, fill) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Upper handle (filled)
        const handle = new Path2D('M7 6 L7 12.25 L17 12.25 L17 6 Q17 0 12 0 Q7 0 7 6 Z');
        ctx.fillStyle = fill;
        ctx.fill(handle);

        // Lever
        const lever = this._roundedRectPath(2.5, 7.75, 19, 4.5, 2.25);
        ctx.fill(lever);

        // Lower body: barrel + taper + shaft + angle-in (filled)
        const body = new Path2D('M7 12.25 L7 18 C7 21 10 23 10 24 L10 39.5 L12 41 L14 39.5 L14 24 C14 23 17 21 17 18 L17 12.25 Z');
        ctx.fill(body);

        // Pin
        ctx.beginPath();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.2;
        ctx.moveTo(12, 41);
        ctx.lineTo(12, 43.5);
        ctx.stroke();

        // Contact circle
        ctx.beginPath();
        ctx.arc(12, 46.25, 2.75, 0, Math.PI * 2);
        ctx.stroke();
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
 * @property {string} type - Probe type ('voltage' | 'current')
 */

/**
 * WireEditor - Interaction layer for wire editing in a circuit schematic
 * 
 * Manages interaction state (idle, drawing, dragging) and calls WireGraph methods.
 * Handles mouse/keyboard events and renders wire preview during editing.
 * 
 * Behaviors match KiCad/EasyEDA conventions:
 * - Click to start/continue wire
 * - L-shaped orthogonal routing with horizontal-first or vertical-first based on cursor
 * - Double-click or Escape to finish wire
 * - Click on existing node to connect
 * - Click on existing segment to split and connect
 * - Drag nodes or segments to move them
 */

export class WireEditor {
    /**
     * @param {import('./CanvasViewport.js').CanvasViewport} viewport 
     * @param {import('./WireGraph.js').WireGraph} wireGraph 
     */
    constructor(viewport, wireGraph) {
        this.viewport = viewport;
        this.wireGraph = wireGraph;
        
        // Configuration
        this.gridSize = viewport.gridSize || 10;
        this.nodeHitTolerance = 8;
        this.segmentHitTolerance = 5;
        
        // Colors
        this.wireColor = '#000000';
        this.wireHighlightColor = '#f97316'; // Orange
        this.previewColor = 'rgba(0, 0, 0, 0.5)';
        this.nodeColor = '#000000';
        this.junctionColor = '#000000';
        this.junctionRadius = 4;
        
        // Interaction state
        this.mode = 'idle'; // 'idle' | 'drawing' | 'dragging'
        this.isActive = true; // Whether wire tool is selected
        
        // Drawing state
        this.drawingStartNode = null; // Node ID where current wire started
        this.lastPlacedNode = null;   // Last node placed during drawing
        this.previewPath = null;      // Current preview path { start: {x,y}, bend: {x,y}, end: {x,y} }
        
        // Dragging state
        this.dragTarget = null;       // { type: 'node' | 'segment', id: number | string }
        this.dragStartWorld = null;   // { x, y } - world position where drag started
        this.dragStartPositions = null; // Original positions of nodes being dragged
        this.dragMovedNodeIds = null; // Set of node IDs that are allowed to move during drag
        this.dragBendNodes = null;    // Map of "nodeId1-nodeId2" -> bendNodeId for temporary bends
        this.dragOriginalSegments = null; // Original segments before drag started
        
        // Hover state for highlighting
        this.hoveredNode = null;
        this.hoveredSegment = null;
        
        // Mouse state for detecting drags vs clicks
        this.mouseDownPos = null;
        this.mouseDownTime = null;
        this.isDragging = false;
        this.dragThreshold = 3; // pixels
        
        // Callbacks
        this.onStatusChange = null;
        
        // Set up rendering callback
        this.viewport.onRender = (ctx, vp) => this._render(ctx, vp);
        
        // Set up event handlers
        this._setupEventHandlers();
        
        this._setStatus('Ready - Click to start drawing wire');
    }
    
    // ==================== Event Setup ====================
    
    _setupEventHandlers() {
        // Store original handlers to chain them
        const originalOnMouseDown = this.viewport.onMouseDown;
        const originalOnMouseMove = this.viewport.onMouseMove;
        const originalOnMouseUp = this.viewport.onMouseUp;
        const originalOnClick = this.viewport.onClick;
        
        this.viewport.onMouseDown = (worldX, worldY, event) => {
            if (this.isActive) {
                this._onMouseDown(worldX, worldY, event);
            }
            originalOnMouseDown?.(worldX, worldY, event);
        };
        
        this.viewport.onMouseMove = (worldX, worldY, event) => {
            if (this.isActive) {
                this._onMouseMove(worldX, worldY, event);
            }
            originalOnMouseMove?.(worldX, worldY, event);
        };
        
        this.viewport.onMouseUp = (worldX, worldY, event) => {
            if (this.isActive) {
                this._onMouseUp(worldX, worldY, event);
            }
            originalOnMouseUp?.(worldX, worldY, event);
        };
        
        this.viewport.onClick = (worldX, worldY, event) => {
            // We handle clicks in mouseUp to properly detect drag vs click
            originalOnClick?.(worldX, worldY, event);
        };
    }
    
    // ==================== Event Handlers ====================
    
    _onMouseDown(worldX, worldY, event) {
        if (event?.__componentHandled) return;
        if (event.button !== 0) return; // Only left click
        if (event.shiftKey) return; // Shift+click is for panning
        
        const snapped = this.viewport.snapToGrid(worldX, worldY);
        
        this.mouseDownPos = { x: worldX, y: worldY };
        this.mouseDownTime = Date.now();
        this.isDragging = false;
        
        if (this.mode === 'idle') {
            // Check if we're clicking on an existing node or segment to drag
            const hitNode = this.wireGraph.getNodeAt(snapped.x, snapped.y, this.nodeHitTolerance);
            const hitSegment = this.wireGraph.getSegmentAt(snapped.x, snapped.y, this.segmentHitTolerance);
            
            if (hitNode) {
                if (!hitNode.isComponentPin) {
                    // Prepare for potential node drag
                    this.dragTarget = { type: 'node', id: hitNode.id };
                    this.dragStartWorld = { ...snapped };
                    this.dragStartPositions = new Map();
                    this.dragStartPositions.set(hitNode.id, { x: hitNode.x, y: hitNode.y });
                    this.dragMovedNodeIds = new Set([hitNode.id]);
                    this.dragBendNodes = new Map();
                    this.dragOriginalSegments = this._captureSegmentsForNode(hitNode.id);
                }
            } else if (hitSegment) {
                // Prepare for potential segment drag
                this.dragTarget = { type: 'segment', id: hitSegment.segment.id };
                this.dragStartWorld = { ...snapped };
                this.dragStartPositions = new Map();
                this.dragMovedNodeIds = new Set();
                this.dragBendNodes = new Map();
                
                const seg = hitSegment.segment;
                const node1 = this.wireGraph.getNode(seg.nodeId1);
                const node2 = this.wireGraph.getNode(seg.nodeId2);
                if (node1) this.dragStartPositions.set(node1.id, { x: node1.x, y: node1.y });
                if (node2) this.dragStartPositions.set(node2.id, { x: node2.x, y: node2.y });
                if (node1 && !node1.isComponentPin) this.dragMovedNodeIds.add(node1.id);
                if (node2 && !node2.isComponentPin) this.dragMovedNodeIds.add(node2.id);
                this.dragOriginalSegments = this._captureSegmentsForNodes([seg.nodeId1, seg.nodeId2]);
            }
        }
    }
    
    _onMouseMove(worldX, worldY, event) {
        if (event?.__componentHandled) return;
        const snapped = this.viewport.snapToGrid(worldX, worldY);
        
        // Check for drag threshold
        if (this.mouseDownPos && !this.isDragging && this.mode !== 'drawing') {
            const dx = worldX - this.mouseDownPos.x;
            const dy = worldY - this.mouseDownPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist > this.dragThreshold / this.viewport.zoom) {
                this.isDragging = true;
                
                // Start dragging if we have a target
                if (this.dragTarget) {
                    this.mode = 'dragging';
                    this._setStatus(`Dragging ${this.dragTarget.type}...`);
                }
            }
        }
        
        // Handle based on mode
        if (this.mode === 'dragging') {
            this._handleDrag(snapped.x, snapped.y);
        } else if (this.mode === 'drawing') {
            this._updateDrawingPreview(snapped.x, snapped.y);
        } else {
            // Idle mode - update hover states
            this._updateHoverState(snapped.x, snapped.y);
        }
    }
    
    _onMouseUp(worldX, worldY, event) {
        if (event?.__componentHandled) return;
        if (event.button !== 0) return;
        
        const snapped = this.viewport.snapToGrid(worldX, worldY);
        const wasDrawing = this.mode === 'drawing';
        const wasDragging = this.mode === 'dragging';
        const clickedWithoutDrag = !this.isDragging && this.mouseDownPos;
        
        // Handle double-click detection
        const isDoubleClick = event.detail === 2;
        
        if (wasDragging) {
            // Finish drag
            this._finishDrag();
        } else if (wasDrawing && clickedWithoutDrag) {
            // Continue or finish wire drawing
            if (isDoubleClick) {
                this._finishDrawing();
            } else {
                this._handleDrawingClick(snapped.x, snapped.y);
            }
        } else if (this.mode === 'idle' && clickedWithoutDrag) {
            // Start drawing or select
            if (isDoubleClick) {
                // Double-click on empty space does nothing
            } else {
                this._handleIdleClick(snapped.x, snapped.y);
            }
        }
        
        // Reset mouse state
        this.mouseDownPos = null;
        this.mouseDownTime = null;
        this.isDragging = false;
        this.dragTarget = null;
        this.dragStartWorld = null;
        this.dragStartPositions = null;
        this.dragMovedNodeIds = null;
        this.dragBendNodes = null;
        this.dragOriginalSegments = null;
    }
    
    handleKeyDown(event) {
        if (event.key === 'Escape') {
            if (this.mode === 'drawing') {
                this._finishDrawing();
                return true;
            } else if (this.mode === 'dragging') {
                this._cancelDrag();
                return true;
            }
        }
        return false;
    }
    
    // ==================== Drawing Mode ====================
    
    _handleIdleClick(x, y) {
        // Check if clicking on existing node
        const hitNode = this.wireGraph.getNodeAt(x, y, this.nodeHitTolerance);
        
        if (hitNode) {
            // Start drawing from existing node
            this._startDrawingFromNode(hitNode.id);
        } else {
            // Check if clicking on existing segment
            const hitSegment = this.wireGraph.getSegmentAt(x, y, this.segmentHitTolerance);
            
            if (hitSegment) {
                // Split segment and start drawing from new node
                const newNodeId = this.wireGraph.splitSegment(hitSegment.segment.id, x, y);
                if (newNodeId) {
                    this._startDrawingFromNode(newNodeId);
                }
            } else {
                // Start new wire at this point
                this._startDrawingNew(x, y);
            }
        }
    }
    
    _startDrawingNew(x, y) {
        const nodeId = this.wireGraph.addNode(x, y);
        this.drawingStartNode = nodeId;
        this.lastPlacedNode = nodeId;
        this.mode = 'drawing';
        this._setStatus('Drawing wire - Click to add points, double-click or Escape to finish');
    }
    
    _startDrawingFromNode(nodeId) {
        this.drawingStartNode = nodeId;
        this.lastPlacedNode = nodeId;
        this.mode = 'drawing';
        this._setStatus('Drawing wire - Click to add points, double-click or Escape to finish');
    }
    
    _handleDrawingClick(x, y) {
        const lastNode = this.wireGraph.getNode(this.lastPlacedNode);
        if (!lastNode) {
            this._finishDrawing();
            return;
        }
        
        // Check if clicking on existing node
        const hitNode = this.wireGraph.getNodeAt(x, y, this.nodeHitTolerance);
        
        if (hitNode && hitNode.id !== this.lastPlacedNode) {
            // Connect to existing node and finish
            this._placeWireToPoint(hitNode.x, hitNode.y, hitNode.id);
            this._finishDrawing();
            return;
        }
        
        // Check if clicking on existing segment
        const hitSegment = this.wireGraph.getSegmentAt(x, y, this.segmentHitTolerance);
        
        if (hitSegment) {
            // Split segment and connect to new node
            const newNodeId = this.wireGraph.splitSegment(hitSegment.segment.id, x, y);
            if (newNodeId && newNodeId !== this.lastPlacedNode) {
                const newNode = this.wireGraph.getNode(newNodeId);
                this._placeWireToPoint(newNode.x, newNode.y, newNodeId);
                this._finishDrawing();
                return;
            }
        }
        
        // Place wire to this point (with L-shaped routing)
        this._placeWireToPoint(x, y);
    }
    
    _placeWireToPoint(x, y, existingNodeId = null) {
        const lastNode = this.wireGraph.getNode(this.lastPlacedNode);
        if (!lastNode) return;
        
        // Calculate L-shaped path
        const path = this._calculateLPath(lastNode.x, lastNode.y, x, y);
        
        // Create nodes and segments for the path
        let currentNodeId = this.lastPlacedNode;
        
        // If there's a bend point
        if (path.bend) {
            const bendNodeId = this.wireGraph.addNode(path.bend.x, path.bend.y);
            if (bendNodeId !== currentNodeId) {
                this.wireGraph.addSegment(currentNodeId, bendNodeId);
                currentNodeId = bendNodeId;
            }
        }
        
        // Create the final node and segment
        const finalNodeId = existingNodeId ?? this.wireGraph.addNode(x, y);
        if (finalNodeId !== currentNodeId) {
            this.wireGraph.addSegment(currentNodeId, finalNodeId);
        }
        
        this.lastPlacedNode = finalNodeId;
        
        // Clean up the graph
        this.wireGraph.cleanup();
    }
    
    _calculateLPath(x1, y1, x2, y2) {
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        
        // If already aligned, no bend needed
        if (dx < 0.001 || dy < 0.001) {
            return { start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, bend: null };
        }
        
        // Choose horizontal-first or vertical-first based on which direction is longer
        // This mimics KiCad behavior where the longer leg comes first
        let bendX, bendY;
        
        if (dx >= dy) {
            // Horizontal first
            bendX = x2;
            bendY = y1;
        } else {
            // Vertical first
            bendX = x1;
            bendY = y2;
        }
        
        return {
            start: { x: x1, y: y1 },
            bend: { x: bendX, y: bendY },
            end: { x: x2, y: y2 }
        };
    }
    
    _updateDrawingPreview(x, y) {
        const lastNode = this.wireGraph.getNode(this.lastPlacedNode);
        if (!lastNode) {
            this.previewPath = null;
            return;
        }
        
        this.previewPath = this._calculateLPath(lastNode.x, lastNode.y, x, y);
    }
    
    _finishDrawing() {
        // Clean up single-node wires (no segments)
        if (this.drawingStartNode) {
            const startNode = this.wireGraph.getNode(this.drawingStartNode);
            if (startNode && this.wireGraph.getConnectionCount(this.drawingStartNode) === 0) {
                // Remove lonely starting node
                this.wireGraph.removeNode(this.drawingStartNode);
            }
        }
        
        this.wireGraph.cleanup();
        
        this.mode = 'idle';
        this.drawingStartNode = null;
        this.lastPlacedNode = null;
        this.previewPath = null;
        this._setStatus('Ready - Click to start drawing wire');
    }
    
    // ==================== Dragging Mode ====================
    
    _handleDrag(x, y) {
        if (!this.dragTarget || !this.dragStartWorld || !this.dragStartPositions) return;
        
        const dx = x - this.dragStartWorld.x;
        const dy = y - this.dragStartWorld.y;
        
        // First, restore graph to original state (remove bend nodes, restore segments)
        this._restoreDragState();
        
        if (this.dragTarget.type === 'node') {
            this._dragNode(this.dragTarget.id, dx, dy);
        } else if (this.dragTarget.type === 'segment') {
            this._dragSegment(this.dragTarget.id, dx, dy);
        }
        
        // Fix any diagonal segments in real-time
        this._fixDiagonalsDuringDrag();
    }
    
    /**
     * Capture segments connected to a node for later restoration
     */
    _captureSegmentsForNode(nodeId) {
        const segments = this.wireGraph.getSegmentsForNode(nodeId);
        return segments.map(seg => ({
            id: seg.id,
            nodeId1: seg.nodeId1,
            nodeId2: seg.nodeId2
        }));
    }
    
    /**
     * Capture segments connected to multiple nodes
     */
    _captureSegmentsForNodes(nodeIds) {
        const segmentSet = new Set();
        const result = [];
        for (const nodeId of nodeIds) {
            const segments = this.wireGraph.getSegmentsForNode(nodeId);
            for (const seg of segments) {
                if (!segmentSet.has(seg.id)) {
                    segmentSet.add(seg.id);
                    result.push({
                        id: seg.id,
                        nodeId1: seg.nodeId1,
                        nodeId2: seg.nodeId2
                    });
                }
            }
        }
        return result;
    }
    
    /**
     * Restore graph state by removing temporary bend nodes and restoring original segments
     */
    _restoreDragState() {
        if (!this.dragBendNodes || !this.dragOriginalSegments) return;
        
        // Remove all bend nodes we created (this also removes their segments)
        for (const bendNodeId of this.dragBendNodes.values()) {
            this.wireGraph.removeNode(bendNodeId);
        }
        this.dragBendNodes.clear();
        
        // Restore original segments (in case they were removed when bend nodes were created)
        for (const origSeg of this.dragOriginalSegments) {
            if (!this.wireGraph.hasSegment(origSeg.nodeId1, origSeg.nodeId2)) {
                // Only restore if both nodes still exist
                if (this.wireGraph.getNode(origSeg.nodeId1) && this.wireGraph.getNode(origSeg.nodeId2)) {
                    this.wireGraph.addSegment(origSeg.nodeId1, origSeg.nodeId2);
                }
            }
        }
        
        // Restore original node positions
        for (const [nodeId, pos] of this.dragStartPositions) {
            this.wireGraph.updateNode(nodeId, pos.x, pos.y);
        }
    }
    
    _dragNode(nodeId, dx, dy) {
        const originalPos = this.dragStartPositions.get(nodeId);
        if (!originalPos) return;
        if (this.dragMovedNodeIds && !this.dragMovedNodeIds.has(nodeId)) return;
        
        const newX = this.viewport.snapToGrid(originalPos.x + dx, 0).x;
        const newY = this.viewport.snapToGrid(0, originalPos.y + dy).y;
        
        // Move the node
        this.wireGraph.updateNode(nodeId, newX, newY);
    }
    
    _dragSegment(segmentId, dx, dy) {
        const segment = this.wireGraph.getSegment(segmentId);
        if (!segment) return;
        if (this.dragMovedNodeIds && this.dragMovedNodeIds.size === 0) return;
        
        const pos1 = this.dragStartPositions.get(segment.nodeId1);
        const pos2 = this.dragStartPositions.get(segment.nodeId2);
        if (!pos1 || !pos2) return;
        
        // Determine if this is a horizontal or vertical segment
        const isHorizontal = Math.abs(pos1.y - pos2.y) < 0.001;
        const isVertical = Math.abs(pos1.x - pos2.x) < 0.001;
        
        if (isHorizontal) {
            // Move only in Y direction
            const newY = this.viewport.snapToGrid(0, pos1.y + dy).y;
            
            if (!this.dragMovedNodeIds || this.dragMovedNodeIds.has(segment.nodeId1)) {
                this.wireGraph.updateNode(segment.nodeId1, pos1.x, newY);
            }
            if (!this.dragMovedNodeIds || this.dragMovedNodeIds.has(segment.nodeId2)) {
                this.wireGraph.updateNode(segment.nodeId2, pos2.x, newY);
            }
        } else if (isVertical) {
            // Move only in X direction
            const newX = this.viewport.snapToGrid(pos1.x + dx, 0).x;
            
            if (!this.dragMovedNodeIds || this.dragMovedNodeIds.has(segment.nodeId1)) {
                this.wireGraph.updateNode(segment.nodeId1, newX, pos1.y);
            }
            if (!this.dragMovedNodeIds || this.dragMovedNodeIds.has(segment.nodeId2)) {
                this.wireGraph.updateNode(segment.nodeId2, newX, pos2.y);
            }
        }
    }
    
    /**
     * Fix diagonal segments in real-time during drag by inserting bend nodes
     */
    _fixDiagonalsDuringDrag() {
        // Get all segments connected to the dragged nodes
        const nodesToCheck = new Set(this.dragMovedNodeIds ?? this.dragStartPositions.keys());
        const segmentsToFix = [];
        
        for (const nodeId of nodesToCheck) {
            const segments = this.wireGraph.getSegmentsForNode(nodeId);
            for (const segment of segments) {
                const node1 = this.wireGraph.getNode(segment.nodeId1);
                const node2 = this.wireGraph.getNode(segment.nodeId2);
                if (!node1 || !node2) continue;
                
                const dx = Math.abs(node1.x - node2.x);
                const dy = Math.abs(node1.y - node2.y);
                
                // Check if diagonal
                if (dx > 0.001 && dy > 0.001) {
                    // Only process each segment once
                    const segKey = segment.id;
                    if (!segmentsToFix.find(s => s.segment.id === segKey)) {
                        segmentsToFix.push({
                            segment,
                            node1: { ...node1 },
                            node2: { ...node2 }
                        });
                    }
                }
            }
        }
        
        // Fix each diagonal segment by inserting a bend
        for (const { segment, node1, node2 } of segmentsToFix) {
            // Remove the diagonal segment
            this.wireGraph.removeSegment(segment.nodeId1, segment.nodeId2);
            
            // Determine which node is being dragged
            const node1Dragged = this.dragMovedNodeIds ? this.dragMovedNodeIds.has(segment.nodeId1) : this.dragStartPositions.has(segment.nodeId1);
            const node2Dragged = this.dragMovedNodeIds ? this.dragMovedNodeIds.has(segment.nodeId2) : this.dragStartPositions.has(segment.nodeId2);
            
            // Choose bend point based on which node is being dragged
            // The bend should be at (draggedNode.x, staticNode.y) or (staticNode.x, draggedNode.y)
            let bendX, bendY;
            
            if (node1Dragged && !node2Dragged) {
                // Node1 is dragged, keep bend connected orthogonally to node2
                bendX = node1.x;
                bendY = node2.y;
            } else if (node2Dragged && !node1Dragged) {
                // Node2 is dragged, keep bend connected orthogonally to node1
                bendX = node2.x;
                bendY = node1.y;
            } else {
                // Both dragged (segment drag) - use horizontal-first routing
                bendX = node2.x;
                bendY = node1.y;
            }
            
            // Create bend node
            const bendNodeId = this.wireGraph.addNode(bendX, bendY);
            
            // Track this bend node for later removal
            const bendKey = `${segment.nodeId1}-${segment.nodeId2}`;
            this.dragBendNodes.set(bendKey, bendNodeId);
            
            // Create two orthogonal segments through the bend
            this.wireGraph.addSegment(segment.nodeId1, bendNodeId);
            this.wireGraph.addSegment(bendNodeId, segment.nodeId2);
        }
    }
    
    _ensureOrthogonalConnections(nodeId) {
        // This is now handled by _fixDiagonalsDuringDrag
    }
    
    _finishDrag() {
        // The bend nodes created during drag are now permanent
        // Just clear the tracking and run cleanup
        
        // Check for new junctions (segment intersections)
        this._checkForNewJunctions();
        
        // Clean up the graph (merges collinear segments, etc.)
        this.wireGraph.cleanup();
        
        this.mode = 'idle';
        this.dragTarget = null;
        this.dragStartWorld = null;
        this.dragStartPositions = null;
        this.dragMovedNodeIds = null;
        this.dragBendNodes = null;
        this.dragOriginalSegments = null;
        this._setStatus('Ready - Click to start drawing wire');
    }
    
    _checkForNewJunctions() {
        // Check if any moved segments now intersect with other segments
        const segments = this.wireGraph.getAllSegments();
        const nodesToCheck = new Set();
        
        // For each pair of segments, check for intersection
        for (let i = 0; i < segments.length; i++) {
            for (let j = i + 1; j < segments.length; j++) {
                const seg1 = segments[i];
                const seg2 = segments[j];
                
                // Skip if they share a node
                if (seg1.nodeId1 === seg2.nodeId1 || seg1.nodeId1 === seg2.nodeId2 ||
                    seg1.nodeId2 === seg2.nodeId1 || seg1.nodeId2 === seg2.nodeId2) {
                    continue;
                }
                
                const intersection = this._getSegmentIntersection(seg1, seg2);
                if (intersection) {
                    // Check if intersection is at a segment endpoint (no split needed)
                    const node1a = this.wireGraph.getNode(seg1.nodeId1);
                    const node1b = this.wireGraph.getNode(seg1.nodeId2);
                    const node2a = this.wireGraph.getNode(seg2.nodeId1);
                    const node2b = this.wireGraph.getNode(seg2.nodeId2);
                    
                    const atEndpoint1 = this._isPointAtNode(intersection, node1a) || 
                                        this._isPointAtNode(intersection, node1b);
                    const atEndpoint2 = this._isPointAtNode(intersection, node2a) || 
                                        this._isPointAtNode(intersection, node2b);
                    
                    if (!atEndpoint1 || !atEndpoint2) {
                        // Split segments at intersection
                        if (!atEndpoint1) {
                            const newNodeId = this.wireGraph.splitSegment(seg1.id, intersection.x, intersection.y);
                            if (newNodeId) nodesToCheck.add(newNodeId);
                        }
                        if (!atEndpoint2) {
                            // Re-find segment since it might have moved
                            const result = this.wireGraph.getSegmentAt(intersection.x, intersection.y, 0.1);
                            if (result && result.segment.id !== seg1.id) {
                                const newNodeId = this.wireGraph.splitSegment(result.segment.id, intersection.x, intersection.y);
                                if (newNodeId) nodesToCheck.add(newNodeId);
                            }
                        }
                    }
                }
            }
        }
    }
    
    _isPointAtNode(point, node) {
        if (!node) return false;
        return Math.abs(point.x - node.x) < 0.001 && Math.abs(point.y - node.y) < 0.001;
    }
    
    _getSegmentIntersection(seg1, seg2) {
        const node1a = this.wireGraph.getNode(seg1.nodeId1);
        const node1b = this.wireGraph.getNode(seg1.nodeId2);
        const node2a = this.wireGraph.getNode(seg2.nodeId1);
        const node2b = this.wireGraph.getNode(seg2.nodeId2);
        
        if (!node1a || !node1b || !node2a || !node2b) return null;
        
        // For orthogonal segments, intersection is simpler
        const seg1Horizontal = Math.abs(node1a.y - node1b.y) < 0.001;
        const seg2Horizontal = Math.abs(node2a.y - node2b.y) < 0.001;
        
        // Both horizontal or both vertical - parallel, no intersection
        if (seg1Horizontal === seg2Horizontal) return null;
        
        let hSeg, vSeg;
        if (seg1Horizontal) {
            hSeg = { a: node1a, b: node1b };
            vSeg = { a: node2a, b: node2b };
        } else {
            hSeg = { a: node2a, b: node2b };
            vSeg = { a: node1a, b: node1b };
        }
        
        const intX = vSeg.a.x;
        const intY = hSeg.a.y;
        
        // Check if intersection point is within both segments
        const hMinX = Math.min(hSeg.a.x, hSeg.b.x);
        const hMaxX = Math.max(hSeg.a.x, hSeg.b.x);
        const vMinY = Math.min(vSeg.a.y, vSeg.b.y);
        const vMaxY = Math.max(vSeg.a.y, vSeg.b.y);
        
        if (intX >= hMinX && intX <= hMaxX && intY >= vMinY && intY <= vMaxY) {
            return { x: intX, y: intY };
        }
        
        return null;
    }
    
    _cancelDrag() {
        // Restore original state (this removes bend nodes and restores positions/segments)
        this._restoreDragState();
        
        this.mode = 'idle';
        this.dragTarget = null;
        this.dragStartWorld = null;
        this.dragStartPositions = null;
        this.dragMovedNodeIds = null;
        this.dragBendNodes = null;
        this.dragOriginalSegments = null;
        this._setStatus('Ready - Click to start drawing wire');
    }
    
    // ==================== Hover State ====================
    
    _updateHoverState(x, y) {
        this.hoveredNode = null;
        this.hoveredSegment = null;
        
        // Check for node hover first (takes priority)
        const hitNode = this.wireGraph.getNodeAt(x, y, this.nodeHitTolerance);
        if (hitNode) {
            this.hoveredNode = hitNode;
            return;
        }
        
        // Check for segment hover
        const hitSegment = this.wireGraph.getSegmentAt(x, y, this.segmentHitTolerance);
        if (hitSegment) {
            this.hoveredSegment = hitSegment.segment;
        }
    }
    
    // ==================== Rendering ====================
    
    _render(ctx, viewport) {
        // Draw all segments
        const segments = this.wireGraph.getAllSegments();
        for (const segment of segments) {
            const isHovered = this.hoveredSegment && this.hoveredSegment.id === segment.id;
            this._renderSegment(ctx, viewport, segment, isHovered);
        }
        
        // Draw junction dots (nodes with 3+ connections)
        const nodes = this.wireGraph.getAllNodes();
        for (const node of nodes) {
            const connectionCount = this.wireGraph.getConnectionCount(node.id);
            const isHovered = this.hoveredNode && this.hoveredNode.id === node.id;
            
            if (connectionCount >= 3) {
                // Draw junction dot
                this._renderJunction(ctx, viewport, node, isHovered);
            } else if (isHovered) {
                // Highlight hovered non-junction nodes
                this._renderNodeHighlight(ctx, viewport, node);
            }
        }
        
        // Draw preview path while drawing
        if (this.mode === 'drawing' && this.previewPath) {
            this._renderPreviewPath(ctx, viewport);
        }
    }
    
    _renderSegment(ctx, viewport, segment, isHovered) {
        const node1 = this.wireGraph.getNode(segment.nodeId1);
        const node2 = this.wireGraph.getNode(segment.nodeId2);
        if (!node1 || !node2) return;
        
        const color = isHovered ? this.wireHighlightColor : this.wireColor;
        const lineWidth = isHovered ? 3 : 2;
        
        viewport.drawLine(node1.x, node1.y, node2.x, node2.y, color, lineWidth);
    }
    
    _renderJunction(ctx, viewport, node, isHovered) {
        const fillColor = isHovered ? this.wireHighlightColor : this.junctionColor;
        viewport.drawCircle(node.x, node.y, this.junctionRadius / viewport.zoom, fillColor, null, 0);
    }
    
    _renderNodeHighlight(ctx, viewport, node) {
        viewport.drawCircle(node.x, node.y, 6 / viewport.zoom, null, this.wireHighlightColor, 2);
    }
    
    _renderPreviewPath(ctx, viewport) {
        const path = this.previewPath;
        
        if (path.bend) {
            viewport.drawLine(path.start.x, path.start.y, path.bend.x, path.bend.y, this.previewColor, 2);
            viewport.drawLine(path.bend.x, path.bend.y, path.end.x, path.end.y, this.previewColor, 2);
        } else {
            viewport.drawLine(path.start.x, path.start.y, path.end.x, path.end.y, this.previewColor, 2);
        }
        
        // Draw endpoint indicator
        viewport.drawCircle(path.end.x, path.end.y, 4 / viewport.zoom, null, this.previewColor, 2);
    }
    
    // ==================== Public API ====================
    
    /**
     * Set whether the wire tool is active
     * @param {boolean} active 
     */
    setActive(active) {
        this.isActive = active;
        if (!active && this.mode === 'drawing') {
            this._finishDrawing();
        }
    }
    
    /**
     * Start drawing a wire from an existing node
     * @param {number} nodeId - The node ID to start from
     */
    startDrawingFromNode(nodeId) {
        this._startDrawingFromNode(nodeId);
    }
    
    /**
     * Clear all wires
     */
    clear() {
        this.wireGraph.clear();
        this._finishDrawing();
        this.viewport.render();
    }
    
    /**
     * Get the wire graph data
     * @returns {{ nodes: Array, segments: Array }}
     */
    getData() {
        return this.wireGraph.toJSON();
    }
    
    /**
     * Load wire graph data
     * @param {{ nodes: Array, segments: Array }} data 
     */
    loadData(data) {
        this.wireGraph.fromJSON(data);
        this.viewport.render();
    }
    
    _setStatus(message) {
        this.onStatusChange?.(message);
    }
}

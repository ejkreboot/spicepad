/**
 * WireGraph - Data model for wire topology in a circuit schematic
 * 
 * Stores nodes (points with x, y, id) and segments (connections between two node IDs).
 * All segments are orthogonal (horizontal or vertical only).
 * This class is pure data - no rendering or DOM references.
 */

export class WireGraph {
    constructor() {
        // Map of node ID -> { id, x, y }
        this.nodes = new Map();
        
        // Map of segment ID -> { id, nodeId1, nodeId2 }
        // Segment ID is normalized as "min-max" of node IDs
        this.segments = new Map();
        
        // Counter for generating unique node IDs
        this._nextNodeId = 1;
    }
    
    // ==================== Node Operations ====================
    
    /**
     * Add a node at the given position. If a node already exists at that location,
     * return the existing node's ID instead.
     * @param {number} x 
     * @param {number} y 
     * @returns {number} Node ID
     */
    addNode(x, y) {
        // Check for existing node at this location
        const existing = this.getNodeAt(x, y, 0.001);
        if (existing) {
            return existing.id;
        }
        
        const id = this._nextNodeId++;
        this.nodes.set(id, { id, x, y });
        return id;
    }
    
    /**
     * Get a node by ID
     * @param {number} id 
     * @returns {{ id: number, x: number, y: number } | undefined}
     */
    getNode(id) {
        return this.nodes.get(id);
    }
    
    /**
     * Update a node's position
     * @param {number} id 
     * @param {number} x 
     * @param {number} y 
     */
    updateNode(id, x, y) {
        const node = this.nodes.get(id);
        if (node) {
            node.x = x;
            node.y = y;
        }
    }
    
    /**
     * Remove a node and all connected segments
     * @param {number} id 
     */
    removeNode(id) {
        if (!this.nodes.has(id)) return;
        
        // Remove all segments connected to this node
        const connectedSegments = this.getSegmentsForNode(id);
        for (const segment of connectedSegments) {
            this.segments.delete(segment.id);
        }
        
        this.nodes.delete(id);
    }
    
    /**
     * Find a node near the given point within tolerance
     * @param {number} x 
     * @param {number} y 
     * @param {number} tolerance 
     * @returns {{ id: number, x: number, y: number } | null}
     */
    getNodeAt(x, y, tolerance = 5) {
        for (const node of this.nodes.values()) {
            const dx = node.x - x;
            const dy = node.y - y;
            if (Math.sqrt(dx * dx + dy * dy) <= tolerance) {
                return node;
            }
        }
        return null;
    }
    
    /**
     * Get all nodes
     * @returns {Array<{ id: number, x: number, y: number }>}
     */
    getAllNodes() {
        return Array.from(this.nodes.values());
    }
    
    /**
     * Get node IDs connected to the given node
     * @param {number} nodeId 
     * @returns {number[]}
     */
    getConnectedNodes(nodeId) {
        const connected = [];
        for (const segment of this.segments.values()) {
            if (segment.nodeId1 === nodeId) {
                connected.push(segment.nodeId2);
            } else if (segment.nodeId2 === nodeId) {
                connected.push(segment.nodeId1);
            }
        }
        return connected;
    }
    
    // ==================== Segment Operations ====================
    
    /**
     * Create a normalized segment ID from two node IDs
     * @param {number} nodeId1 
     * @param {number} nodeId2 
     * @returns {string}
     */
    _makeSegmentId(nodeId1, nodeId2) {
        const min = Math.min(nodeId1, nodeId2);
        const max = Math.max(nodeId1, nodeId2);
        return `${min}-${max}`;
    }
    
    /**
     * Add a segment between two nodes. No-op if segment already exists.
     * @param {number} nodeId1 
     * @param {number} nodeId2 
     * @returns {string | null} Segment ID if created, null if already exists or invalid
     */
    addSegment(nodeId1, nodeId2) {
        if (nodeId1 === nodeId2) return null;
        if (!this.nodes.has(nodeId1) || !this.nodes.has(nodeId2)) return null;
        
        const segmentId = this._makeSegmentId(nodeId1, nodeId2);
        if (this.segments.has(segmentId)) return null;
        
        this.segments.set(segmentId, {
            id: segmentId,
            nodeId1: Math.min(nodeId1, nodeId2),
            nodeId2: Math.max(nodeId1, nodeId2)
        });
        
        return segmentId;
    }
    
    /**
     * Remove a segment between two nodes
     * @param {number} nodeId1 
     * @param {number} nodeId2 
     */
    removeSegment(nodeId1, nodeId2) {
        const segmentId = this._makeSegmentId(nodeId1, nodeId2);
        this.segments.delete(segmentId);
    }
    
    /**
     * Get a segment by its ID
     * @param {string} segmentId 
     * @returns {{ id: string, nodeId1: number, nodeId2: number } | undefined}
     */
    getSegment(segmentId) {
        return this.segments.get(segmentId);
    }
    
    /**
     * Get all segments
     * @returns {Array<{ id: string, nodeId1: number, nodeId2: number }>}
     */
    getAllSegments() {
        return Array.from(this.segments.values());
    }
    
    /**
     * Get all segments connected to a node
     * @param {number} nodeId 
     * @returns {Array<{ id: string, nodeId1: number, nodeId2: number }>}
     */
    getSegmentsForNode(nodeId) {
        const result = [];
        for (const segment of this.segments.values()) {
            if (segment.nodeId1 === nodeId || segment.nodeId2 === nodeId) {
                result.push(segment);
            }
        }
        return result;
    }
    
    /**
     * Find a segment near the given point within tolerance
     * @param {number} x 
     * @param {number} y 
     * @param {number} tolerance 
     * @returns {{ segment: { id: string, nodeId1: number, nodeId2: number }, distance: number } | null}
     */
    getSegmentAt(x, y, tolerance = 5) {
        let closest = null;
        let closestDistance = tolerance;
        
        for (const segment of this.segments.values()) {
            const node1 = this.nodes.get(segment.nodeId1);
            const node2 = this.nodes.get(segment.nodeId2);
            if (!node1 || !node2) continue;
            
            const distance = this._pointToSegmentDistance(x, y, node1.x, node1.y, node2.x, node2.y);
            if (distance < closestDistance) {
                closestDistance = distance;
                closest = { segment, distance };
            }
        }
        
        return closest;
    }
    
    /**
     * Calculate distance from a point to a line segment
     * @private
     */
    _pointToSegmentDistance(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSquared = dx * dx + dy * dy;
        
        if (lengthSquared === 0) {
            // Segment is a point
            return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
        }
        
        // Project point onto line, clamped to segment
        let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
        t = Math.max(0, Math.min(1, t));
        
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;
        
        return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
    }
    
    /**
     * Split a segment at a point, inserting a new node
     * @param {string} segmentId 
     * @param {number} x 
     * @param {number} y 
     * @returns {number | null} New node ID, or null if failed
     */
    splitSegment(segmentId, x, y) {
        const segment = this.segments.get(segmentId);
        if (!segment) return null;
        
        const node1 = this.nodes.get(segment.nodeId1);
        const node2 = this.nodes.get(segment.nodeId2);
        if (!node1 || !node2) return null;
        
        // For orthogonal segments, snap the split point to the segment line
        let snapX = x;
        let snapY = y;
        
        if (node1.x === node2.x) {
            // Vertical segment - snap X to segment
            snapX = node1.x;
        } else if (node1.y === node2.y) {
            // Horizontal segment - snap Y to segment
            snapY = node1.y;
        }
        
        // Remove old segment
        this.segments.delete(segmentId);
        
        // Create new node at split point
        const newNodeId = this.addNode(snapX, snapY);
        
        // Create two new segments
        this.addSegment(segment.nodeId1, newNodeId);
        this.addSegment(newNodeId, segment.nodeId2);
        
        return newNodeId;
    }
    
    /**
     * If a node has exactly 2 connections that are collinear, remove the node
     * and join the segments into one.
     * @param {number} nodeId 
     * @returns {boolean} True if node was merged
     */
    mergeCollinearSegments(nodeId) {
        const node = this.nodes.get(nodeId);
        if (!node) return false;
        if (node.isComponentPin) return false; // Never collapse through a component pin
        
        const connectedIds = this.getConnectedNodes(nodeId);
        if (connectedIds.length !== 2) return false;
        
        const node1 = this.nodes.get(connectedIds[0]);
        const node2 = this.nodes.get(connectedIds[1]);
        if (!node1 || !node2) return false;
        
        // Check if they're collinear (both horizontal or both vertical)
        const isCollinear = 
            (node1.x === node.x && node2.x === node.x) ||  // Vertical line
            (node1.y === node.y && node2.y === node.y);    // Horizontal line
        
        if (!isCollinear) return false;
        
        // Remove the two segments
        this.removeSegment(nodeId, connectedIds[0]);
        this.removeSegment(nodeId, connectedIds[1]);
        
        // Remove the node
        this.nodes.delete(nodeId);
        
        // Create direct segment between the two remaining nodes
        this.addSegment(connectedIds[0], connectedIds[1]);
        
        return true;
    }
    
    // ==================== Cleanup Operations ====================
    
    /**
     * Merge all nodes at the same location
     */
    mergeCoincidentNodes() {
        const nodeArray = Array.from(this.nodes.values());
        const merged = new Map(); // old ID -> new ID
        
        for (let i = 0; i < nodeArray.length; i++) {
            const nodeA = nodeArray[i];
            if (merged.has(nodeA.id)) continue;
            
            for (let j = i + 1; j < nodeArray.length; j++) {
                const nodeB = nodeArray[j];
                if (merged.has(nodeB.id)) continue;
                
                if (Math.abs(nodeA.x - nodeB.x) < 0.001 && Math.abs(nodeA.y - nodeB.y) < 0.001) {
                    // Merge nodeB into nodeA
                    if (nodeB.isComponentPin && !nodeA.isComponentPin) {
                        nodeA.isComponentPin = true;
                        nodeA.componentId = nodeB.componentId;
                        nodeA.pinId = nodeB.pinId;
                        nodeA.isBend = false;
                    } else if (!nodeA.isComponentPin && nodeB.isBend) {
                        nodeA.isBend = true;
                    }
                    merged.set(nodeB.id, nodeA.id);
                }
            }
        }
        
        // Update all segments to use new node IDs
        const segmentsToUpdate = [];
        for (const segment of this.segments.values()) {
            const newId1 = merged.get(segment.nodeId1) ?? segment.nodeId1;
            const newId2 = merged.get(segment.nodeId2) ?? segment.nodeId2;
            if (newId1 !== segment.nodeId1 || newId2 !== segment.nodeId2) {
                segmentsToUpdate.push({
                    oldId: segment.id,
                    newNodeId1: newId1,
                    newNodeId2: newId2
                });
            }
        }
        
        for (const update of segmentsToUpdate) {
            this.segments.delete(update.oldId);
            if (update.newNodeId1 !== update.newNodeId2) {
                this.addSegment(update.newNodeId1, update.newNodeId2);
            }
        }
        
        // Remove merged nodes
        for (const oldId of merged.keys()) {
            this.nodes.delete(oldId);
        }
    }
    
    /**
     * Remove zero-length segments (where both endpoints are at the same location)
     */
    removeZeroLengthSegments() {
        const toRemove = [];
        for (const segment of this.segments.values()) {
            const node1 = this.nodes.get(segment.nodeId1);
            const node2 = this.nodes.get(segment.nodeId2);
            if (!node1 || !node2) {
                toRemove.push(segment.id);
                continue;
            }
            if (Math.abs(node1.x - node2.x) < 0.001 && Math.abs(node1.y - node2.y) < 0.001) {
                toRemove.push(segment.id);
            }
        }
        for (const id of toRemove) {
            this.segments.delete(id);
        }
    }
    
    /**
     * Merge all collinear segments (nodes with exactly 2 collinear connections)
     */
    mergeAllCollinearSegments() {
        let changed = true;
        while (changed) {
            changed = false;
            for (const node of this.nodes.values()) {
                if (this.mergeCollinearSegments(node.id)) {
                    changed = true;
                    break; // Restart since we modified the graph
                }
            }
        }
    }
    
    /**
     * Remove dangling nodes (nodes with no connections)
     */
    removeDanglingNodes() {
        const toRemove = [];
        for (const node of this.nodes.values()) {
            if (this.getConnectedNodes(node.id).length === 0) {
                toRemove.push(node.id);
            }
        }
        for (const id of toRemove) {
            this.nodes.delete(id);
        }
    }
    
    /**
     * Run all cleanup operations
     */
    cleanup() {
        this.mergeCoincidentNodes();
        this.removeZeroLengthSegments();
        this.mergeAllCollinearSegments();
    }
    
    /**
     * Clear all nodes and segments
     */
    clear() {
        this.nodes.clear();
        this.segments.clear();
        this._nextNodeId = 1;
    }
    
    // ==================== Utility Methods ====================
    
    /**
     * Check if a segment exists between two nodes
     * @param {number} nodeId1 
     * @param {number} nodeId2 
     * @returns {boolean}
     */
    hasSegment(nodeId1, nodeId2) {
        return this.segments.has(this._makeSegmentId(nodeId1, nodeId2));
    }
    
    /**
     * Get the number of connections at a node (for determining if it's a junction)
     * @param {number} nodeId 
     * @returns {number}
     */
    getConnectionCount(nodeId) {
        return this.getConnectedNodes(nodeId).length;
    }
    
    /**
     * Check if a point lies on a segment (within tolerance)
     * @param {number} x 
     * @param {number} y 
     * @param {string} segmentId 
     * @param {number} tolerance 
     * @returns {boolean}
     */
    isPointOnSegment(x, y, segmentId, tolerance = 0.001) {
        const segment = this.segments.get(segmentId);
        if (!segment) return false;
        
        const node1 = this.nodes.get(segment.nodeId1);
        const node2 = this.nodes.get(segment.nodeId2);
        if (!node1 || !node2) return false;
        
        return this._pointToSegmentDistance(x, y, node1.x, node1.y, node2.x, node2.y) <= tolerance;
    }
    
    /**
     * Serialize the graph to a plain object
     * @returns {{ nodes: Array, segments: Array }}
     */
    toJSON() {
        return {
            nodes: Array.from(this.nodes.values()),
            segments: Array.from(this.segments.values())
        };
    }
    
    /**
     * Load graph from a plain object
     * @param {{ nodes: Array, segments: Array }} data 
     */
    fromJSON(data) {
        this.clear();
        
        let maxId = 0;
        for (const node of data.nodes) {
            this.nodes.set(node.id, { ...node });
            maxId = Math.max(maxId, node.id);
        }
        this._nextNodeId = maxId + 1;
        
        for (const segment of data.segments) {
            this.segments.set(segment.id, { ...segment });
        }
    }
}

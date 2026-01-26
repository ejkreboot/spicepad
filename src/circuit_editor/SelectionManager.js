/**
 * SelectionManager - Marquee selection and group dragging for components and wires.
 */

export class SelectionManager {
    constructor({ viewport, wireGraph, componentManager, wireEditor, isSelectionEnabled }) {
        this.viewport = viewport;
        this.wireGraph = wireGraph;
        this.componentManager = componentManager;
        this.wireEditor = wireEditor;
        this.isSelectionEnabled = isSelectionEnabled || (() => !this.wireEditor.isActive);

        this.selectedComponentIds = new Set();
        this.selectedSegmentIds = new Set();

        this.isMarqueeActive = false;
        this.marqueeStart = null;
        this.marqueeEnd = null;
        this._marqueeDragging = false;

        this.groupDrag = null;

        this._setupEventHandlers();
        this._setupRenderHook();
    }

    clearSelection() {
        this.selectedComponentIds.clear();
        this.selectedSegmentIds.clear();
        this._applySelectionToManagers();
    }

    /**
     * Delete all currently selected components and wire segments
     * @returns {boolean} True if anything was deleted
     */
    deleteSelected() {
        const hadSelection = this.selectedComponentIds.size > 0 || this.selectedSegmentIds.size > 0;
        
        // Delete selected components
        for (const componentId of this.selectedComponentIds) {
            this.componentManager.removeComponent(componentId);
        }
        
        // Delete selected wire segments
        for (const segmentId of this.selectedSegmentIds) {
            const segment = this.wireGraph.getSegment(segmentId);
            if (segment) {
                this.wireGraph.removeSegment(segment.nodeId1, segment.nodeId2);
            }
        }
        
        // Clean up orphaned nodes
        this.wireGraph.cleanup();
        
        // Clear the selection
        this.clearSelection();
        
        return hadSelection;
    }

    _applySelectionToManagers() {
        this.componentManager.setSelectedComponents(this.selectedComponentIds);
        this.wireEditor.setSelectedSegments(this.selectedSegmentIds);
        this.viewport.render();
    }

    _setupEventHandlers() {
        const originalOnMouseDown = this.viewport.onMouseDown;
        const originalOnMouseMove = this.viewport.onMouseMove;
        const originalOnMouseUp = this.viewport.onMouseUp;

        this.viewport.onMouseDown = (worldX, worldY, event) => {
            if (this._onMouseDown(worldX, worldY, event)) {
                event.__selectionHandled = true;
                event.__componentHandled = true;
            }
            originalOnMouseDown?.(worldX, worldY, event);
        };

        this.viewport.onMouseMove = (worldX, worldY, event) => {
            if (this._onMouseMove(worldX, worldY, event)) {
                event.__selectionHandled = true;
                event.__componentHandled = true;
            }
            originalOnMouseMove?.(worldX, worldY, event);
        };

        this.viewport.onMouseUp = (worldX, worldY, event) => {
            if (this._onMouseUp(worldX, worldY, event)) {
                event.__selectionHandled = true;
                event.__componentHandled = true;
            }
            originalOnMouseUp?.(worldX, worldY, event);
        };
    }

    _onMouseDown(worldX, worldY, event) {
        if (!this._enabled()) return false;
        if (event.button !== 0) return false;
        if (event.shiftKey) return false;

        const snapped = this.viewport.snapToGrid(worldX, worldY);
        const labelHit = this.componentManager.findLabelHit ? this.componentManager.findLabelHit(snapped.x, snapped.y) : null;
        if (labelHit) {
            return false; // Let component manager handle label dragging
        }
        const hitComponent = this.componentManager.getComponentAt(snapped.x, snapped.y);
        const hitSegment = this.wireGraph.getSegmentAt(snapped.x, snapped.y, this.wireEditor.segmentHitTolerance ?? 5);
        const hasSelection = this.selectedComponentIds.size > 0 || this.selectedSegmentIds.size > 0;

        if (hasSelection) {
            const hitSelectedComponent = hitComponent && this.selectedComponentIds.has(hitComponent.id);
            const hitSelectedSegment = hitSegment && this.selectedSegmentIds.has(hitSegment.segment.id);
            if (hitSelectedComponent || hitSelectedSegment) {
                this._beginGroupDrag(snapped);
                return true;
            }
        }

        // If we clicked on an existing item but it is not part of the current selection, let existing handlers manage it.
        if (hitComponent || hitSegment) {
            return false;
        }

        // Start marquee selection from empty space.
        this.isMarqueeActive = true;
        this._marqueeDragging = false;
        this.marqueeStart = snapped;
        this.marqueeEnd = snapped;
        return true;
    }

    _onMouseMove(worldX, worldY, event) {
        if (!this._enabled()) return false;
        const snapped = this.viewport.snapToGrid(worldX, worldY);

        if (this.groupDrag) {
            this._updateGroupDrag(snapped);
            this.viewport.render();
            return true;
        }

        if (this.isMarqueeActive && this.marqueeStart) {
            const dx = snapped.x - this.marqueeStart.x;
            const dy = snapped.y - this.marqueeStart.y;
            const dist = Math.hypot(dx, dy);
            const threshold = 3 / this.viewport.zoom;
            if (dist > threshold) {
                this._marqueeDragging = true;
            }
            this.marqueeEnd = snapped;
            this.viewport.render();
            return true;
        }

        return false;
    }

    _onMouseUp(worldX, worldY, event) {
        if (!this._enabled()) return false;
        const snapped = this.viewport.snapToGrid(worldX, worldY);

        if (this.groupDrag) {
            this._updateGroupDrag(snapped);
            this._finishGroupDrag();
            this.viewport.render();
            return true;
        }

        if (this.isMarqueeActive) {
            this.marqueeEnd = snapped;
            if (this._marqueeDragging) {
                this._finalizeMarqueeSelection();
            } else {
                this.clearSelection();
            }
            this.isMarqueeActive = false;
            this.marqueeStart = null;
            this.marqueeEnd = null;
            this._marqueeDragging = false;
            this.viewport.render();
            return true;
        }

        return false;
    }

    _beginGroupDrag(startWorld) {
        const wireState = this._captureWireState();
        const componentPositions = new Map();
        for (const component of this.componentManager.components) {
            if (this.selectedComponentIds.has(component.id)) {
                componentPositions.set(component.id, { x: component.x, y: component.y });
            }
        }

        const { movedNodeIds, nodeStartPositions } = this._collectMovableNodes();

        this.groupDrag = {
            startWorld,
            wireState,
            componentPositions,
            movedNodeIds,
            nodeStartPositions
        };
    }

    _updateGroupDrag(currentWorld) {
        if (!this.groupDrag) return;
        this._restoreWireState(this.groupDrag.wireState);

        const dx = currentWorld.x - this.groupDrag.startWorld.x;
        const dy = currentWorld.y - this.groupDrag.startWorld.y;

        this._applyComponentDelta(dx, dy);
        this._applyWireDelta(dx, dy);
        this._fixDiagonalSegments(this.groupDrag.movedNodeIds);
    }

    _finishGroupDrag() {
        if (!this.groupDrag) return;
        this.wireGraph.cleanup();
        this.groupDrag = null;
    }

    _applyComponentDelta(dx, dy) {
        if (!this.groupDrag) return;
        for (const [componentId, startPos] of this.groupDrag.componentPositions.entries()) {
            const component = this.componentManager.components.find(c => c.id === componentId);
            if (!component) continue;
            const snapped = this.viewport.snapToGrid(startPos.x + dx, startPos.y + dy);
            component.x = snapped.x;
            component.y = snapped.y;
            this.componentManager.syncComponentPins(component);
        }
    }

    _applyWireDelta(dx, dy) {
        if (!this.groupDrag) return;
        for (const nodeId of this.groupDrag.movedNodeIds) {
            const start = this.groupDrag.nodeStartPositions.get(nodeId);
            const node = this.wireGraph.getNode(nodeId);
            if (!start || !node) continue;
            const snapped = this.viewport.snapToGrid(start.x + dx, start.y + dy);
            this.wireGraph.updateNode(nodeId, snapped.x, snapped.y);
        }
    }

    _fixDiagonalSegments(movedNodeIds) {
        const segments = this.wireGraph.getAllSegments();
        for (const segment of segments) {
            const node1 = this.wireGraph.getNode(segment.nodeId1);
            const node2 = this.wireGraph.getNode(segment.nodeId2);
            if (!node1 || !node2) continue;

            const dx = Math.abs(node1.x - node2.x);
            const dy = Math.abs(node1.y - node2.y);
            if (dx < 0.001 || dy < 0.001) continue;

            this.wireGraph.removeSegment(segment.nodeId1, segment.nodeId2);

            const node1Moved = movedNodeIds.has(node1.id);
            const node2Moved = movedNodeIds.has(node2.id);
            let bendX = node2.x;
            let bendY = node1.y;

            if (node1Moved && !node2Moved) {
                bendX = node1.x;
                bendY = node2.y;
            } else if (node2Moved && !node1Moved) {
                bendX = node2.x;
                bendY = node1.y;
            }

            const bendNodeId = this.wireGraph.addNode(bendX, bendY);
            const bendNode = this.wireGraph.getNode(bendNodeId);
            if (bendNode) {
                bendNode.isBend = true;
            }
            this.wireGraph.addSegment(segment.nodeId1, bendNodeId);
            this.wireGraph.addSegment(bendNodeId, segment.nodeId2);
        }
    }

    _finalizeMarqueeSelection() {
        if (!this.marqueeStart || !this.marqueeEnd) return;
        const minX = Math.min(this.marqueeStart.x, this.marqueeEnd.x);
        const maxX = Math.max(this.marqueeStart.x, this.marqueeEnd.x);
        const minY = Math.min(this.marqueeStart.y, this.marqueeEnd.y);
        const maxY = Math.max(this.marqueeStart.y, this.marqueeEnd.y);

        this.selectedComponentIds = new Set();
        for (const component of this.componentManager.components) {
            const bounds = component.getBounds();
            const inside =
                bounds.x >= minX &&
                bounds.y >= minY &&
                bounds.x + bounds.width <= maxX &&
                bounds.y + bounds.height <= maxY;
            if (inside) {
                this.selectedComponentIds.add(component.id);
            }
        }

        this.selectedSegmentIds = new Set();
        const segments = this.wireGraph.getAllSegments();
        for (const segment of segments) {
            const node1 = this.wireGraph.getNode(segment.nodeId1);
            const node2 = this.wireGraph.getNode(segment.nodeId2);
            if (!node1 || !node2) continue;
            const inside =
                node1.x >= minX && node1.x <= maxX &&
                node1.y >= minY && node1.y <= maxY &&
                node2.x >= minX && node2.x <= maxX &&
                node2.y >= minY && node2.y <= maxY;
            if (inside) {
                this.selectedSegmentIds.add(segment.id);
            }
        }

        this._applySelectionToManagers();
    }

    _collectMovableNodes() {
        const movedNodeIds = new Set();
        const nodeStartPositions = new Map();

        for (const segmentId of this.selectedSegmentIds) {
            const segment = this.wireGraph.getSegment(segmentId);
            if (!segment) continue;
            const nodeIds = [segment.nodeId1, segment.nodeId2];
            for (const nodeId of nodeIds) {
                const node = this.wireGraph.getNode(nodeId);
                if (!node) continue;
                if (node.isComponentPin) {
                    if (node.componentId && this.selectedComponentIds.has(node.componentId)) {
                        continue; // Component movement will update this pin.
                    }
                    continue; // Anchor pin when component is not selected.
                }
                movedNodeIds.add(nodeId);
                if (!nodeStartPositions.has(nodeId)) {
                    nodeStartPositions.set(nodeId, { x: node.x, y: node.y });
                }
            }
        }

        return { movedNodeIds, nodeStartPositions };
    }

    _captureWireState() {
        const nodes = new Map();
        for (const [id, node] of this.wireGraph.nodes.entries()) {
            nodes.set(id, { ...node });
        }
        const segments = this.wireGraph.getAllSegments().map(seg => ({ ...seg }));
        return {
            nodes,
            segments,
            nextNodeId: this.wireGraph._nextNodeId
        };
    }

    _restoreWireState(state) {
        if (!state) return;
        for (const id of Array.from(this.wireGraph.nodes.keys())) {
            if (!state.nodes.has(id)) {
                this.wireGraph.removeNode(id);
            }
        }

        for (const [id, data] of state.nodes.entries()) {
            const existing = this.wireGraph.getNode(id);
            if (existing) {
                Object.assign(existing, data);
            } else {
                this.wireGraph.nodes.set(id, { ...data });
            }
        }

        this.wireGraph.segments.clear();
        for (const seg of state.segments) {
            this.wireGraph.addSegment(seg.nodeId1, seg.nodeId2);
        }

        this.wireGraph._nextNodeId = state.nextNodeId;
    }

    _setupRenderHook() {
        const originalOnRender = this.viewport.onRender;
        this.viewport.onRender = (ctx, viewport) => {
            originalOnRender?.(ctx, viewport);
            this._renderMarquee(ctx, viewport);
        };
    }

    _renderMarquee(ctx, viewport) {
        if (!this.isMarqueeActive || !this.marqueeStart || !this.marqueeEnd) return;
        const minX = Math.min(this.marqueeStart.x, this.marqueeEnd.x);
        const maxX = Math.max(this.marqueeStart.x, this.marqueeEnd.x);
        const minY = Math.min(this.marqueeStart.y, this.marqueeEnd.y);
        const maxY = Math.max(this.marqueeStart.y, this.marqueeEnd.y);

        viewport.drawRect(
            minX,
            minY,
            maxX - minX,
            maxY - minY,
            'rgba(59, 130, 246, 0.1)',
            '#2563eb',
            1.5
        );
    }

    _enabled() {
        return this.isSelectionEnabled ? this.isSelectionEnabled() : true;
    }
}

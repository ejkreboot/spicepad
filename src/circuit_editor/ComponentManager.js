/**
 * ComponentManager - Manages component instances, rendering, and dragging.
 */

import { createBasicSquareComponent } from './Component.js';

export class ComponentManager {
	/**
	 * @param {import('./CanvasViewport.js').CanvasViewport} viewport
	 * @param {import('./WireGraph.js').WireGraph} wireGraph
	 */
	constructor(viewport, wireGraph) {
		this.viewport = viewport;
		this.wireGraph = wireGraph;
        
		this.components = [];
		this.pinNodeIdsByComponent = new Map(); // componentId -> Map(pinId -> nodeId)
        
		// Dragging state
		this.isDragging = false;
		this.dragComponent = null;
		this.dragStartWorld = null;
		this.dragStartPos = null;
        
		// Appearance
		this.bodyStroke = '#111111';
		this.bodyFill = '#ffffff';
		this.pinFill = '#111111';
		this.pinRadius = 3.5;
		this.hitPadding = 2;
		this.pinHitTolerance = 6;
        
		this._setupEventHandlers();
		this._setupRendering();
	}
    
	// ==================== Public API ====================
    
	/**
	 * Add a component instance and register its pins with the wire graph
	 * @param {import('./Component.js').Component} component
	 */
	addComponent(component) {
		this.components.push(component);
		this._registerComponentPins(component);
		this.viewport.render();
	}
    
	/**
	 * Convenience: add a basic square component
	 * @param {Object} options
	 */
	addBasicSquare(options) {
		const component = createBasicSquareComponent(options);
		this.addComponent(component);
		return component;
	}
    
	// ==================== Event Handling ====================
    
	_setupEventHandlers() {
		const originalOnMouseDown = this.viewport.onMouseDown;
		const originalOnMouseMove = this.viewport.onMouseMove;
		const originalOnMouseUp = this.viewport.onMouseUp;
        
		this.viewport.onMouseDown = (worldX, worldY, event) => {
			if (this._onMouseDown(worldX, worldY, event)) {
				event.__componentHandled = true;
			}
			originalOnMouseDown?.(worldX, worldY, event);
		};
        
		this.viewport.onMouseMove = (worldX, worldY, event) => {
			if (this._onMouseMove(worldX, worldY, event)) {
				event.__componentHandled = true;
			}
			originalOnMouseMove?.(worldX, worldY, event);
		};
        
		this.viewport.onMouseUp = (worldX, worldY, event) => {
			if (this._onMouseUp(worldX, worldY, event)) {
				event.__componentHandled = true;
			}
			originalOnMouseUp?.(worldX, worldY, event);
		};
	}
    
	_onMouseDown(worldX, worldY, event) {
		if (event.button !== 0) return false;
		if (event.shiftKey) return false;
        
		const snapped = this.viewport.snapToGrid(worldX, worldY);
		const hit = this._getComponentAt(snapped.x, snapped.y);
		if (!hit) return false;
        
		// If mouse is near a pin, let wire editor handle
		const pin = hit.getPinAt(snapped.x, snapped.y, this.pinHitTolerance);
		if (pin) return false;
        
		this.isDragging = true;
		this.dragComponent = hit;
		this.dragStartWorld = { x: snapped.x, y: snapped.y };
		this.dragStartPos = { x: hit.x, y: hit.y };
		return true;
	}
    
	_onMouseMove(worldX, worldY, event) {
		if (!this.isDragging || !this.dragComponent) return false;
		const snapped = this.viewport.snapToGrid(worldX, worldY);
        
		const dx = snapped.x - this.dragStartWorld.x;
		const dy = snapped.y - this.dragStartWorld.y;
        
		this.dragComponent.x = this.dragStartPos.x + dx;
		this.dragComponent.y = this.dragStartPos.y + dy;
        
		this._syncComponentPins(this.dragComponent);
		this.viewport.render();
		return true;
	}
    
	_onMouseUp(worldX, worldY, event) {
		if (!this.isDragging) return false;
        
		this.isDragging = false;
		this.dragComponent = null;
		this.dragStartWorld = null;
		this.dragStartPos = null;
        
		this.wireGraph.cleanup();
        
		this.viewport.render();
		return true;
	}
    
	// ==================== Rendering ====================
    
	_setupRendering() {
		const originalOnRender = this.viewport.onRender;
		this.viewport.onRender = (ctx, viewport) => {
			originalOnRender?.(ctx, viewport);
			this._renderComponents(ctx, viewport);
		};
	}
    
	_renderComponents(ctx, viewport) {
		for (const component of this.components) {
			viewport.drawRect(component.x, component.y, component.width, component.height, this.bodyFill, this.bodyStroke, 2);
            
			for (const pin of component.pins) {
				const pos = component.getPinWorldPosition(pin);
				viewport.drawCircle(pos.x, pos.y, this.pinRadius / viewport.zoom, this.pinFill, null, 0);
			}
		}
	}
    
	// ==================== Pin Registration ====================
    
	_registerComponentPins(component) {
		const map = new Map();
		for (const pin of component.pins) {
			const pos = component.getPinWorldPosition(pin);
			const nodeId = this.wireGraph.addNode(pos.x, pos.y);
			const node = this.wireGraph.getNode(nodeId);
			if (node) {
				node.isComponentPin = true;
				node.componentId = component.id;
				node.pinId = pin.id;
			}
			map.set(pin.id, nodeId);
		}
		this.pinNodeIdsByComponent.set(component.id, map);
	}
    
	_syncComponentPins(component) {
		const map = this.pinNodeIdsByComponent.get(component.id);
		if (!map) return;
        
		for (const pin of component.pins) {
			const nodeId = map.get(pin.id);
			if (!nodeId) continue;
			const pos = component.getPinWorldPosition(pin);
			this.wireGraph.updateNode(nodeId, pos.x, pos.y);
			this._reroutePinConnections(nodeId);
		}
	}
    
	_reroutePinConnections(pinNodeId) {
		const pinNode = this.wireGraph.getNode(pinNodeId);
		if (!pinNode) return;
        
		const connectedIds = this.wireGraph.getConnectedNodes(pinNodeId);
		for (const connectedId of connectedIds) {
			const connectedNode = this.wireGraph.getNode(connectedId);
			if (!connectedNode) continue;
            
			// Already orthogonal
			if (pinNode.x === connectedNode.x || pinNode.y === connectedNode.y) {
				continue;
			}
            
			const connectedNeighbors = this.wireGraph.getConnectedNodes(connectedId);
			const isJunction = !connectedNode.isComponentPin && connectedNeighbors.length >= 3;
			if (isJunction) {
				if (this._trySlideJunction(connectedId, pinNodeId)) {
					continue;
				}
			}

			const isBendNode = !connectedNode.isComponentPin && connectedNeighbors.length === 2 && connectedNeighbors.includes(pinNodeId);
			if (isBendNode) {
				const otherEndpointId = connectedNeighbors[0] === pinNodeId ? connectedNeighbors[1] : connectedNeighbors[0];
				const otherEndpoint = this.wireGraph.getNode(otherEndpointId);
				if (!otherEndpoint) continue;
				const bendPos = this._chooseBendPosition(pinNode, otherEndpoint, connectedNode);
				this.wireGraph.updateNode(connectedId, bendPos.x, bendPos.y);
				continue;
			}
            
			// Insert a bend node to keep the path orthogonal
			const bendPos = this._chooseBendPosition(pinNode, connectedNode, null);
			const bendNodeId = this.wireGraph.addNode(bendPos.x, bendPos.y);
			const bendNode = this.wireGraph.getNode(bendNodeId);
			if (bendNode) {
				bendNode.isBend = true;
			}
            
			this.wireGraph.removeSegment(pinNodeId, connectedId);
			this.wireGraph.addSegment(pinNodeId, bendNodeId);
			this.wireGraph.addSegment(bendNodeId, connectedId);
		}
	}
    
	_trySlideJunction(junctionId, movingPinId) {
		const junction = this.wireGraph.getNode(junctionId);
		const movingPin = this.wireGraph.getNode(movingPinId);
		if (!junction || !movingPin) return false;
        
		const neighbors = this.wireGraph.getConnectedNodes(junctionId);
		if (neighbors.length < 3) return false;
        
		const candidateA = { x: movingPin.x, y: junction.y };
		const candidateB = { x: junction.x, y: movingPin.y };
        
		const validA = this._isJunctionPositionValid(neighbors, candidateA);
		const validB = this._isJunctionPositionValid(neighbors, candidateB);
        
		if (!validA && !validB) return false;
        
		let chosen = candidateA;
		if (validA && validB) {
			const scoreA = this._junctionTotalManhattan(neighbors, candidateA);
			const scoreB = this._junctionTotalManhattan(neighbors, candidateB);
			chosen = scoreA <= scoreB ? candidateA : candidateB;
		} else if (validB) {
			chosen = candidateB;
		}
        
		this.wireGraph.updateNode(junctionId, chosen.x, chosen.y);
		return true;
	}
    
	_isJunctionPositionValid(neighborIds, candidate) {
		for (const neighborId of neighborIds) {
			const neighbor = this.wireGraph.getNode(neighborId);
			if (!neighbor) return false;
			if (neighbor.x !== candidate.x && neighbor.y !== candidate.y) {
				return false;
			}
		}
		return true;
	}
    
	_junctionTotalManhattan(neighborIds, candidate) {
		let total = 0;
		for (const neighborId of neighborIds) {
			const neighbor = this.wireGraph.getNode(neighborId);
			if (!neighbor) continue;
			total += Math.abs(neighbor.x - candidate.x) + Math.abs(neighbor.y - candidate.y);
		}
		return total;
	}
    
	_chooseBendPosition(nodeA, nodeB, existingBend) {
		const candidate1 = { x: nodeA.x, y: nodeB.y };
		const candidate2 = { x: nodeB.x, y: nodeA.y };
        
		if (existingBend) {
			const d1 = Math.hypot(existingBend.x - candidate1.x, existingBend.y - candidate1.y);
			const d2 = Math.hypot(existingBend.x - candidate2.x, existingBend.y - candidate2.y);
			return d1 <= d2 ? candidate1 : candidate2;
		}
        
		const dx = Math.abs(nodeB.x - nodeA.x);
		const dy = Math.abs(nodeB.y - nodeA.y);
		return dx >= dy ? candidate1 : candidate2;
	}
    
	// ==================== Hit Testing ====================
    
	_getComponentAt(worldX, worldY) {
		for (let i = this.components.length - 1; i >= 0; i--) {
			const component = this.components[i];
			if (component.hitTest(worldX, worldY, this.hitPadding)) {
				return component;
			}
		}
		return null;
	}
}

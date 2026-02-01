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
		this.svgCache = new Map(); // definitionId -> svg render data
		this.selectedComponentIds = new Set();
        
		// Dragging state
		this.isDragging = false;
		this.dragComponent = null;
		this.dragStartWorld = null;
		this.dragStartPos = null;
		this.isLabelDragging = false;
		this.dragLabelInfo = null;
		this.hoverLabelHit = null;
				this.hoverComponent = null;
        
		// Appearance
		this.bodyStroke = '#111111';
		this.bodyFill = '#ffffff';
		this.pinFill = '#111111';
		this.pinRadius = 3.5;
		this.floatingPinColor = '#ef4444';
		this.hitPadding = 2;
		this.pinHitTolerance = 6;
		this.ghostFill = '#e2e8f0';
		this.ghostStroke = '#94a3b8';
		this.ghostPin = '#64748b';
		this.ghostOpacity = 0.45;
        
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
	 * Remove a component by ID and unregister its pins from the wire graph
	 * @param {string} componentId
	 */
	removeComponent(componentId) {
		const index = this.components.findIndex(c => c.id === componentId);
		if (index === -1) return;
		
		// Unregister pins from wire graph
		const pinMap = this.pinNodeIdsByComponent.get(componentId);
		if (pinMap) {
			for (const nodeId of pinMap.values()) {
				this.wireGraph.removeNode(nodeId);
			}
			this.pinNodeIdsByComponent.delete(componentId);
		}
		
		// Remove from components array
		this.components.splice(index, 1);
		this.selectedComponentIds.delete(componentId);
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

	/**
	 * Render a translucent preview of a component at the given position.
	 * @param {CanvasRenderingContext2D} ctx
	 * @param {import('./CanvasViewport.js').CanvasViewport} viewport
	 * @param {import('./Component.js').Component} component
	 */
	renderGhostComponent(ctx, viewport, component) {
		if (!component) return;
		ctx.save();
		ctx.globalAlpha = this.ghostOpacity;

		const svgEntry = this._getSvgEntry(component);
		if (svgEntry?.ready) {
			this._renderSvgComponent(ctx, viewport, component, svgEntry);
		} else {
			const bounds = component.getBounds();
			viewport.drawRect(bounds.x, bounds.y, bounds.width, bounds.height, this.ghostFill, this.ghostStroke, 1.5);
		}

		for (const pin of component.pins) {
			const pos = component.getPinWorldPosition(pin);
			viewport.drawCircle(pos.x, pos.y, this.pinRadius / viewport.zoom, this.ghostPin, null, 0);
		}

		ctx.restore();
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
		if (event?.__selectionHandled) return false;
		if (event.button !== 0) return false;
		if (event.shiftKey) return false;
        
		const labelHit = this._findLabelHit(worldX, worldY);
		if (labelHit) {
			this.isLabelDragging = true;
			this.dragLabelInfo = {
				component: labelHit.component,
				labelType: labelHit.labelType,
				labelIndex: labelHit.labelIndex,
				offset: {
					dx: worldX - labelHit.position.x,
					dy: worldY - labelHit.position.y
				}
			};
			return true;
		}
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
		if (event?.__selectionHandled) return false;
		if (this.isLabelDragging && this.dragLabelInfo) {
			const { component, labelType, labelIndex, offset } = this.dragLabelInfo;
			const targetX = worldX - offset.dx;
			const targetY = worldY - offset.dy;
			this._setLabelOverride(component, labelType, labelIndex, {
				x: targetX - component.x,
				y: targetY - component.y
			});
			this.viewport.render();
			return true;
		}

		// Hover detection for labels when not dragging
		const prevHoverLabel = this.hoverLabelHit;
		const prevHoverComponent = this.hoverComponent;

		this.hoverLabelHit = this._findLabelHit(worldX, worldY, 4 / this.viewport.zoom);

		if (!this.isDragging && !this.isLabelDragging) {
			this.hoverComponent = this.hoverLabelHit ? null : this._getComponentAt(worldX, worldY);
		} else {
			this.hoverComponent = null;
		}

		if (prevHoverLabel !== this.hoverLabelHit || prevHoverComponent !== this.hoverComponent) {
			this.viewport.render();
		}
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
		if (event?.__selectionHandled) return false;
		if (this.isLabelDragging) {
			this.isLabelDragging = false;
			this.dragLabelInfo = null;
			return true;
		}
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
			const isSelected = this.selectedComponentIds.has(component.id);
			const isHovered = !isSelected && !this.isDragging && !this.isLabelDragging && this.hoverComponent === component;
			if (isSelected) {
				const bounds = component.getBounds();
				const pad = 4 / viewport.zoom;
				const radius = 4 / viewport.zoom;
				viewport.drawRoundedRect(
					bounds.x - pad,
					bounds.y - pad,
					bounds.width + pad * 2,
					bounds.height + pad * 2,
					radius,
					'rgba(59, 130, 246, 0.08)',
					'#2563eb',
					2
				);
			}
			if (isHovered) {
				const bounds = component.getBounds();
				const pad = 3 / viewport.zoom;
				const radius = 4 / viewport.zoom;
				viewport.drawRoundedRect(
					bounds.x - pad,
					bounds.y - pad,
					bounds.width + pad * 2,
					bounds.height + pad * 2,
					radius,
					null,
					'rgba(59, 130, 246, 0.9)',
					1.25
				);
			}

			const svgEntry = this._getSvgEntry(component);
			if (svgEntry?.ready) {
				this._renderSvgComponent(ctx, viewport, component, svgEntry);
			} else {
				const bounds = component.getBounds();
				viewport.drawRect(bounds.x, bounds.y, bounds.width, bounds.height, this.bodyFill, this.bodyStroke, 2);
			}
            
			for (const pin of component.pins) {
				const pos = component.getPinWorldPosition(pin);
				const nodeId = this._getPinNodeId(component.id, pin.id);
				const isFloating = this._isPinFloating(nodeId);
				const fill = isFloating ? this.floatingPinColor : this.pinFill;
				viewport.drawCircle(pos.x, pos.y, this.pinRadius / viewport.zoom, fill, null, 0);
				this._renderPinLabel(ctx, viewport, component, pin, pos);
			}

			this._renderComponentLabels(ctx, viewport, component);
		}
	}

	_getLabelPosition(component, labelType, labelsOverride = null) {
		const labels = labelsOverride ?? component.meta?.labels;
		if (!labels) return null;
		const labelIndex = component.getLabelIndex ? component.getLabelIndex() : 0;
		const overrides = component.meta?.labelOverrides;
		const overridePos = overrides?.[labelType]?.[labelIndex];
		const basePos = labels?.[labelType]?.[labelIndex];
		const pos = overridePos ?? basePos;
		if (!pos) return null;

		const baseOrientation = labelIndex === 1 ? 90 : 0;
		const rotation = component.rotation || 0;
		const relativeRotation = ((rotation - baseOrientation) % 360 + 360) % 360;
		// Use original dimensions for label position calculations
		const origDims = component.getOriginalDimensions ? component.getOriginalDimensions() : { width: component.width, height: component.height };
		const cx = origDims.width / 2;
		const cy = origDims.height / 2;
		let dx = pos.x - cx;
		let dy = pos.y - cy;

		switch (relativeRotation) {
			case 90: {
				const tmp = dx;
				dx = -dy;
				dy = tmp;
				break;
			}
			case 180:
				dx = -dx;
				dy = -dy;
				break;
			case 270: {
				const tmp = dx;
				dx = dy;
				dy = -tmp;
				break;
			}
			default:
				break;
		}

		// Calculate world position using the actual bounding box center
		const bounds = component.getBounds();
		const worldCenterX = bounds.x + bounds.width / 2;
		const worldCenterY = bounds.y + bounds.height / 2;

		return {
			x: worldCenterX + dx,
			y: worldCenterY + dy,
			labelIndex
		};
	}

	_getLabelBounds(component, labelType, text, extraPadding = 0) {
		if (!text) return null;
		const position = this._getLabelPosition(component, labelType);
		if (!position) return null;
		const ctx = this.viewport.ctx;
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.font = '8px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
		const metrics = ctx.measureText(String(text));
		ctx.restore();
		const fontSize = 8;
				const padding = (6 / this.viewport.zoom) + extraPadding; // wider hit box for easier grabbing
				const widthWorld = Math.max((metrics.width || 0), 10);
				const heightWorld = Math.max(fontSize, 8);
		return {
			x: position.x - widthWorld / 2 - padding,
			y: position.y - heightWorld / 2 - padding,
			width: widthWorld + padding * 2,
			height: heightWorld + padding * 2,
			labelIndex: position.labelIndex,
			position
		};
	}

	_getSvgEntry(component) {
		const definitionId = component.meta?.definitionId;
		const svg = component.meta?.svg;
		if (!definitionId || !svg) return null;
		if (this.svgCache.has(definitionId)) return this.svgCache.get(definitionId);

		const parser = new DOMParser();
		const doc = parser.parseFromString(svg, 'image/svg+xml');
		const svgEl = doc.querySelector('svg');
		if (!svgEl) return null;

		const viewBox = (svgEl.getAttribute('viewBox') || '').split(/\s+/).map(Number);
		const viewBoxWidth = Number.isFinite(viewBox[2]) ? viewBox[2] : (parseFloat(svgEl.getAttribute('width')) || 0);
		const viewBoxHeight = Number.isFinite(viewBox[3]) ? viewBox[3] : (parseFloat(svgEl.getAttribute('height')) || 0);
		const compWidth = parseFloat(svgEl.getAttribute('data-comp-width')) || component.width;
		const compHeight = parseFloat(svgEl.getAttribute('data-comp-height')) || component.height;
		const offsetX = parseFloat(svgEl.getAttribute('data-offset-x')) || 0;
		const offsetY = parseFloat(svgEl.getAttribute('data-offset-y')) || 0;

		const entry = {
			image: new Image(),
			viewBoxWidth,
			viewBoxHeight,
			compWidth,
			compHeight,
			offsetX,
			offsetY,
			ready: false
		};

		const blob = new Blob([svg], { type: 'image/svg+xml' });
		const url = URL.createObjectURL(blob);
		entry.image.onload = () => {
			entry.ready = true;
			URL.revokeObjectURL(url);
			this.viewport.render();
		};
		entry.image.onerror = () => {
			URL.revokeObjectURL(url);
		};
		entry.image.src = url;

		this.svgCache.set(definitionId, entry);
		return entry;
	}

	_renderSvgComponent(ctx, viewport, component, svgEntry) {
		const rotation = component.rotation || 0;
		const origDims = component.getOriginalDimensions ? component.getOriginalDimensions() : { width: component.width, height: component.height };
		
		// Use original dimensions for scale calculation
		const scaleX = origDims.width / svgEntry.compWidth;
		const scaleY = origDims.height / svgEntry.compHeight;
		const drawWidth = svgEntry.viewBoxWidth * scaleX;
		const drawHeight = svgEntry.viewBoxHeight * scaleY;
		const drawX = component.x - svgEntry.offsetX * scaleX;
		const drawY = component.y - svgEntry.offsetY * scaleY;

		const screen = viewport.worldToScreen(drawX, drawY);
		
		// Apply rotation if needed
		if (rotation !== 0) {
			ctx.save();
			// Calculate center of the component's bounding box in screen coordinates
			const centerX = screen.x + (drawWidth * viewport.zoom) / 2;
			const centerY = screen.y + (drawHeight * viewport.zoom) / 2;
			ctx.translate(centerX, centerY);
			ctx.rotate((rotation * Math.PI) / 180);
			ctx.translate(-centerX, -centerY);
		}
		
		ctx.drawImage(
			svgEntry.image,
			screen.x,
			screen.y,
			drawWidth * viewport.zoom,
			drawHeight * viewport.zoom
		);
		
		if (rotation !== 0) {
			ctx.restore();
		}
	}

	_renderComponentLabels(ctx, viewport, component) {
		const labels = component.meta?.labels;
		const designatorText = component.meta?.designatorText ?? '';
		const designatorDisplay = designatorText
			|| component.meta?.definition?.designator?.prefix
			|| component.meta?.definition?.name
			|| component.name
			|| component.id;
		const valueText = component.meta?.valueText;

		// If no label metadata, fall back to center positions
		const fallbackLabels = {
			designator: [{ x: component.x + component.width / 2, y: component.y - 6 }],
			value: [{ x: component.x + component.width / 2, y: component.y + component.height + 6 }]
		};
		const labelsOrFallback = labels || fallbackLabels;

		viewport.beginWorldPath();
		ctx.fillStyle = '#111111';
		ctx.font = '8px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';

		const designatorPos = this._getLabelPosition(component, 'designator', labelsOrFallback);
		if (designatorPos && designatorDisplay) {
			ctx.fillText(designatorDisplay, designatorPos.x, designatorPos.y);
			this._maybeRenderLabelHover(ctx, component, 'designator', designatorDisplay);
		}

		const valuePos = this._getLabelPosition(component, 'value', labelsOrFallback);
		const isSubcircuit = component.meta?.definition?.componentType === 'subcircuit';
		const fallbackValue = isSubcircuit ? (component.meta?.definition?.name || component.meta?.definitionId || '') : '';
		const valueDisplay = (valueText !== null && valueText !== undefined && valueText !== '')
			? valueText
			: fallbackValue;
		if (valuePos && valueDisplay) {
			ctx.fillText(String(valueDisplay), valuePos.x, valuePos.y);
			this._maybeRenderLabelHover(ctx, component, 'value', valueDisplay);
		}

		viewport.endWorldPath();
	}

	_maybeRenderLabelHover(ctx, component, labelType, text) {
		if (!this.hoverLabelHit) return;
		if (this.hoverLabelHit.component !== component) return;
		if (this.hoverLabelHit.labelType !== labelType) return;
		const bounds = this._getLabelBounds(component, labelType, text);
		if (!bounds) return;
		ctx.save();
			const radius = 2; // slightly tighter corners than component outlines
		const x = bounds.x;
		const y = bounds.y;
		const w = bounds.width;
		const h = bounds.height;
		const r = Math.min(radius, w / 2, h / 2);
			ctx.strokeStyle = 'rgba(59, 130, 246, 0.9)';
			ctx.lineWidth = 1 / this.viewport.zoom; // keep stroke roughly 1px in screen space
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.lineTo(x + w - r, y);
		ctx.arcTo(x + w, y, x + w, y + r, r);
		ctx.lineTo(x + w, y + h - r);
		ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
		ctx.lineTo(x + r, y + h);
		ctx.arcTo(x, y + h, x, y + h - r, r);
		ctx.lineTo(x, y + r);
		ctx.arcTo(x, y, x + r, y, r);
		ctx.stroke();
		ctx.restore();
	}

	_renderPinLabel(ctx, viewport, component, pin, pinPos) {
		const isSubcircuit = component.meta?.definition?.componentType === 'subcircuit';
		if (!isSubcircuit) return;
		if (!pin.labelOffset) return;
		viewport.beginWorldPath();
		ctx.fillStyle = '#111111';
		ctx.font = '6px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
		const labelX = component.x + pin.labelOffset.x;
		const labelY = component.y + pin.labelOffset.y;
		if (pin.labelOffset.x < pin.offset.x) {
			ctx.textAlign = 'right';
		} else if (pin.labelOffset.x > pin.offset.x) {
			ctx.textAlign = 'left';
		} else {
			ctx.textAlign = 'center';
		}
		ctx.textBaseline = 'middle';
		ctx.fillText(pin.name ?? '', labelX, labelY);
		viewport.endWorldPath();
	}

	_getPinNodeId(componentId, pinId) {
		return this.pinNodeIdsByComponent.get(componentId)?.get(pinId) ?? null;
	}

	_isPinFloating(nodeId) {
		if (!nodeId) return true;
		const node = this.wireGraph.getNode(nodeId);
		if (!node) return true;
		return this.wireGraph.getConnectionCount(nodeId) === 0;
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

	_setLabelOverride(component, labelType, labelIndex, pos) {
		if (!component.meta) component.meta = {};
		if (!component.meta.labelOverrides) component.meta.labelOverrides = {};
		const arr = Array.isArray(component.meta.labelOverrides[labelType]) ? component.meta.labelOverrides[labelType] : [];
		arr[labelIndex] = { x: pos.x, y: pos.y };
		component.meta.labelOverrides[labelType] = arr;
	}

	_findLabelHit(worldX, worldY, extraPadding = 0) {
		for (let i = this.components.length - 1; i >= 0; i--) {
			const component = this.components[i];
			const designatorBounds = this._getLabelBounds(component, 'designator', component.meta?.designatorText ?? '', extraPadding);
			if (designatorBounds && this._pointInRect(worldX, worldY, designatorBounds)) {
				return { component, labelType: 'designator', labelIndex: designatorBounds.labelIndex, position: designatorBounds.position };
			}
			const valueText = component.meta?.valueText;
			if (valueText !== null && valueText !== undefined && valueText !== '') {
				const valueBounds = this._getLabelBounds(component, 'value', valueText, extraPadding);
				if (valueBounds && this._pointInRect(worldX, worldY, valueBounds)) {
					return { component, labelType: 'value', labelIndex: valueBounds.labelIndex, position: valueBounds.position };
				}
			}
		}
		return null;
	}

	findLabelHit(worldX, worldY) {
		return this._findLabelHit(worldX, worldY);
	}

	_pointInRect(x, y, rect) {
		return (
			x >= rect.x &&
			x <= rect.x + rect.width &&
			y >= rect.y &&
			y <= rect.y + rect.height
		);
	}

	getComponentAt(worldX, worldY) {
		return this._getComponentAt(worldX, worldY);
	}

	setSelectedComponents(componentIds) {
		this.selectedComponentIds = componentIds ? new Set(componentIds) : new Set();
		this.viewport.render();
	}

	syncComponentPins(component) {
		this._syncComponentPins(component);
	}

	// ==================== Serialization ====================

	/**
	 * Serialize all components to JSON
	 * @returns {Array}
	 */
	toJSON() {
		return this.components.map(component => ({
			id: component.id,
			name: component.name,
			x: component.x,
			y: component.y,
			width: component.width,
			height: component.height,
			rotation: component.rotation,
			pins: component.pins,
			meta: component.meta
		}));
	}

	/**
	 * Load components from JSON
	 * @param {Array} data
	 * @param {Function} ComponentClass - The Component class constructor
	 */
	fromJSON(data, ComponentClass) {
		// Clear existing components
		this.components = [];
		this.pinNodeIdsByComponent.clear();

		// Recreate components
		for (const compData of data) {
			const component = new ComponentClass({
				id: compData.id,
				name: compData.name,
				x: compData.x,
				y: compData.y,
				width: compData.width,
				height: compData.height,
				pins: compData.pins,
				meta: compData.meta,
				rotation: compData.rotation
			});
			this.components.push(component);
			this._registerComponentPins(component);
		}
	}
}

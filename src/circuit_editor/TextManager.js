/**
 * TextManager - Manages text annotations on the circuit schematic
 * 
 * Text objects have position, content, and styling.
 * Can be dragged, selected, and deleted like components.
 */

export class TextManager {
    /**
     * @param {import('./CanvasViewport.js').CanvasViewport} viewport
     * @param {object} options
     */
    constructor(viewport, options = {}) {
        this.viewport = viewport;
        this.isTextDragEnabled = options.isTextDragEnabled || (() => true);
        
        this.texts = []; // Array of text objects
        this.selectedTextIds = new Set();
        
        // Dragging state
        this.isDragging = false;
        this.dragText = null;
        this.dragStartWorld = null;
        this.dragStartPos = null;
        this.hoverText = null;
        
        // Appearance
        this.textColor = '#000000';
        this.fontSize = 14; // Default font size
        this.fontFamily = 'monospace';
        this.hitPadding = 4;
        this.selectedColor = '#2563eb';
        
        this._setupEventHandlers();
        this._setupRendering();
    }
    
    // ==================== Public API ====================
    
    /**
     * Add a text object
     * @param {Object} options
     * @param {string} options.id
     * @param {number} options.x - World coordinates
     * @param {number} options.y - World coordinates
     * @param {string} options.content - Text content
     * @param {number} [options.fontSize] - Font size
     * @param {string} [options.color] - Text color
     */
    addText(options) {
        const text = {
            id: options.id,
            x: options.x,
            y: options.y,
            content: options.content || '',
            fontSize: options.fontSize || this.fontSize,
            color: options.color || this.textColor
        };
        this.texts.push(text);
        this.viewport.render();
        return text;
    }
    
    /**
     * Remove a text object by ID
     * @param {string} textId
     */
    removeText(textId) {
        const index = this.texts.findIndex(t => t.id === textId);
        if (index === -1) return null;
        
        const removed = this.texts.splice(index, 1)[0];
        this.selectedTextIds.delete(textId);
        this.viewport.render();
        return removed;
    }
    
    /**
     * Get text object by ID
     * @param {string} textId
     */
    getText(textId) {
        return this.texts.find(t => t.id === textId);
    }
    
    /**
     * Update text content
     * @param {string} textId
     * @param {string} content
     */
    updateTextContent(textId, content) {
        const text = this.getText(textId);
        if (text) {
            text.content = content;
            this.viewport.render();
        }
    }
    
    /**
     * Get text at world position
     * @param {number} worldX
     * @param {number} worldY
     */
    getTextAt(worldX, worldY) {
        // Check in reverse order (top-most first)
        for (let i = this.texts.length - 1; i >= 0; i--) {
            const text = this.texts[i];
            const bounds = this._getTextBounds(text);
            if (bounds && this._hitTest(worldX, worldY, bounds)) {
                return text;
            }
        }
        return null;
    }
    
    /**
     * Clear all texts
     */
    clear() {
        this.texts = [];
        this.selectedTextIds.clear();
        this.viewport.render();
    }
    
    /**
     * Serialize to JSON
     */
    toJSON() {
        return this.texts.map(t => ({
            id: t.id,
            x: t.x,
            y: t.y,
            content: t.content,
            fontSize: t.fontSize,
            color: t.color
        }));
    }
    
    /**
     * Deserialize from JSON
     */
    fromJSON(data) {
        this.texts = (data || []).map(t => ({
            id: t.id,
            x: t.x,
            y: t.y,
            content: t.content || '',
            fontSize: t.fontSize || this.fontSize,
            color: t.color || this.textColor
        }));
        this.selectedTextIds.clear();
    }
    
    // ==================== Event Handlers ====================
    
    _setupEventHandlers() {
        const originalOnMouseDown = this.viewport.onMouseDown;
        const originalOnMouseMove = this.viewport.onMouseMove;
        const originalOnMouseUp = this.viewport.onMouseUp;
        
        this.viewport.onMouseDown = (worldX, worldY, event) => {
            const handled = this._onMouseDown(worldX, worldY, event);
            if (!handled) {
                originalOnMouseDown?.(worldX, worldY, event);
            }
        };
        
        this.viewport.onMouseMove = (worldX, worldY, event) => {
            this._onMouseMove(worldX, worldY, event);
            originalOnMouseMove?.(worldX, worldY, event);
        };
        
        this.viewport.onMouseUp = (worldX, worldY, event) => {
            const handled = this._onMouseUp(worldX, worldY, event);
            if (!handled) {
                originalOnMouseUp?.(worldX, worldY, event);
            }
        };
    }
    
    _onMouseDown(worldX, worldY, event) {
        if (!this.isTextDragEnabled()) return false;
        if (event?.__selectionHandled) return false;
        if (event?.__componentHandled) return false;
        if (event?.__textHandled) return false;
        if (event.button !== 0) return false;
        
        const hitText = this.getTextAt(worldX, worldY);
        
        if (hitText) {
            // Prepare for drag
            this.dragText = hitText;
            this.dragStartWorld = { x: worldX, y: worldY };
            this.dragStartPos = { x: hitText.x, y: hitText.y };
            event.__textHandled = true;
            return true;
        }
        
        return false;
    }
    
    _onMouseMove(worldX, worldY, event) {
        if (!this.isTextDragEnabled()) return;
        if (event?.__selectionHandled) return;
        if (event?.__componentHandled) return;
        
        // Handle dragging
        if (this.dragText && this.dragStartWorld) {
            const dx = worldX - this.dragStartWorld.x;
            const dy = worldY - this.dragStartWorld.y;
            
            // Check if we've moved enough to start dragging
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 2 / this.viewport.zoom || this.isDragging) {
                this.isDragging = true;
                this.dragText.x = this.dragStartPos.x + dx;
                this.dragText.y = this.dragStartPos.y + dy;
                this.viewport.render();
            }
            return;
        }
        
        // Update hover state
        const hitText = this.getTextAt(worldX, worldY);
        if (hitText !== this.hoverText) {
            this.hoverText = hitText;
            this.viewport.render();
        }
    }
    
    _onMouseUp(worldX, worldY, event) {
        if (event?.__textHandled) return false;
        
        if (this.dragText) {
            if (!this.isDragging) {
                // Was a click, not a drag - select the text
                this.selectedTextIds.clear();
                this.selectedTextIds.add(this.dragText.id);
            }
            
            this.isDragging = false;
            this.dragText = null;
            this.dragStartWorld = null;
            this.dragStartPos = null;
            this.viewport.render();
            return true;
        }
        
        return false;
    }
    
    // ==================== Rendering ====================
    
    _setupRendering() {
        const originalOnRender = this.viewport.onRender;
        this.viewport.onRender = (ctx, viewport) => {
            originalOnRender?.(ctx, viewport);
            this._render(ctx, viewport);
        };
    }
    
    _render(ctx, viewport) {
        if (this.texts.length === 0) return;
        
        ctx.save();
        
        for (const text of this.texts) {
            this._renderText(ctx, viewport, text);
        }
        
        ctx.restore();
    }
    
    _renderText(ctx, viewport, text) {
        const isSelected = this.selectedTextIds.has(text.id);
        const isHovered = this.hoverText === text;
        const bounds = this._getTextScreenBounds(text, ctx, viewport.zoom);
        if (!bounds) return;
        
        ctx.save();
        
        // Set font
        ctx.font = `${bounds.fontSize}px ${this.fontFamily}`;
        ctx.textBaseline = 'top';
        
        // Draw background if selected or hovered
        if (isSelected || isHovered) {
            ctx.fillStyle = isSelected ? 'rgba(37, 99, 235, 0.1)' : 'rgba(0, 0, 0, 0.05)';
            ctx.fillRect(
                bounds.x - this.hitPadding,
                bounds.y - this.hitPadding,
                bounds.width + this.hitPadding * 2,
                bounds.height + this.hitPadding * 2
            );

            // Draw border
            ctx.strokeStyle = isSelected ? this.selectedColor : 'rgba(0, 0, 0, 0.2)';
            ctx.lineWidth = isSelected ? 2 : 1;
            ctx.strokeRect(
                bounds.x - this.hitPadding,
                bounds.y - this.hitPadding,
                bounds.width + this.hitPadding * 2,
                bounds.height + this.hitPadding * 2
            );
        }
        
        // Draw text
        ctx.fillStyle = text.color;
        ctx.fillText(text.content, bounds.x, bounds.y);
        
        ctx.restore();
    }
    
    // ==================== Utilities ====================
    
    _measureText(text, ctx = this.viewport.ctx, zoom = this.viewport.zoom) {
        const fontSize = Math.max(text.fontSize * zoom, 1);

        ctx.save();
        ctx.font = `${fontSize}px ${this.fontFamily}`;
        const metrics = ctx.measureText(text.content);
        ctx.restore();

        return {
            width: metrics.width,
            height: fontSize * 1.2,
            fontSize
        };
    }

    _getTextScreenBounds(text, ctx = this.viewport.ctx, zoom = this.viewport.zoom) {
        if (zoom <= 0) return null;

        const metrics = this._measureText(text, ctx, zoom);
        const screen = this.viewport.worldToScreen(text.x, text.y);

        return {
            x: screen.x,
            y: screen.y,
            width: metrics.width,
            height: metrics.height,
            fontSize: metrics.fontSize
        };
    }

    _getTextBounds(text, ctx = this.viewport.ctx, zoom = this.viewport.zoom) {
        if (zoom <= 0) return null;

        const metrics = this._measureText(text, ctx, zoom);

        return {
            x: text.x,
            y: text.y,
            width: metrics.width / zoom,
            height: metrics.height / zoom
        };
    }
    
    _hitTest(worldX, worldY, bounds) {
        const padding = this.hitPadding / Math.max(this.viewport.zoom, 0.0001);

        return (
            worldX >= bounds.x - padding &&
            worldX <= bounds.x + bounds.width + padding &&
            worldY >= bounds.y - padding &&
            worldY <= bounds.y + bounds.height + padding
        );
    }
}

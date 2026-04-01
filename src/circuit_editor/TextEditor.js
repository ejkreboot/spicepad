/**
 * TextEditor - Interaction layer for text editing in the circuit schematic
 * 
 * Manages text editing state and in-place text input.
 * Handles mouse/keyboard events for placing and editing text.
 * 
 * Behaviors:
 * - Click to place new text and start typing
 * - Type to add text content
 * - Enter to finish editing
 * - Escape to cancel current edit
 * - Click on existing text to edit it
 */

export class TextEditor {
    /**
     * @param {import('./CanvasViewport.js').CanvasViewport} viewport
     * @param {import('./TextManager.js').TextManager} textManager
     */
    constructor(viewport, textManager) {
        this.viewport = viewport;
        this.textManager = textManager;
        
        this.isActive = false; // Whether text tool is selected
        this.isEditing = false; // Currently editing text
        this.editingTextId = null; // ID of text being edited
        this.editBuffer = ''; // Current text being typed
        this.cursorPosition = null; // { x, y } world coordinates
        this.cursorVisible = true;
        this.cursorBlinkInterval = null;
        
        // Appearance
        this.cursorColor = '#2563eb';
        this.ghostColor = 'rgba(0, 0, 0, 0.4)';
        
        // Callbacks
        this.onStatusChange = null;
        this.onTextCreated = null; // Callback when text is created
        
        // Set up rendering callback
        const originalOnRender = this.viewport.onRender;
        this.viewport.onRender = (ctx, vp) => {
            originalOnRender?.(ctx, vp);
            this._render(ctx, vp);
        };
        
        // Set up event handlers
        this._setupEventHandlers();
        
        this._setStatus('');
    }
    
    // ==================== Public API ====================
    
    setActive(active) {
        this.isActive = active;
        if (!active) {
            this._finishEditing();
        } else {
            this._setStatus('Click to place text');
        }
        this.viewport.render();
    }
    
    /**
     * Handle keydown events for text editing
     * @param {KeyboardEvent} event
     * @returns {boolean} true if event was handled
     */
    handleKeyDown(event) {
        if (!this.isEditing) return false;
        
        // Handle special keys
        if (event.key === 'Enter') {
            this._finishEditing();
            return true;
        }
        
        if (event.key === 'Escape') {
            this._cancelEditing();
            return true;
        }
        
        if (event.key === 'Backspace') {
            event.preventDefault();
            this.editBuffer = this.editBuffer.slice(0, -1);
            this._updateEditingText();
            this.viewport.render();
            return true;
        }
        
        // Handle printable characters
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            this.editBuffer += event.key;
            this._updateEditingText();
            this.viewport.render();
            return true;
        }
        
        return false;
    }
    
    // ==================== Event Setup ====================
    
    _setupEventHandlers() {
        const originalOnMouseDown = this.viewport.onMouseDown;
        const originalOnMouseMove = this.viewport.onMouseMove;
        const originalOnClick = this.viewport.onClick;
        
        this.viewport.onMouseDown = (worldX, worldY, event) => {
            if (this._onMouseDown(worldX, worldY, event)) {
                event.__textEditorHandled = true;
            }
            originalOnMouseDown?.(worldX, worldY, event);
        };
        
        this.viewport.onMouseMove = (worldX, worldY, event) => {
            this._onMouseMove(worldX, worldY, event);
            originalOnMouseMove?.(worldX, worldY, event);
        };
        
        this.viewport.onClick = (worldX, worldY, event) => {
            this._onClick(worldX, worldY, event);
            originalOnClick?.(worldX, worldY, event);
        };
    }
    
    // ==================== Event Handlers ====================
    
    _onMouseDown(worldX, worldY, event) {
        if (event?.__selectionHandled) return false;
        if (event?.__componentHandled) return false;
        if (event?.__textHandled) return false;
        if (event.button !== 0) return false;
        if (!this.isActive) return false;
        
        // If we're currently editing, finish the current edit
        if (this.isEditing) {
            this._finishEditing();
        }
        
        return false;
    }
    
    _onMouseMove(worldX, worldY, event) {
        if (!this.isActive || this.isEditing) return;
        
        const snapped = this.viewport.snapToGrid(worldX, worldY);
        this.cursorPosition = snapped;
        this.viewport.render();
    }
    
    _onClick(worldX, worldY, event) {
        if (event?.__selectionHandled) return;
        if (event?.__componentHandled) return;
        if (event?.__textEditorHandled) return;
        if (!this.isActive) return;
        
        const snapped = this.viewport.snapToGrid(worldX, worldY);
        
        // Check if clicking on existing text
        const existingText = this.textManager.getTextAt(snapped.x, snapped.y);
        
        if (existingText) {
            // Edit existing text
            this._startEditingExisting(existingText);
        } else {
            // Create new text
            this._startEditingNew(snapped.x, snapped.y);
        }
    }
    
    // ==================== Editing Mode ====================
    
    _startEditingNew(x, y) {
        // Generate unique ID
        const id = `text_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        
        // Create text object
        this.textManager.addText({
            id,
            x,
            y,
            content: ''
        });
        
        this.isEditing = true;
        this.editingTextId = id;
        this.editBuffer = '';
        this._setStatus('Type text (Enter to finish, Escape to cancel)');
        this._startCursorBlink();
        this.viewport.render();
    }
    
    _startEditingExisting(text) {
        this.isEditing = true;
        this.editingTextId = text.id;
        this.editBuffer = text.content;
        this._setStatus('Edit text (Enter to finish, Escape to cancel)');
        this._startCursorBlink();
        this.viewport.render();
    }
    
    _updateEditingText() {
        if (!this.editingTextId) return;
        this.textManager.updateTextContent(this.editingTextId, this.editBuffer);
    }
    
    _finishEditing() {
        if (!this.isEditing) return;
        
        // If text is empty, remove it
        if (this.editBuffer.trim() === '' && this.editingTextId) {
            this.textManager.removeText(this.editingTextId);
        } else if (this.editingTextId) {
            // Fire callback if text was created
            this.onTextCreated?.(this.editingTextId);
        }
        
        this._stopCursorBlink();
        this.isEditing = false;
        this.editingTextId = null;
        this.editBuffer = '';
        this._setStatus(this.isActive ? 'Click to place text' : '');
        this.viewport.render();
    }
    
    _cancelEditing() {
        if (!this.isEditing) return;
        
        // Remove the text being edited
        if (this.editingTextId) {
            this.textManager.removeText(this.editingTextId);
        }
        
        this._stopCursorBlink();
        this.isEditing = false;
        this.editingTextId = null;
        this.editBuffer = '';
        this._setStatus(this.isActive ? 'Click to place text' : '');
        this.viewport.render();
    }
    
    // ==================== Cursor Blink ====================
    
    _startCursorBlink() {
        this._stopCursorBlink();
        this.cursorVisible = true;
        this.cursorBlinkInterval = setInterval(() => {
            this.cursorVisible = !this.cursorVisible;
            this.viewport.render();
        }, 530); // Standard cursor blink rate
    }
    
    _stopCursorBlink() {
        if (this.cursorBlinkInterval) {
            clearInterval(this.cursorBlinkInterval);
            this.cursorBlinkInterval = null;
        }
        this.cursorVisible = true;
    }
    
    // ==================== Rendering ====================
    
    _render(ctx, viewport) {
        // Render cursor preview when hovering with text tool active
        if (this.isActive && !this.isEditing && this.cursorPosition) {
            this._renderCursorPreview(ctx);
        }
        
        // Render blinking cursor when editing
        if (this.isEditing && this.cursorVisible) {
            this._renderEditingCursor(ctx);
        }
    }
    
    _renderCursorPreview(ctx) {
        if (!this.cursorPosition) return;

        const screen = this.viewport.worldToScreen(this.cursorPosition.x, this.cursorPosition.y);
        const previewFontSize = Math.max(this.textManager.fontSize * this.viewport.zoom, 1);
        
        ctx.save();
        ctx.strokeStyle = this.ghostColor;
        ctx.lineWidth = 1;
        
        // Draw crosshair at cursor position
        const size = 10;
        ctx.beginPath();
        ctx.moveTo(screen.x - size, screen.y);
        ctx.lineTo(screen.x + size, screen.y);
        ctx.moveTo(screen.x, screen.y - size);
        ctx.lineTo(screen.x, screen.y + size);
        ctx.stroke();
        
        // Draw "Abc" preview
        ctx.font = `${previewFontSize}px ${this.textManager.fontFamily}`;
        ctx.fillStyle = this.ghostColor;
        ctx.textBaseline = 'top';
        ctx.fillText('Abc', screen.x + size + 4, screen.y - previewFontSize / 2);
        
        ctx.restore();
    }
    
    _renderEditingCursor(ctx) {
        if (!this.editingTextId) return;
        
        const text = this.textManager.getText(this.editingTextId);
        if (!text) return;
        
        ctx.save();
        
        // Measure text to position cursor
        const fontSize = Math.max(text.fontSize * this.viewport.zoom, 1);
        ctx.font = `${fontSize}px ${this.textManager.fontFamily}`;
        const metrics = ctx.measureText(text.content);
        const screen = this.viewport.worldToScreen(text.x, text.y);
        
        // Draw cursor line
        ctx.strokeStyle = this.cursorColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        const cursorX = screen.x + metrics.width;
        const cursorY = screen.y;
        ctx.moveTo(cursorX, cursorY);
        ctx.lineTo(cursorX, cursorY + fontSize * 1.2);
        ctx.stroke();
        
        ctx.restore();
    }
    
    // ==================== Utilities ====================
    
    _setStatus(message) {
        this.onStatusChange?.(message);
    }
}

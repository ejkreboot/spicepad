/**
 * CanvasViewport - Manages canvas rendering, pan/zoom, coordinate transforms, and grid
 * 
 * Responsibilities:
 * - Canvas element management and DPI scaling
 * - Pan (mouse drag) and zoom (mouse wheel) transformations
 * - World ↔ Screen coordinate conversions
 * - Grid rendering with adaptive density
 * - CAD-style crosshair cursor following mouse
 * 
 * All external consumers work in world coordinates only.
 */

export class CanvasViewport {
    /**
     * @param {HTMLCanvasElement} canvas - The canvas element to manage
     * @param {Object} options - Configuration options
     */
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Configuration with defaults
        this.gridSize = options.gridSize ?? 10;
        this.minZoom = options.minZoom ?? 0.1;
        this.maxZoom = options.maxZoom ?? 10;
        this.gridColor = options.gridColor ?? '#e8e8e8';
        this.gridMajorColor = options.gridMajorColor ?? '#d0d0d0';
        this.crosshairColor = options.crosshairColor ?? 'rgba(59, 130, 246, 0.5)';
        this.backgroundColor = options.backgroundColor ?? '#fdfdfd';
        
        // Transform state (world coordinates)
        this.zoom = 1;
        this.panX = 0;  // World offset (pan position in world units) - will be set after resize
        this.panY = 0;
        this._needsCentering = true; // Flag to center on first render
        
        // Interaction state
        this.isPanning = false;
        this.lastMouseScreen = { x: 0, y: 0 };
        this.mouseWorld = { x: 0, y: 0 };
        this.showCrosshair = true;
        
        // DPI scaling
        this.dpr = window.devicePixelRatio || 1;
        
        // Event callbacks - external consumers register these
        this.onMouseMove = null;   // (worldX, worldY, event) => void
        this.onMouseDown = null;   // (worldX, worldY, event) => void
        this.onMouseUp = null;     // (worldX, worldY, event) => void
        this.onClick = null;       // (worldX, worldY, event) => void
        this.onZoomChange = null;  // (zoom) => void
        this.onRender = null;      // (ctx, viewport) => void - called during render for custom drawing
        
        this._setupCanvas();
        this._bindEvents();
    }
    
    /**
     * Setup canvas for high-DPI displays
     */
    _setupCanvas() {
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.display = 'block';
        this._scheduleResize();
        
        // Watch for container resize
        this.resizeObserver = new ResizeObserver(() => this._scheduleResize());
        this.resizeObserver.observe(this.canvas.parentElement);
    }

    _scheduleResize() {
        if (this._resizeRaf) {
            cancelAnimationFrame(this._resizeRaf);
        }
        this._resizeRaf = requestAnimationFrame(() => {
            this._resizeRaf = null;
            this._resizeCanvas();
        });
    }
    
    _resizeCanvas() {
        const parent = this.canvas.parentElement;
        const width = parent?.clientWidth ?? 0;
        const height = parent?.clientHeight ?? 0;

        if (width <= 0 || height <= 0) return;
        if (width === this.width && height === this.height) return;
        
        // Set actual size in memory (scaled for DPI)
        this.canvas.width = width * this.dpr;
        this.canvas.height = height * this.dpr;
        
        // Store logical dimensions for calculations
        this.width = width;
        this.height = height;
        
        // Center on origin on first resize
        if (this._needsCentering) {
            this.panX = width / (2 * this.zoom);
            this.panY = height / (2 * this.zoom);
            this._needsCentering = false;
        }
        
        this.render();
    }
    
    _bindEvents() {
        this.canvas.addEventListener('wheel', this._onWheel.bind(this), { passive: false });
        this.canvas.addEventListener('mousedown', this._onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this._onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this._onMouseUp.bind(this));
        this.canvas.addEventListener('mouseenter', this._onMouseEnter.bind(this));
        this.canvas.addEventListener('mouseleave', this._onMouseLeave.bind(this));
        this.canvas.addEventListener('click', this._onClick.bind(this));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    
    // ==================== Coordinate Transforms ====================
    
    /**
     * Convert screen coordinates to world coordinates
     * @param {number} screenX - Screen X position
     * @param {number} screenY - Screen Y position
     * @returns {{x: number, y: number}} World coordinates
     */
    screenToWorld(screenX, screenY) {
        return {
            x: (screenX / this.zoom) - this.panX,
            y: (screenY / this.zoom) - this.panY
        };
    }
    
    /**
     * Convert world coordinates to screen coordinates
     * @param {number} worldX - World X position
     * @param {number} worldY - World Y position
     * @returns {{x: number, y: number}} Screen coordinates
     */
    worldToScreen(worldX, worldY) {
        return {
            x: (worldX + this.panX) * this.zoom,
            y: (worldY + this.panY) * this.zoom
        };
    }
    
    /**
     * Snap world coordinates to the grid
     * @param {number} worldX 
     * @param {number} worldY 
     * @returns {{x: number, y: number}} Snapped world coordinates
     */
    snapToGrid(worldX, worldY) {
        return {
            x: Math.round(worldX / this.gridSize) * this.gridSize,
            y: Math.round(worldY / this.gridSize) * this.gridSize
        };
    }
    
    /**
     * Get current mouse position in world coordinates
     * @returns {{x: number, y: number}}
     */
    getMouseWorld() {
        return { ...this.mouseWorld };
    }
    
    /**
     * Get the visible world bounds
     * @returns {{minX: number, minY: number, maxX: number, maxY: number}}
     */
    getVisibleBounds() {
        const topLeft = this.screenToWorld(0, 0);
        const bottomRight = this.screenToWorld(this.width, this.height);
        return {
            minX: topLeft.x,
            minY: topLeft.y,
            maxX: bottomRight.x,
            maxY: bottomRight.y
        };
    }
    
    // ==================== Event Handlers ====================
    
    _onWheel(event) {
        event.preventDefault();
        
        const rect = this.canvas.getBoundingClientRect();
        const mouseScreenX = event.clientX - rect.left;
        const mouseScreenY = event.clientY - rect.top;
        
        // Get world position before zoom
        const worldBefore = this.screenToWorld(mouseScreenX, mouseScreenY);
        
        // Calculate new zoom
        const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * zoomFactor));
        
        if (newZoom !== this.zoom) {
            this.zoom = newZoom;
            
            // Adjust pan to keep mouse position fixed in world space
            const worldAfter = this.screenToWorld(mouseScreenX, mouseScreenY);
            this.panX += worldAfter.x - worldBefore.x;
            this.panY += worldAfter.y - worldBefore.y;
            
            this.onZoomChange?.(this.zoom);
            this.render();
        }
    }
    
    _onMouseDown(event) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        
        this.lastMouseScreen = { x: screenX, y: screenY };
        
        // Middle mouse button or Space+left click for panning
        if (event.button === 1 || (event.button === 0 && event.shiftKey)) {
            this.isPanning = true;
            this.canvas.style.cursor = 'grabbing';
            event.preventDefault();
            return;
        }
        
        const world = this.screenToWorld(screenX, screenY);
        this.onMouseDown?.(world.x, world.y, event);
    }
    
    _onMouseMove(event) {
        const rect = this.canvas.getBoundingClientRect();
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        
        if (this.isPanning) {
            // Pan in world coordinates
            const dx = (screenX - this.lastMouseScreen.x) / this.zoom;
            const dy = (screenY - this.lastMouseScreen.y) / this.zoom;
            this.panX += dx;
            this.panY += dy;
            this.lastMouseScreen = { x: screenX, y: screenY };
            this.render();
            return;
        }
        
        this.lastMouseScreen = { x: screenX, y: screenY };
        this.mouseWorld = this.screenToWorld(screenX, screenY);
        
        this.onMouseMove?.(this.mouseWorld.x, this.mouseWorld.y, event);
        this.render();
    }
    
    _onMouseUp(event) {
        if (this.isPanning) {
            this.isPanning = false;
            this.canvas.style.cursor = 'crosshair';
            return;
        }
        
        const rect = this.canvas.getBoundingClientRect();
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        const world = this.screenToWorld(screenX, screenY);
        
        this.onMouseUp?.(world.x, world.y, event);
    }
    
    _onClick(event) {
        if (this.isPanning) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const screenX = event.clientX - rect.left;
        const screenY = event.clientY - rect.top;
        const world = this.screenToWorld(screenX, screenY);
        
        this.onClick?.(world.x, world.y, event);
    }
    
    _onMouseEnter(event) {
        this.showCrosshair = true;
        this.render();
    }
    
    _onMouseLeave(event) {
        this.isPanning = false;
        this.canvas.style.cursor = 'crosshair';
        this.showCrosshair = false;
        this.render();
    }
    
    // ==================== Rendering ====================
    
    /**
     * Main render method - clears canvas, draws grid, invokes custom render callback, draws crosshair
     */
    render() {
        const ctx = this.ctx;
        
        // Scale for DPI
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        
        // Clear canvas
        ctx.fillStyle = this.backgroundColor;
        ctx.fillRect(0, 0, this.width, this.height);
        
        // Draw grid
        this._renderGrid();
        
        // Allow external drawing (wire editor, etc.)
        this.onRender?.(ctx, this);
        
        // Draw crosshair last (on top)
        if (this.showCrosshair && !this.isPanning) {
            this._renderCrosshair();
        }
    }
    
    _renderGrid() {
        const ctx = this.ctx;
        const bounds = this.getVisibleBounds();
        
        // Determine grid spacing based on zoom level
        let gridStep = this.gridSize;
        while (gridStep * this.zoom < 10) gridStep *= 2;
        while (gridStep * this.zoom > 100) gridStep /= 2;
        
        const majorStep = gridStep * 5;
        
        // Calculate grid line start/end positions
        const startX = Math.floor(bounds.minX / gridStep) * gridStep;
        const endX = Math.ceil(bounds.maxX / gridStep) * gridStep;
        const startY = Math.floor(bounds.minY / gridStep) * gridStep;
        const endY = Math.ceil(bounds.maxY / gridStep) * gridStep;
        
        ctx.lineWidth = 1;
        
        // Draw minor grid lines
        ctx.strokeStyle = this.gridColor;
        ctx.beginPath();
        for (let x = startX; x <= endX; x += gridStep) {
            if (x % majorStep === 0) continue;
            const screen = this.worldToScreen(x, 0);
            ctx.moveTo(Math.round(screen.x) + 0.5, 0);
            ctx.lineTo(Math.round(screen.x) + 0.5, this.height);
        }
        for (let y = startY; y <= endY; y += gridStep) {
            if (y % majorStep === 0) continue;
            const screen = this.worldToScreen(0, y);
            ctx.moveTo(0, Math.round(screen.y) + 0.5);
            ctx.lineTo(this.width, Math.round(screen.y) + 0.5);
        }
        ctx.stroke();
        
        // Draw major grid lines
        ctx.strokeStyle = this.gridMajorColor;
        ctx.beginPath();
        for (let x = startX; x <= endX; x += gridStep) {
            if (x % majorStep !== 0) continue;
            const screen = this.worldToScreen(x, 0);
            ctx.moveTo(Math.round(screen.x) + 0.5, 0);
            ctx.lineTo(Math.round(screen.x) + 0.5, this.height);
        }
        for (let y = startY; y <= endY; y += gridStep) {
            if (y % majorStep !== 0) continue;
            const screen = this.worldToScreen(0, y);
            ctx.moveTo(0, Math.round(screen.y) + 0.5);
            ctx.lineTo(this.width, Math.round(screen.y) + 0.5);
        }
        ctx.stroke();
        
        // Draw origin axes (if visible)
        if (bounds.minX <= 0 && bounds.maxX >= 0) {
            const screen = this.worldToScreen(0, 0);
            ctx.strokeStyle = 'rgba(200, 0, 0, 0.3)';
            ctx.beginPath();
            ctx.moveTo(Math.round(screen.x) + 0.5, 0);
            ctx.lineTo(Math.round(screen.x) + 0.5, this.height);
            ctx.stroke();
        }
        if (bounds.minY <= 0 && bounds.maxY >= 0) {
            const screen = this.worldToScreen(0, 0);
            ctx.strokeStyle = 'rgba(200, 0, 0, 0.3)';
            ctx.beginPath();
            ctx.moveTo(0, Math.round(screen.y) + 0.5);
            ctx.lineTo(this.width, Math.round(screen.y) + 0.5);
            ctx.stroke();
        }
    }
    
    _renderCrosshair() {
        const ctx = this.ctx;
        const screen = this.worldToScreen(this.mouseWorld.x, this.mouseWorld.y);
        
        ctx.strokeStyle = this.crosshairColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        
        // Vertical line
        ctx.beginPath();
        ctx.moveTo(Math.round(screen.x) + 0.5, 0);
        ctx.lineTo(Math.round(screen.x) + 0.5, this.height);
        ctx.stroke();
        
        // Horizontal line
        ctx.beginPath();
        ctx.moveTo(0, Math.round(screen.y) + 0.5);
        ctx.lineTo(this.width, Math.round(screen.y) + 0.5);
        ctx.stroke();
        
        ctx.setLineDash([]);
    }
    
    // ==================== Drawing Helpers (for use by editors) ====================
    
    /**
     * Begin a path in world coordinates - sets up transform
     */
    beginWorldPath() {
        this.ctx.save();
        this.ctx.translate(this.panX * this.zoom, this.panY * this.zoom);
        this.ctx.scale(this.zoom, this.zoom);
    }
    
    /**
     * End world coordinate path - restores transform
     */
    endWorldPath() {
        this.ctx.restore();
    }
    
    /**
     * Draw a line in world coordinates
     * @param {number} x1 
     * @param {number} y1 
     * @param {number} x2 
     * @param {number} y2 
     * @param {string} color 
     * @param {number} lineWidth - in screen pixels (not world units)
     */
    drawLine(x1, y1, x2, y2, color = '#333', lineWidth = 2) {
        const ctx = this.ctx;
        const start = this.worldToScreen(x1, y1);
        const end = this.worldToScreen(x2, y2);
        
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
    }
    
    /**
     * Draw a circle in world coordinates
     * @param {number} x - center X
     * @param {number} y - center Y
     * @param {number} radius - in world units
     * @param {string} fillColor 
     * @param {string} strokeColor 
     * @param {number} lineWidth 
     */
    drawCircle(x, y, radius, fillColor = null, strokeColor = '#333', lineWidth = 2) {
        const ctx = this.ctx;
        const center = this.worldToScreen(x, y);
        const screenRadius = radius * this.zoom;
        
        ctx.beginPath();
        ctx.arc(center.x, center.y, screenRadius, 0, Math.PI * 2);
        
        if (fillColor) {
            ctx.fillStyle = fillColor;
            ctx.fill();
        }
        if (strokeColor) {
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = lineWidth;
            ctx.stroke();
        }
    }
    
    /**
     * Draw a rectangle in world coordinates
     * @param {number} x 
     * @param {number} y 
     * @param {number} width 
     * @param {number} height 
     * @param {string} fillColor 
     * @param {string} strokeColor 
     * @param {number} lineWidth 
     */
    drawRect(x, y, width, height, fillColor = null, strokeColor = '#333', lineWidth = 2) {
        const ctx = this.ctx;
        const topLeft = this.worldToScreen(x, y);
        const screenWidth = width * this.zoom;
        const screenHeight = height * this.zoom;
        
        if (fillColor) {
            ctx.fillStyle = fillColor;
            ctx.fillRect(topLeft.x, topLeft.y, screenWidth, screenHeight);
        }
        if (strokeColor) {
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = lineWidth;
            ctx.strokeRect(topLeft.x, topLeft.y, screenWidth, screenHeight);
        }
    }
    
    // ==================== Public API ====================
    
    /**
     * Set zoom level programmatically
     * @param {number} zoom 
     */
    setZoom(zoom) {
        this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
        this.onZoomChange?.(this.zoom);
        this.render();
    }
    
    /**
     * Reset view to origin
     */
    resetView() {
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.onZoomChange?.(this.zoom);
        this.render();
    }
    
    /**
     * Center the view on a world position
     * @param {number} worldX 
     * @param {number} worldY 
     */
    centerOn(worldX, worldY) {
        this.panX = (this.width / 2 / this.zoom) - worldX;
        this.panY = (this.height / 2 / this.zoom) - worldY;
        this.render();
    }
    
    /**
     * Cleanup resources
     */
    dispose() {
        this.resizeObserver?.disconnect();
    }
}

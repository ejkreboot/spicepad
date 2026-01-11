import { deleteSymbol as deleteSymbolFromStore, loadLibrary, replaceLibrary, saveSymbol } from '../common/storage/library.js';

// State
        let components = {};
        let currentComponentId = null;
        let isNewComponentDraft = false;
        let primitiveCatalog = {};
        const dirtyComponents = new Set();
        let mode = 'select';
        let elements = []; // Drawing elements for current component
        let pins = []; // Pins for current component
        let selectedElement = null;
        let selectedElements = new Set(); // Multiple selected elements
        let isDrawing = false;
        let isDragging = false;
        let isSelecting = false; // Drag-selecting multiple elements
        let dragStart = null;
        let drawStart = null;
        let selectionRect = null; // { x1, y1, x2, y2 } in component coords
        let polygonPoints = [];
        let polylinePoints = [];
        let arcStage = 0; // 0: idle, 1: center chosen, 2: start/radius chosen
        let arcCenter = null;
        let arcRadius = null;
        let arcStartAngle = null;
        let arcPreviewPoint = null;
        let editingVertex = null; // { elementIndex, vertexIndex or 'start'/'end' }
        let undoStack = []; // Stack of actions for undo
        let originalElementState = null; // Element state at start of drag
        let originalElementStates = new Map(); // Map of element states for multi-drag
        let multiDragReference = null; // Reference element info for snapping multi-drag
        let draggingPinIndex = null;
        let pinDragOffset = null;
        let draggingPinLabelIndex = null;
        let pinLabelDragOffset = null;
        let defaultValueIsNull = false;
        let zoomLevel = 3;
        const MIN_ZOOM = 1;
        const MAX_ZOOM = 10;
        const DEFAULT_PIN_LABEL_OFFSET = { x: 12, y: -12 };

        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const zoomIndicator = document.createElement('span');
        zoomIndicator.className = 'zoom-indicator';
        const coordIndicator = document.createElement('span');
        coordIndicator.className = 'zoom-indicator';
        coordIndicator.textContent = 'X: 0.00, Y: 0.00';
        const labelPreviewCanvases = [
            { canvas: document.getElementById('labelPreview0'), orientation: 0 },
            { canvas: document.getElementById('labelPreview90'), orientation: 90 }
        ].map(entry => {
            const previewCanvas = entry.canvas;
            const preview = {
                ...entry,
                canvas: previewCanvas,
                ctx: previewCanvas ? previewCanvas.getContext('2d') : null,
                markerTargets: [],
                transform: null
            };
            if (previewCanvas) {
                previewCanvas.style.touchAction = 'none';
                previewCanvas.addEventListener('pointerdown', (event) => handleLabelPreviewPointerDown(preview, event));
                previewCanvas.addEventListener('pointermove', (event) => handleLabelPreviewPointerMove(preview, event));
                previewCanvas.addEventListener('pointerup', (event) => handleLabelPreviewPointerUp(preview, event));
                previewCanvas.addEventListener('pointerleave', (event) => handleLabelPreviewPointerUp(preview, event));
                previewCanvas.addEventListener('pointercancel', (event) => handleLabelPreviewPointerUp(preview, event));
            }
            return preview;
        });
        let labelPreviewDirty = false;
        let labelDragState = null;

        function markCurrentComponentDirty() {
            if (isNewComponentDraft || !currentComponentId) return;
            if (!dirtyComponents.has(currentComponentId)) {
                dirtyComponents.add(currentComponentId);
                updateComponentList();
            }
        }

        function clearDirtyState(id, options = {}) {
            if (!id) return;
            const removed = dirtyComponents.delete(id);
            if (removed && !options.silent) {
                updateComponentList();
            }
        }

        function clampZoom(value) {
            return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
        }

        function updateZoomIndicator() {
            if (!zoomIndicator) return;
            zoomIndicator.textContent = 'Zoom: ' + zoomLevel.toFixed(1) + 'x';
        }

        function setZoomLevel(value, options = {}) {
            const clamped = clampZoom(value);
            if (!options.force && Math.abs(clamped - zoomLevel) < 0.001) return;
            zoomLevel = clamped;
            updateZoomIndicator();
            redraw();
        }

        async function loadPrimitives() {
            try {
                const response = await fetch('./primitives.json');
                if (!response.ok) throw new Error(`Failed to load primitives.json (${response.status})`);
                const data = await response.json();
                primitiveCatalog = data?.primitives || {};
            } catch (err) {
                console.error('Unable to load primitives.json', err);
                primitiveCatalog = {};
            }
            populatePrefixOptions();
            applyPrimitiveDefaults(document.getElementById('compPrefix')?.value);
        }

        function getDefaultPrimitivePrefix() {
            const keys = Object.keys(primitiveCatalog);
            if (keys.length === 0) return '';
            const sorted = [...keys].sort();
            return sorted[0];
        }

        function populatePrefixOptions(selectedPrefix) {
            const select = document.getElementById('compPrefix');
            if (!select) return;
            const keys = Object.keys(primitiveCatalog).sort();
            const previous = selectedPrefix || select.value || '';
            select.innerHTML = keys.map(key => `<option value="${key}">${key}</option>`).join('');
            if (previous && !keys.includes(previous)) {
                const opt = document.createElement('option');
                opt.value = previous;
                opt.textContent = `${previous} (custom)`;
                select.appendChild(opt);
            }
            const nextValue = previous || keys[0] || '';
            if (nextValue) select.value = nextValue;
        }

        function applyPrimitiveDefaults(prefix, options = {}) {
            const defaultInput = document.getElementById('compDefault');
            if (!defaultInput) return;
            const entry = primitiveCatalog[prefix];
            const componentDefault = options.componentDefault;
            defaultValueIsNull = false;
            if (entry && entry.defaultValue === null) {
                defaultValueIsNull = true;
                defaultInput.value = '';
                defaultInput.disabled = true;
                defaultInput.placeholder = 'No default value';
                return;
            }
            if (componentDefault === null) {
                defaultValueIsNull = true;
            }
            defaultInput.disabled = false;
            if (entry && typeof entry.defaultValue === 'string') {
                defaultInput.placeholder = entry.defaultValue;
            } else {
                defaultInput.placeholder = '';
            }
            const resolved = componentDefault !== undefined
                ? componentDefault
                : (entry ? entry.defaultValue ?? '' : defaultInput.value);
            defaultInput.value = resolved ?? '';
            if (resolved === null) defaultValueIsNull = true;
        }

        function onPrefixChanged() {
            const select = document.getElementById('compPrefix');
            if (!select) return;
            applyPrimitiveDefaults(select.value);
            markCurrentComponentDirty();
            requestLabelPreviewUpdate({ immediate: true });
        }

        function onCanvasWheel(event) {
            const pinchGesture = event.ctrlKey || event.metaKey;
            const trackpadScrollGesture = !pinchGesture && event.deltaMode === 0;
            if (!pinchGesture && !trackpadScrollGesture) return;
            event.preventDefault();
            const multiplier = pinchGesture ? 0.01 : 0.0025;
            const increment = -event.deltaY * multiplier;
            if (increment === 0) return;
            setZoomLevel(zoomLevel + increment);
        }

        // Initialize
        async function init() {
            resizeCanvas();
            resizePreviewCanvases();
            window.addEventListener('resize', () => {
                resizeCanvas();
            });
            canvas.addEventListener('mousedown', onMouseDown);
            canvas.addEventListener('mousemove', onMouseMove);
            canvas.addEventListener('mouseup', onMouseUp);
            canvas.addEventListener('dblclick', onDoubleClick);
            canvas.addEventListener('wheel', onCanvasWheel, { passive: false });
            const info = document.getElementById('canvasInfo');
            if (info) {
                info.innerHTML = '';
                info.appendChild(zoomIndicator);
                info.appendChild(coordIndicator);
            }

            const prefixSelect = document.getElementById('compPrefix');
            if (prefixSelect) {
                prefixSelect.addEventListener('change', onPrefixChanged);
            }

            // Keyboard shortcuts
            window.addEventListener('keydown', (e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                    e.preventDefault();
                    undo();
                } else if (e.key === 'Escape') {
                    if (mode === 'arc' && arcStage > 0) {
                        resetArcConstruction();
                        redraw();
                    }
                }
            });

            // Load default components
            attachLabelInputListeners();
            attachComponentInputDirtyListeners();
            window.addEventListener('mouseup', () => flushLabelPreviewUpdates());
            await loadPrimitives();
            await loadComponentsFromStorage();
            requestLabelPreviewUpdate({ immediate: true });
            updateZoomIndicator();
        }

        function getDefaultComponents() {
            const resistorSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60" data-generated-by="symbol-editor" data-comp-width="80" data-comp-height="40" data-offset-x="20" data-offset-y="10"><path fill="none" stroke="#000000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" d="M 20 30 L 35 30 L 40 22 L 50 38 L 60 22 L 70 38 L 80 22 L 85 30 L 100 30"/></svg>`;
            const capacitorSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60" data-generated-by="symbol-editor" data-comp-width="80" data-comp-height="40" data-offset-x="20" data-offset-y="10"><g fill="none" stroke="#000000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M 20 30 L 50 30"/><path d="M 50 15 L 50 45"/><path d="M 70 15 L 70 45"/><path d="M 70 30 L 100 30"/></g></svg>`;
            const groundSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 90" data-generated-by="symbol-editor" data-comp-width="60" data-comp-height="60" data-offset-x="15" data-offset-y="15"><g fill="none" stroke="#000000" stroke-width="4" stroke-linecap="round"><path d="M 45 15 L 45 45"/><path d="M 25 45 L 65 45"/><path d="M 30 55 L 60 55"/><path d="M 35 65 L 55 65"/></g></svg>`;

            return {
                resistor: {
                    name: 'Resistor',
                    description: 'Standard two-pin resistor symbol',
                    defaultValue: '1k',
                    designator: { prefix: 'R', autoIncrement: true },
                    size: { width: 60, height: 40 },
                    pins: [
                        { id: '1', name: 'A', position: { x: 0, y: 20 }, labelPosition: { x: 2, y: 18 } },
                        { id: '2', name: 'B', position: { x: 60, y: 20 }, labelPosition: { x: 57, y: 18 } }
                    ],
                    labels: {
                        designator: [{ x: 29, y: 10 }, { x: 43, y: 16 }],
                        value: [{ x: 29, y: 31 }, { x: 43, y: 22 }]
                    },
                    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 60" data-generated-by="symbol-editor" data-comp-width="60" data-comp-height="40" data-offset-x="15" data-offset-y="10"><polyline points="15,30 30,30 32,24 37,36 42,24 47,36 51,24 56,36 58,30 75,30 70,30" fill="none" stroke="#000000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
                },
                capacitor: {
                    name: 'Capacitor',
                    description: 'Parallel-plate capacitor symbol',
                    defaultValue: '1uF',
                    designator: { prefix: 'C', autoIncrement: true },
                    size: { width: 60, height: 40 },
                    pins: [
                        { id: '1', name: 'A', position: { x: 0, y: 20 }, labelPosition: { x: 2, y: 18 } },
                        { id: '2', name: 'B', position: { x: 60, y: 20 }, labelPosition: { x: 56, y: 18 } }
                    ],
                    labels: {
                        designator: [{ x: 29, y: 4 }, { x: 49, y: 18 }],
                        value: [{ x: 29, y: 36 }, { x: 49, y: 24 }]
                    },
                    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 60" data-generated-by="symbol-editor" data-comp-width="60" data-comp-height="40" data-offset-x="15" data-offset-y="10"><path fill="none" stroke="#000000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" d="M 15 30 L 39 30"/><path fill="none" stroke="#000000" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" d="M 39 20 L 39 40"/><path fill="none" stroke="#000000" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" d="M 51 20 L 51 40"/><path fill="none" stroke="#000000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" d="M 51 30 L 75 30"/></svg>`
                },
                ground: {
                    name: 'Ground',
                    description: 'Reference ground symbol',
                    defaultValue: null,
                    designator: { prefix: 'GND', autoIncrement: false },
                    size: { width: 60, height: 50 },
                    isGround: true,
                    pins: [
                        { id: '1', name: 'GND', position: { x: 30, y: 0 }, labelPosition: { x: 32, y: 4 } }
                    ],
                    labels: {
                        designator: [{ x: 49, y: 51 }, { x: -12, y: 30 }],
                        value: [{ x: 49, y: 43 }, { x: 70, y: 30 }]
                    },
                    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 75" data-generated-by="symbol-editor" data-comp-width="60" data-comp-height="50" data-offset-x="15" data-offset-y="13"><path fill="none" stroke="#000000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" d="M 45 13 L 45 43"/><path fill="none" stroke="#000000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" d="M 25 43 L 65 43"/><path fill="none" stroke="#000000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" d="M 33 53 L 58 53"/><path fill="none" stroke="#000000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" d="M 41 63 L 49 63"/></svg>`
                }
            };
        }

        function applyComponentsToState(nextComponents) {
            components = nextComponents || {};
            stripModelFields(components);
            dirtyComponents.clear();
            currentComponentId = null;
            isNewComponentDraft = false;

            updateComponentList();
            updateJSON();
            const defaultWidth = parseInt(document.getElementById('compWidth').value, 10) || 80;
            const defaultHeight = parseInt(document.getElementById('compHeight').value, 10) || 40;
            setLabelInputs(getDefaultLabelPositions(defaultWidth, defaultHeight), defaultWidth, defaultHeight);
        }

        async function loadComponentsFromStorage() {
            const seedLibrary = getDefaultComponents();
            try {
                const library = await loadLibrary({ seedLibrary });
                const hasData = library && Object.keys(library).length > 0;
                applyComponentsToState(hasData ? library : seedLibrary);
                if (!hasData) {
                    await replaceLibrary(seedLibrary).catch(err => console.warn('Failed to seed IndexedDB library', err));
                }
            } catch (err) {
                console.warn('Unable to load library from IndexedDB, using defaults instead', err);
                applyComponentsToState(seedLibrary);
            }
        }

        function loadDefaultComponents() {
            const defaults = getDefaultComponents();
            applyComponentsToState(defaults);
        }

        function resizeCanvas() {
            const wrapper = canvas.parentElement;
            // Get the actual content dimensions (excluding borders and padding)
            canvas.width = wrapper.clientWidth;
            canvas.height = wrapper.clientHeight;
            redraw();
        }

        // Mode handling
        function setMode(newMode) {
            mode = newMode;
            polygonPoints = [];
            polylinePoints = [];
            resetArcConstruction();

            // Update button states
            document.querySelectorAll('.toolbar .btn').forEach(btn => {
                btn.classList.remove('btn-primary');
                btn.classList.add('btn-secondary');
            });
            const btn = document.getElementById('btn-' + mode);
            if (btn) {
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-primary');
            }

            // Update indicator
            const indicator = document.getElementById('modeIndicator');
            if (indicator) {
                indicator.textContent = mode.toUpperCase();
                indicator.className = 'mode-indicator mode-' + mode;
            }

            redraw();
        }

        function resetArcConstruction() {
            arcStage = 0;
            arcCenter = null;
            arcRadius = null;
            arcStartAngle = null;
            arcPreviewPoint = null;
        }

        // Canvas coordinate helpers
        function getCanvasOffset() {
            const zoom = zoomLevel;
            const compWidth = parseInt(document.getElementById('compWidth').value) || 80;
            const compHeight = parseInt(document.getElementById('compHeight').value) || 40;

            // Center the component with some padding
            const offsetX = (canvas.width - compWidth * zoom) / 2;
            const offsetY = (canvas.height - compHeight * zoom) / 2;

            return { x: offsetX, y: offsetY, zoom };
        }

        function canvasToComponent(cx, cy, options = {}) {
            const { x: offsetX, y: offsetY, zoom } = getCanvasOffset();
            const grid = parseInt(document.getElementById('gridSize').value);
            const snapSetting = options.snap !== undefined ? options.snap : document.getElementById('snapToGrid').checked;

            let compX = (cx - offsetX) / zoom;
            let compY = (cy - offsetY) / zoom;

            // Snap to grid if enabled
            if (snapSetting) {
                compX = Math.round(compX / grid) * grid;
                compY = Math.round(compY / grid) * grid;
            }

            return { x: compX, y: compY };
        }

        function componentToCanvas(compX, compY) {
            const { x: offsetX, y: offsetY, zoom } = getCanvasOffset();
            return {
                x: compX * zoom + offsetX,
                y: compY * zoom + offsetY
            };
        }

        function requestLabelPreviewUpdate(options = {}) {
            const immediate = options.immediate || false;
            if (immediate) {
                labelPreviewDirty = false;
                updateLabelPreviews();
                return;
            }
            const shouldDefer = isDrawing || isDragging || isSelecting || (mode === 'arc' && arcStage > 0);
            if (shouldDefer) {
                labelPreviewDirty = true;
                return;
            }
            labelPreviewDirty = false;
            updateLabelPreviews();
        }

        function flushLabelPreviewUpdates() {
            if (!labelPreviewDirty) return;
            labelPreviewDirty = false;
            updateLabelPreviews();
        }

        function attachLabelInputListeners() {
            const ids = [
                'designatorLabel0X', 'designatorLabel0Y',
                'valueLabel0X', 'valueLabel0Y',
                'designatorLabel90X', 'designatorLabel90Y',
                'valueLabel90X', 'valueLabel90Y'
            ];
            ids.forEach(id => {
                const input = document.getElementById(id);
                if (input) {
                    const trigger = () => {
                        if (!isNewComponentDraft) markCurrentComponentDirty();
                        requestLabelPreviewUpdate({ immediate: true });
                    };
                    input.addEventListener('input', trigger);
                    input.addEventListener('change', trigger);
                }
            });
            ['compPrefix', 'compDefault'].forEach(id => {
                const input = document.getElementById(id);
                if (input) {
                    const trigger = () => {
                        if (id === 'compDefault' && !input.disabled) {
                            defaultValueIsNull = false;
                        }
                        if (!isNewComponentDraft) markCurrentComponentDirty();
                        requestLabelPreviewUpdate({ immediate: true });
                    };
                    input.addEventListener('input', trigger);
                    input.addEventListener('change', trigger);
                }
            });
        }

        function attachComponentInputDirtyListeners() {
            ['compId', 'compName'].forEach(id => attachDirtyListenerToInput(id, { updateDraftList: true }));
            ['compPrefix', 'compDefault', 'compWidth', 'compHeight'].forEach(id => attachDirtyListenerToInput(id));
            attachDirtyListenerToInput('compAutoInc');
        }

        function attachDirtyListenerToInput(id, options = {}) {
            const input = document.getElementById(id);
            if (!input) return;
            const events = options.events || ['input', 'change'];
            const handler = () => {
                if (options.updateDraftList && isNewComponentDraft) {
                    updateComponentList();
                    return;
                }
                markCurrentComponentDirty();
            };
            events.forEach(evt => input.addEventListener(evt, handler));
        }

        function resizePreviewCanvases() {
            labelPreviewCanvases.forEach(({ canvas }) => {
                if (!canvas) return;
                const rect = canvas.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return;
                if (canvas.width !== rect.width || canvas.height !== rect.height) {
                    canvas.width = rect.width;
                    canvas.height = rect.height;
                }
            });
        }

        function updateLabelPreviews() {
            resizePreviewCanvases();
            const compWidth = parseInt(document.getElementById('compWidth').value, 10) || 80;
            const compHeight = parseInt(document.getElementById('compHeight').value, 10) || 40;
            const labels = readLabelInputs(compWidth, compHeight);
            labelPreviewCanvases.forEach(preview => {
                drawLabelPreview(preview, labels, compWidth, compHeight);
            });
        }

        function drawLabelPreview(preview, labels, compWidth, compHeight) {
            const { canvas, ctx, orientation } = preview;
            if (!canvas || !ctx || canvas.width === 0 || canvas.height === 0) return;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const angle = orientation === 90 ? Math.PI / 2 : 0;
            const designator = orientation === 0 ? labels.designator[0] : labels.designator[1];
            const value = orientation === 0 ? labels.value[0] : labels.value[1];
            const extraPoints = [designator, value]
                .filter(Boolean)
                .map(point => ({ point, rotate: false }));
            const transform = createPreviewTransform(
                compWidth,
                compHeight,
                angle,
                canvas.width,
                canvas.height,
                extraPoints
            );
            if (!transform) {
                preview.transform = null;
                preview.markerTargets = [];
                return;
            }

            preview.transform = transform;
            preview.markerTargets = [];

            // Draw component boundary
            ctx.save();
            ctx.strokeStyle = '#c2c2c2';
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(
                transform.offsetX,
                transform.offsetY,
                transform.bounds.width * transform.scale,
                transform.bounds.height * transform.scale
            );
            ctx.restore();

            drawPreviewOrigin(ctx, transform);
            drawPreviewElements(ctx, transform);
            drawPreviewPins(ctx, transform);

            const prefixInput = document.getElementById('compPrefix');
            const defaultInput = document.getElementById('compDefault');
            const prefixText = (prefixInput?.value || '').trim() || 'DES';
            const defaultText = (defaultInput?.value || '').trim() || 'VAL';
            const hideValueMarker = defaultValueIsNull || defaultInput?.disabled;
            const hideDesignatorMarker = !prefixText || prefixText.toUpperCase() === 'GND';
            const orientationIndex = orientation === 0 ? 0 : 1;
            if (!hideDesignatorMarker) {
                drawLabelMarker(ctx, designator, transform, '#1e88e5', prefixText, {
                    preview,
                    labelType: 'designator',
                    orientationIndex
                });
            }
            if (!hideValueMarker) {
                drawLabelMarker(ctx, value, transform, '#43a047', defaultText, {
                    preview,
                    labelType: 'value',
                    orientationIndex
                });
            }
        }

        function drawPreviewOrigin(ctx, transform) {
            const origin = projectPointForPreview({ x: 0, y: 0 }, transform);
            ctx.save();
            ctx.fillStyle = '#666';
            ctx.beginPath();
            ctx.arc(origin.x, origin.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        function drawPreviewElements(ctx, transform) {
            ctx.save();
            ctx.strokeStyle = '#444';
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            elements.forEach(el => {
                const strokeWidth = Math.max(1, ((el.strokeWidth || 4) * transform.scale));
                ctx.lineWidth = strokeWidth;
                if (el.type === 'line') {
                    const start = projectPointForPreview({ x: el.x1, y: el.y1 }, transform);
                    const end = projectPointForPreview({ x: el.x2, y: el.y2 }, transform);
                    ctx.beginPath();
                    ctx.moveTo(start.x, start.y);
                    ctx.lineTo(end.x, end.y);
                    ctx.stroke();
                } else if (el.type === 'circle') {
                    const center = projectPointForPreview({ x: el.cx, y: el.cy }, transform);
                    const radius = Math.max(1, el.r * transform.scale);
                    ctx.beginPath();
                    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
                    if (el.filled) {
                        ctx.fillStyle = '#000';
                        ctx.fill();
                    }
                    ctx.stroke();
                } else if (el.type === 'arc') {
                    const center = projectPointForPreview({ x: el.cx, y: el.cy }, transform);
                    const radius = Math.max(1, el.r * transform.scale);
                    ctx.beginPath();
                    ctx.arc(
                        center.x,
                        center.y,
                        radius,
                        el.startAngle + transform.angle,
                        el.endAngle + transform.angle
                    );
                    ctx.stroke();
                } else if (el.type === 'polygon' && el.points) {
                    const pts = el.points.map(pt => projectPointForPreview(pt, transform));
                    if (pts.length) {
                        ctx.beginPath();
                        ctx.moveTo(pts[0].x, pts[0].y);
                        pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
                        ctx.closePath();
                        if (el.filled) {
                            ctx.fillStyle = '#000';
                            ctx.fill();
                        }
                        ctx.stroke();
                    }
                } else if (el.type === 'polyline' && el.points) {
                    const pts = el.points.map(pt => projectPointForPreview(pt, transform));
                    if (pts.length) {
                        ctx.beginPath();
                        ctx.moveTo(pts[0].x, pts[0].y);
                        pts.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
                        ctx.stroke();
                    }
                }
            });
            ctx.restore();
        }

        function drawPreviewPins(ctx, transform) {
            ctx.save();
            pins.forEach(pin => {
                const pos = projectPointForPreview(pin.position, transform);
                const scale = transform?.scale || 1;
                const scaleFactor = 0.6; // shrink preview text ~40%
                const pinRadius = Math.max(3, 4 * scale * scaleFactor);
                const idFontSize = Math.max(6, 10 * scale * scaleFactor);
                const labelFontSize = Math.max(6, 9 * scale * scaleFactor);

                ctx.fillStyle = '#ff6600';
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, pinRadius, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#fff';
                ctx.font = `bold ${idFontSize}px monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(pin.id, pos.x, pos.y);

                const labelProjected = projectPointForPreview(getPinLabelPosition(pin), transform);
                ctx.fillStyle = '#111';
                ctx.font = `${labelFontSize}px monospace`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(pin.name || pin.id, labelProjected.x, labelProjected.y);
            });
            ctx.restore();
        }

        function drawLabelMarker(ctx, point, transform, color, label, options = {}) {
            if (!point) return;
            const projected = projectPointForPreview(point, transform, false);
            const scale = transform?.scale || 1;
            const scaleFactor = 0.6; // shrink preview text ~40%
            const fontSize = Math.max(6, 10 * scale * scaleFactor);
            ctx.save();
            ctx.fillStyle = color;
            ctx.font = `${fontSize}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // Render the label directly at the anchor point (no marker dot).
            ctx.fillText(label, projected.x, projected.y);
            ctx.restore();
            if (options.preview && options.preview.markerTargets) {
                options.preview.markerTargets.push({
                    type: options.labelType,
                    orientationIndex: options.orientationIndex,
                    canvasPosition: { x: projected.x, y: projected.y }
                });
            }
        }

        const LABEL_MARKER_HIT_RADIUS = 10;

        function getPreviewCanvasPoint(canvasElement, event) {
            if (!canvasElement) return null;
            const rect = canvasElement.getBoundingClientRect();
            const scaleX = canvasElement.width / rect.width;
            const scaleY = canvasElement.height / rect.height;
            return {
                x: (event.clientX - rect.left) * scaleX,
                y: (event.clientY - rect.top) * scaleY
            };
        }

        function previewCanvasPointToComponent(preview, point) {
            if (!preview || !preview.transform || !point) return null;
            const transform = preview.transform;
            if (!transform.scale) return null;
            const normalizedX = (point.x - transform.offsetX) / transform.scale;
            const normalizedY = (point.y - transform.offsetY) / transform.scale;
            return {
                x: Math.round(normalizedX + transform.bounds.minX),
                y: Math.round(normalizedY + transform.bounds.minY)
            };
        }

        function setLabelPositionFromPreview(labelType, orientationIndex, position) {
            if (!position) return;
            const prefix = labelType === 'value' ? 'valueLabel' : 'designatorLabel';
            const suffix = orientationIndex === 0 ? '0' : '90';
            const xInput = document.getElementById(prefix + suffix + 'X');
            const yInput = document.getElementById(prefix + suffix + 'Y');
            const roundedX = Math.round(position.x);
            const roundedY = Math.round(position.y);
            if (xInput) xInput.value = roundedX;
            if (yInput) yInput.value = roundedY;
        }

        function updateLabelPositionFromCanvasPoint(preview, dragState, canvasPoint) {
            if (!dragState) return;
            const componentPoint = previewCanvasPointToComponent(preview, canvasPoint);
            if (!componentPoint) return;
            setLabelPositionFromPreview(dragState.labelType, dragState.orientationIndex, componentPoint);
            requestLabelPreviewUpdate({ immediate: true });
        }

        function handleLabelPreviewPointerDown(preview, event) {
            if (!preview?.canvas || !preview.markerTargets?.length) return;
            const canvasPoint = getPreviewCanvasPoint(preview.canvas, event);
            if (!canvasPoint) return;
            const hit = preview.markerTargets.find(target => {
                const dx = canvasPoint.x - target.canvasPosition.x;
                const dy = canvasPoint.y - target.canvasPosition.y;
                return Math.hypot(dx, dy) <= LABEL_MARKER_HIT_RADIUS;
            });
            if (!hit) return;
            event.preventDefault();
            labelDragState = {
                preview,
                pointerId: event.pointerId,
                labelType: hit.type,
                orientationIndex: hit.orientationIndex
            };
            preview.canvas.setPointerCapture(event.pointerId);
            updateLabelPositionFromCanvasPoint(preview, labelDragState, canvasPoint);
        }

        function handleLabelPreviewPointerMove(preview, event) {
            if (!labelDragState || labelDragState.preview !== preview || labelDragState.pointerId !== event.pointerId) return;
            event.preventDefault();
            const canvasPoint = getPreviewCanvasPoint(preview.canvas, event);
            if (!canvasPoint) return;
            updateLabelPositionFromCanvasPoint(preview, labelDragState, canvasPoint);
        }

        function handleLabelPreviewPointerUp(preview, event) {
            if (!labelDragState || labelDragState.preview !== preview || labelDragState.pointerId !== event.pointerId) return;
            if (preview.canvas?.hasPointerCapture?.(event.pointerId)) {
                preview.canvas.releasePointerCapture(event.pointerId);
            }
            event.preventDefault();
            labelDragState = null;
        }

        function createPreviewTransform(width, height, angle, canvasWidth, canvasHeight, extraPoints = []) {
            if (!width || !height || !canvasWidth || !canvasHeight) return null;
            const bounds = getRotatedBounds(width, height, angle, extraPoints);
            const padding = 12;
            const usableWidth = Math.max(canvasWidth - padding * 2, 10);
            const usableHeight = Math.max(canvasHeight - padding * 2, 10);
            const scale = Math.min(
                usableWidth / (bounds.width || 1),
                usableHeight / (bounds.height || 1)
            );
            const offsetX = (canvasWidth - bounds.width * scale) / 2;
            const offsetY = (canvasHeight - bounds.height * scale) / 2;
            return { angle, width, height, bounds, scale, offsetX, offsetY };
        }

        function getRotatedBounds(width, height, angle, extraPoints = []) {
            const baseCorners = [
                { x: 0, y: 0 },
                { x: width, y: 0 },
                { x: width, y: height },
                { x: 0, y: height }
            ].map(pt => angle === 0 ? pt : rotatePointAroundCenter(pt, angle, width, height));
            const xs = baseCorners.map(p => p.x);
            const ys = baseCorners.map(p => p.y);
            extraPoints.forEach(entry => {
                if (!entry || !entry.point) return;
                const shouldRotate = entry.rotate !== false;
                const candidate = shouldRotate
                    ? rotatePointAroundCenter(entry.point, angle, width, height)
                    : { x: entry.point.x, y: entry.point.y };
                xs.push(candidate.x);
                ys.push(candidate.y);
            });
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
        }

        function rotatePointAroundCenter(point, angle, width, height) {
            if (angle === 0) return { x: point.x, y: point.y };
            const cx = width / 2;
            const cy = height / 2;
            const dx = point.x - cx;
            const dy = point.y - cy;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            return {
                x: cx + dx * cosA - dy * sinA,
                y: cy + dx * sinA + dy * cosA
            };
        }

        function projectPointForPreview(point, transform, rotatePoint = true) {
            if (!point) return { x: 0, y: 0 };
            const source = rotatePoint ?
                rotatePointAroundCenter(point, transform.angle, transform.width, transform.height) :
                { x: point.x, y: point.y };
            const normalizedX = source.x - transform.bounds.minX;
            const normalizedY = source.y - transform.bounds.minY;
            return {
                x: transform.offsetX + normalizedX * transform.scale,
                y: transform.offsetY + normalizedY * transform.scale
            };
        }

        // Drawing
        function redraw() {
            const { x: offsetX, y: offsetY, zoom } = getCanvasOffset();
            const grid = parseInt(document.getElementById('gridSize').value);
            const compWidth = parseInt(document.getElementById('compWidth').value) || 80;
            const compHeight = parseInt(document.getElementById('compHeight').value) || 40;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw grid
            ctx.strokeStyle = '#d1fae5';
            ctx.lineWidth = 0.25;

            const gridZoom = grid * zoom;
            const startX = offsetX % gridZoom;
            const startY = offsetY % gridZoom;

            for (let x = startX; x < canvas.width; x += gridZoom) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
                ctx.stroke();
            }

            for (let y = startY; y < canvas.height; y += gridZoom) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(canvas.width, y);
                ctx.stroke();
            }

            // Draw component boundary
            ctx.strokeStyle = '#999';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(offsetX, offsetY, compWidth * zoom, compHeight * zoom);
            ctx.setLineDash([]);

            // Anchor marker at bounding box center
            const anchorX = offsetX + (compWidth * zoom) / 2;
            const anchorY = offsetY + (compHeight * zoom) / 2;
            const anchorHalfSize = Math.max(4, Math.min(12, 6 * zoom)) / 2;
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(anchorX - anchorHalfSize, anchorY - anchorHalfSize);
            ctx.lineTo(anchorX + anchorHalfSize, anchorY + anchorHalfSize);
            ctx.moveTo(anchorX - anchorHalfSize, anchorY + anchorHalfSize);
            ctx.lineTo(anchorX + anchorHalfSize, anchorY - anchorHalfSize);
            ctx.stroke();

            // Draw origin marker
            ctx.fillStyle = '#666';
            ctx.beginPath();
            ctx.arc(offsetX, offsetY, 4, 0, Math.PI * 2);
            ctx.fill();

            // Draw elements
            elements.forEach((el, idx) => {
                const isSelected = selectedElement === idx || selectedElements.has(idx);
                drawElement(el, isSelected, zoom, offsetX, offsetY);
            });

            // Draw pins
            pins.forEach((pin, idx) => {
                const pos = componentToCanvas(pin.position.x, pin.position.y);

                ctx.fillStyle = '#ff6600';
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#fff';
                ctx.font = 'bold 10px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(pin.id, pos.x, pos.y);

                const labelPos = getPinLabelPosition(pin);
                const labelCanvas = componentToCanvas(labelPos.x, labelPos.y);
                const fontSize = Math.max(9, Math.min(18, 10 + zoom * 1.2));
                ctx.fillStyle = '#111';
                ctx.font = `${fontSize}px monospace`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(pin.name || pin.id, labelCanvas.x, labelCanvas.y);
            });

            // Draw polygon in progress
            if (mode === 'polygon' && polygonPoints.length > 0) {
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 2;
                ctx.beginPath();
                const first = componentToCanvas(polygonPoints[0].x, polygonPoints[0].y);
                ctx.moveTo(first.x, first.y);
                polygonPoints.forEach(pt => {
                    const p = componentToCanvas(pt.x, pt.y);
                    ctx.lineTo(p.x, p.y);
                });
                ctx.stroke();
            }

            // Draw polyline in progress
            if (mode === 'polyline' && polylinePoints.length > 0) {
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 2;
                ctx.beginPath();
                const first = componentToCanvas(polylinePoints[0].x, polylinePoints[0].y);
                ctx.moveTo(first.x, first.y);
                polylinePoints.forEach(pt => {
                    const p = componentToCanvas(pt.x, pt.y);
                    ctx.lineTo(p.x, p.y);
                });
                ctx.stroke();
            }

            drawArcConstructionPreview();

            // Draw selection rectangle
            if (isSelecting && selectionRect) {
                const start = componentToCanvas(selectionRect.x1, selectionRect.y1);
                const end = componentToCanvas(selectionRect.x2, selectionRect.y2);

                ctx.strokeStyle = '#0066ff';
                ctx.fillStyle = 'rgba(0, 102, 255, 0.1)';
                ctx.lineWidth = 1;
                ctx.setLineDash([5, 5]);
                ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
                ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
                ctx.setLineDash([]);
            }

            requestLabelPreviewUpdate();
        }

        function drawElement(el, isSelected, zoom, offsetX, offsetY) {
            ctx.strokeStyle = isSelected ? '#ff0000' : '#333';
            ctx.fillStyle = el.filled ? (isSelected ? '#ff0000' : '#333') : 'transparent';
            ctx.lineWidth = (el.strokeWidth || 4) * zoom;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            if (el.type === 'line') {
                const start = componentToCanvas(el.x1, el.y1);
                const end = componentToCanvas(el.x2, el.y2);
                ctx.beginPath();
                ctx.moveTo(start.x, start.y);
                ctx.lineTo(end.x, end.y);
                ctx.stroke();
            } else if (el.type === 'circle') {
                const center = componentToCanvas(el.cx, el.cy);
                ctx.beginPath();
                ctx.arc(center.x, center.y, el.r * zoom, 0, Math.PI * 2);
                if (el.filled) ctx.fill();
                ctx.stroke();
            } else if (el.type === 'arc') {
                const center = componentToCanvas(el.cx, el.cy);
                ctx.beginPath();
                ctx.arc(center.x, center.y, el.r * zoom, el.startAngle, el.endAngle);
                ctx.stroke();
            } else if (el.type === 'polygon') {
                if (el.points && el.points.length > 0) {
                    ctx.beginPath();
                    const first = componentToCanvas(el.points[0].x, el.points[0].y);
                    ctx.moveTo(first.x, first.y);
                    el.points.forEach(pt => {
                        const p = componentToCanvas(pt.x, pt.y);
                        ctx.lineTo(p.x, p.y);
                    });
                    ctx.closePath();
                    if (el.filled) ctx.fill();
                    ctx.stroke();
                }
            } else if (el.type === 'polyline') {
                if (el.points && el.points.length > 0) {
                    ctx.beginPath();
                    const first = componentToCanvas(el.points[0].x, el.points[0].y);
                    ctx.moveTo(first.x, first.y);
                    el.points.forEach(pt => {
                        const p = componentToCanvas(pt.x, pt.y);
                        ctx.lineTo(p.x, p.y);
                    });
                    // Don't close path for polyline
                    ctx.stroke();
                }
            }
        }

        function drawArcConstructionPreview() {
            if (mode !== 'arc' || arcStage === 0 || !arcCenter) return;
            const { zoom } = getCanvasOffset();
            const centerCanvas = componentToCanvas(arcCenter.x, arcCenter.y);
            ctx.save();
            ctx.strokeStyle = '#0066ff';
            ctx.fillStyle = '#0066ff';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(centerCanvas.x, centerCanvas.y, 3, 0, Math.PI * 2);
            ctx.fill();
            if (arcStage === 1 && arcPreviewPoint) {
                const previewCanvas = componentToCanvas(arcPreviewPoint.x, arcPreviewPoint.y);
                ctx.beginPath();
                ctx.moveTo(centerCanvas.x, centerCanvas.y);
                ctx.lineTo(previewCanvas.x, previewCanvas.y);
                ctx.stroke();
                const radius = Math.sqrt(Math.pow(arcPreviewPoint.x - arcCenter.x, 2) + Math.pow(arcPreviewPoint.y - arcCenter.y, 2));
                if (radius > 0) {
                    ctx.beginPath();
                    ctx.arc(centerCanvas.x, centerCanvas.y, radius * zoom, 0, Math.PI * 2);
                    ctx.stroke();
                }
            } else if (arcStage === 2 && arcRadius) {
                const startPoint = {
                    x: arcCenter.x + Math.cos(arcStartAngle) * arcRadius,
                    y: arcCenter.y + Math.sin(arcStartAngle) * arcRadius
                };
                const startCanvas = componentToCanvas(startPoint.x, startPoint.y);
                ctx.beginPath();
                ctx.moveTo(centerCanvas.x, centerCanvas.y);
                ctx.lineTo(startCanvas.x, startCanvas.y);
                ctx.stroke();
                const endAngle = arcPreviewPoint ? Math.atan2(arcPreviewPoint.y - arcCenter.y, arcPreviewPoint.x - arcCenter.x) : arcStartAngle;
                ctx.beginPath();
                ctx.arc(centerCanvas.x, centerCanvas.y, arcRadius * zoom, arcStartAngle, endAngle);
                ctx.stroke();
            }
            ctx.restore();
        }

        // Mouse handlers
        function onMouseDown(e) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const cx = (e.clientX - rect.left) * scaleX;
            const cy = (e.clientY - rect.top) * scaleY;
            const shouldSnap = mode !== 'select';
            const pos = canvasToComponent(cx, cy, { snap: shouldSnap });
            multiDragReference = null;

            if (mode === 'select') {
                const labelIndex = findPinLabelNearPosition(pos);
                if (labelIndex !== -1) {
                    draggingPinLabelIndex = labelIndex;
                    const labelPos = getPinLabelPosition(pins[labelIndex]);
                    pinLabelDragOffset = {
                        x: labelPos.x - pos.x,
                        y: labelPos.y - pos.y
                    };
                    undoStack.push({
                        type: 'move-pin-label',
                        index: labelIndex,
                        before: { x: labelPos.x, y: labelPos.y }
                    });
                    return;
                }
                const pinIndex = findPinNearPosition(pos);
                if (pinIndex !== -1) {
                    draggingPinIndex = pinIndex;
                    const pin = pins[pinIndex];
                    const beforePosition = {
                        position: { x: pin.position.x, y: pin.position.y },
                        label: getPinLabelPosition(pin)
                    };
                    pinDragOffset = {
                        x: pin.position.x - pos.x,
                        y: pin.position.y - pos.y
                    };
                    undoStack.push({
                        type: 'move-pin',
                        index: pinIndex,
                        before: beforePosition
                    });
                    return;
                }

                const shiftKey = e.shiftKey;

                // First check if clicking on a vertex
                const vertex = findVertexAt(pos.x, pos.y);
                if (vertex) {
                    // Start editing this vertex
                    editingVertex = vertex;
                    selectedElement = vertex.elementIndex;
                    selectedElements.clear();
                    isDragging = true;
                    dragStart = pos;
                    // Save state for undo
                    undoStack.push({
                        type: 'move',
                        index: selectedElement,
                        before: JSON.parse(JSON.stringify(elements[selectedElement]))
                    });
                } else {
                    // Try to select an element or pin
                    const clickedElement = findElementAt(pos.x, pos.y);
                    if (clickedElement !== null) {
                        // Handle multi-selection with shift
                        if (shiftKey) {
                            if (selectedElements.has(clickedElement)) {
                                selectedElements.delete(clickedElement);
                            } else {
                                selectedElements.add(clickedElement);
                            }
                            selectedElement = null;
                        } else {
                            // Single selection - check if clicking on already selected element(s)
                            if (selectedElements.size > 0 && selectedElements.has(clickedElement)) {
                                // Start dragging all selected elements
                                isDragging = true;
                                dragStart = pos;
                                editingVertex = null;
                                // Save original states for all selected elements
                                originalElementStates.clear();
                                selectedElements.forEach(idx => {
                                    originalElementStates.set(idx, JSON.parse(JSON.stringify(elements[idx])));
                                });
                                const referenceState = originalElementStates.get(clickedElement);
                                const referencePoint = referenceState ? getElementReferencePoint(referenceState) : getElementReferencePoint(elements[clickedElement]);
                                multiDragReference = {
                                    index: clickedElement,
                                    point: referencePoint
                                };
                            } else {
                                // New single selection
                                selectedElement = clickedElement;
                                selectedElements.clear();
                                isDragging = true;
                                dragStart = pos;
                                editingVertex = null;
                                // Save original state for dragging and undo
                                originalElementState = JSON.parse(JSON.stringify(elements[selectedElement]));
                                undoStack.push({
                                    type: 'move',
                                    index: selectedElement,
                                    before: originalElementState
                                });
                            }
                        }
                    } else {
                        // Start drag selection if clicking empty space
                        if (!shiftKey) {
                            selectedElement = null;
                            selectedElements.clear();
                        }
                        isSelecting = true;
                        selectionRect = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y };
                        editingVertex = null;
                    }
                }
                updateElementList();
                redraw();
            } else if (mode === 'line') {
                isDrawing = true;
                drawStart = pos;
            } else if (mode === 'circle') {
                isDrawing = true;
                drawStart = pos;
            } else if (mode === 'arc') {
                handleArcClick(pos);
            } else if (mode === 'polygon') {
                polygonPoints.push(pos);
                redraw();
            } else if (mode === 'polyline') {
                polylinePoints.push(pos);
                redraw();
            } else if (mode === 'pin') {
                addPin(pos);
            }
        }

        function onMouseMove(e) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const cx = (e.clientX - rect.left) * scaleX;
            const cy = (e.clientY - rect.top) * scaleY;
            const shouldSnap = mode !== 'select';
            const pos = canvasToComponent(cx, cy, { snap: shouldSnap });

            coordIndicator.textContent = `X: ${pos.x.toFixed(2)}, Y: ${pos.y.toFixed(2)}`;

            if (draggingPinLabelIndex !== null) {
                applyPinLabelDragPosition(pos);
                return;
            }

            if (draggingPinIndex !== null) {
                applyPinDragPosition(pos);
                return;
            }

            if (mode === 'arc' && arcStage > 0) {
                arcPreviewPoint = pos;
                redraw();
                return;
            }

            if (isSelecting && selectionRect) {
                // Update selection rectangle
                selectionRect.x2 = pos.x;
                selectionRect.y2 = pos.y;
                redraw();
            } else if (isDragging && dragStart) {
                if (editingVertex) {
                    // Edit only the selected vertex
                    const el = elements[editingVertex.elementIndex];
                    const snapToGrid = document.getElementById('snapToGrid').checked;
                    const gridSize = parseInt(document.getElementById('gridSize').value) || 1;
                    const snapValue = (value) => Math.round(value / gridSize) * gridSize;
                    const target = {
                        x: snapToGrid ? snapValue(pos.x) : pos.x,
                        y: snapToGrid ? snapValue(pos.y) : pos.y
                    };
                    if (el.type === 'line') {
                        if (editingVertex.vertex === 'start') {
                            el.x1 = target.x;
                            el.y1 = target.y;
                        } else if (editingVertex.vertex === 'end') {
                            el.x2 = target.x;
                            el.y2 = target.y;
                        }
                    } else if (el.type === 'circle') {
                        if (editingVertex.vertex === 'center') {
                            el.cx = target.x;
                            el.cy = target.y;
                        } else if (editingVertex.vertex === 'radius') {
                            const radius = Math.sqrt(
                                Math.pow(target.x - el.cx, 2) + Math.pow(target.y - el.cy, 2)
                            );
                            el.r = Math.max(1, Math.round(radius));
                        }
                    } else if ((el.type === 'polygon' || el.type === 'polyline') && el.points) {
                        el.points[editingVertex.vertex].x = target.x;
                        el.points[editingVertex.vertex].y = target.y;
                    }
                    redraw();
                } else if (selectedElements.size > 0 && originalElementStates.size > 0) {
                    // Drag multiple selected elements using a shared snapped delta
                    const snapToGrid = document.getElementById('snapToGrid').checked;
                    const gridSize = parseInt(document.getElementById('gridSize').value, 10) || 1;

                    const rawOffsetX = pos.x - dragStart.x;
                    const rawOffsetY = pos.y - dragStart.y;

                    let deltaX = rawOffsetX;
                    let deltaY = rawOffsetY;

                    if (snapToGrid) {
                        const referenceState = multiDragReference?.index !== undefined
                            ? originalElementStates.get(multiDragReference.index)
                            : null;
                        const referencePoint = multiDragReference?.point || (referenceState ? getElementReferencePoint(referenceState) : null);

                        if (referencePoint) {
                            let targetX = referencePoint.x + rawOffsetX;
                            let targetY = referencePoint.y + rawOffsetY;
                            targetX = Math.round(targetX / gridSize) * gridSize;
                            targetY = Math.round(targetY / gridSize) * gridSize;
                            deltaX = targetX - referencePoint.x;
                            deltaY = targetY - referencePoint.y;
                        } else {
                            deltaX = Math.round(rawOffsetX / gridSize) * gridSize;
                            deltaY = Math.round(rawOffsetY / gridSize) * gridSize;
                        }
                    }

                    selectedElements.forEach(idx => {
                        const el = elements[idx];
                        const orig = originalElementStates.get(idx);
                        if (!orig) return;

                        if (el.type === 'line') {
                            el.x1 = orig.x1 + deltaX;
                            el.y1 = orig.y1 + deltaY;
                            el.x2 = orig.x2 + deltaX;
                            el.y2 = orig.y2 + deltaY;
                        } else if (el.type === 'circle' || el.type === 'arc') {
                            el.cx = orig.cx + deltaX;
                            el.cy = orig.cy + deltaY;
                        } else if ((el.type === 'polygon' || el.type === 'polyline') && el.points && orig.points) {
                            el.points.forEach((p, i) => {
                                p.x = orig.points[i].x + deltaX;
                                p.y = orig.points[i].y + deltaY;
                            });
                        }
                    });

                    redraw();
                } else if (selectedElement !== null && originalElementState) {
                    // Drag single element - snap the target position to grid
                    const snapToGrid = document.getElementById('snapToGrid').checked;
                    const el = elements[selectedElement];
                    const orig = originalElementState;

                    // Calculate offset from drag start
                    const offsetX = pos.x - dragStart.x;
                    const offsetY = pos.y - dragStart.y;

                    // Calculate where the reference point would be
                    let targetX, targetY;
                    if (el.type === 'line') {
                        targetX = orig.x1 + offsetX;
                        targetY = orig.y1 + offsetY;
                    } else if (el.type === 'circle' || el.type === 'arc') {
                        targetX = orig.cx + offsetX;
                        targetY = orig.cy + offsetY;
                    } else if ((el.type === 'polygon' || el.type === 'polyline') && el.points) {
                        targetX = orig.points[0].x + offsetX;
                        targetY = orig.points[0].y + offsetY;
                    }

                    // Snap target position to grid if enabled
                    if (snapToGrid) {
                        const gridSize = parseInt(document.getElementById('gridSize').value);
                        targetX = Math.round(targetX / gridSize) * gridSize;
                        targetY = Math.round(targetY / gridSize) * gridSize;
                    }

                    // Calculate actual delta to apply (from original to snapped target)
                    let dx, dy;
                    if (el.type === 'line') {
                        dx = targetX - orig.x1;
                        dy = targetY - orig.y1;
                    } else if (el.type === 'circle' || el.type === 'arc') {
                        dx = targetX - orig.cx;
                        dy = targetY - orig.cy;
                    } else if ((el.type === 'polygon' || el.type === 'polyline') && el.points) {
                        dx = targetX - orig.points[0].x;
                        dy = targetY - orig.points[0].y;
                    }

                    // Apply delta to all points
                    if (el.type === 'line') {
                        el.x1 = orig.x1 + dx;
                        el.y1 = orig.y1 + dy;
                        el.x2 = orig.x2 + dx;
                        el.y2 = orig.y2 + dy;
                    } else if (el.type === 'circle' || el.type === 'arc') {
                        el.cx = orig.cx + dx;
                        el.cy = orig.cy + dy;
                    } else if ((el.type === 'polygon' || el.type === 'polyline') && el.points) {
                        el.points.forEach((p, i) => {
                            p.x = orig.points[i].x + dx;
                            p.y = orig.points[i].y + dy;
                        });
                    }

                    redraw();
                }
            } else if (isDrawing && drawStart) {
                redraw();

                const { zoom } = getCanvasOffset();
                const start = componentToCanvas(drawStart.x, drawStart.y);
                const end = componentToCanvas(pos.x, pos.y);

                ctx.strokeStyle = '#666';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);

                if (mode === 'line') {
                    ctx.beginPath();
                    ctx.moveTo(start.x, start.y);
                    ctx.lineTo(end.x, end.y);
                    ctx.stroke();
                } else if (mode === 'circle') {
                    const radius = Math.sqrt(Math.pow(pos.x - drawStart.x, 2) + Math.pow(pos.y - drawStart.y, 2));
                    ctx.beginPath();
                    ctx.arc(start.x, start.y, radius * zoom, 0, Math.PI * 2);
                    ctx.stroke();
                }

                ctx.setLineDash([]);
            }
        }

        function onMouseUp(e) {
            if (draggingPinLabelIndex !== null) {
                const pin = pins[draggingPinLabelIndex];
                const lastAction = undoStack[undoStack.length - 1];
                if (lastAction && lastAction.type === 'move-pin-label') {
                    const before = lastAction.before;
                    const labelPos = pin ? getPinLabelPosition(pin) : null;
                    if (!labelPos || (labelPos.x === before.x && labelPos.y === before.y)) {
                        undoStack.pop();
                    }
                }
                updatePinList();
                redraw();
                resetPinLabelDragState();
                return;
            }
            if (draggingPinIndex !== null) {
                const pin = pins[draggingPinIndex];
                const lastAction = undoStack[undoStack.length - 1];
                if (lastAction && lastAction.type === 'move-pin') {
                    const before = lastAction.before;
                    if (!pin || (pin.position.x === before.position.x && pin.position.y === before.position.y)) {
                        undoStack.pop();
                    }
                }
                updatePinList();
                redraw();
                resetPinDragState();
                return;
            }
            if (isSelecting) {
                // Finish selection rectangle
                if (selectionRect) {
                    const minX = Math.min(selectionRect.x1, selectionRect.x2);
                    const maxX = Math.max(selectionRect.x1, selectionRect.x2);
                    const minY = Math.min(selectionRect.y1, selectionRect.y2);
                    const maxY = Math.max(selectionRect.y1, selectionRect.y2);

                    // Find elements within rectangle
                    elements.forEach((el, idx) => {
                        if (isElementInRect(el, minX, minY, maxX, maxY)) {
                            selectedElements.add(idx);
                        }
                    });
                }

                isSelecting = false;
                selectionRect = null;
                updateElementList();
                redraw();
                return;
            }

            if (isDragging) {
                // Check if element actually moved
                if (selectedElements.size > 0 && originalElementStates.size > 0) {
                    // Save undo for multi-element move
                    const beforeStates = new Map();
                    originalElementStates.forEach((state, idx) => {
                        beforeStates.set(idx, state);
                    });
                    undoStack.push({
                        type: 'multi-move',
                        states: beforeStates,
                        indices: Array.from(selectedElements)
                    });
                    originalElementStates.clear();
                } else if (undoStack.length > 0 && undoStack[undoStack.length - 1].type === 'move') {
                    const lastAction = undoStack[undoStack.length - 1];
                    const current = elements[lastAction.index];
                    const before = lastAction.before;
                    // If no actual change, remove the undo action
                    if (JSON.stringify(current) === JSON.stringify(before)) {
                        undoStack.pop();
                    }
                }
                isDragging = false;
                dragStart = null;
                editingVertex = null;
                originalElementState = null;
                multiDragReference = null;
                updateElementList();
                redraw();
                markCurrentComponentDirty();
                return;
            }

            if (!isDrawing || !drawStart) return;

            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const cx = (e.clientX - rect.left) * scaleX;
            const cy = (e.clientY - rect.top) * scaleY;
            const shouldSnap = mode !== 'select';
            const pos = canvasToComponent(cx, cy, { snap: shouldSnap });

            const strokeWidth = parseInt(document.getElementById('strokeWidth').value);
            const filled = document.getElementById('filled').checked;

            if (mode === 'line') {
                elements.push({
                    type: 'line',
                    x1: drawStart.x,
                    y1: drawStart.y,
                    x2: pos.x,
                    y2: pos.y,
                    strokeWidth
                });
                undoStack.push({ type: 'create', index: elements.length - 1 });
                markCurrentComponentDirty();
            } else if (mode === 'circle') {
                const radius = Math.sqrt(Math.pow(pos.x - drawStart.x, 2) + Math.pow(pos.y - drawStart.y, 2));
                elements.push({
                    type: 'circle',
                    cx: drawStart.x,
                    cy: drawStart.y,
                    r: Math.round(radius),
                    strokeWidth,
                    filled
                });
                undoStack.push({ type: 'create', index: elements.length - 1 });
                markCurrentComponentDirty();
            }

            isDrawing = false;
            drawStart = null;
            updateElementList();
            redraw();
        }

        function handleArcClick(pos) {
            if (arcStage === 0) {
                arcCenter = pos;
                arcStage = 1;
            } else if (arcStage === 1) {
                const radius = Math.sqrt(Math.pow(pos.x - arcCenter.x, 2) + Math.pow(pos.y - arcCenter.y, 2));
                if (radius < 1) return;
                arcRadius = radius;
                arcStartAngle = Math.atan2(pos.y - arcCenter.y, pos.x - arcCenter.x);
                arcStage = 2;
                arcPreviewPoint = pos;
            } else if (arcStage === 2) {
                const strokeWidth = parseInt(document.getElementById('strokeWidth').value);
                const endAngle = Math.atan2(pos.y - arcCenter.y, pos.x - arcCenter.x);
                if (Math.abs(endAngle - arcStartAngle) < 0.01) {
                    arcPreviewPoint = pos;
                    redraw();
                    return;
                }
                elements.push({
                    type: 'arc',
                    cx: arcCenter.x,
                    cy: arcCenter.y,
                    r: Math.max(1, Math.round(arcRadius)),
                    startAngle: arcStartAngle,
                    endAngle,
                    strokeWidth
                });
                undoStack.push({ type: 'create', index: elements.length - 1 });
                markCurrentComponentDirty();
                resetArcConstruction();
                updateElementList();
            }
            redraw();
        }

        function onDoubleClick(e) {
            if (mode === 'polygon' && polygonPoints.length >= 3) {
                const strokeWidth = parseInt(document.getElementById('strokeWidth').value);
                const filled = document.getElementById('filled').checked;

                elements.push({
                    type: 'polygon',
                    points: [...polygonPoints],
                    strokeWidth,
                    filled
                });
                undoStack.push({ type: 'create', index: elements.length - 1 });
                markCurrentComponentDirty();

                polygonPoints = [];
                updateElementList();
                redraw();
            } else if (mode === 'polyline' && polylinePoints.length >= 2) {
                const strokeWidth = parseInt(document.getElementById('strokeWidth').value);

                elements.push({
                    type: 'polyline',
                    points: [...polylinePoints],
                    strokeWidth
                });
                undoStack.push({ type: 'create', index: elements.length - 1 });
                markCurrentComponentDirty();

                polylinePoints = [];
                updateElementList();
                redraw();
            }
        }

        function getHitThreshold(targetPixels = 4, options = {}) {
            const { zoom } = getCanvasOffset();
            const safeZoom = Math.max(zoom, 0.1);
            const minComponentUnits = options.min || 1.5;
            const maxComponentUnits = options.max || 8;
            const converted = targetPixels / safeZoom;
            return Math.max(minComponentUnits, Math.min(maxComponentUnits, converted));
        }

        function findElementAt(x, y) {
            const threshold = getHitThreshold(3, { min: 1.5 });

            for (let i = elements.length - 1; i >= 0; i--) {
                const el = elements[i];

                if (el.type === 'line') {
                    const dist = pointToLineDistance(x, y, el.x1, el.y1, el.x2, el.y2);
                    if (dist < threshold) return i;
                } else if (el.type === 'circle' || el.type === 'arc') {
                    const dist = Math.abs(Math.sqrt(Math.pow(x - el.cx, 2) + Math.pow(y - el.cy, 2)) - el.r);
                    if (dist < threshold) return i;
                } else if (el.type === 'polygon' && el.points) {
                    // Check if point is near any edge of the polygon
                    for (let j = 0; j < el.points.length; j++) {
                        const p1 = el.points[j];
                        const p2 = el.points[(j + 1) % el.points.length];
                        const dist = pointToLineDistance(x, y, p1.x, p1.y, p2.x, p2.y);
                        if (dist < threshold) return i;
                    }
                } else if (el.type === 'polyline' && el.points) {
                    // Check if point is near any segment of the polyline
                    for (let j = 0; j < el.points.length - 1; j++) {
                        const p1 = el.points[j];
                        const p2 = el.points[j + 1];
                        const dist = pointToLineDistance(x, y, p1.x, p1.y, p2.x, p2.y);
                        if (dist < threshold) return i;
                    }
                }
            }

            return null;
        }

        function findVertexAt(x, y) {
            const threshold = getHitThreshold(4, { min: 2 });

            for (let i = elements.length - 1; i >= 0; i--) {
                const el = elements[i];

                if (el.type === 'line') {
                    // Check start point
                    if (Math.sqrt(Math.pow(x - el.x1, 2) + Math.pow(y - el.y1, 2)) < threshold) {
                        return { elementIndex: i, vertex: 'start' };
                    }
                    // Check end point
                    if (Math.sqrt(Math.pow(x - el.x2, 2) + Math.pow(y - el.y2, 2)) < threshold) {
                        return { elementIndex: i, vertex: 'end' };
                    }
                } else if (el.type === 'polygon' && el.points) {
                    // Check each vertex of polygon
                    for (let j = 0; j < el.points.length; j++) {
                        const p = el.points[j];
                        if (Math.sqrt(Math.pow(x - p.x, 2) + Math.pow(y - p.y, 2)) < threshold) {
                            return { elementIndex: i, vertex: j };
                        }
                    }
                } else if (el.type === 'polyline' && el.points) {
                    // Check each vertex of polyline
                    for (let j = 0; j < el.points.length; j++) {
                        const p = el.points[j];
                        if (Math.sqrt(Math.pow(x - p.x, 2) + Math.pow(y - p.y, 2)) < threshold) {
                            return { elementIndex: i, vertex: j };
                        }
                    }
                } else if (el.type === 'circle') {
                    const distToCenter = Math.sqrt(Math.pow(x - el.cx, 2) + Math.pow(y - el.cy, 2));
                    if (distToCenter < threshold) {
                        return { elementIndex: i, vertex: 'center' };
                    }
                    if (Math.abs(distToCenter - el.r) < threshold) {
                        return { elementIndex: i, vertex: 'radius' };
                    }
                }
            }

            return null;
        }

        function pointToLineDistance(px, py, x1, y1, x2, y2) {
            const A = px - x1;
            const B = py - y1;
            const C = x2 - x1;
            const D = y2 - y1;

            const dot = A * C + B * D;
            const lenSq = C * C + D * D;
            let param = lenSq !== 0 ? dot / lenSq : -1;

            let xx, yy;
            if (param < 0) {
                xx = x1; yy = y1;
            } else if (param > 1) {
                xx = x2; yy = y2;
            } else {
                xx = x1 + param * C;
                yy = y1 + param * D;
            }

            return Math.sqrt(Math.pow(px - xx, 2) + Math.pow(py - yy, 2));
        }

        function isElementInRect(el, minX, minY, maxX, maxY) {
            // Check if any part of the element is within the rectangle
            if (el.type === 'line') {
                // Check if either endpoint is in rect, or if line intersects rect
                return (el.x1 >= minX && el.x1 <= maxX && el.y1 >= minY && el.y1 <= maxY) ||
                    (el.x2 >= minX && el.x2 <= maxX && el.y2 >= minY && el.y2 <= maxY);
            } else if (el.type === 'circle' || el.type === 'arc') {
                // Check if center is in rect (simplified)
                return el.cx >= minX && el.cx <= maxX && el.cy >= minY && el.cy <= maxY;
            } else if ((el.type === 'polygon' || el.type === 'polyline') && el.points) {
                // Check if any point is in rect
                return el.points.some(p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
            }
            return false;
        }

        function findPinNearPosition(pos) {
            if (!pos || !pins.length) return -1;
            const threshold = getHitThreshold(8, { min: 2, max: 12 });
            for (let i = pins.length - 1; i >= 0; i--) {
                const pinPos = pins[i]?.position;
                if (!pinPos) continue;
                const dist = Math.hypot(pinPos.x - pos.x, pinPos.y - pos.y);
                if (dist <= threshold) {
                    return i;
                }
            }
            return -1;
        }

        function findPinLabelNearPosition(pos) {
            if (!pos || !pins.length) return -1;
            const threshold = getHitThreshold(6, { min: 2, max: 12 });
            for (let i = pins.length - 1; i >= 0; i--) {
                const labelPos = getPinLabelPosition(pins[i]);
                const dist = Math.hypot(labelPos.x - pos.x, labelPos.y - pos.y);
                if (dist <= threshold) {
                    return i;
                }
            }
            return -1;
        }

        function getElementReferencePoint(el) {
            if (!el) return { x: 0, y: 0 };
            if (el.type === 'line') return { x: el.x1, y: el.y1 };
            if (el.type === 'circle' || el.type === 'arc') return { x: el.cx, y: el.cy };
            if ((el.type === 'polygon' || el.type === 'polyline') && el.points && el.points.length > 0) {
                return { x: el.points[0].x, y: el.points[0].y };
            }
            return { x: 0, y: 0 };
        }

        function applyPinDragPosition(pos) {
            if (draggingPinIndex === null) return;
            const pin = pins[draggingPinIndex];
            if (!pin || !pos) return;
            const gridSize = parseInt(document.getElementById('gridSize').value, 10) || 1;
            const snapToGrid = document.getElementById('snapToGrid').checked;
            let targetX = pos.x + (pinDragOffset?.x || 0);
            let targetY = pos.y + (pinDragOffset?.y || 0);
            if (snapToGrid) {
                targetX = Math.round(targetX / gridSize) * gridSize;
                targetY = Math.round(targetY / gridSize) * gridSize;
            }
            const deltaX = targetX - pin.position.x;
            const deltaY = targetY - pin.position.y;
            pin.position.x = targetX;
            pin.position.y = targetY;
            const label = ensurePinLabelPosition(pin);
            label.x = Math.round(label.x + deltaX);
            label.y = Math.round(label.y + deltaY);
            updatePinList();
            redraw();
            markCurrentComponentDirty();
        }

        function applyPinLabelDragPosition(pos) {
            if (draggingPinLabelIndex === null) return;
            const pin = pins[draggingPinLabelIndex];
            if (!pin || !pos) return;
            const label = ensurePinLabelPosition(pin);
            const gridSize = parseInt(document.getElementById('gridSize').value, 10) || 1;
            const snapToGrid = document.getElementById('snapToGrid').checked;
            let targetX = pos.x + (pinLabelDragOffset?.x || 0);
            let targetY = pos.y + (pinLabelDragOffset?.y || 0);
            if (snapToGrid) {
                targetX = Math.round(targetX / gridSize) * gridSize;
                targetY = Math.round(targetY / gridSize) * gridSize;
            }
            label.x = Math.round(targetX);
            label.y = Math.round(targetY);
            updatePinList();
            redraw();
            markCurrentComponentDirty();
        }

        function resetPinDragState() {
            draggingPinIndex = null;
            pinDragOffset = null;
        }

        function resetPinLabelDragState() {
            draggingPinLabelIndex = null;
            pinLabelDragOffset = null;
        }

        function getDefaultPinLabelPosition(pin) {
            const source = pin?.position || { x: 0, y: 0 };
            return {
                x: Math.round(source.x + DEFAULT_PIN_LABEL_OFFSET.x),
                y: Math.round(source.y + DEFAULT_PIN_LABEL_OFFSET.y)
            };
        }

        function ensurePinLabelPosition(pin) {
            if (!pin) return { x: 0, y: 0 };
            if (!pin.labelPosition || !Number.isFinite(pin.labelPosition.x) || !Number.isFinite(pin.labelPosition.y)) {
                pin.labelPosition = getDefaultPinLabelPosition(pin);
            }
            return pin.labelPosition;
        }

        function getPinLabelPosition(pin) {
            const label = ensurePinLabelPosition(pin);
            return { x: label.x, y: label.y };
        }

        function normalizePin(pin, index) {
            const baseId = pin?.id || String(index + 1);
            const x = Number.isFinite(pin?.position?.x) ? pin.position.x : 0;
            const y = Number.isFinite(pin?.position?.y) ? pin.position.y : 0;
            const normalized = {
                id: baseId,
                name: pin?.name || baseId,
                position: { x, y }
            };
            const labelSource = pin?.labelPosition;
            const labelX = Number.isFinite(labelSource?.x) ? labelSource.x : x + DEFAULT_PIN_LABEL_OFFSET.x;
            const labelY = Number.isFinite(labelSource?.y) ? labelSource.y : y + DEFAULT_PIN_LABEL_OFFSET.y;
            normalized.labelPosition = { x: Math.round(labelX), y: Math.round(labelY) };
            return normalized;
        }

        function normalizePins(pinList) {
            if (!Array.isArray(pinList)) return [];
            return pinList.map((pin, index) => normalizePin(pin, index));
        }

        // Pin management
        function addPin(pos) {
            const id = (pins.length + 1).toString();
            pins.push(normalizePin({
                id,
                name: id,
                position: { x: pos.x, y: pos.y }
            }, pins.length));
            updatePinList();
            redraw();
            markCurrentComponentDirty();
        }

        function addPinManual() {
            const id = (pins.length + 1).toString();
            pins.push(normalizePin({
                id,
                name: id,
                position: { x: 0, y: 0 }
            }, pins.length));
            updatePinList();
            redraw();
            markCurrentComponentDirty();
        }

        function updatePinList() {
            const container = document.getElementById('pinList');
            container.innerHTML = pins.map((pin, idx) => {
                const labelPos = getPinLabelPosition(pin);
                return `
                <div class="pin-item">
                    <div class="pin-header">
                        <span>Pin ${pin.id}: ${pin.name}</span>
                        <button class="btn btn-danger small-btn" onclick="removePin(${idx})">×</button>
                    </div>
                    <div class="pin-coords">
                        <input type="text" value="${pin.name}" placeholder="Name" onchange="updatePin(${idx}, 'name', this.value)"> 
                        <input type="number" value="${pin.position.x}" onchange="updatePin(${idx}, 'x', this.value)">
                        <input type="number" value="${pin.position.y}" onchange="updatePin(${idx}, 'y', this.value)">
                    </div>
                    <div class="pin-label-coords">
                        <span>Label</span>
                        <input type="number" value="${labelPos.x}" onchange="updatePin(${idx}, 'labelX', this.value)">
                        <input type="number" value="${labelPos.y}" onchange="updatePin(${idx}, 'labelY', this.value)">
                    </div>
                </div>
            `;
            }).join('');
        }

        function updatePin(idx, prop, value) {
            const pin = pins[idx];
            if (!pin) return;
            if (prop === 'name') {
                pin.name = value;
            } else if (prop === 'x' || prop === 'y') {
                const parsed = parseInt(value, 10);
                if (!Number.isFinite(parsed)) return;
                const axis = prop === 'x' ? 'x' : 'y';
                const delta = parsed - pin.position[axis];
                pin.position[axis] = parsed;
                const label = ensurePinLabelPosition(pin);
                label[axis] = Math.round(label[axis] + delta);
            } else if (prop === 'labelX' || prop === 'labelY') {
                const parsed = parseInt(value, 10);
                if (!Number.isFinite(parsed)) return;
                const label = ensurePinLabelPosition(pin);
                if (prop === 'labelX') {
                    label.x = parsed;
                } else {
                    label.y = parsed;
                }
            }
            updatePinList();
            redraw();
            markCurrentComponentDirty();
        }

        function removePin(idx) {
            pins.splice(idx, 1);
            // Renumber pins
            pins.forEach((p, i) => p.id = (i + 1).toString());
            updatePinList();
            redraw();
            markCurrentComponentDirty();
        }

        // Element list
        function updateElementList() {
            const container = document.getElementById('elementList');
            container.innerHTML = elements.map((el, idx) => {
                const isSelected = selectedElement === idx || selectedElements.has(idx);
                return `
                <div class="element-item ${isSelected ? 'selected' : ''}" onclick="selectElement(${idx}, event)">
                    <div class="element-header">
                        <span>${el.type}</span>
                        <button class="btn btn-danger small-btn" onclick="removeElement(${idx}); event.stopPropagation();">×</button>
                    </div>
                    <div style="font-size: 10px; color: #888;">
                        ${formatElementInfo(el)}
                    </div>
                </div>
            `}).join('');
        }

        function formatElementInfo(el) {
            if (el.type === 'line') return `(${el.x1},${el.y1}) → (${el.x2},${el.y2})`;
            if (el.type === 'circle') return `center: (${el.cx},${el.cy}), r: ${el.r}`;
            if (el.type === 'arc') return `center: (${el.cx},${el.cy}), r: ${el.r}`;
            if (el.type === 'polygon') return `${el.points?.length || 0} points (closed)`;
            if (el.type === 'polyline') return `${el.points?.length || 0} points (open)`;
            return '';
        }

        function selectElement(idx, event) {
            if (event && event.shiftKey) {
                // Toggle selection with shift
                if (selectedElements.has(idx)) {
                    selectedElements.delete(idx);
                } else {
                    selectedElements.add(idx);
                }
                selectedElement = null;
            } else {
                // Single selection
                selectedElement = idx;
                selectedElements.clear();
            }
            updateElementList();
            redraw();
        }

        function removeElement(idx) {
            const element = elements[idx];
            undoStack.push({ type: 'delete', index: idx, element: JSON.parse(JSON.stringify(element)) });
            elements.splice(idx, 1);
            selectedElement = null;
            selectedElements.clear();
            updateElementList();
            redraw();
            markCurrentComponentDirty();
        }

        function deleteSelected() {
            let removedAny = false;
            if (selectedElements.size > 0) {
                // Delete multiple selected elements (from highest index to lowest)
                const indices = Array.from(selectedElements).sort((a, b) => b - a);
                indices.forEach(idx => {
                    const element = elements[idx];
                    undoStack.push({ type: 'delete', index: idx, element: JSON.parse(JSON.stringify(element)) });
                    elements.splice(idx, 1);
                });
                selectedElements.clear();
                removedAny = true;
            } else if (selectedElement !== null) {
                removeElement(selectedElement);
                return;
            }
            updateElementList();
            redraw();
            if (removedAny) {
                markCurrentComponentDirty();
            }
        }

        function updateSelectedStroke() {
            const strokeWidth = parseInt(document.getElementById('strokeWidth').value);
            let changed = false;

            if (selectedElements.size > 0) {
                selectedElements.forEach(idx => {
                    if (elements[idx].strokeWidth !== strokeWidth) {
                        elements[idx].strokeWidth = strokeWidth;
                        changed = true;
                    }
                });
            } else if (selectedElement !== null) {
                if (elements[selectedElement].strokeWidth !== strokeWidth) {
                    elements[selectedElement].strokeWidth = strokeWidth;
                    changed = true;
                }
            }
            if (changed) {
                markCurrentComponentDirty();
            }
            redraw();
        }

        function undo() {
            if (undoStack.length === 0) return;

            const action = undoStack.pop();

            if (action.type === 'create') {
                // Remove the created element
                elements.splice(action.index, 1);
                selectedElement = null;
            } else if (action.type === 'delete') {
                // Restore the deleted element
                elements.splice(action.index, 0, action.element);
            } else if (action.type === 'move') {
                // Restore previous state of element
                elements[action.index] = JSON.parse(JSON.stringify(action.before));
            } else if (action.type === 'multi-move') {
                // Restore previous states of multiple elements
                action.states.forEach((state, idx) => {
                    elements[idx] = JSON.parse(JSON.stringify(state));
                });
            } else if (action.type === 'move-pin') {
                const pin = pins[action.index];
                if (pin && action.before) {
                    pin.position = { x: action.before.position.x, y: action.before.position.y };
                    const label = ensurePinLabelPosition(pin);
                    label.x = action.before.label.x;
                    label.y = action.before.label.y;
                }
                updatePinList();
            } else if (action.type === 'move-pin-label') {
                const pin = pins[action.index];
                if (pin && action.before) {
                    const label = ensurePinLabelPosition(pin);
                    label.x = action.before.x;
                    label.y = action.before.y;
                }
                updatePinList();
            }

            updateElementList();
            redraw();
            markCurrentComponentDirty();
        }

        function clearDrawing() {
            if (confirm('Clear all drawing elements?')) {
                elements = [];
                selectedElement = null;
                selectedElements.clear();
                resetArcConstruction();
                updateElementList();
                redraw();
                markCurrentComponentDirty();
            }
        }

        // Component management
        function getDefaultLabelPositions(width, height) {
            const w = Number.isFinite(width) ? width : 80;
            const h = Number.isFinite(height) ? height : 40;
            return {
                designator: [
                    { x: Math.round(w / 2), y: -12 },
                    { x: -12, y: Math.round(h / 2) }
                ],
                value: [
                    { x: Math.round(w / 2), y: h + 12 },
                    { x: w + 12, y: Math.round(h / 2) }
                ]
            };
        }

        function setLabelInputs(labels, width, height) {
            const defaults = getDefaultLabelPositions(width, height);
            const designator0 = labels?.designator?.[0] || defaults.designator[0];
            const designator90 = labels?.designator?.[1] || defaults.designator[1];
            const value0 = labels?.value?.[0] || defaults.value[0];
            const value90 = labels?.value?.[1] || defaults.value[1];
            const mappings = [
                { id: 'designatorLabel0X', value: designator0.x },
                { id: 'designatorLabel0Y', value: designator0.y },
                { id: 'valueLabel0X', value: value0.x },
                { id: 'valueLabel0Y', value: value0.y },
                { id: 'designatorLabel90X', value: designator90.x },
                { id: 'designatorLabel90Y', value: designator90.y },
                { id: 'valueLabel90X', value: value90.x },
                { id: 'valueLabel90Y', value: value90.y }
            ];
            mappings.forEach(entry => {
                const input = document.getElementById(entry.id);
                if (input) input.value = entry.value;
            });
            requestLabelPreviewUpdate({ immediate: true });
        }

        function readLabelInputs(width, height) {
            const defaults = getDefaultLabelPositions(width, height);
            const getNumber = (id, fallback) => {
                const input = document.getElementById(id);
                if (!input) return fallback;
                const parsed = parseInt(input.value, 10);
                return Number.isFinite(parsed) ? parsed : fallback;
            };
            return {
                designator: [
                    {
                        x: getNumber('designatorLabel0X', defaults.designator[0].x),
                        y: getNumber('designatorLabel0Y', defaults.designator[0].y)
                    },
                    {
                        x: getNumber('designatorLabel90X', defaults.designator[1].x),
                        y: getNumber('designatorLabel90Y', defaults.designator[1].y)
                    }
                ],
                value: [
                    {
                        x: getNumber('valueLabel0X', defaults.value[0].x),
                        y: getNumber('valueLabel0Y', defaults.value[0].y)
                    },
                    {
                        x: getNumber('valueLabel90X', defaults.value[1].x),
                        y: getNumber('valueLabel90Y', defaults.value[1].y)
                    }
                ]
            };
        }

        function stripModelFields(map) {
            if (!map || typeof map !== 'object') return;
            Object.values(map).forEach(comp => {
                if (comp && typeof comp === 'object' && 'model' in comp) {
                    delete comp.model;
                }
            });
        }

        // Component management
        function updateComponentList() {
            const container = document.getElementById('componentList');
            if (!container) return;

            const items = [];

            if (isNewComponentDraft) {
                const draftId = document.getElementById('compId')?.value.trim();
                const draftName = document.getElementById('compName')?.value.trim();
                const label = draftId || draftName || 'New Component';
                items.push(`
                    <div class="component-item draft selected">
                        <span class="draft-label">${label}</span>
                        <span class="draft-subtext">Unsaved</span>
                    </div>
                `);
            }

            items.push(...Object.entries(components).map(([id, comp]) => {
                const isSelected = !isNewComponentDraft && currentComponentId === id;
                const isDirty = dirtyComponents.has(id);
                const classes = ['component-item'];
                if (isSelected) classes.push('selected');
                if (isDirty) classes.push('dirty');
                return `
                <div class="${classes.join(' ')}" onclick="loadComponent('${id}')">
                    ${comp.svg || '<svg></svg>'}
                    <span class="component-name">${comp.name}</span>
                </div>
            `;
            }));

            container.innerHTML = items.join('');
        }

        function loadComponent(id) {
            isNewComponentDraft = false;
            currentComponentId = id;
            const comp = components[id];
            const compWidthValue = comp.size?.width || 80;
            const compHeightValue = comp.size?.height || 40;

            document.getElementById('compId').value = id;
            document.getElementById('compName').value = comp.name || '';
            populatePrefixOptions(comp.designator?.prefix || getDefaultPrimitivePrefix());
            document.getElementById('compPrefix').value = comp.designator?.prefix || getDefaultPrimitivePrefix();
            document.getElementById('compAutoInc').checked = comp.designator?.autoIncrement !== false;
            applyPrimitiveDefaults(document.getElementById('compPrefix').value, { componentDefault: comp.defaultValue });
            document.getElementById('compWidth').value = compWidthValue;
            document.getElementById('compHeight').value = compHeightValue;

            pins = normalizePins(comp.pins);
            elements = parseSVGToElements(comp.svg);
            setLabelInputs(comp.labels, compWidthValue, compHeightValue);
            selectedElement = null;
            selectedElements.clear();
            resetArcConstruction();

            updateComponentList();
            updatePinList();
            updateElementList();
            resizeCanvas(); // Ensure canvas dimensions are recalculated
            requestLabelPreviewUpdate({ immediate: true });
        }

        function parseSVGToElements(svgString) {
            if (!svgString) return [];

            const elements = [];
            const parser = new DOMParser();
            const doc = parser.parseFromString(svgString, 'image/svg+xml');
            const svg = doc.querySelector('svg');
            if (!svg) return [];

            // Get viewBox to understand coordinate space
            const viewBox = svg.getAttribute('viewBox');
            const compWidth = parseInt(document.getElementById('compWidth').value) || 80;
            const compHeight = parseInt(document.getElementById('compHeight').value) || 40;

            let vbMinX = 0;
            let vbMinY = 0;
            let vbWidth = compWidth;
            let vbHeight = compHeight;

            if (viewBox) {
                const parts = viewBox.trim().split(/\s+/);
                if (parts.length === 4) {
                    vbMinX = parseFloat(parts[0]) || 0;
                    vbMinY = parseFloat(parts[1]) || 0;
                    vbWidth = parseFloat(parts[2]) || compWidth;
                    vbHeight = parseFloat(parts[3]) || compHeight;
                }
            }

            const metaCompWidth = parseFloat(svg.getAttribute('data-comp-width'));
            const metaCompHeight = parseFloat(svg.getAttribute('data-comp-height'));
            const metaOffsetX = parseFloat(svg.getAttribute('data-offset-x'));
            const metaOffsetY = parseFloat(svg.getAttribute('data-offset-y'));

            const baseWidth = Number.isFinite(metaCompWidth) ? metaCompWidth : vbWidth;
            const baseHeight = Number.isFinite(metaCompHeight) ? metaCompHeight : vbHeight;
            const offsetX = Number.isFinite(metaOffsetX) ? metaOffsetX : vbMinX;
            const offsetY = Number.isFinite(metaOffsetY) ? metaOffsetY : vbMinY;

            const scaleX = baseWidth ? compWidth / baseWidth : 1;
            const scaleY = baseHeight ? compHeight / baseHeight : 1;
            const scale = Math.min(scaleX, scaleY) || 1;

            const mapPoint = (x, y) => ({
                x: Math.round((x - offsetX) * scale),
                y: Math.round((y - offsetY) * scale)
            });

            // Parse paths
            svg.querySelectorAll('path').forEach(path => {
                const d = path.getAttribute('d');
                if (!d) return;
                const strokeWidth = parseFloat(path.getAttribute('stroke-width')) || 4;
                if (path.getAttribute('data-arc') === 'true') {
                    const cx = Math.round(((parseFloat(path.getAttribute('data-cx')) || 0) * scale));
                    const cy = Math.round(((parseFloat(path.getAttribute('data-cy')) || 0) * scale));
                    const r = Math.max(1, Math.round(((parseFloat(path.getAttribute('data-r')) || 0) * scale)));
                    const startAngle = parseFloat(path.getAttribute('data-start')) || 0;
                    const endAngle = parseFloat(path.getAttribute('data-end')) || 0;
                    elements.push({
                        type: 'arc',
                        cx,
                        cy,
                        r,
                        startAngle,
                        endAngle,
                        strokeWidth: strokeWidth * scale
                    });
                    return;
                }
                const lines = parsePathToLines(d, mapPoint);
                lines.forEach(line => {
                    elements.push({ ...line, strokeWidth: strokeWidth * scale });
                });
            });

            // Parse circles
            svg.querySelectorAll('circle').forEach(circle => {
                const rawCx = parseFloat(circle.getAttribute('cx')) || 0;
                const rawCy = parseFloat(circle.getAttribute('cy')) || 0;
                const center = mapPoint(rawCx, rawCy);
                const r = Math.max(1, Math.round(((parseFloat(circle.getAttribute('r')) || 0) * scale)));
                const strokeWidth = parseFloat(circle.getAttribute('stroke-width')) || 4;
                elements.push({
                    type: 'circle',
                    cx: center.x,
                    cy: center.y,
                    r,
                    strokeWidth: strokeWidth * scale,
                    filled: circle.getAttribute('fill') !== 'none'
                });
            });

            // Parse ellipses (convert to circles using average of rx and ry)
            svg.querySelectorAll('ellipse').forEach(ellipse => {
                const rawCx = parseFloat(ellipse.getAttribute('cx')) || 0;
                const rawCy = parseFloat(ellipse.getAttribute('cy')) || 0;
                const center = mapPoint(rawCx, rawCy);
                const rx = (parseFloat(ellipse.getAttribute('rx')) || 0) * scale;
                const ry = (parseFloat(ellipse.getAttribute('ry')) || 0) * scale;
                const r = Math.max(1, Math.round((rx + ry) / 2));
                const strokeWidth = parseFloat(ellipse.getAttribute('stroke-width')) || 4;
                elements.push({
                    type: 'circle',
                    cx: center.x,
                    cy: center.y,
                    r,
                    strokeWidth: strokeWidth * scale,
                    filled: ellipse.getAttribute('fill') !== 'none'
                });
            });

            // Parse polygons
            svg.querySelectorAll('polygon').forEach(poly => {
                const pointsStr = poly.getAttribute('points');
                if (pointsStr) {
                    const points = pointsStr.trim().split(/\s+/).map(p => {
                        const [x, y] = p.split(',').map(Number);
                        return mapPoint(x, y);
                    });
                    const strokeWidth = parseFloat(poly.getAttribute('stroke-width')) || 4;
                    elements.push({
                        type: 'polygon',
                        points,
                        strokeWidth: strokeWidth * scale,
                        filled: poly.getAttribute('fill') !== 'none'
                    });
                }
            });

            // Parse polylines
            svg.querySelectorAll('polyline').forEach(poly => {
                const pointsStr = poly.getAttribute('points');
                if (pointsStr) {
                    const points = pointsStr.trim().split(/\s+/).map(p => {
                        const [x, y] = p.split(',').map(Number);
                        return mapPoint(x, y);
                    });
                    const strokeWidth = parseFloat(poly.getAttribute('stroke-width')) || 4;
                    elements.push({
                        type: 'polyline',
                        points,
                        strokeWidth: strokeWidth * scale
                    });
                }
            });

            return elements;
        }

        function parsePathToLines(d, transformPoint) {
            const lines = [];
            const mapPoint = typeof transformPoint === 'function'
                ? transformPoint
                : (x, y) => ({ x: Math.round(x), y: Math.round(y) });
            const commands = d.match(/[MLQCZmlqcz][^MLQCZmlqcz]*/gi) || [];

            let currentX = 0, currentY = 0;
            let startX = 0, startY = 0;

            commands.forEach(cmd => {
                const type = cmd[0];
                const args = cmd.slice(1).trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));

                if (type === 'M' || type === 'm') {
                    if (type === 'M') {
                        currentX = args[0];
                        currentY = args[1];
                    } else {
                        currentX += args[0];
                        currentY += args[1];
                    }
                    startX = currentX;
                    startY = currentY;
                } else if (type === 'L' || type === 'l') {
                    for (let i = 0; i < args.length; i += 2) {
                        let newX, newY;
                        if (type === 'L') {
                            newX = args[i];
                            newY = args[i + 1];
                        } else {
                            newX = currentX + args[i];
                            newY = currentY + args[i + 1];
                        }
                        const startPoint = mapPoint(currentX, currentY);
                        const endPoint = mapPoint(newX, newY);
                        lines.push({
                            type: 'line',
                            x1: startPoint.x,
                            y1: startPoint.y,
                            x2: endPoint.x,
                            y2: endPoint.y
                        });
                        currentX = newX;
                        currentY = newY;
                    }
                } else if (type === 'Z' || type === 'z') {
                    const startPoint = mapPoint(currentX, currentY);
                    const endPoint = mapPoint(startX, startY);
                    lines.push({
                        type: 'line',
                        x1: startPoint.x,
                        y1: startPoint.y,
                        x2: endPoint.x,
                        y2: endPoint.y
                    });
                    currentX = startX;
                    currentY = startY;
                } else if (type === 'Q' || type === 'q') {
                    // Quadratic bezier - approximate with lines
                    for (let i = 0; i < args.length; i += 4) {
                        let cx, cy, ex, ey;
                        if (type === 'Q') {
                            cx = args[i]; cy = args[i + 1];
                            ex = args[i + 2]; ey = args[i + 3];
                        } else {
                            cx = currentX + args[i]; cy = currentY + args[i + 1];
                            ex = currentX + args[i + 2]; ey = currentY + args[i + 3];
                        }
                        // Approximate with line to endpoint
                        const startPoint = mapPoint(currentX, currentY);
                        const endPoint = mapPoint(ex, ey);
                        lines.push({
                            type: 'line',
                            x1: startPoint.x,
                            y1: startPoint.y,
                            x2: endPoint.x,
                            y2: endPoint.y
                        });
                        currentX = ex;
                        currentY = ey;
                    }
                }
            });

            return lines;
        }

        function elementsToSVG() {
            const compWidth = parseInt(document.getElementById('compWidth').value) || 80;
            const compHeight = parseInt(document.getElementById('compHeight').value) || 40;

            // Use 1.5x viewBox for typical lead lines
            const vbWidth = Math.round(compWidth * 1.5);
            const vbHeight = Math.round(compHeight * 1.5);
            const offsetX = Math.round((vbWidth - compWidth) / 2);
            const offsetY = Math.round((vbHeight - compHeight) / 2);

            const svgParts = [];

            elements.forEach(el => {
                const strokeWidth = el.strokeWidth || 4;
                if (el.type === 'line') {
                    const d = `M ${el.x1 + offsetX} ${el.y1 + offsetY} L ${el.x2 + offsetX} ${el.y2 + offsetY}`;
                    svgParts.push(`<path fill="none" stroke="#000000" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" d="${d}"/>`);
                } else if (el.type === 'circle') {
                    svgParts.push(`<circle cx="${el.cx + offsetX}" cy="${el.cy + offsetY}" r="${el.r}" fill="${el.filled ? '#000000' : 'none'}" stroke="#000000" stroke-width="${strokeWidth}"/>`);
                } else if (el.type === 'arc') {
                    const startX = el.cx + Math.cos(el.startAngle) * el.r;
                    const startY = el.cy + Math.sin(el.startAngle) * el.r;
                    const endX = el.cx + Math.cos(el.endAngle) * el.r;
                    const endY = el.cy + Math.sin(el.endAngle) * el.r;
                    let delta = el.endAngle - el.startAngle;
                    while (delta <= -Math.PI * 2) delta += Math.PI * 2;
                    while (delta >= Math.PI * 2) delta -= Math.PI * 2;
                    const largeArcFlag = Math.abs(delta) > Math.PI ? 1 : 0;
                    const sweepFlag = delta >= 0 ? 1 : 0;
                    const d = `M ${startX + offsetX} ${startY + offsetY} A ${el.r} ${el.r} 0 ${largeArcFlag} ${sweepFlag} ${endX + offsetX} ${endY + offsetY}`;
                    svgParts.push(`<path data-arc="true" data-cx="${el.cx}" data-cy="${el.cy}" data-r="${el.r}" data-start="${el.startAngle}" data-end="${el.endAngle}" fill="none" stroke="#000000" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" d="${d}"/>`);
                } else if (el.type === 'polygon' && el.points) {
                    const pts = el.points.map(p => `${p.x + offsetX},${p.y + offsetY}`).join(' ');
                    svgParts.push(`<polygon points="${pts}" fill="${el.filled ? '#000000' : 'none'}" stroke="#000000" stroke-width="${strokeWidth}" stroke-linejoin="round"/>`);
                } else if (el.type === 'polyline' && el.points) {
                    const pts = el.points.map(p => `${p.x + offsetX},${p.y + offsetY}`).join(' ');
                    svgParts.push(`<polyline points="${pts}" fill="none" stroke="#000000" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`);
                }
            });

            return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbWidth} ${vbHeight}" data-generated-by="symbol-editor" data-comp-width="${compWidth}" data-comp-height="${compHeight}" data-offset-x="${offsetX}" data-offset-y="${offsetY}">${svgParts.join('')}</svg>`;
        }

        async function updateComponent() {
            const id = document.getElementById('compId').value.trim();
            if (!id) {
                alert('Please enter a component ID');
                return;
            }

            const compWidth = parseInt(document.getElementById('compWidth').value) || 80;
            const compHeight = parseInt(document.getElementById('compHeight').value) || 40;
            const labels = readLabelInputs(compWidth, compHeight);

            const prefixValue = document.getElementById('compPrefix').value || id[0].toUpperCase();
            const defaultField = document.getElementById('compDefault');
            const defaultValue = defaultValueIsNull ? null : (defaultField ? defaultField.value : '');

            const comp = {
                name: document.getElementById('compName').value || id,
                description: components[currentComponentId]?.description || '',
                defaultValue,
                designator: {
                    prefix: prefixValue,
                    autoIncrement: document.getElementById('compAutoInc').checked
                },
                size: {
                    width: compWidth,
                    height: compHeight
                },
                pins: pins.map(p => {
                    const label = ensurePinLabelPosition(p);
                    return {
                        id: p.id,
                        name: p.name,
                        position: { x: p.position.x, y: p.position.y },
                        labelPosition: { x: Math.round(label.x), y: Math.round(label.y) }
                    };
                }),
                labels,
                svg: elementsToSVG()
            };

            // Preserve special flags
            if (components[currentComponentId]?.isGround) {
                comp.isGround = true;
            }

            // If ID changed, remove old and add new
            if (currentComponentId && currentComponentId !== id) {
                clearDirtyState(currentComponentId, { silent: true });
                delete components[currentComponentId];
                try {
                    await deleteSymbolFromStore(currentComponentId);
                } catch (err) {
                    console.warn('Failed to remove renamed component from IndexedDB', err);
                }
            }

            components[id] = comp;
            clearDirtyState(id, { silent: true });
            isNewComponentDraft = false;
            currentComponentId = id;

            try {
                await saveSymbol(id, comp);
            } catch (err) {
                console.warn('Failed to persist component to IndexedDB', err);
            }

            updateComponentList();
            updateJSON();
        }

        function newComponent() {
            currentComponentId = null;
            isNewComponentDraft = true;
            elements = [];
            pins = [];
            selectedElement = null;
            resetArcConstruction();

            document.getElementById('compId').value = '';
            document.getElementById('compName').value = '';
            const defaultPrefix = getDefaultPrimitivePrefix();
            populatePrefixOptions(defaultPrefix);
            document.getElementById('compPrefix').value = defaultPrefix;
            document.getElementById('compAutoInc').checked = true;
            applyPrimitiveDefaults(defaultPrefix);
            document.getElementById('compWidth').value = '80';
            document.getElementById('compHeight').value = '40';
            const defaultWidth = parseInt(document.getElementById('compWidth').value, 10) || 80;
            const defaultHeight = parseInt(document.getElementById('compHeight').value, 10) || 40;
            setLabelInputs(getDefaultLabelPositions(defaultWidth, defaultHeight), defaultWidth, defaultHeight);

            updateComponentList();
            updatePinList();
            updateElementList();
            resizeCanvas(); // Ensure canvas is properly sized
            requestLabelPreviewUpdate({ immediate: true });

            // Focus on the ID field to show something happened
            document.getElementById('compId').focus();
        }

        async function duplicateComponent() {
            if (!currentComponentId) return;

            const newId = currentComponentId + '_copy';
            components[newId] = JSON.parse(JSON.stringify(components[currentComponentId]));
            components[newId].name += ' (Copy)';

            currentComponentId = newId;
            isNewComponentDraft = false;
            clearDirtyState(newId, { silent: true });
            document.getElementById('compId').value = newId;

            try {
                await saveSymbol(newId, components[newId]);
            } catch (err) {
                console.warn('Failed to persist duplicated component', err);
            }

            updateComponentList();
            updateJSON();
        }

        async function deleteComponent() {
            if (!currentComponentId) return;
            if (!confirm(`Delete component "${currentComponentId}"?`)) return;

            const idToDelete = currentComponentId;
            delete components[idToDelete];
            clearDirtyState(idToDelete, { silent: true });
            try {
                await deleteSymbolFromStore(idToDelete);
            } catch (err) {
                console.warn('Failed to delete component from IndexedDB', err);
            }
            currentComponentId = null;
            newComponent();
            updateJSON();
        }

        // JSON handling
        function updateJSON() {
            stripModelFields(components);
            document.getElementById('jsonOutput').value = JSON.stringify(components, null, '\t');
        }

        function copyJSON() {
            const output = document.getElementById('jsonOutput');
            output.select();
            document.execCommand('copy');
            alert('JSON copied to clipboard!');
        }

        function downloadJSON() {
            const data = document.getElementById('jsonOutput').value || JSON.stringify(components, null, '\t');
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'components.json';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }

        async function newJSON() {
            if (!confirm('Start a new JSON library? This will remove all existing components.')) return;
            components = {};
            currentComponentId = null;
            dirtyComponents.clear();
            try {
                await replaceLibrary({});
            } catch (err) {
                console.warn('Failed to reset IndexedDB library', err);
            }
            newComponent();
            updateJSON();
        }

        function loadFromFile(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async function (e) {
                try {
                    components = JSON.parse(e.target.result);
                    stripModelFields(components);
                    currentComponentId = null;
                    dirtyComponents.clear();
                    try {
                        await replaceLibrary(components);
                    } catch (err) {
                        console.warn('Failed to persist imported components to IndexedDB', err);
                    }
                    newComponent();
                    updateComponentList();
                    updateJSON();
                    alert('Components loaded successfully!');
                } catch (err) {
                    alert('Error parsing JSON: ' + err.message);
                }
            };
            reader.readAsText(file);
        }

        const symbolEditorGlobals = {
            addPinManual,
            clearDrawing,
            copyJSON,
            deleteComponent,
            deleteSelected,
            downloadJSON,
            duplicateComponent,
            loadComponent,
            loadFromFile,
            newComponent,
            newJSON,
            removeElement,
            removePin,
            resizeCanvas,
            selectElement,
            setMode,
            updateComponent,
            updatePin,
            updateSelectedStroke,
        };

        Object.assign(window, symbolEditorGlobals);

        // Initialize
        init().then(() => setMode('select')).catch(err => console.error('Symbol editor failed to initialize', err));

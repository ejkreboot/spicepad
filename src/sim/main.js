import { loadLibrary as loadSymbolLibrary } from '../common/storage/library.js';
import { getDefaultComponents } from '../common/defaultComponents.js';

const GRID_SIZE = 5;
			const MIN_ZOOM = 0.5;
			const MAX_ZOOM = 3;
			const ZOOM_SENSITIVITY = 0.0015;
			const TOOL_PLACE = "place";
			const TOOL_WIRE = "wire";
			const TOOL_DELETE = "delete";
			const PIN_HIT_RADIUS = 10;
			const DRAG_THRESHOLD = 4;
			const NET_CELL_SIZE = GRID_SIZE * 2;
			const JUNCTION_RADIUS = 2.8;
			const HOVER_NET_COLOR = "#2563eb";
			const canvas = document.getElementById("editorCanvas");
			const ctx = canvas.getContext("2d");
			const palette = document.getElementById("componentPalette");
			const wireToolToggle = document.getElementById("wireToolToggle");
			const deleteToolToggle = document.getElementById("deleteToolToggle");
			const netlistOutput = document.getElementById("netlistOutput");

			const state = {
				library: {},
				sprites: {},
				placements: [],
				wires: [],
				nextPlacementId: 1,
				nextWireId: 1,
				selected: null,
				ready: false,
				selectedPlacements: new Set(),
				selectionBox: null,
				selectionDrag: null,
				pendingPlacement: null,
				zoom: 1,
				panX: 0,
				panY: 0,
				panning: null,
				panPointerId: null,
				spacePanning: false,
				activeTool: TOOL_PLACE,
				pendingWire: null,
				pointerWorld: null,
				hoverPlacementId: null,
				hoverNetId: null,
				netlistText: "",
				referenceMap: Object.create(null),
				nets: new Map(),
				pinToNet: new Map(),
				wireToNet: new Map(),
				junctionPoints: [],
			};

				document.addEventListener("DOMContentLoaded", () => {
				loadComponentLibrary();
				setupCanvasResizeHandling();
				canvas.addEventListener("pointerdown", handlePointerDown);
				canvas.addEventListener("pointermove", handlePointerMove);
				canvas.addEventListener("pointerup", handlePointerUp);
				canvas.addEventListener("pointercancel", handlePointerUp);
				canvas.addEventListener("pointerleave", handlePointerLeave);
				canvas.addEventListener("dblclick", handleDoubleClick);
					canvas.addEventListener("wheel", handleWheel, { passive: false });
					canvas.addEventListener("contextmenu", (event) => event.preventDefault());
				if (wireToolToggle) {
					wireToolToggle.addEventListener("click", toggleWireTool);
					updateWireToggleUI();
				}
				if (deleteToolToggle) {
					deleteToolToggle.addEventListener("click", toggleDeleteTool);
					updateDeleteToggleUI();
				}
				document.addEventListener("keydown", handleKeyDown, true);
				document.addEventListener("keyup", handleKeyUp, true);
				updateNetlist();
			});

			function handleWheel(event) {
				if (!state.ready) {
					return;
				}
				event.preventDefault();
				const metrics = getCanvasMetrics();
				const canvasPoint = {
					x: (event.clientX - metrics.rect.left) * metrics.scaleX,
					y: (event.clientY - metrics.rect.top) * metrics.scaleY,
				};
				// Ensure the backing store matches the displayed size before first render.
				resizeCanvasToDisplaySize();
				const focusWorld = canvasToWorld(canvasPoint.x, canvasPoint.y);
				const delta = -event.deltaY;
				const zoomFactor = Math.exp(delta * ZOOM_SENSITIVITY);
				const nextZoom = clamp(state.zoom * zoomFactor, MIN_ZOOM, MAX_ZOOM);
				applyZoom(nextZoom, focusWorld, canvasPoint);
			}

			async function loadComponentLibrary() {
				const seedLibrary = getDefaultComponents();
				try {
					const library = await loadSymbolLibrary({ seedLibrary });
					const hasEntries = library && Object.keys(library).length > 0;
					const resolvedLibrary = hasEntries ? library : seedLibrary;
					if (!hasEntries) {
						console.warn("Component library is empty; using defaults.");
					}
					await initializeLibrary(resolvedLibrary);
				} catch (error) {
					console.error("Failed to load component library; falling back to defaults.", error);
					await initializeLibrary(seedLibrary);
				}
			}

			async function initializeLibrary(library) {
				state.library = library || {};
				const entries = Object.entries(state.library);
				if (entries.length === 0) {
					console.warn("Component library is empty.");
					return;
				}

				await Promise.all(entries.map(([key, component]) => buildSprite(key, component)));
				state.selected = entries[0][0];
				state.ready = true;
				updatePalette();
				updateNetlist();
				requestRender();
			}

			function toggleWireTool() {
				setActiveTool(isWireMode() ? TOOL_PLACE : TOOL_WIRE);
			}

			function toggleDeleteTool() {
				setActiveTool(isDeleteMode() ? TOOL_PLACE : TOOL_DELETE);
			}

			function setActiveTool(nextTool) {
				if (state.activeTool === nextTool) {
					return;
				}
				state.activeTool = nextTool;
				if (!isWireMode()) {
					state.pendingWire = null;
				}
				updateWireToggleUI();
				updateDeleteToggleUI();
				requestRender();
			}

			function updateWireToggleUI() {
				if (!wireToolToggle) {
					return;
				}
				if (isWireMode()) {
					wireToolToggle.classList.add("active");
					wireToolToggle.textContent = "Wire Tool (On)";
				} else {
					wireToolToggle.classList.remove("active");
					wireToolToggle.textContent = "Wire Tool";
				}
			}

			function updateDeleteToggleUI() {
				if (!deleteToolToggle) {
					return;
				}
				if (isDeleteMode()) {
					deleteToolToggle.classList.add("active");
					deleteToolToggle.textContent = "Delete Tool (On)";
				} else {
					deleteToolToggle.classList.remove("active");
					deleteToolToggle.textContent = "Delete Tool";
				}
			}

			function isWireMode() {
				return state.activeTool === TOOL_WIRE;
			}

			function isDeleteMode() {
				return state.activeTool === TOOL_DELETE;
			}

			function handlePointerDown(event) {
				if (!state.ready) {
					return;
				}

				const isPanInteraction = state.spacePanning || event.button === 1 || event.button === 2;
				if (isPanInteraction) {
					beginPan(event);
					return;
				}

				if (event.button !== 0) {
					return;
				}

				const point = getCanvasCoordinates(event);
				updateHoverPlacement(point);
				if (isDeleteMode()) {
					handleDeletePointerDown(point);
					event.preventDefault();
					return;
				}
				if (isWireMode()) {
					handleWirePointerDown(point);
					event.preventDefault();
					return;
				}
				const hitIndex = findPlacementAt(point);
				if (hitIndex !== -1) {
					const hitPlacement = state.placements[hitIndex];
					const placementId = ensurePlacementId(hitPlacement);
					if (!isPlacementSelected(placementId)) {
						setSelection([placementId]);
					}
					beginSelectionDrag(point, event.pointerId);
					event.preventDefault();
					return;
				}

				if (!state.selected) {
					return;
				}

				beginPendingPlacement(point, event.pointerId);
			}

			function handleWirePointerDown(point) {
				const pinHit = findPinAt(point);
				const snappedPoint = {
					x: snapToGrid(point.x),
					y: snapToGrid(point.y),
				};
				const wireHitIndex = pinHit ? -1 : findWireAt(point);
				let targetRef = null;
				if (pinHit) {
					const placementId = ensurePlacementId(pinHit.placement);
					targetRef = {
						kind: "pin",
						placementId,
						pinId: pinHit.pin.id,
					};
				} else if (wireHitIndex !== -1) {
					targetRef = {
						kind: "point",
						point: snappedPoint,
					};
				}
				if (!targetRef) {
					if (state.pendingWire) {
						addPendingWireWaypoint(point);
					}
					return;
				}
				if (!state.pendingWire) {
					state.pendingWire = { from: normalizeEndpointRef(targetRef), waypoints: [] };
					requestRender();
					return;
				}
				const sameEndpoint = areEndpointsEqual(state.pendingWire.from, targetRef);
				if (sameEndpoint) {
					state.pendingWire = null;
					requestRender();
					return;
				}
				const newWire = createWireBetween(
					state.pendingWire.from,
					normalizeEndpointRef(targetRef),
					state.pendingWire.waypoints
				);
				if (newWire) {
					state.wires.push(newWire);
					updateNetlist();
				}
				state.pendingWire = null;
				requestRender();
			}

			function addPendingWireWaypoint(point) {
				if (!state.pendingWire) {
					return;
				}
				const snapped = {
					x: snapToGrid(point.x),
					y: snapToGrid(point.y),
				};
				const waypoints = state.pendingWire.waypoints || (state.pendingWire.waypoints = []);
				const last = waypoints[waypoints.length - 1];
				if (last && last.x === snapped.x && last.y === snapped.y) {
					return;
				}
				waypoints.push(snapped);
				requestRender();
			}

			function getCanvasCoordinates(event) {
				const metrics = getCanvasMetrics();
				const canvasX = (event.clientX - metrics.rect.left) * metrics.scaleX;
				const canvasY = (event.clientY - metrics.rect.top) * metrics.scaleY;
				return canvasToWorld(canvasX, canvasY);
			}

			function snapToGrid(value) {
				return Math.round(value / GRID_SIZE) * GRID_SIZE;
			}

			function updatePointerWorldFromEvent(event) {
				const point = getCanvasCoordinates(event);
				updatePointerWorld(point);
				updateHoverPlacement(point);
				updateHoverNet(point);
				return point;
			}

			function updatePointerWorld(point) {
				if (!point) {
					return;
				}
				const snappedPoint = {
					x: snapToGrid(point.x),
					y: snapToGrid(point.y),
				};
				const prev = state.pointerWorld;
				const changed = !prev || prev.x !== snappedPoint.x || prev.y !== snappedPoint.y;
				if (changed) {
					state.pointerWorld = snappedPoint;
					requestRender();
				}
			}

			function clearPointerWorld() {
				if (state.pointerWorld) {
					state.pointerWorld = null;
					requestRender();
				}
			}

			function updateHoverPlacement(point) {
				if (!point) {
					clearHoverPlacement();
					return;
				}
				const hitIndex = findPlacementAt(point);
				if (hitIndex === -1) {
					clearHoverPlacement();
					return;
				}
				const placement = state.placements[hitIndex];
				if (!placement) {
					clearHoverPlacement();
					return;
				}
				const placementId = ensurePlacementId(placement);
				if (state.hoverPlacementId !== placementId) {
					state.hoverPlacementId = placementId;
				}
			}

			function clearHoverPlacement() {
				if (state.hoverPlacementId !== null) {
					state.hoverPlacementId = null;
				}
			}

			function updateHoverNet(point) {
				if (!point) {
					clearHoverNet();
					return;
				}
				let nextNetId = null;
				const pinHit = findPinAt(point);
				if (pinHit) {
					const placementId = ensurePlacementId(pinHit.placement);
					const pinKey = makePinKey(placementId, pinHit.pin.id);
					nextNetId = state.pinToNet?.get(pinKey) || null;
				}
				if (!nextNetId) {
					const wireIndex = findWireAt(point);
					if (wireIndex !== -1) {
						const wire = state.wires[wireIndex];
						nextNetId = state.wireToNet?.get(wire.id) || null;
					}
				}
				if (nextNetId !== state.hoverNetId) {
					state.hoverNetId = nextNetId;
					requestRender();
				}
			}

			function clearHoverNet() {
				if (state.hoverNetId !== null) {
					state.hoverNetId = null;
					requestRender();
				}
			}

			function beginPan(event) {
				state.panning = {
					pointerId: event.pointerId,
					startX: event.clientX,
					startY: event.clientY,
					panX: state.panX,
					panY: state.panY,
				};
				state.panPointerId = event.pointerId;
				if (typeof canvas.setPointerCapture === "function") {
					canvas.setPointerCapture(event.pointerId);
				}
				event.preventDefault();
			}

			function updatePan(event) {
				if (!state.panning) {
					return;
				}
				const metrics = getCanvasMetrics();
				const deltaX = (event.clientX - state.panning.startX) * metrics.scaleX;
				const deltaY = (event.clientY - state.panning.startY) * metrics.scaleY;
				state.panX = state.panning.panX - deltaX / state.zoom;
				state.panY = state.panning.panY - deltaY / state.zoom;
				requestRender();
			}

			function endPan(pointerId) {
				if (pointerId === state.panPointerId && typeof canvas.releasePointerCapture === "function") {
					canvas.releasePointerCapture(state.panPointerId);
				}
				state.panning = null;
				state.panPointerId = null;
			}

			function handlePointerMove(event) {
				if (state.panPointerId === event.pointerId && state.panning) {
					updatePan(event);
					updatePointerWorldFromEvent(event);
					return;
				}

				const point = getCanvasCoordinates(event);
				updatePointerWorld(point);
				updateHoverPlacement(point);
				updateHoverNet(point);

				if (state.selectionDrag && event.pointerId === state.selectionDrag.pointerId) {
					updateSelectionDrag(point);
					event.preventDefault();
					return;
				}

				if (state.pendingPlacement && event.pointerId === state.pendingPlacement.pointerId) {
					const dragDistance = Math.hypot(
						point.x - state.pendingPlacement.startPoint.x,
						point.y - state.pendingPlacement.startPoint.y
					);
					if (dragDistance >= DRAG_THRESHOLD) {
						// Convert to selection box drag.
						startSelectionBox(state.pendingPlacement.startPoint, state.pendingPlacement.pointerId);
						state.pendingPlacement = null;
					}
				}

				if (state.selectionBox) {
					updateSelectionBox(point);
					event.preventDefault();
					return;
				}
			}

			function handlePointerUp(event) {
				if (state.panPointerId === event.pointerId) {
					endPan(event.pointerId);
					return;
				}

				if (state.selectionDrag && event.pointerId === state.selectionDrag.pointerId) {
					endSelectionDrag();
					return;
				}

				if (state.selectionBox) {
					finalizeSelectionBox();
					return;
				}

				if (state.pendingPlacement && event.pointerId === state.pendingPlacement.pointerId) {
					placePendingComponent();
					return;
				}
			}

			function handlePointerLeave() {
				clearPointerWorld();
				clearHoverPlacement();
				clearHoverNet();
				state.selectionBox = null;
				state.pendingPlacement = null;
			}

			function isPlacementSelected(placementId) {
				return state.selectedPlacements && state.selectedPlacements.has(placementId);
			}

			function setSelection(placementIds) {
				state.selectedPlacements = new Set(Array.isArray(placementIds) ? placementIds : []);
				requestRender();
			}

			function clearSelection() {
				if (state.selectedPlacements.size) {
					state.selectedPlacements.clear();
					requestRender();
				}
			}

			function beginPendingPlacement(point, pointerId) {
				const snapped = {
					x: snapToGrid(point.x),
					y: snapToGrid(point.y),
				};
				state.pendingPlacement = {
					pointerId,
					startPoint: point,
					snapped,
				};
				if (typeof canvas.setPointerCapture === "function") {
					canvas.setPointerCapture(pointerId);
				}
			}

			function placePendingComponent() {
				const pending = state.pendingPlacement;
				state.pendingPlacement = null;
				if (!pending || !state.selected) {
					return;
				}
				const placementId = state.nextPlacementId++;
				state.placements.push({
					id: placementId,
					type: state.selected,
					x: pending.snapped.x,
					y: pending.snapped.y,
					value: resolveComponentValue(state.selected),
					rotation: 0,
				});
				state.hoverPlacementId = placementId;
				if (typeof canvas.releasePointerCapture === "function" && pending.pointerId != null) {
					canvas.releasePointerCapture(pending.pointerId);
				}
				updateNetlist();
				requestRender();
			}

			function beginSelectionDrag(point, pointerId) {
				const selectedIds = Array.from(state.selectedPlacements);
				const baseline = new Map();
				state.placements.forEach((placement) => {
					if (placement && isPlacementSelected(placement.id)) {
						baseline.set(placement.id, { x: placement.x, y: placement.y });
					}
				});
				state.selectionDrag = {
					pointerId,
					startPoint: point,
					baseline,
				};
				if (typeof canvas.setPointerCapture === "function") {
					canvas.setPointerCapture(pointerId);
				}
			}

			function updateSelectionDrag(point) {
				if (!state.selectionDrag) {
					return;
				}
				const deltaX = snapDelta(point.x - state.selectionDrag.startPoint.x);
				const deltaY = snapDelta(point.y - state.selectionDrag.startPoint.y);
				let moved = false;
				state.selectionDrag.baseline.forEach((base, placementId) => {
					const placement = findPlacementById(placementId);
					if (!placement) {
						return;
					}
					const nextX = base.x + deltaX;
					const nextY = base.y + deltaY;
					if (placement.x !== nextX || placement.y !== nextY) {
						placement.x = nextX;
						placement.y = nextY;
						moved = true;
					}
				});
				if (moved) {
					state.selectionDrag.moved = true;
					// Reroute wires connected to any moved placement.
					state.selectionDrag.baseline.forEach((_, placementId) => {
						rerouteWiresForPlacement(placementId);
					});
					requestRender();
				}
			}

			function endSelectionDrag() {
				if (!state.selectionDrag) {
					return;
				}
				if (typeof canvas.releasePointerCapture === "function" && state.selectionDrag.pointerId != null) {
					canvas.releasePointerCapture(state.selectionDrag.pointerId);
				}
				const dragged = state.selectionDrag.moved;
				state.selectionDrag = null;
				if (dragged) {
					updateNetlist();
				}
			}

			function startSelectionBox(startPoint, pointerId) {
				clearSelection();
				state.selectionBox = {
					start: {
						x: snapToGrid(startPoint.x),
						y: snapToGrid(startPoint.y),
					},
					current: {
						x: snapToGrid(startPoint.x),
						y: snapToGrid(startPoint.y),
					},
					pointerId: pointerId ?? null,
				};
			}

			function updateSelectionBox(point) {
				if (!state.selectionBox) {
					return;
				}
				state.selectionBox.current = {
					x: snapToGrid(point.x),
					y: snapToGrid(point.y),
				};
				requestRender();
			}

			function finalizeSelectionBox() {
				if (!state.selectionBox) {
					return;
				}
				const { start, current } = state.selectionBox;
				if (typeof canvas.releasePointerCapture === "function" && state.selectionBox.pointerId != null) {
					canvas.releasePointerCapture(state.selectionBox.pointerId);
				}
				state.selectionBox = null;
				const minX = Math.min(start.x, current.x);
				const maxX = Math.max(start.x, current.x);
				const minY = Math.min(start.y, current.y);
				const maxY = Math.max(start.y, current.y);
				const selectedIds = [];
				state.placements.forEach((placement) => {
					const component = state.library[placement.type];
					if (!component) {
						return;
					}
					const halfW = component.size.width / 2;
					const halfH = component.size.height / 2;
					const pxMin = placement.x - halfW;
					const pxMax = placement.x + halfW;
					const pyMin = placement.y - halfH;
					const pyMax = placement.y + halfH;
					const overlaps = pxMax >= minX && pxMin <= maxX && pyMax >= minY && pyMin <= maxY;
					if (overlaps) {
						selectedIds.push(ensurePlacementId(placement));
					}
				});
				setSelection(selectedIds);
				requestRender();
			}

			function snapDelta(delta) {
				return Math.round(delta / GRID_SIZE) * GRID_SIZE;
			}

			function handleDoubleClick(event) {
				if (!state.ready) {
					return;
				}
				const point = getCanvasCoordinates(event);
				const hitIndex = findPlacementAt(point);
				if (hitIndex === -1) {
					return;
				}
				const placement = state.placements[hitIndex];
				const previousValue = getPlacementValue(placement);
				const nextValue = window.prompt("Component value", previousValue);
				if (nextValue === null) {
					return;
				}
				const trimmed = nextValue.trim();
				if (trimmed) {
					placement.value = trimmed;
				} else {
					delete placement.value;
				}
				updateNetlist();
				requestRender();
				event.preventDefault();
			}

			function findPlacementAt(point) {
				if (!point) {
					return -1;
				}
				// Traverse in reverse draw order so the topmost instance wins the hit test.
				for (let i = state.placements.length - 1; i >= 0; i -= 1) {
					const placement = state.placements[i];
					const component = state.library[placement.type];
					if (!component) {
						continue;
					}
					if (isPointInsidePlacement(point, placement, component)) {
						return i;
					}
				}
				return -1;
			}

			function isPointInsidePlacement(point, placement, component) {
				if (!point || !placement || !component) {
					return false;
				}
				const halfWidth = component.size.width / 2;
				const halfHeight = component.size.height / 2;
				const localPoint = worldPointToLocal(point, placement);
				if (!localPoint) {
					return false;
				}
				return (
					localPoint.x >= -halfWidth &&
					localPoint.x <= halfWidth &&
					localPoint.y >= -halfHeight &&
					localPoint.y <= halfHeight
				);
			}

			function findPinAt(point) {
				for (let i = state.placements.length - 1; i >= 0; i -= 1) {
					const placement = state.placements[i];
					const component = state.library[placement.type];
					if (!component) {
						continue;
					}
					for (const pin of component.pins || []) {
						const pinPosition = getPinWorldPosition(placement, pin);
						if (!pinPosition) {
							continue;
						}
						const distance = Math.hypot(point.x - pinPosition.x, point.y - pinPosition.y);
						if (distance <= PIN_HIT_RADIUS) {
							ensurePlacementId(placement);
							return { placement, pin, position: pinPosition };
						}
					}
				}
				return null;
			}

			function findWireAt(point) {
				const threshold = 8;
				for (let index = state.wires.length - 1; index >= 0; index -= 1) {
					const wire = state.wires[index];
					const path = getWirePoints(wire);
					for (let i = 0; i < path.length - 1; i += 1) {
						const start = path[i];
						const end = path[i + 1];
						if (!start || !end) {
							continue;
						}
						const distance = distancePointToSegment(point, start, end);
						if (distance <= threshold) {
							return index;
						}
					}
				}
				return -1;
			}

			function distancePointToSegment(point, start, end) {
				const dx = end.x - start.x;
				const dy = end.y - start.y;
				if (dx === 0 && dy === 0) {
					return Math.hypot(point.x - start.x, point.y - start.y);
				}
				const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy);
				const clampedT = clamp(t, 0, 1);
				const closestX = start.x + clampedT * dx;
				const closestY = start.y + clampedT * dy;
				return Math.hypot(point.x - closestX, point.y - closestY);
			}

			function handleDeletePointerDown(point) {
				const wireIndex = findWireAt(point);
				if (wireIndex !== -1) {
					state.wires.splice(wireIndex, 1);
					updateNetlist();
					requestRender();
					return;
				}
				const placementIndex = findPlacementAt(point);
				if (placementIndex === -1) {
					return;
				}
				const [placement] = state.placements.splice(placementIndex, 1);
				const removedId = placement?.id;
				if (removedId) {
					if (state.hoverPlacementId === removedId) {
						state.hoverPlacementId = null;
					}
					state.wires = state.wires.filter((wire) => {
						const fromMatches = isPinEndpoint(wire.from) && wire.from.placementId === removedId;
						const toMatches = isPinEndpoint(wire.to) && wire.to.placementId === removedId;
						return !fromMatches && !toMatches;
					});
				}
				updateNetlist();
				requestRender();
			}

			function getPinWorldPosition(placement, pin) {
				const component = state.library[placement.type];
				if (!component || !pin || !component.size || !pin.position) {
					return null;
				}
				const localX = pin.position.x - component.size.width / 2;
				const localY = pin.position.y - component.size.height / 2;
				const rotationRadians = toRadians(getPlacementRotation(placement));
				const rotated = rotatePoint(localX, localY, rotationRadians);
				return {
					x: placement.x + rotated.x,
					y: placement.y + rotated.y,
				};
			}

			function findPlacementById(placementId) {
				return state.placements.find((placement) => placement.id === placementId) || null;
			}

			function rotateHoveredPlacement() {
				if (!state.hoverPlacementId) {
					return false;
				}
				const placement = findPlacementById(state.hoverPlacementId);
				if (!placement) {
					state.hoverPlacementId = null;
					return false;
				}
				if (!isPlacementSelected(placement.id)) {
					setSelection([placement.id]);
				}
				rotatePlacement(placement, 90);
				return true;
			}

			function rotatePlacement(placement, deltaDegrees = 90) {
				if (!placement) {
					return;
				}
				const nextRotation = normalizeRotation(getPlacementRotation(placement) + deltaDegrees);
				placement.rotation = nextRotation;
				const placementId = ensurePlacementId(placement);
				rerouteWiresForPlacement(placementId);
				updateNetlist();
				requestRender();
			}

			function ensurePlacementId(placement) {
				if (!placement.id) {
					placement.id = state.nextPlacementId++;
				}
				return placement.id;
			}

			function getPinDefinition(placement, pinId) {
				const component = state.library[placement.type];
				if (!component) {
					return null;
				}
				return (component.pins || []).find((pin) => pin.id === pinId) || null;
			}

			function getPinPositionFromRef(ref) {
				const placement = findPlacementById(ref.placementId);
				if (!placement) {
					return null;
				}
				const pin = getPinDefinition(placement, ref.pinId);
				if (!pin) {
					return null;
				}
				return getPinWorldPosition(placement, pin);
			}

			function isPinEndpoint(ref) {
				if (!ref) {
					return false;
				}
				if (ref.kind === "pin") {
					return true;
				}
				return Boolean(ref.placementId && ref.pinId);
			}

			function normalizeEndpointRef(ref) {
				if (!ref) {
					return null;
				}
				if (ref.kind === "point") {
					const px = ref.point?.x ?? ref.x;
					const py = ref.point?.y ?? ref.y;
					if (px == null || py == null) {
						return null;
					}
					return {
						kind: "point",
						point: {
							x: snapToGrid(px),
							y: snapToGrid(py),
						},
					};
				}
				if (isPinEndpoint(ref)) {
					return {
						kind: "pin",
						placementId: ref.placementId,
						pinId: ref.pinId,
					};
				}
				return null;
			}

			function resolveEndpointPosition(ref) {
				if (!ref) {
					return null;
				}
				if (isPinEndpoint(ref)) {
					return getPinPositionFromRef(ref);
				}
				if (ref.kind === "point" && ref.point) {
					return { x: ref.point.x, y: ref.point.y };
				}
				return null;
			}

			function areEndpointsEqual(a, b) {
				if (!a || !b) {
					return false;
				}
				if (isPinEndpoint(a) && isPinEndpoint(b)) {
					return a.placementId === b.placementId && a.pinId === b.pinId;
				}
				if (a.kind === "point" && b.kind === "point") {
					return a.point?.x === b.point?.x && a.point?.y === b.point?.y;
				}
				return false;
			}

			function createWireBetween(fromRef, toRef, waypoints = []) {
				if (!fromRef || !toRef) {
					return null;
				}
				const normalizedFrom = normalizeEndpointRef(fromRef);
				const normalizedTo = normalizeEndpointRef(toRef);
				if (!normalizedFrom || !normalizedTo) {
					return null;
				}
				if (areEndpointsEqual(normalizedFrom, normalizedTo)) {
					return null;
				}
				const normalizedWaypoints = Array.isArray(waypoints)
					? waypoints.map((point) => ({ x: point.x, y: point.y }))
					: [];
				const vertices = buildWireVertices(normalizedFrom, normalizedTo, normalizedWaypoints);
				if (!vertices) {
					return null;
				}
				const interior = vertices.length > 2 ? vertices.slice(1, -1) : null;
				return {
					id: state.nextWireId++,
					from: normalizedFrom,
					to: normalizedTo,
					waypoints: interior,
					vertices,
					// Keep legacy accessor to avoid touching all draw sites at once.
					path: vertices,
				};
			}

			function buildWireVertices(fromRef, toRef, waypoints) {
				const startPoint = resolveEndpointPosition(fromRef);
				const endPoint = resolveEndpointPosition(toRef);
				if (!startPoint || !endPoint) {
					return null;
				}
				let vertices;
				if (Array.isArray(waypoints) && waypoints.length) {
					vertices = buildPolylinePath([startPoint, ...waypoints, endPoint]);
				} else {
					vertices = buildManhattanPath(startPoint, endPoint);
				}
				return mergeCollinearVertices(vertices);
			}

			function buildManhattanPath(startPoint, endPoint) {
				if (!startPoint || !endPoint) {
					return null;
				}
				const path = [{ x: startPoint.x, y: startPoint.y }];
				const needsBend = startPoint.x !== endPoint.x && startPoint.y !== endPoint.y;
				if (needsBend) {
					path.push({ x: endPoint.x, y: startPoint.y });
				}
				path.push({ x: endPoint.x, y: endPoint.y });
				return path;
			}

			function getPendingWirePreviewPath() {
				if (!state.pendingWire || !state.pointerWorld) {
					return null;
				}
				const originPoint = resolveEndpointPosition(state.pendingWire.from);
				if (!originPoint) {
					return null;
				}
				const waypoints = Array.isArray(state.pendingWire.waypoints) ? state.pendingWire.waypoints : [];
				if (waypoints.length) {
					return buildPolylinePath([originPoint, ...waypoints, state.pointerWorld]);
				}
				return buildManhattanPath(originPoint, state.pointerWorld);
			}

			function rerouteWiresForPlacement(placementId) {
				if (!placementId) {
					return;
				}
				state.wires.forEach((wire) => {
					const affectsFrom = isPinEndpoint(wire.from) && wire.from.placementId === placementId;
					const affectsTo = isPinEndpoint(wire.to) && wire.to.placementId === placementId;
					if (affectsFrom || affectsTo) {
						const nextVertices = applyRubberBandToWire(wire, placementId);
						if (nextVertices) {
							wire.vertices = nextVertices;
							wire.path = nextVertices;
							wire.waypoints = nextVertices.length > 2 ? nextVertices.slice(1, -1) : null;
						}
					}
				});
			}

			function buildPolylinePath(points) {
				if (!Array.isArray(points) || points.length < 2) {
					return null;
				}
				const path = [{ x: points[0].x, y: points[0].y }];
				for (let i = 1; i < points.length; i += 1) {
					const segment = buildManhattanPath(points[i - 1], points[i]);
					if (!segment || segment.length < 2) {
						return null;
					}
					for (let j = 1; j < segment.length; j += 1) {
						path.push(segment[j]);
					}
				}
				return mergeCollinearVertices(path);
			}

			function applyRubberBandToWire(wire, movedPlacementId) {
				if (!wire) {
					return null;
				}
				let vertices = getWirePoints(wire).map((point) => ({ x: point.x, y: point.y }));
				if (vertices.length < 2) {
					return null;
				}

				let updated = false;
				if (isPinEndpoint(wire.from) && wire.from.placementId === movedPlacementId) {
					const next = rubberBandEndpoint(vertices, 0, 1, getPinPositionFromRef(wire.from));
					if (next) {
						vertices = next;
						updated = true;
					}
				}
				if (isPinEndpoint(wire.to) && wire.to.placementId === movedPlacementId) {
					const next = rubberBandEndpoint(
						vertices,
						vertices.length - 1,
						vertices.length - 2,
						getPinPositionFromRef(wire.to)
					);
					if (next) {
						vertices = next;
						updated = true;
					}
				}

				if (!updated) {
					return null;
				}
				const merged = mergeCollinearVertices(vertices);
				if (isOrthogonalPolyline(merged)) {
					return merged;
				}
				// If the topology cannot be preserved, fall back to rebuilding a legal path.
				return buildWireVertices(wire.from, wire.to, wire.waypoints || []);
			}

			function rubberBandEndpoint(vertices, endpointIndex, neighborIndex, pinPosition) {
				if (!pinPosition || !vertices[neighborIndex]) {
					return null;
				}
				const endpoint = vertices[endpointIndex];
				const neighbor = vertices[neighborIndex];
				const orientation = inferSegmentOrientation(endpoint, neighbor);
				if (!orientation) {
					return null;
				}
				const nextVertices = vertices.map((point) => ({ x: point.x, y: point.y }));
				nextVertices[endpointIndex] = { x: pinPosition.x, y: pinPosition.y };
				const aligned =
					orientation === "horizontal"
						? pinPosition.y === neighbor.y
						: pinPosition.x === neighbor.x;
				if (!aligned) {
					const bridgePoint =
						orientation === "horizontal"
							? { x: neighbor.x, y: pinPosition.y }
							: { x: pinPosition.x, y: neighbor.y };
					if (endpointIndex === 0) {
						nextVertices.splice(1, 0, bridgePoint);
					} else {
						nextVertices.splice(nextVertices.length - 1, 0, bridgePoint);
					}
				}
				return nextVertices;
			}

			function inferSegmentOrientation(start, end) {
				if (!start || !end) {
					return null;
				}
				if (start.x === end.x) {
					return "vertical";
				}
				if (start.y === end.y) {
					return "horizontal";
				}
				return null;
			}

			function mergeCollinearVertices(vertices) {
				if (!Array.isArray(vertices)) {
					return [];
				}
				const merged = [];
				vertices.forEach((point) => {
					if (!point) {
						return;
					}
					const last = merged[merged.length - 1];
					if (last && last.x === point.x && last.y === point.y) {
						return;
					}
					merged.push({ x: point.x, y: point.y });
					if (merged.length >= 3) {
						const a = merged[merged.length - 3];
						const b = merged[merged.length - 2];
						const c = merged[merged.length - 1];
						if (areCollinearAxisAligned(a, b, c)) {
							merged.splice(merged.length - 2, 1);
						}
					}
				});
				return merged;
			}

			function areCollinearAxisAligned(a, b, c) {
				if (!a || !b || !c) {
					return false;
				}
				return (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
			}

			function isOrthogonalPolyline(vertices) {
				if (!Array.isArray(vertices)) {
					return false;
				}
				for (let i = 0; i < vertices.length - 1; i += 1) {
					const start = vertices[i];
					const end = vertices[i + 1];
					if (!inferSegmentOrientation(start, end)) {
						return false;
					}
				}
				return true;
			}

			function getWirePoints(wire) {
				if (!wire) {
					return [];
				}
				if (Array.isArray(wire.vertices)) {
					return wire.vertices;
				}
				if (Array.isArray(wire.path)) {
					return wire.path;
				}
				return [];
			}

			function rebuildConnectivity() {
				const graph = buildConnectivityGraph(state.wires, state.placements, state.library);
				state.nets = graph.nets;
				state.pinToNet = graph.pinToNet;
				state.wireToNet = graph.wireToNet;
				state.junctionPoints = graph.junctions;
			}

			function buildConnectivityGraph(wires, placements, library) {
				const segments = collectWireSegments(wires);
				const segmentNodes = new Map();
				const pointMeta = new Map();
				const wirePointKeys = new Map();
				const index = createSpatialIndex();
				const pins = collectPlacedPins(placements, library);

				segments.forEach((segment, indexValue) => {
					segment.index = indexValue;
					segmentNodes.set(indexValue, new Set());
					addSegmentToIndex(index, segment);
					registerSegmentEndpoint(segmentNodes, pointMeta, wirePointKeys, segment.index, segment.wireId, segment.start);
					registerSegmentEndpoint(segmentNodes, pointMeta, wirePointKeys, segment.index, segment.wireId, segment.end);
				});

				const processedPairs = new Set();
				segments.forEach((segment) => {
					const candidates = querySegmentsForSegment(index, segment);
					candidates.forEach((otherIndex) => {
						if (otherIndex <= segment.index) {
							return;
						}
						const pairKey = `${segment.index}|${otherIndex}`;
						if (processedPairs.has(pairKey)) {
							return;
						}
						processedPairs.add(pairKey);
						const other = segments[otherIndex];
						const intersections = findSegmentIntersections(segment, other);
						intersections.forEach((point) => {
							const key = recordPoint(pointMeta, wirePointKeys, segment.wireId, null, point);
							recordPoint(pointMeta, wirePointKeys, other.wireId, null, point);
							segmentNodes.get(segment.index)?.add(key);
							segmentNodes.get(otherIndex)?.add(key);
						});
					});
				});

				segments.forEach((segment) => {
					const endpoints = [segment.start, segment.end];
					endpoints.forEach((pt) => {
						const neighbors = querySegmentsAtPoint(index, pt);
						neighbors.forEach((otherIndex) => {
							if (otherIndex === segment.index) {
								return;
							}
							const other = segments[otherIndex];
							if (!isPointOnSegment(pt, other)) {
								return;
							}
							const key = recordPoint(pointMeta, wirePointKeys, segment.wireId, null, pt);
							recordPoint(pointMeta, wirePointKeys, other.wireId, null, pt);
							segmentNodes.get(segment.index)?.add(key);
							segmentNodes.get(otherIndex)?.add(key);
						});
					});
				});

				pins.forEach((pin) => {
					const key = recordPoint(pointMeta, wirePointKeys, null, pin.key, { x: pin.x, y: pin.y });
					const touchingSegments = querySegmentsAtPoint(index, pin);
					touchingSegments.forEach((segmentIndex) => {
						const segment = segments[segmentIndex];
						if (!segment) {
							return;
						}
						if (!isPointOnSegment(pin, segment)) {
							return;
						}
						recordPoint(pointMeta, wirePointKeys, segment.wireId, pin.key, { x: pin.x, y: pin.y });
						segmentNodes.get(segmentIndex)?.add(key);
					});
				});

				const uf = new UnionFind();
				pointMeta.forEach((_, key) => uf.add(key));
				segments.forEach((segment) => {
					const nodes = segmentNodes.get(segment.index);
					if (!nodes || nodes.size < 2) {
						return;
					}
					const ordered = orderSegmentNodes(nodes, pointMeta, segment);
					const head = ordered[0];
					for (let i = 1; i < ordered.length; i += 1) {
						uf.union(head, ordered[i]);
					}
				});

				const groundRoots = new Set();
				pins.forEach((pin) => {
					if (!pin.isGround) {
						return;
					}
					const key = pointKey(pin.x, pin.y);
					if (!pointMeta.has(key)) {
						return;
					}
					groundRoots.add(uf.find(key));
				});

				const rootToName = new Map();
				let nextNetIndex = 1;
				pointMeta.forEach((meta, key) => {
					const root = uf.find(key);
					if (!rootToName.has(root)) {
						const label = groundRoots.has(root) ? "0" : `N${String(nextNetIndex).padStart(3, "0")}`;
						rootToName.set(root, label);
						if (!groundRoots.has(root)) {
							nextNetIndex += 1;
						}
					}
				});

				const nets = new Map();
				const pinToNet = new Map();
				const wireToNet = new Map();
				const junctions = [];
				pointMeta.forEach((meta, key) => {
					const root = uf.find(key);
					const netName = rootToName.get(root);
					if (!netName) {
						return;
					}
					let net = nets.get(netName);
					if (!net) {
						net = { id: netName, name: netName, wires: new Set(), pins: new Set(), points: new Set() };
						nets.set(netName, net);
					}
					net.points.add(key);
					meta.wires.forEach((wireId) => net.wires.add(wireId));
					meta.pins.forEach((pinKey) => net.pins.add(pinKey));
					if (meta.wires.size > 1) {
						junctions.push({ x: meta.x, y: meta.y, netId: netName });
					}
				});

				pins.forEach((pin) => {
					const key = pointKey(pin.x, pin.y);
					const meta = pointMeta.get(key);
					if (!meta) {
						return;
					}
					const connected = meta.wires.size > 0 || meta.pins.size > 1 || pin.isGround;
					if (!connected) {
						return;
					}
					const root = uf.find(key);
					const netName = rootToName.get(root);
					if (netName) {
						pinToNet.set(pin.key, netName);
					}
				});

				wirePointKeys.forEach((pointKeys, wireId) => {
					const roots = new Set();
					pointKeys.forEach((key) => roots.add(uf.find(key)));
					const [firstRoot] = Array.from(roots);
					if (!firstRoot) {
						return;
					}
					const netName = rootToName.get(firstRoot);
					if (netName) {
						wireToNet.set(wireId, netName);
					}
				});

				return { nets, pinToNet, wireToNet, junctions };
			}

			function collectWireSegments(wires) {
				const segments = [];
				wires.forEach((wire) => {
					if (!wire.id) {
						wire.id = state.nextWireId++;
					}
					const path = getWirePoints(wire);
					for (let i = 0; i < path.length - 1; i += 1) {
						const start = path[i];
						const end = path[i + 1];
						const orientation = inferSegmentOrientation(start, end);
						if (!orientation) {
							continue;
						}
						segments.push({
							wireId: wire.id,
							start: { x: start.x, y: start.y },
							end: { x: end.x, y: end.y },
							orientation,
						});
					}
				});
				return segments;
			}

			function collectPlacedPins(placements, library) {
				const results = [];
				placements.forEach((placement) => {
					const component = library[placement.type];
					if (!component) {
						return;
					}
					const placementId = ensurePlacementId(placement);
					(component.pins || []).forEach((pin) => {
						const position = getPinWorldPosition(placement, pin);
						if (!position) {
							return;
						}
						results.push({
							key: makePinKey(placementId, pin.id),
							x: position.x,
							y: position.y,
							isGround: isGroundComponent(component),
						});
					});
				});
				return results;
			}

			function createSpatialIndex() {
				const buckets = new Map();
				return {
					buckets,
				};
			}

			function addSegmentToIndex(index, segment) {
				const minX = Math.min(segment.start.x, segment.end.x);
				const maxX = Math.max(segment.start.x, segment.end.x);
				const minY = Math.min(segment.start.y, segment.end.y);
				const maxY = Math.max(segment.start.y, segment.end.y);
				const cells = getCellsForBounds(minX, minY, maxX, maxY);
				cells.forEach((cell) => {
					const existing = index.buckets.get(cell) || new Set();
					existing.add(segment.index);
					index.buckets.set(cell, existing);
				});
			}

			function querySegmentsForSegment(index, segment) {
				const minX = Math.min(segment.start.x, segment.end.x);
				const maxX = Math.max(segment.start.x, segment.end.x);
				const minY = Math.min(segment.start.y, segment.end.y);
				const maxY = Math.max(segment.start.y, segment.end.y);
				const cells = getCellsForBounds(minX, minY, maxX, maxY);
				const candidates = new Set();
				cells.forEach((cell) => {
					const bucket = index.buckets.get(cell);
					if (bucket) {
						bucket.forEach((id) => candidates.add(id));
					}
				});
				return candidates;
			}

			function querySegmentsAtPoint(index, point) {
				const cell = getCellForPoint(point.x, point.y);
				const bucket = index.buckets.get(cell) || new Set();
				return bucket;
			}

			function getCellsForBounds(minX, minY, maxX, maxY) {
				const cells = [];
				const startX = Math.floor(minX / NET_CELL_SIZE);
				const endX = Math.floor(maxX / NET_CELL_SIZE);
				const startY = Math.floor(minY / NET_CELL_SIZE);
				const endY = Math.floor(maxY / NET_CELL_SIZE);
				for (let x = startX; x <= endX; x += 1) {
					for (let y = startY; y <= endY; y += 1) {
						cells.push(`${x},${y}`);
					}
				}
				return cells;
			}

			function getCellForPoint(x, y) {
				const cx = Math.floor(x / NET_CELL_SIZE);
				const cy = Math.floor(y / NET_CELL_SIZE);
				return `${cx},${cy}`;
			}

			function findSegmentIntersections(a, b) {
				if (!a || !b || !a.orientation || !b.orientation) {
					return [];
				}
				if (a.orientation === b.orientation) {
					if (a.orientation === "horizontal" && a.start.y === b.start.y) {
						return overlappingRangePoints(a.start.x, a.end.x, b.start.x, b.end.x, a.start.y, true);
					}
					if (a.orientation === "vertical" && a.start.x === b.start.x) {
						return overlappingRangePoints(a.start.y, a.end.y, b.start.y, b.end.y, a.start.x, false);
					}
				}
				return [];
			}

			function overlappingRangePoints(a1, a2, b1, b2, constant, isHorizontal) {
				const minA = Math.min(a1, a2);
				const maxA = Math.max(a1, a2);
				const minB = Math.min(b1, b2);
				const maxB = Math.max(b1, b2);
				const start = Math.max(minA, minB);
				const end = Math.min(maxA, maxB);
				if (end < start) {
					return [];
				}
				if (start === end) {
					return [isHorizontal ? { x: start, y: constant } : { x: constant, y: start }];
				}
				return [
					isHorizontal ? { x: start, y: constant } : { x: constant, y: start },
					isHorizontal ? { x: end, y: constant } : { x: constant, y: end },
				];
			}

			function recordPoint(pointMeta, wirePointKeys, wireId, pinKey, point) {
				const key = pointKey(point.x, point.y);
				let meta = pointMeta.get(key);
				if (!meta) {
					meta = { x: point.x, y: point.y, wires: new Set(), pins: new Set() };
					pointMeta.set(key, meta);
				}
				if (wireId != null) {
					meta.wires.add(wireId);
					let wireSet = wirePointKeys.get(wireId);
					if (!wireSet) {
						wireSet = new Set();
						wirePointKeys.set(wireId, wireSet);
					}
					wireSet.add(key);
				}
				if (pinKey) {
					meta.pins.add(pinKey);
				}
				return key;
			}

			function registerSegmentEndpoint(segmentNodes, pointMeta, wirePointKeys, segmentIndex, wireId, point) {
				const key = recordPoint(pointMeta, wirePointKeys, wireId, null, point);
				const entry = segmentNodes.get(segmentIndex);
				if (entry) {
					entry.add(key);
				}
			}

			function orderSegmentNodes(nodes, pointMeta, segment) {
				const ordered = Array.from(nodes).map((key) => {
					const meta = pointMeta.get(key);
					return { key, meta };
				});
				const axis = segment.orientation === "horizontal" ? "x" : "y";
				ordered.sort((a, b) => (a.meta ? a.meta[axis] : 0) - (b.meta ? b.meta[axis] : 0));
				return ordered.map((entry) => entry.key);
			}

			function isPointOnSegment(point, segment) {
				if (!point || !segment) {
					return false;
				}
				const onX = between(point.x, segment.start.x, segment.end.x);
				const onY = between(point.y, segment.start.y, segment.end.y);
				if (segment.orientation === "horizontal") {
					return onX && point.y === segment.start.y;
				}
				if (segment.orientation === "vertical") {
					return onY && point.x === segment.start.x;
				}
				return false;
			}

			function between(value, start, end) {
				const min = Math.min(start, end);
				const max = Math.max(start, end);
				return value >= min - Number.EPSILON && value <= max + Number.EPSILON;
			}

			function pointKey(x, y) {
				return `${x},${y}`;
			}

			function updateNetlist() {
				if (!state.ready) {
					state.netlistText = "* Component library loading...";
					state.referenceMap = Object.create(null);
					state.nets = new Map();
					state.pinToNet = new Map();
					state.wireToNet = new Map();
					state.junctionPoints = [];
					syncNetlistOutput();
					return;
				}
				rebuildConnectivity();
				state.referenceMap = Object.create(null);
				state.netlistText = buildNetlistText();
				syncNetlistOutput();
			}

			function syncNetlistOutput() {
				if (netlistOutput) {
					netlistOutput.textContent = state.netlistText || "";
				}
			}

			function buildNetlistText() {
				const pinToNet = state.pinToNet || new Map();
				const prefixCounters = new Map();
				const lines = [];
				const referenceMap = state.referenceMap || Object.create(null);
				state.referenceMap = referenceMap;
				state.placements.forEach((placement) => {
					const component = state.library[placement.type];
					if (!component) {
						return;
					}
					const placementId = ensurePlacementId(placement);
					const reference = buildReferenceForPlacement(placement, component, prefixCounters);
					referenceMap[placementId] = reference || "";
					if (shouldExcludeFromNetlist(component)) {
						return;
					}
					const pins = component.pins || [];
					const nodeLabels = pins.map((pin, index) => {
						const key = makePinKey(placementId, pin.id);
						return pinToNet.get(key) || `NC${index + 1}`;
					});
					const value = getPlacementValue(placement);
					const comment = component.name ? ` ; ${component.name}` : "";
					lines.push(`${reference} ${nodeLabels.join(" ")} ${value}${comment}`);
				});
				if (!lines.length) {
					return "* Netlist is empty. Place components to begin.";
				}
				lines.unshift("* Auto-generated SPICE netlist");
				return lines.join("\n");
			}

			function defaultComponentValue(prefix) {
				switch (prefix) {
					case "R":
						return "1";
					case "C":
						return "1p";
					case "L":
						return "1n";
					default:
						return "1";
				}
			}

			function getDesignatorConfig(typeKey, component) {
				if (!component && typeKey) {
					component = state.library[typeKey];
				}
				return component?.designator || null;
			}

			function getDesignatorPrefix(typeKey, component) {
				const config = getDesignatorConfig(typeKey, component);
				if (config && typeof config.prefix === "string") {
					const trimmed = config.prefix.trim();
					if (trimmed) {
						return trimmed;
					}
				}
				return guessDesignatorPrefix(typeKey, component);
			}

			function shouldAutoIncrementDesignator(component, typeKey) {
				const config = getDesignatorConfig(typeKey, component);
				if (!config || typeof config.autoIncrement === "undefined") {
					return true;
				}
				return Boolean(config.autoIncrement);
			}

			function buildReferenceForPlacement(placement, component, prefixCounters) {
				const prefix = getDesignatorPrefix(placement.type, component);
				if (!prefix) {
					return "";
				}
				if (!shouldAutoIncrementDesignator(component, placement.type)) {
					return prefix;
				}
				const nextIndex = (prefixCounters.get(prefix) || 0) + 1;
				prefixCounters.set(prefix, nextIndex);
				return `${prefix}${nextIndex}`;
			}

			function isGroundComponent(componentOrType) {
				if (!componentOrType) {
					return false;
				}
				if (typeof componentOrType === "string") {
					const typeComponent = state.library[componentOrType];
					return Boolean(typeComponent?.isGround);
				}
				return Boolean(componentOrType.isGround);
			}

			function shouldExcludeFromNetlist(component) {
				return Boolean(component?.isGround || component?.excludeFromNetlist);
			}

			function guessDesignatorPrefix(typeKey, component) {
				const source = `${typeKey || ""} ${component?.name || ""}`.toLowerCase();
				if (source.includes("res")) {
					return "R";
				}
				if (source.includes("cap")) {
					return "C";
				}
				if (source.includes("ind") || source.includes("coil")) {
					return "L";
				}
				if (source.includes("voltage") && source.includes("source")) {
					return "V";
				}
				return "X";
			}

			function resolveComponentValue(typeKey) {
				if (!typeKey) {
					return "";
				}
				const component = state.library[typeKey];
				if (!component) {
					return "";
				}
				const prefix = getDesignatorPrefix(typeKey, component);
				return component.defaultValue || component.value || defaultComponentValue(prefix);
			}

			function getPlacementValue(placement) {
				if (!placement) {
					return "";
				}
				if (typeof placement.value === "string") {
					const trimmed = placement.value.trim();
					if (trimmed) {
						return trimmed;
					}
				}
				return resolveComponentValue(placement.type) || "";
			}

			function makePinKey(placementId, pinId) {
				return `${placementId}:${pinId}`;
			}

			class UnionFind {
				constructor() {
					this.parent = new Map();
				}

				add(key) {
					if (!this.parent.has(key)) {
						this.parent.set(key, key);
					}
				}

				find(key) {
					if (!this.parent.has(key)) {
						this.parent.set(key, key);
						return key;
					}
					let root = key;
					while (root !== this.parent.get(root)) {
						root = this.parent.get(root);
					}
					let node = key;
					while (node !== root) {
						const parent = this.parent.get(node);
						this.parent.set(node, root);
						node = parent;
					}
					return root;
				}

				union(a, b) {
					const rootA = this.find(a);
					const rootB = this.find(b);
					if (rootA === rootB) {
						return;
					}
					this.parent.set(rootB, rootA);
				}
			}

			function buildSprite(key, component) {
				return new Promise((resolve, reject) => {
					if (!component || typeof component.svg !== "string") {
						reject(new Error(`Missing SVG for component ${key}`));
						return;
					}
					const svgMarkup = component.svg;
					const img = new Image();
					img.onload = () => {
						state.sprites[key] = img;
						resolve();
					};
					img.onerror = reject;
					img.src = svgToDataUrl(svgMarkup);
				});
			}

			function parseViewBox(svgString) {
				if (typeof svgString !== "string") {
					return null;
				}
				const match = svgString.match(/viewBox\s*=\s*"([^"]+)"/i);
				if (!match) {
					return null;
				}
				const parts = match[1]
					.trim()
					.split(/\s+/)
					.map(Number)
					.filter((value) => Number.isFinite(value));
				if (parts.length !== 4) {
					return null;
				}
				return {
					minX: parts[0],
					minY: parts[1],
					width: parts[2],
					height: parts[3],
				};
			}

			function getSpriteMeta(component) {
				if (!component) {
					return null;
				}
				if (component.__spriteMeta) {
					return component.__spriteMeta;
				}
				const svg = component.svg;
				const viewBox = parseViewBox(svg) || {
					minX: 0,
					minY: 0,
					width: component.size?.width || 0,
					height: component.size?.height || 0,
				};
				const compWidthAttr = svg && svg.match(/data-comp-width\s*=\s*"(\d+(?:\.\d+)?)"/i);
				const compHeightAttr = svg && svg.match(/data-comp-height\s*=\s*"(\d+(?:\.\d+)?)"/i);
				const offsetXAttr = svg && svg.match(/data-offset-x\s*=\s*"(\d+(?:\.\d+)?)"/i);
				const offsetYAttr = svg && svg.match(/data-offset-y\s*=\s*"(\d+(?:\.\d+)?)"/i);
				const compWidth = compWidthAttr ? parseFloat(compWidthAttr[1]) : component.size?.width;
				const compHeight = compHeightAttr ? parseFloat(compHeightAttr[1]) : component.size?.height;
				const offsetX = offsetXAttr ? parseFloat(offsetXAttr[1]) : 0;
				const offsetY = offsetYAttr ? parseFloat(offsetYAttr[1]) : 0;
				const meta = {
					viewBox,
					compWidth: Number.isFinite(compWidth) ? compWidth : component.size?.width || viewBox.width,
					compHeight: Number.isFinite(compHeight) ? compHeight : component.size?.height || viewBox.height,
					offsetX: Number.isFinite(offsetX) ? offsetX : 0,
					offsetY: Number.isFinite(offsetY) ? offsetY : 0,
				};
				component.__spriteMeta = meta;
				return meta;
			}

			function svgToDataUrl(svgString) {
				const trimmed = svgString.trim();
				const encoded = window.btoa(unescape(encodeURIComponent(trimmed)));
				return `data:image/svg+xml;base64,${encoded}`;
			}


			function updatePalette() {
				palette.innerHTML = "";
				Object.entries(state.library).forEach(([key, component]) => {
					const button = document.createElement("button");
					button.type = "button";
					const label = component?.name || key;
					button.setAttribute("aria-label", label);
					button.title = label;
					const sprite = state.sprites[key];
					const svgMarkup = component?.svg;
					const iconSrc = sprite?.src || (svgMarkup ? svgToDataUrl(svgMarkup) : "");
					if (iconSrc) {
						const img = document.createElement("img");
						img.src = iconSrc;
						img.alt = "";
						img.setAttribute("aria-hidden", "true");
						button.appendChild(img);
					} else {
						button.textContent = label;
					}
					if (state.selected === key) {
						button.classList.add("active");
					}
					button.addEventListener("click", () => {
						state.selected = key;
						setActiveTool(TOOL_PLACE);
						updatePalette();
					});
					palette.appendChild(button);
				});
			}

			let pendingFrame = null;
			function requestRender() {
				if (pendingFrame !== null) {
					return;
				}
				pendingFrame = requestAnimationFrame(() => {
					render();
					pendingFrame = null;
				});
			}

			function render() {
				const metrics = getCanvasMetrics();
				const baseScale = metrics.dpr || 1;
				// Reset any prior transforms before clearing/drawing.
				ctx.setTransform(1, 0, 0, 1, 0, 0);
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				ctx.setTransform(baseScale, 0, 0, baseScale, 0, 0);
				const scale = state.zoom;
				ctx.save();
				ctx.scale(scale, scale);
				ctx.translate(-state.panX, -state.panY);
				drawCrosshairGuides(scale);
				drawWires(scale);
				state.placements.forEach((instance) => drawComponent(instance, scale));
				drawSelectionBox(scale);
				ctx.restore();
				// Return to identity to avoid leaking transforms into future clears.
				ctx.setTransform(1, 0, 0, 1, 0, 0);
			}

			function drawCrosshairGuides(scale) {
				// Draw CAD-style crosshair guides that span the visible canvas.
				if (!state.pointerWorld) {
					return;
				}
				const left = state.panX;
				const top = state.panY;
				const right = left + canvas.width / scale;
				const bottom = top + canvas.height / scale;
				ctx.save();
				ctx.strokeStyle = "rgba(15, 23, 42, 0.4)";
				ctx.setLineDash([]);
				ctx.lineWidth = 0.15 / scale;
				ctx.beginPath();
				ctx.moveTo(left, state.pointerWorld.y);
				ctx.lineTo(right, state.pointerWorld.y);
				ctx.moveTo(state.pointerWorld.x, top);
				ctx.lineTo(state.pointerWorld.x, bottom);
				ctx.stroke();
				ctx.restore();
			}

			function drawWires(scale) {
				ctx.save();
				ctx.lineJoin = "round";
				ctx.lineCap = "round";
				const hoverNet = state.hoverNetId;
				const wireNetMap = state.wireToNet || new Map();
				const normalStroke = "#0f172a";
				const baseWidth = Math.max(2 / scale, 1 / scale);
				ctx.lineWidth = baseWidth;
				state.wires.forEach((wire) => {
					const netId = wireNetMap.get(wire.id) || null;
					if (hoverNet && netId === hoverNet) {
						return;
					}
					ctx.strokeStyle = normalStroke;
					drawWirePath(getWirePoints(wire));
				});
				if (hoverNet) {
					ctx.lineWidth = Math.max(baseWidth * 1.5, 1.4 / scale);
					ctx.strokeStyle = HOVER_NET_COLOR;
					state.wires.forEach((wire) => {
						const netId = wireNetMap.get(wire.id) || null;
						if (netId !== hoverNet) {
							return;
						}
						drawWirePath(getWirePoints(wire));
					});
				}
				if (isWireMode() && state.pendingWire) {
					const previewPath = getPendingWirePreviewPath();
					if (previewPath) {
						ctx.save();
						ctx.setLineDash([8 / scale, 6 / scale]);
						ctx.strokeStyle = HOVER_NET_COLOR;
						drawWirePath(previewPath);
						ctx.restore();
					}
				}
				drawJunctionDots(scale, hoverNet);
				ctx.restore();
			}

			function drawJunctionDots(scale, hoverNet) {
				if (!Array.isArray(state.junctionPoints) || !state.junctionPoints.length) {
					return;
				}
				const radius = JUNCTION_RADIUS / scale;
				ctx.save();
				ctx.lineWidth = 1 / scale;
				state.junctionPoints.forEach((junction) => {
					const highlighted = hoverNet && junction.netId === hoverNet;
					ctx.fillStyle = highlighted ? HOVER_NET_COLOR : "#0f172a";
					ctx.strokeStyle = highlighted ? "#dbeafe" : "#f8fafc";
					ctx.beginPath();
					ctx.arc(junction.x, junction.y, radius, 0, Math.PI * 2);
					ctx.fill();
					ctx.stroke();
				});
				ctx.restore();
			}

			function drawWirePath(path) {
				if (!path || path.length < 2) {
					return;
				}
				ctx.beginPath();
				ctx.moveTo(path[0].x, path[0].y);
				for (let i = 1; i < path.length; i += 1) {
					ctx.lineTo(path[i].x, path[i].y);
				}
				ctx.stroke();
			}

			function drawComponent(instance, scale) {
				const component = state.library[instance.type];
				const sprite = state.sprites[instance.type];
				if (!component || !sprite) {
					return;
				}
				const spriteMeta = getSpriteMeta(component);
				const hoverNet = state.hoverNetId;
				const pinNetMap = state.pinToNet || new Map();

				const halfWidth = component.size.width / 2;
				const halfHeight = component.size.height / 2;
				const rotationDegrees = getPlacementRotation(instance);
				const rotationRadians = toRadians(rotationDegrees);
				const localDrawX = -halfWidth;
				const localDrawY = -halfHeight;
				const valueLabel = getPlacementValue(instance);
				const placementId = ensurePlacementId(instance);
				const referenceLabel = state.referenceMap ? state.referenceMap[placementId] : null;
				const orientationFactor = Math.abs(Math.sin(rotationRadians));
				const topAnchorY = localDrawY;
				const bottomAnchorY = localDrawY + component.size.height;
				const valueAnchor = valueLabel
					? getComponentLabelAnchor(component, "value", rotationDegrees)
					: null;
				const designatorAnchor = referenceLabel
					? getComponentLabelAnchor(component, "designator", rotationDegrees)
					: null;
				const valueLabelPosition = valueLabel
					? valueAnchor
						? transformLabelAnchorToWorld(instance, component, valueAnchor, rotationRadians)
						: getLabelWorldPosition(
							instance,
							topAnchorY,
							rotationRadians,
							scale,
							-1,
							6,
							14,
							orientationFactor
						)
					: null;
				const referenceLabelPosition = referenceLabel
					? designatorAnchor
						? transformLabelAnchorToWorld(instance, component, designatorAnchor, rotationRadians)
						: getLabelWorldPosition(
							instance,
							bottomAnchorY,
							rotationRadians,
							scale,
							1,
							4,
							12,
							orientationFactor
						)
					: null;

				ctx.save();
				ctx.translate(instance.x, instance.y);
				if (rotationRadians !== 0) {
					ctx.rotate(rotationRadians);
				}
				const scaleX = spriteMeta && spriteMeta.compWidth ? component.size.width / spriteMeta.compWidth : 1;
				const scaleY = spriteMeta && spriteMeta.compHeight ? component.size.height / spriteMeta.compHeight : 1;
				const drawX = spriteMeta ? localDrawX - spriteMeta.offsetX * scaleX : localDrawX;
				const drawY = spriteMeta ? localDrawY - spriteMeta.offsetY * scaleY : localDrawY;
				const drawW = spriteMeta ? spriteMeta.viewBox.width * scaleX : component.size.width;
				const drawH = spriteMeta ? spriteMeta.viewBox.height * scaleY : component.size.height;
				ctx.drawImage(sprite, drawX, drawY, drawW, drawH);
				if (isPlacementSelected(placementId)) {
					drawSelectionOutline(component, localDrawX, localDrawY, scale);
				}
				const pins = component.pins || [];
				if (pins.length) {
					const pinRadius = 2.2 / scale;
					const pinStroke = 1 / scale;
					ctx.save();
					ctx.lineWidth = pinStroke;
					pins.forEach((pin) => {
						if (!pin || !pin.position) {
							return;
						}
						const pinX = localDrawX + pin.position.x;
						const pinY = localDrawY + pin.position.y;
						const pinKey = makePinKey(placementId, pin.id);
						const pinNetId = pinNetMap.get(pinKey) || null;
						const highlighted = hoverNet && pinNetId === hoverNet;
						ctx.fillStyle = highlighted ? HOVER_NET_COLOR : "#0f172a";
						ctx.strokeStyle = highlighted ? "#dbeafe" : "#f8fafc";
						ctx.beginPath();
						ctx.arc(pinX, pinY, pinRadius, 0, Math.PI * 2);
						ctx.fill();
						ctx.stroke();
					});
					ctx.restore();
				}
				const activePinId =
					state.pendingWire &&
					state.pendingWire.from.placementId === placementId
						? state.pendingWire.from.pinId
						: null;
				if (activePinId) {
					const pins = component.pins || [];
					const highlightPin = pins.find((pin) => pin.id === activePinId && pin.position);
					if (highlightPin && highlightPin.position) {
						const pinX = localDrawX + highlightPin.position.x;
						const pinY = localDrawY + highlightPin.position.y;
						const highlightRadius = 6 / scale;
						ctx.strokeStyle = "#f97316";
						ctx.lineWidth = 2 / scale;
						ctx.beginPath();
						ctx.arc(pinX, pinY, highlightRadius, 0, Math.PI * 2);
						ctx.stroke();
					}
				}
				ctx.restore();

				if (valueLabel && valueLabelPosition) {
					ctx.save();
					// Align size closely with symbol editor preview scaling.
					const pixelFontSize = 6;
					// Let label text scale with zoom by using the base font size inside the already-scaled context.
					const fontSize = pixelFontSize;
					ctx.font = `${fontSize}px monospace`;
					ctx.textAlign = "center";
					// Match symbol editor baseline alignment so anchors land identically.
					ctx.textBaseline = "middle";
					ctx.fillStyle = "#0f172a";
					ctx.fillText(valueLabel, valueLabelPosition.x, valueLabelPosition.y);
					ctx.restore();
				}

				if (referenceLabel && referenceLabelPosition) {
					ctx.save();
					// Align size closely with symbol editor preview scaling.
					const pixelFontSize = 5;
					// Labels now scale with zoom alongside the component sprite.
					const fontSize = pixelFontSize;
					ctx.font = `${fontSize}px monospace`;
					ctx.textAlign = "center";
					// Match symbol editor baseline alignment.
					ctx.textBaseline = "middle";
					ctx.fillStyle = "#1f2937";
					ctx.fillText(referenceLabel, referenceLabelPosition.x, referenceLabelPosition.y);
					ctx.restore();
				}
			}

			function drawSelectionOutline(component, localDrawX, localDrawY, scale) {
				const halfWidth = component.size.width / 2;
				const halfHeight = component.size.height / 2;
				ctx.save();
				ctx.strokeStyle = "#2563eb";
				ctx.lineWidth = 1.2 / scale;
				ctx.setLineDash([4 / scale, 2 / scale]);
				ctx.strokeRect(localDrawX, localDrawY, halfWidth * 2, halfHeight * 2);
				ctx.restore();
			}

			function handleKeyDown(event) {
				if (event.code === "Escape" && !shouldIgnoreKey(event)) {
					if (state.pendingWire) {
						state.pendingWire = null;
						requestRender();
					}
					if (isWireMode()) {
						setActiveTool(TOOL_PLACE);
					}
					return;
				}
				if ((event.key === "r" || event.key === "R") && !shouldIgnoreKey(event)) {
					const rotated = rotateHoveredPlacement();
					if (rotated) {
						event.preventDefault();
					}
					return;
				}
				if (event.code === "Space" && !shouldIgnoreKey(event)) {
					if (!state.spacePanning) {
						state.spacePanning = true;
					}
					event.preventDefault();
				}
			}

			function handleKeyUp(event) {
				if (event.code === "Space") {
					state.spacePanning = false;
				}
			}

			function shouldIgnoreKey(event) {
				const target = event.target;
				if (!target) {
					return false;
				}
				const tag = target.tagName;
				return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
			}

			function getCanvasMetrics() {
				const rect = canvas.getBoundingClientRect();
				const dpr = window.devicePixelRatio || 1;
				// scaleX/scaleY convert from CSS pixels to canvas units (which track CSS px).
				const scaleX = (canvas.width / dpr) / rect.width;
				const scaleY = (canvas.height / dpr) / rect.height;
				return { rect, dpr, scaleX, scaleY };
			}

			function drawSelectionBox(scale) {
				if (!state.selectionBox) {
					return;
				}
				const { start, current } = state.selectionBox;
				const x = Math.min(start.x, current.x);
				const y = Math.min(start.y, current.y);
				const w = Math.abs(start.x - current.x);
				const h = Math.abs(start.y - current.y);
				ctx.save();
				ctx.fillStyle = "rgba(37, 99, 235, 0.12)";
				ctx.strokeStyle = "rgba(37, 99, 235, 0.9)";
				ctx.lineWidth = 1 / scale;
				ctx.setLineDash([4 / scale, 2 / scale]);
				ctx.beginPath();
				ctx.rect(x, y, w, h);
				ctx.fill();
				ctx.stroke();
				ctx.restore();
			}

			function resizeCanvasToDisplaySize() {
				const dpr = window.devicePixelRatio || 1;
				const rect = canvas.getBoundingClientRect();
				const width = Math.max(1, Math.round(rect.width));
				const height = Math.max(1, Math.round(rect.height));
				const displayWidth = Math.round(width * dpr);
				const displayHeight = Math.round(height * dpr);
				if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
					canvas.width = displayWidth;
					canvas.height = displayHeight;
					canvas.style.width = `${width}px`;
					canvas.style.height = `${height}px`;
					return true;
				}
				return false;
			}

			function setupCanvasResizeHandling() {
				const resizeHandler = () => {
					const resized = resizeCanvasToDisplaySize();
					if (resized) {
						requestRender();
					}
				};
				resizeHandler();
				if (typeof ResizeObserver === "function") {
					const observer = new ResizeObserver(resizeHandler);
					observer.observe(canvas);
				}
				window.addEventListener("resize", resizeHandler);
			}

			function canvasToWorld(canvasX, canvasY) {
				return {
					x: state.panX + canvasX / state.zoom,
					y: state.panY + canvasY / state.zoom,
				};
			}

			function worldPointToLocal(point, placement) {
				if (!point || !placement) {
					return null;
				}
				const dx = point.x - placement.x;
				const dy = point.y - placement.y;
				const rotationRadians = toRadians(getPlacementRotation(placement));
				return rotatePoint(dx, dy, -rotationRadians);
			}

			function getPlacementRotation(placement) {
				if (!placement) {
					return 0;
				}
				return Number.isFinite(placement.rotation) ? placement.rotation : 0;
			}

			function normalizeRotation(value) {
				if (!Number.isFinite(value)) {
					return 0;
				}
				const mod = value % 360;
				return mod < 0 ? mod + 360 : mod;
			}

			function toRadians(degrees) {
				return (degrees * Math.PI) / 180;
			}

			function rotatePoint(x, y, angleRadians) {
				const cosA = Math.cos(angleRadians);
				const sinA = Math.sin(angleRadians);
				return {
					x: x * cosA - y * sinA,
					y: x * sinA + y * cosA,
				};
			}

			function getLabelWorldPosition(
				instance,
				anchorY,
				rotationRadians,
				scale,
				direction,
				minOffset,
				maxOffset,
				orientationFactor
			) {
				if (!instance || !Number.isFinite(scale) || scale === 0) {
					return null;
				}
				const normalizedDirection = direction >= 0 ? 1 : -1;
				const factor = Number.isFinite(orientationFactor)
					? orientationFactor
					: Math.abs(Math.sin(rotationRadians));
				const pixelOffset = minOffset + (maxOffset - minOffset) * factor;
				const localPoint = {
					x: 0,
					y: anchorY + (normalizedDirection * pixelOffset) / scale,
				};
				const rotated = rotationRadians
					? rotatePoint(localPoint.x, localPoint.y, rotationRadians)
					: localPoint;
				return {
					x: instance.x + rotated.x,
					y: instance.y + rotated.y,
				};
			}

			function getComponentLabelAnchor(component, labelKey, rotationDegrees) {
				if (!component || !component.labels) {
					return null;
				}
				const anchors = component.labels[labelKey];
				if (!Array.isArray(anchors) || !anchors.length) {
					return null;
				}
				const normalized = normalizeRotation(rotationDegrees);
				const useSecondary = normalized === 90 || normalized === 270;
				const index = useSecondary ? 1 : 0;
				const anchor = anchors[index] || anchors[0] || null;
				if (!anchor) {
					return null;
				}
				return {
					anchor,
					baseRotation: useSecondary ? 90 : 0,
				};
			}

			function transformLabelAnchorToWorld(instance, component, anchorInfo, rotationRadians) {
				if (!instance || !component || !component.size || !anchorInfo || !anchorInfo.anchor) {
					return null;
				}
				const { anchor, baseRotation = 0 } = anchorInfo;
				const localX = (anchor.x ?? 0) - component.size.width / 2;
				const localY = (anchor.y ?? 0) - component.size.height / 2;
				const baseRadians = toRadians(baseRotation);
				const deltaRotation = rotationRadians - baseRadians;
				const rotated = deltaRotation
					? rotatePoint(localX, localY, deltaRotation)
					: { x: localX, y: localY };
				return {
					x: instance.x + rotated.x,
					y: instance.y + rotated.y,
				};
			}

			function applyZoom(nextZoom, focusWorld, canvasPoint) {
				const clampedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
				const screenPoint = canvasPoint || { x: canvas.width / 2, y: canvas.height / 2 };
				const focus = focusWorld || canvasToWorld(screenPoint.x, screenPoint.y);
				if (!Number.isFinite(clampedZoom) || clampedZoom === state.zoom) {
					return;
				}
				state.zoom = clampedZoom;
				state.panX = focus.x - screenPoint.x / state.zoom;
				state.panY = focus.y - screenPoint.y / state.zoom;
				requestRender();
			}

			function clamp(value, min, max) {
				return Math.min(max, Math.max(min, value));
			}

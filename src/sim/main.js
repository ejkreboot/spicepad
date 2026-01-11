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
				dragging: null,
				dragPointerId: null,
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
				netlistText: "",
				referenceMap: Object.create(null),
			};

				document.addEventListener("DOMContentLoaded", () => {
				loadComponentLibrary();
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
					state.dragging = {
						index: hitIndex,
						offsetX: point.x - hitPlacement.x,
						offsetY: point.y - hitPlacement.y,
					};
					state.dragPointerId = event.pointerId;
					if (typeof canvas.setPointerCapture === "function") {
						canvas.setPointerCapture(event.pointerId);
					}
					event.preventDefault();
					return;
				}

				if (!state.selected) {
					return;
				}
				const snapped = {
					x: snapToGrid(point.x),
					y: snapToGrid(point.y),
				};

				const placementId = state.nextPlacementId++;
				state.placements.push({
					id: placementId,
					type: state.selected,
					x: snapped.x,
					y: snapped.y,
					value: resolveComponentValue(state.selected),
					rotation: 0,
				});
				state.hoverPlacementId = placementId;

				updateNetlist();
				requestRender();
			}

			function handleWirePointerDown(point) {
				const hit = findPinAt(point);
				if (!hit) {
					if (state.pendingWire) {
						addPendingWireWaypoint(point);
					}
					return;
				}
				const placementId = ensurePlacementId(hit.placement);
				const targetRef = {
					placementId,
					pinId: hit.pin.id,
				};
				if (!state.pendingWire) {
					state.pendingWire = { from: targetRef, waypoints: [] };
					requestRender();
					return;
				}
				const samePin =
					state.pendingWire.from.placementId === targetRef.placementId &&
					state.pendingWire.from.pinId === targetRef.pinId;
				if (samePin) {
					state.pendingWire = null;
					requestRender();
					return;
				}
				const newWire = createWireBetween(
					state.pendingWire.from,
					targetRef,
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

				if (!state.dragging || event.pointerId !== state.dragPointerId) {
					return;
				}

				const placement = state.placements[state.dragging.index];
				if (!placement) {
					return;
				}

				const nextX = snapToGrid(point.x - state.dragging.offsetX);
				const nextY = snapToGrid(point.y - state.dragging.offsetY);
				if (placement.x !== nextX || placement.y !== nextY) {
					placement.x = nextX;
					placement.y = nextY;
					const placementId = ensurePlacementId(placement);
					rerouteWiresForPlacement(placementId);
					requestRender();
				}
			}

			function handlePointerUp(event) {
				if (state.panPointerId === event.pointerId) {
					endPan(event.pointerId);
					return;
				}

				if (!state.dragging || event.pointerId !== state.dragPointerId) {
					return;
				}

				if (state.dragPointerId !== null && typeof canvas.releasePointerCapture === "function") {
					canvas.releasePointerCapture(state.dragPointerId);
				}
				state.dragging = null;
				state.dragPointerId = null;
			}

			function handlePointerLeave() {
				clearPointerWorld();
				clearHoverPlacement();
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
					const path = wire?.path || [];
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
						return (
							wire.from.placementId !== removedId && wire.to.placementId !== removedId
						);
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

			function createWireBetween(fromRef, toRef, waypoints = []) {
				if (!fromRef || !toRef) {
					return null;
				}
				if (fromRef.placementId === toRef.placementId && fromRef.pinId === toRef.pinId) {
					return null;
				}
				const normalizedWaypoints = Array.isArray(waypoints)
					? waypoints.map((point) => ({ x: point.x, y: point.y }))
					: [];
				const path = buildWirePath(fromRef, toRef, normalizedWaypoints);
				if (!path) {
					return null;
				}
				return {
					id: state.nextWireId++,
					from: { ...fromRef },
					to: { ...toRef },
					waypoints: normalizedWaypoints.length ? normalizedWaypoints : null,
					path,
				};
			}

			function buildWirePath(fromRef, toRef, waypoints) {
				const startPoint = getPinPositionFromRef(fromRef);
				const endPoint = getPinPositionFromRef(toRef);
				if (!startPoint || !endPoint) {
					return null;
				}
				if (Array.isArray(waypoints) && waypoints.length) {
					return buildPolylinePath([startPoint, ...waypoints, endPoint]);
				}
				return buildManhattanPath(startPoint, endPoint);
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
				const originPoint = getPinPositionFromRef(state.pendingWire.from);
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
					if (wire.from.placementId === placementId || wire.to.placementId === placementId) {
						wire.waypoints = null;
						const nextPath = buildWirePath(wire.from, wire.to);
						if (nextPath) {
							wire.path = nextPath;
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
				return path;
			}

			function updateNetlist() {
				if (!state.ready) {
					state.netlistText = "* Component library loading...";
					state.referenceMap = Object.create(null);
					syncNetlistOutput();
					return;
				}
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
				const pinToNet = buildNetAssignments();
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

			function buildNetAssignments() {
				const uf = new UnionFind();
				const pinRefs = [];
				const groundPinKeys = new Set();
				state.placements.forEach((placement) => {
					const component = state.library[placement.type];
					if (!component) {
						return;
					}
					const placementId = ensurePlacementId(placement);
					const isGround = isGroundComponent(component);
					(component.pins || []).forEach((pin) => {
						const key = makePinKey(placementId, pin.id);
						pinRefs.push(key);
						uf.add(key);
						if (isGround) {
							groundPinKeys.add(key);
						}
					});
				});
				state.wires.forEach((wire) => {
					const fromKey = makePinKey(wire.from.placementId, wire.from.pinId);
					const toKey = makePinKey(wire.to.placementId, wire.to.pinId);
					uf.add(fromKey);
					uf.add(toKey);
					uf.union(fromKey, toKey);
				});
				const pinToNet = new Map();
				const rootToLabel = new Map();
				const groundRoots = new Set();
				groundPinKeys.forEach((key) => {
					const root = uf.find(key);
					groundRoots.add(root);
				});
				let nextLabelIndex = 1;
				pinRefs.forEach((key) => {
					const root = uf.find(key);
					let label = rootToLabel.get(root);
					if (!label) {
						if (groundRoots.has(root)) {
							label = "0";
						} else {
							label = `N${String(nextLabelIndex).padStart(3, "0")}`;
							nextLabelIndex += 1;
						}
						rootToLabel.set(root, label);
					}
					pinToNet.set(key, label);
				});
				return pinToNet;
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
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				const scale = state.zoom;
				ctx.save();
				ctx.scale(scale, scale);
				ctx.translate(-state.panX, -state.panY);
				drawCrosshairGuides(scale);
				drawWires(scale);
				state.placements.forEach((instance) => drawComponent(instance, scale));
				ctx.restore();
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
				ctx.lineWidth = Math.max(2 / scale, 1 / scale);
				ctx.lineJoin = "round";
				ctx.lineCap = "round";
				ctx.strokeStyle = "#0f172a";
				state.wires.forEach((wire) => drawWirePath(wire.path));
				if (isWireMode() && state.pendingWire) {
					const previewPath = getPendingWirePreviewPath();
					if (previewPath) {
						ctx.save();
						ctx.setLineDash([8 / scale, 6 / scale]);
						ctx.strokeStyle = "#2563eb";
						drawWirePath(previewPath);
						ctx.restore();
					}
				}
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
				const pins = component.pins || [];
				if (pins.length) {
					const pinRadius = 2.2 / scale;
					const pinStroke = 1 / scale;
					ctx.save();
					ctx.fillStyle = "#0f172a";
					ctx.strokeStyle = "#f8fafc";
					ctx.lineWidth = pinStroke;
					pins.forEach((pin) => {
						if (!pin || !pin.position) {
							return;
						}
						const pinX = localDrawX + pin.position.x;
						const pinY = localDrawY + pin.position.y;
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
				return {
					rect,
					scaleX: canvas.width / rect.width,
					scaleY: canvas.height / rect.height,
				};
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

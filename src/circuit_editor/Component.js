/**
 * Component - Basic schematic component instance
 *
 * Position is in world coordinates (top-left corner).
 * Pins are defined as offsets from the top-left corner.
 */

export class Component {
	/**
	 * @param {Object} options
	 * @param {string} options.id
	 * @param {number} options.x
	 * @param {number} options.y
	 * @param {number} options.width
	 * @param {number} options.height
	 * @param {Array<{id: string, name: string, offset: {x: number, y: number}, labelOffset?: {x: number, y: number}}>} options.pins
	 * @param {string} [options.name]
	 */
	constructor(options) {
		this.id = options.id;
		this.name = options.name ?? options.id;
		this.x = options.x;
		this.y = options.y;
		this.width = options.width;
		this.height = options.height;
		this.pins = options.pins ?? [];
		this.meta = options.meta ?? {};
		this.rotation = options.rotation ?? 0; // 0, 90, 180, 270
	}
    
	/**
	 * Get bounding box in world coordinates
	 */
	getBounds() {
		const rotation = this.rotation || 0;
		let width = this.width;
		let height = this.height;
		
		// Swap dimensions for 90/270 degree rotations
		if (rotation === 90 || rotation === 270) {
			const temp = width;
			width = height;
			height = temp;
		}
		
		return {
			x: this.x,
			y: this.y,
			width: width,
			height: height
		};
	}
    
	/**
	 * Get pin world position
	 * @param {{id: string, name: string, offset: {x: number, y: number}}} pin
	 */
	getPinWorldPosition(pin) {
		const rotation = this.rotation || 0;
		const width = this.width;
		const height = this.height;
		const cx = width / 2;
		const cy = height / 2;
		let dx = pin.offset.x - cx;
		let dy = pin.offset.y - cy;

		// Rotate around the component center so pins stay aligned for non-square symbols
		switch (rotation) {
			case 90: {
				// Clockwise 90°
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
				// Clockwise 270° (or -90°)
				const tmp = dx;
				dx = dy;
				dy = -tmp;
				break;
			}
			default:
				break;
		}

		return {
			x: this.x + cx + dx,
			y: this.y + cy + dy
		};
	}
    
	/**
	 * Hit test for component body
	 * @param {number} worldX
	 * @param {number} worldY
	 * @param {number} padding
	 */
	hitTest(worldX, worldY, padding = 0) {
		const bounds = this.getBounds();
		return (
			worldX >= bounds.x - padding &&
			worldX <= bounds.x + bounds.width + padding &&
			worldY >= bounds.y - padding &&
			worldY <= bounds.y + bounds.height + padding
		);
	}
    
	/**
	 * Find pin near a world position
	 * @param {number} worldX
	 * @param {number} worldY
	 * @param {number} tolerance
	 */
	getPinAt(worldX, worldY, tolerance = 5) {
		for (const pin of this.pins) {
			const pos = this.getPinWorldPosition(pin);
			const dx = pos.x - worldX;
			const dy = pos.y - worldY;
			if (Math.sqrt(dx * dx + dy * dy) <= tolerance) {
				return pin;
			}
		}
		return null;
	}
    
	/**
	 * Translate component by delta
	 * @param {number} dx
	 * @param {number} dy
	 */
	translate(dx, dy) {
		this.x += dx;
		this.y += dy;
	}

	/**
	 * Rotate component 90 degrees clockwise
	 */
	rotate() {
		this.rotation = (this.rotation + 90) % 360;
	}

	/**
	 * Get the label position index based on rotation (0 for 0°/180°, 1 for 90°/270°)
	 */
	getLabelIndex() {
		return (this.rotation === 90 || this.rotation === 270) ? 1 : 0;
	}
	
	/**
	 * Get original (unrotated) dimensions for calculations
	 */
	getOriginalDimensions() {
		return { width: this.width, height: this.height };
	}
}

/**
 * Factory for a basic square component with one pin on each side
 * @param {Object} options
 * @param {string} options.id
 * @param {number} options.x
 * @param {number} options.y
 * @param {number} options.size
 */
export function createBasicSquareComponent(options) {
	const size = options.size ?? 40;
	const half = size / 2;
	return new Component({
		id: options.id,
		name: options.name ?? 'Square',
		x: options.x,
		y: options.y,
		width: size,
		height: size,
		pins: [
			{ id: 'left', name: 'L', offset: { x: 0, y: half } },
			{ id: 'right', name: 'R', offset: { x: size, y: half } },
			{ id: 'top', name: 'T', offset: { x: half, y: 0 } },
			{ id: 'bottom', name: 'B', offset: { x: half, y: size } }
		]
	});
}

/**
 * Factory for a component instance from a library definition
 * @param {Object} options
 * @param {string} options.instanceId
 * @param {string} options.definitionId
 * @param {Object} options.definition
 * @param {{x: number, y: number}} options.position
 * @param {string} [options.designatorText]
 * @param {string | null} [options.valueText]
 */
export function createComponentFromDefinition(options) {
	const definition = options.definition;
	const position = options.position;

	return new Component({
		id: options.instanceId,
		name: definition.name ?? options.definitionId,
		x: position.x,
		y: position.y,
		width: definition.size?.width ?? 40,
		height: definition.size?.height ?? 40,
		pins: (definition.pins ?? []).map(pin => ({
			id: pin.id,
			name: pin.name,
			offset: { x: pin.position.x, y: pin.position.y },
			labelOffset: pin.labelPosition ? { x: pin.labelPosition.x, y: pin.labelPosition.y } : null
		})),
		meta: {
			definitionId: options.definitionId,
			definition,
			svg: definition.svg ?? null,
			labels: definition.labels ?? null,
			designatorText: options.designatorText ?? '',
			valueText: options.valueText ?? null,
			isGround: definition.isGround ?? false
		}
	});
}

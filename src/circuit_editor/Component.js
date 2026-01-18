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
	 * @param {Array<{id: string, name: string, offset: {x: number, y: number}}>} options.pins
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
	}
    
	/**
	 * Get bounding box in world coordinates
	 */
	getBounds() {
		return {
			x: this.x,
			y: this.y,
			width: this.width,
			height: this.height
		};
	}
    
	/**
	 * Get pin world position
	 * @param {{id: string, name: string, offset: {x: number, y: number}}} pin
	 */
	getPinWorldPosition(pin) {
		return {
			x: this.x + pin.offset.x,
			y: this.y + pin.offset.y
		};
	}
    
	/**
	 * Hit test for component body
	 * @param {number} worldX
	 * @param {number} worldY
	 * @param {number} padding
	 */
	hitTest(worldX, worldY, padding = 0) {
		return (
			worldX >= this.x - padding &&
			worldX <= this.x + this.width + padding &&
			worldY >= this.y - padding &&
			worldY <= this.y + this.height + padding
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

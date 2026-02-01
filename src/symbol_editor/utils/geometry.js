/**
 * @fileoverview Geometry utilities for the symbol editor.
 * Provides point math, distance calculations, and hit testing functions.
 */

/**
 * Calculate distance from a point to a line segment
 * @param {number} px - Point x coordinate
 * @param {number} py - Point y coordinate
 * @param {number} x1 - Line start x
 * @param {number} y1 - Line start y
 * @param {number} x2 - Line end x
 * @param {number} y2 - Line end y
 * @returns {number} Distance from point to line segment
 */
export function pointToLineDistance(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = lenSq !== 0 ? dot / lenSq : -1;

    let xx, yy;
    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    return Math.sqrt(Math.pow(px - xx, 2) + Math.pow(py - yy, 2));
}

/**
 * Calculate the Euclidean distance between two points
 * @param {number} x1 - First point x
 * @param {number} y1 - First point y
 * @param {number} x2 - Second point x
 * @param {number} y2 - Second point y
 * @returns {number} Distance between the points
 */
export function distance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

/**
 * Calculate distance from a point to another point
 * @param {{x: number, y: number}} p1 - First point
 * @param {{x: number, y: number}} p2 - Second point
 * @returns {number} Distance
 */
export function pointDistance(p1, p2) {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/**
 * Rotate a point around a center (component center)
 * @param {{x: number, y: number}} point - Point to rotate
 * @param {number} angle - Angle in radians
 * @param {number} width - Component width (for center calculation)
 * @param {number} height - Component height (for center calculation)
 * @returns {{x: number, y: number}} Rotated point
 */
export function rotatePointAroundCenter(point, angle, width, height) {
    if (angle === 0) return { x: point.x, y: point.y };

    const cx = width / 2;
    const cy = height / 2;
    const dx = point.x - cx;
    const dy = point.y - cy;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    return {
        x: cx + dx * cosA - dy * sinA,
        y: cy + dx * sinA + dy * cosA,
    };
}

/**
 * Get the bounds of a rotated rectangle with optional extra points
 * @param {number} width - Rectangle width
 * @param {number} height - Rectangle height
 * @param {number} angle - Rotation angle in radians
 * @param {Array<{point: {x: number, y: number}, rotate?: boolean}>} [extraPoints=[]] - Additional points to include
 * @returns {{minX: number, minY: number, maxX: number, maxY: number, width: number, height: number}}
 */
export function getRotatedBounds(width, height, angle, extraPoints = []) {
    const baseCorners = [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
    ].map(pt => (angle === 0 ? pt : rotatePointAroundCenter(pt, angle, width, height)));

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

    return {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX,
        height: maxY - minY,
    };
}

/**
 * Check if an element intersects a rectangle
 * @param {Object} element - Element to check
 * @param {number} minX - Rectangle min X
 * @param {number} minY - Rectangle min Y
 * @param {number} maxX - Rectangle max X
 * @param {number} maxY - Rectangle max Y
 * @returns {boolean} True if element is in rectangle
 */
export function isElementInRect(element, minX, minY, maxX, maxY) {
    if (element.type === 'line') {
        // Check if either endpoint is in rect
        return (
            (element.x1 >= minX && element.x1 <= maxX && element.y1 >= minY && element.y1 <= maxY) ||
            (element.x2 >= minX && element.x2 <= maxX && element.y2 >= minY && element.y2 <= maxY)
        );
    } else if (element.type === 'circle' || element.type === 'arc') {
        // Check if center is in rect (simplified)
        return element.cx >= minX && element.cx <= maxX && element.cy >= minY && element.cy <= maxY;
    } else if ((element.type === 'polygon' || element.type === 'polyline') && element.points) {
        // Check if any point is in rect
        return element.points.some(
            p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
        );
    }
    return false;
}

/**
 * Get reference point for an element (used for snapping during drag)
 * @param {Object} element - Element to get reference point for
 * @returns {{x: number, y: number}} Reference point
 */
export function getElementReferencePoint(element) {
    if (!element) return { x: 0, y: 0 };

    if (element.type === 'line') {
        return { x: element.x1, y: element.y1 };
    }
    if (element.type === 'circle' || element.type === 'arc') {
        return { x: element.cx, y: element.cy };
    }
    if ((element.type === 'polygon' || element.type === 'polyline') && element.points?.length > 0) {
        return { x: element.points[0].x, y: element.points[0].y };
    }
    return { x: 0, y: 0 };
}

/**
 * Snap a value to grid
 * @param {number} value - Value to snap
 * @param {number} gridSize - Grid size
 * @returns {number} Snapped value
 */
export function snapToGrid(value, gridSize) {
    return Math.round(value / gridSize) * gridSize;
}

/**
 * Snap a point to grid
 * @param {{x: number, y: number}} point - Point to snap
 * @param {number} gridSize - Grid size
 * @returns {{x: number, y: number}} Snapped point
 */
export function snapPointToGrid(point, gridSize) {
    return {
        x: snapToGrid(point.x, gridSize),
        y: snapToGrid(point.y, gridSize),
    };
}

/**
 * Clamp a value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

/**
 * Calculate angle from one point to another
 * @param {{x: number, y: number}} from - Start point
 * @param {{x: number, y: number}} to - End point
 * @returns {number} Angle in radians
 */
export function angleBetweenPoints(from, to) {
    return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * Calculate a point on a circle given center, radius, and angle
 * @param {{x: number, y: number}} center - Circle center
 * @param {number} radius - Circle radius
 * @param {number} angle - Angle in radians
 * @returns {{x: number, y: number}} Point on circle
 */
export function pointOnCircle(center, radius, angle) {
    return {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
    };
}

/**
 * Check if a point is near another point within a threshold
 * @param {{x: number, y: number}} p1 - First point
 * @param {{x: number, y: number}} p2 - Second point
 * @param {number} threshold - Distance threshold
 * @returns {boolean} True if points are within threshold
 */
export function isPointNear(p1, p2, threshold) {
    return pointDistance(p1, p2) < threshold;
}

/**
 * Calculate distance from a point to a circle's edge
 * @param {number} px - Point x
 * @param {number} py - Point y
 * @param {number} cx - Circle center x
 * @param {number} cy - Circle center y
 * @param {number} r - Circle radius
 * @returns {number} Distance to circle edge (negative if inside)
 */
export function pointToCircleDistance(px, py, cx, cy, r) {
    const distToCenter = Math.sqrt(Math.pow(px - cx, 2) + Math.pow(py - cy, 2));
    return Math.abs(distToCenter - r);
}

/**
 * Normalize an angle to be within [0, 2π)
 * @param {number} angle - Angle in radians
 * @returns {number} Normalized angle
 */
export function normalizeAngle(angle) {
    while (angle < 0) angle += Math.PI * 2;
    while (angle >= Math.PI * 2) angle -= Math.PI * 2;
    return angle;
}

/**
 * Get the delta angle from start to end (positive = clockwise)
 * @param {number} startAngle - Start angle in radians
 * @param {number} endAngle - End angle in radians
 * @returns {number} Delta angle
 */
export function getDeltaAngle(startAngle, endAngle) {
    let delta = endAngle - startAngle;
    if (delta < 0) delta += Math.PI * 2;
    while (delta >= Math.PI * 2) delta -= Math.PI * 2;
    return delta;
}

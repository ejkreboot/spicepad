/**
 * @fileoverview SVG parsing and generation for the symbol editor.
 * Handles conversion between SVG format and internal element representation.
 */

import { getComponentDimensions } from '../dom.js';

/**
 * Parse SVG string to element array
 * @param {string} svgString - SVG string to parse
 * @returns {Array} Array of element objects
 */
export function parseSVGToElements(svgString) {
    if (!svgString) return [];

    const elements = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg) return [];

    // Get viewBox to understand coordinate space
    const viewBox = svg.getAttribute('viewBox');
    const { width: compWidth, height: compHeight } = getComponentDimensions();

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
        y: Math.round((y - offsetY) * scale),
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
                strokeWidth: strokeWidth * scale,
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
            filled: circle.getAttribute('fill') !== 'none',
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
            filled: ellipse.getAttribute('fill') !== 'none',
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
                filled: poly.getAttribute('fill') !== 'none',
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
                strokeWidth: strokeWidth * scale,
            });
        }
    });

    return elements;
}

/**
 * Parse SVG path data to line elements
 * @param {string} d - Path data string
 * @param {Function} transformPoint - Point transform function
 * @returns {Array} Array of line elements
 */
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
                    y2: endPoint.y,
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
                y2: endPoint.y,
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
                    y2: endPoint.y,
                });
                currentX = ex;
                currentY = ey;
            }
        }
    });

    return lines;
}

/**
 * Convert elements array to SVG string
 * @param {Array} elements - Array of element objects
 * @returns {string} SVG string
 */
export function elementsToSVG(elements) {
    const { width: compWidth, height: compHeight } = getComponentDimensions();

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
            // Normalize angles to mirror canvas rendering (clockwise, wrap end forward)
            let startAngle = el.startAngle;
            let endAngle = el.endAngle;
            let delta = endAngle - startAngle;
            if (delta < 0) {
                endAngle += Math.PI * 2;
                delta = endAngle - startAngle;
            }
            while (delta >= Math.PI * 2) delta -= Math.PI * 2;

            const startX = el.cx + Math.cos(startAngle) * el.r;
            const startY = el.cy + Math.sin(startAngle) * el.r;
            const endX = el.cx + Math.cos(endAngle) * el.r;
            const endY = el.cy + Math.sin(endAngle) * el.r;
            const largeArcFlag = delta > Math.PI ? 1 : 0;
            // Canvas arcs are clockwise; SVG sweepFlag=1 is clockwise
            const sweepFlag = 1;
            const d = `M ${startX + offsetX} ${startY + offsetY} A ${el.r} ${el.r} 0 ${largeArcFlag} ${sweepFlag} ${endX + offsetX} ${endY + offsetY}`;
            svgParts.push(`<path data-arc="true" data-cx="${el.cx}" data-cy="${el.cy}" data-r="${el.r}" data-start="${startAngle}" data-end="${el.endAngle}" fill="none" stroke="#000000" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" d="${d}"/>`);
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

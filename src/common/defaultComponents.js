export function getDefaultComponents() {
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
                designator: [ { x: 29, y: 10 }, { x: 43, y: 16 } ],
                value: [ { x: 29, y: 31 }, { x: 43, y: 22 } ]
            },
            svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 60" data-generated-by="symbol-editor" data-comp-width="60" data-comp-height="40" data-offset-x="15" data-offset-y="10"><polyline points="15,30 30,30 32,24 37,36 42,24 47,36 51,24 56,36 58,30 75,30 70,30" fill="none" stroke="#000000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
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
                designator: [ { x: 29, y: 4 }, { x: 49, y: 18 } ],
                value: [ { x: 29, y: 36 }, { x: 49, y: 24 } ]
            },
            svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 60" data-generated-by="symbol-editor" data-comp-width="60" data-comp-height="40" data-offset-x="15" data-offset-y="10"><path fill="none" stroke="#000000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" d="M 15 30 L 39 30"/><path fill="none" stroke="#000000" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" d="M 39 20 L 39 40"/><path fill="none" stroke="#000000" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" d="M 51 20 L 51 40"/><path fill="none" stroke="#000000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" d="M 51 30 L 75 30"/></svg>'
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
                designator: [ { x: 49, y: 51 }, { x: -12, y: 30 } ],
                value: [ { x: 49, y: 43 }, { x: 70, y: 30 } ]
            },
            svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 75" data-generated-by="symbol-editor" data-comp-width="60" data-comp-height="50" data-offset-x="15" data-offset-y="13"><path fill="none" stroke="#000000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" d="M 45 13 L 45 43"/><path fill="none" stroke="#000000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" d="M 25 43 L 65 43"/><path fill="none" stroke="#000000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" d="M 33 53 L 58 53"/><path fill="none" stroke="#000000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" d="M 41 63 L 49 63"/></svg>'
        }
    };
}

export const DEFAULT_COMPONENT_LIBRARY = getDefaultComponents();

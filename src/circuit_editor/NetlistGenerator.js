/**
 * NetlistGenerator - Generates ngspice netlist from circuit components and wires
 */

export class NetlistGenerator {
    /**
     * @param {import('./ComponentManager.js').ComponentManager} componentManager
     * @param {import('./WireGraph.js').WireGraph} wireGraph
     */
    constructor(componentManager, wireGraph) {
        this.componentManager = componentManager;
        this.wireGraph = wireGraph;
        this.simulationDirectives = []; // Will be set by the app
    }

    /**
     * Generate a complete ngspice netlist
     * @param {Array} [customDirectives] - Optional simulation directives to use
     * @param {Object} [options]
     * @param {boolean} [options.includeControlBlock=false] - Append a .control block with run/wrdata
     * @param {string[]} [options.controlSignals] - Explicit list of signals to pass to wrdata
     * @returns {string} The netlist text
     */
    generate(customDirectives = null, options = {}) {
        return this.generateWithMetadata(customDirectives, options).netlist;
    }

    /**
     * Generate netlist and return accompanying metadata
     * @param {Array} [customDirectives]
     * @param {Object} [options]
     * @returns {{ netlist: string, netMap: Map<number, string>, netNames: string[] }}
     */
    generateWithMetadata(customDirectives = null, options = {}) {
        const { includeControlBlock = false, controlSignals = null } = options;

        const lines = [];
        
        // Title line
        lines.push('* SpicePad Circuit');
        lines.push('* Generated: ' + new Date().toISOString());
        lines.push('');

        // Build net assignments (map node IDs to net names)
        const netMap = this._buildNetMap();
        const netNames = Array.from(new Set(netMap.values())).filter(name => name !== '0');

        // Generate component lines
        const componentLines = this._generateComponentLines(netMap);
        if (componentLines.length > 0) {
            lines.push('* Components');
            lines.push(...componentLines);
            lines.push('');
        }

        // Add any custom models
        const models = this._collectModels();
        if (models.length > 0) {
            lines.push('* Models');
            lines.push(...models);
            lines.push('');
        }

        // Add simulation commands
        const directives = customDirectives || this.simulationDirectives;
        if (directives && directives.length > 0) {
            lines.push('* Simulation');
            directives.forEach(dir => lines.push(dir.text || dir));
        } else {
            // Default to operating point if no directives specified
            lines.push('* Simulation');
            lines.push('.op');
        }

        if (includeControlBlock) {
            const signals = this._resolveControlSignals(controlSignals, netNames);
            lines.push('.control');
            lines.push('set filetype=ascii');
            lines.push('run');
            if (signals.length > 0) {
                lines.push(`wrdata output.txt ${signals.join(' ')}`);
            }
            lines.push('quit');
            lines.push('.endc');
        }
        
        lines.push('.end');

        return {
            netlist: lines.join('\n'),
            netMap,
            netNames
        };
    }

    /**
     * Build a map from wire node IDs to net names
     * Groups connected nodes into nets and assigns net numbers
     * @returns {Map<number, string>} Map of nodeId -> net name
     */
    _buildNetMap() {
        const netMap = new Map();
        const visited = new Set();
        let netNumber = 1;

        // Get all nodes including component pins
        const allNodeIds = new Set(this.wireGraph.getAllNodes().map(n => n.id));
        
        // Add component pin node IDs
        for (const component of this.componentManager.components) {
            const pinMap = this.componentManager.pinNodeIdsByComponent.get(component.id);
            if (pinMap) {
                for (const nodeId of pinMap.values()) {
                    allNodeIds.add(nodeId);
                }
            }
        }

        // Flood fill to find connected nets
        for (const nodeId of allNodeIds) {
            if (visited.has(nodeId)) continue;

            const connectedNodes = this._getConnectedNodes(nodeId, visited);
            
            // Check if this net contains a ground component
            let netName = null;
            for (const id of connectedNodes) {
                const component = this._findComponentByPinNode(id);
                if (component?.meta?.isGround) {
                    netName = '0'; // Ground net
                    break;
                }
            }

            // Otherwise assign a numbered net
            if (!netName) {
                netName = `${netNumber}`;
                netNumber++;
            }

            // Assign the net name to all nodes in this connected group
            for (const id of connectedNodes) {
                netMap.set(id, netName);
            }
        }

        return netMap;
    }

    /**
     * Flood fill to get all nodes connected to a starting node
     * @param {number} startNodeId
     * @param {Set<number>} visited
     * @returns {Set<number>}
     */
    _getConnectedNodes(startNodeId, visited) {
        const connected = new Set();
        const queue = [startNodeId];

        while (queue.length > 0) {
            const nodeId = queue.shift();
            if (visited.has(nodeId)) continue;

            visited.add(nodeId);
            connected.add(nodeId);

            // Get all segments connected to this node
            const segments = this.wireGraph.getSegmentsForNode(nodeId);
            for (const segment of segments) {
                const otherId = segment.nodeId1 === nodeId ? segment.nodeId2 : segment.nodeId1;
                if (!visited.has(otherId)) {
                    queue.push(otherId);
                }
            }
        }

        return connected;
    }

    /**
     * Find a component that has a pin connected to the given node ID
     * @param {number} nodeId
     * @returns {import('./Component.js').Component | null}
     */
    _findComponentByPinNode(nodeId) {
        for (const component of this.componentManager.components) {
            const pinMap = this.componentManager.pinNodeIdsByComponent.get(component.id);
            if (pinMap) {
                for (const pinNodeId of pinMap.values()) {
                    if (pinNodeId === nodeId) {
                        return component;
                    }
                }
            }
        }
        return null;
    }

    /**
     * Generate SPICE lines for each component
     * @param {Map<number, string>} netMap
     * @returns {string[]}
     */
    _generateComponentLines(netMap) {
        const lines = [];

        for (const component of this.componentManager.components) {
            // Skip ground symbols
            if (component.meta?.isGround) continue;

            const line = this._generateComponentLine(component, netMap);
            if (line) {
                lines.push(line);
            }
        }

        return lines;
    }

    /**
     * Generate a single SPICE line for a component
     * @param {import('./Component.js').Component} component
     * @param {Map<number, string>} netMap
     * @returns {string | null}
     */
    _generateComponentLine(component, netMap) {
        const definition = component.meta?.definition;
        const designator = component.meta?.designatorText || component.name || component.id;
        const value = component.meta?.valueText || definition?.defaultValue || '';

        // Get pin connections
        const pinMap = this.componentManager.pinNodeIdsByComponent.get(component.id);
        if (!pinMap) return null;

        const pinIds = Array.from(pinMap.keys());
        const netNames = pinIds.map(pinId => {
            const nodeId = pinMap.get(pinId);
            return netMap.get(nodeId) || '0';
        });

        // Generate based on component type
        const spiceType = definition?.spiceType || this._guessSpiceType(designator);
        
        if (!spiceType) return null;

        // Format: [designator] [node1] [node2] ... [value/model]
        let line = `${designator} ${netNames.join(' ')}`;

        // Add value or model based on component type
        if (component.meta?.spiceModel) {
            // User provided custom SPICE model/parameters
            line += ` ${component.meta.spiceModel}`;
        } else {
            // Use appropriate default based on component type
            switch (spiceType) {
                case 'voltage':
                    // Voltage sources need DC/AC specification
                    line += value ? ` ${value}` : ' DC 0';
                    break;
                case 'current':
                    // Current sources
                    line += value ? ` ${value}` : ' DC 0';
                    break;
                case 'diode':
                case 'bjt':
                case 'mosfet':
                case 'jfet':
                    // Semiconductor devices need model names
                    const modelName = value || `${designator}_MODEL`;
                    line += ` ${modelName}`;
                    break;
                case 'resistor':
                case 'capacitor':
                case 'inductor':
                    // Passive components just need value
                    line += value ? ` ${value}` : ' 1k';
                    break;
                default:
                    line += value ? ` ${value}` : '';
            }
        }

        return line;
    }

    /**
     * Guess SPICE component type from designator prefix
     * @param {string} designator
     * @returns {string | null}
     */
    _guessSpiceType(designator) {
        const prefix = designator.charAt(0).toUpperCase();
        const typeMap = {
            'R': 'resistor',
            'C': 'capacitor',
            'L': 'inductor',
            'V': 'voltage',
            'I': 'current',
            'D': 'diode',
            'Q': 'bjt',
            'M': 'mosfet',
            'J': 'jfet',
            'X': 'subcircuit'
        };
        return typeMap[prefix] || null;
    }

    /**
     * Collect custom SPICE models from components
     * @returns {string[]}
     */
    _collectModels() {
        const models = new Set();
        for (const component of this.componentManager.components) {
            const spiceModel = component.meta?.spiceModel;
            if (spiceModel && spiceModel.startsWith('.model')) {
                models.add(spiceModel);
            }
        }
        return Array.from(models);
    }

    _resolveControlSignals(controlSignals, netNames) {
        if (Array.isArray(controlSignals) && controlSignals.length > 0) {
            return controlSignals
                .map(signal => signal?.trim())
                .filter(Boolean);
        }

        if (netNames.length === 0) return [];

        return netNames.map(name => `v(${name})`);
    }
}

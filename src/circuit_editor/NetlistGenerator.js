/**
 * NetlistGenerator - Generates ngspice netlist from circuit components and wires
 */

export class NetlistGenerator {
    /**
     * @param {import('./ComponentManager.js').ComponentManager} componentManager
     * @param {import('./WireGraph.js').WireGraph} wireGraph
     * @param {import('./ProbeManager.js').ProbeManager} [probeManager]
     */
    constructor(componentManager, wireGraph, probeManager = null) {
        this.componentManager = componentManager;
        this.wireGraph = wireGraph;
        this.probeManager = probeManager;
        this.simulationDirectives = []; // Will be set by the app
    }

    /**
     * Set the probe manager reference
     * @param {import('./ProbeManager.js').ProbeManager} probeManager
     */
    setProbeManager(probeManager) {
        this.probeManager = probeManager;
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
     * @returns {{ netlist: string, netMap: Map<number, string>, netNames: string[], probeInfo: Array<{label: string, node: string}>, analysisType: string }}
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

        // Inline subcircuit definitions so instances resolve
        const subcircuitBlocks = this._collectSubcircuits();
        if (subcircuitBlocks.length > 0) {
            lines.push('* Subcircuits');
            subcircuitBlocks.forEach((block, index) => {
                block.forEach(line => lines.push(line));
                if (index < subcircuitBlocks.length - 1) {
                    lines.push('');
                }
            });
            lines.push('');
        }

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

        // Add simulation commands and detect analysis type
        const directives = customDirectives || this.simulationDirectives;
        let analysisType = 'op'; // default
        if (directives && directives.length > 0) {
            lines.push('* Simulation');
            directives.forEach(dir => {
                const text = dir.text || dir;
                lines.push(text);
                // Detect analysis type from directive
                if (text.toLowerCase().startsWith('.ac')) analysisType = 'ac';
                else if (text.toLowerCase().startsWith('.tran')) analysisType = 'tran';
                else if (text.toLowerCase().startsWith('.dc')) analysisType = 'dc';
                else if (text.toLowerCase().startsWith('.op')) analysisType = 'op';
            });
        } else {
            // Default to operating point if no directives specified
            lines.push('* Simulation');
            lines.push('.op');
        }

        // Refresh probe connections before building probe info
        if (this.probeManager) {
            this.probeManager.refreshConnections();
        }
        
        // Build probe info and signals for wrdata
        const probeInfo = this._buildProbeInfo(netMap);
        
        if (includeControlBlock) {
            const signals = this._resolveControlSignals(controlSignals, netNames, probeInfo);
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
            netNames,
            probeInfo,
            analysisType
        };
    }

    /**
     * Build probe information array mapping probe labels to net names
     * @param {Map<number, string>} netMap
     * @returns {Array<{label: string, node: string, nodeId: number, color: string}>}
     */
    _buildProbeInfo(netMap) {
        if (!this.probeManager) return [];
        
        const probeData = this.probeManager.getProbeData();
        const probeInfo = [];
        
        for (const probe of probeData) {
            if (probe.nodeId !== null) {
                const netName = netMap.get(probe.nodeId);
                if (netName) {
                    // Include all probes, even ground (will show 0V)
                    probeInfo.push({
                        label: probe.label,
                        node: netName,
                        nodeId: probe.nodeId,
                        isGround: netName === '0',
                        color: probe.color || '#3b82f6'
                    });
                }
            }
        }
        
        return probeInfo;
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
        const isSubcircuit = definition?.componentType === 'subcircuit';
        const value = isSubcircuit ? '' : (component.meta?.valueText || definition?.defaultValue || '');

        // Get pin connections
        const pinMap = this.componentManager.pinNodeIdsByComponent.get(component.id);
        if (!pinMap) return null;

        const pinIds = Array.from(pinMap.keys());
        const netNames = pinIds.map(pinId => {
            const nodeId = pinMap.get(pinId);
            return netMap.get(nodeId) || '0';
        });

        // Generate based on component type
        const spiceType = definition?.spiceType
            || (isSubcircuit ? 'subcircuit' : this._guessSpiceType(designator));
        
        if (!spiceType) return null;

        const modelInfo = spiceType === 'subcircuit' ? null : this._resolveModelInfo(component);

        // Format: [designator] [node1] [node2] ... [value/model]
        let line = `${designator} ${netNames.join(' ')}`;

        // Inline overrides take precedence over defaults
        if (modelInfo?.inlineOverride) {
            line += ` ${modelInfo.inlineOverride}`;
            return line;
        }

        // Use appropriate default based on component type
        switch (spiceType) {
            case 'subcircuit': {
                const subcktName = definition?.subcircuit?.name || '';
                if (!subcktName) return null;
                line += ` ${subcktName}`;
                const args = this._buildSubcircuitArgs(component);
                if (args.length > 0) {
                    line += ` ${args.join(' ')}`;
                }
                break;
            }
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
            case 'jfet': {
                // Semiconductor devices need model names
                const modelName = modelInfo.modelName || value || `${designator}_MODEL`;
                line += ` ${modelName}`;
                break;
            }
            case 'resistor':
            case 'capacitor':
            case 'inductor':
                // Passive components just need value
                line += value ? ` ${value}` : ' 1k';
                break;
            default:
                line += value ? ` ${value}` : '';
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

    _resolveModelInfo(component) {
        const definitionModels = Array.isArray(component.meta?.definition?.models) ? component.meta.definition.models : [];
        const normalizedModels = definitionModels
            .map((entry, index) => this._normalizeModelEntry(entry, index))
            .filter(Boolean);

        const selectedName = component.meta?.selectedModelName;
        let chosenModel = null;
        if (normalizedModels.length > 0) {
            if (selectedName) {
                chosenModel = normalizedModels.find(entry => entry.name === selectedName) || null;
            }
            if (!chosenModel) {
                chosenModel = normalizedModels[0];
            }
        }

        const rawSpiceModel = typeof component.meta?.spiceModel === 'string' ? component.meta.spiceModel.trim() : '';
        const rawCustomModel = typeof component.meta?.customModelStatement === 'string' ? component.meta.customModelStatement.trim() : '';

        const spiceIsModel = rawSpiceModel.toLowerCase().startsWith('.model');
        const normalizedCustomModel = rawCustomModel.toLowerCase().startsWith('.model') ? rawCustomModel : '';
        const customModelStatement = normalizedCustomModel || (spiceIsModel ? rawSpiceModel : '');
        const inlineOverride = !spiceIsModel && rawSpiceModel ? rawSpiceModel : '';

        if (customModelStatement) {
            const modelName = this._extractModelName(customModelStatement) ||
                chosenModel?.name ||
                component.meta?.valueText ||
                component.meta?.definition?.defaultValue ||
                `${component.meta?.designatorText || component.name || component.id}_MODEL`;

            return {
                modelName,
                modelStatement: customModelStatement,
                inlineOverride: inlineOverride || null
            };
        }

        if (chosenModel) {
            return {
                modelName: chosenModel.name,
                modelStatement: chosenModel.model,
                inlineOverride: inlineOverride || null
            };
        }

        return {
            modelName: null,
            modelStatement: null,
            inlineOverride: inlineOverride || null
        };
    }

    _normalizeModelEntry(entry, index = 0) {
        const modelText = typeof entry?.model === 'string' ? entry.model.trim() : '';
        if (!modelText) return null;
        const name = (typeof entry?.name === 'string' && entry.name.trim())
            ? entry.name.trim()
            : this._extractModelName(modelText) || `Model${index + 1}`;
        return { name, model: modelText };
    }

    _extractModelName(statement = '') {
        if (typeof statement !== 'string') return '';
        const match = statement.match(/\.model\s+([^\s]+)/i);
        return match ? match[1] : '';
    }

    /**
     * Collect custom SPICE models from components
     * @returns {string[]}
     */
    _collectModels() {
        const seen = new Set();
        const models = [];
        for (const component of this.componentManager.components) {
            const { modelStatement } = this._resolveModelInfo(component);
            const statement = typeof modelStatement === 'string' ? modelStatement.trim() : '';
            if (!statement || !statement.toLowerCase().startsWith('.model')) continue;
            const normalizedKey = statement.replace(/\s+/g, ' ').toLowerCase();
            if (seen.has(normalizedKey)) continue;
            seen.add(normalizedKey);
            models.push(statement);
        }
        return models;
    }

    _collectSubcircuits() {
        const seen = new Set();
        const blocks = [];
        for (const component of this.componentManager.components) {
            const descriptor = component.meta?.definition?.subcircuit;
            const name = typeof descriptor?.name === 'string' ? descriptor.name.trim() : '';
            const definition = typeof descriptor?.definition === 'string' ? descriptor.definition.trim() : '';
            if (!name || !definition) continue;
            const key = `${name.toLowerCase()}::${definition.replace(/\s+/g, ' ').toLowerCase()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const lines = definition.split(/\r?\n/).map(line => line.replace(/\s+$/u, ''));
            blocks.push(lines);
        }
        return blocks;
    }

    _buildSubcircuitArgs(component) {
        const args = component?.meta?.subcircuitArgs;
        if (!args || typeof args !== 'object') return [];
        return Object.entries(args)
            .filter(([name, val]) => Boolean(name) && val !== undefined && val !== null && String(val).trim() !== '')
            .map(([name, val]) => `${name}=${val}`);
    }

    /**
     * Resolve control signals for wrdata command
     * Prioritizes probe-specified nodes, falls back to all nets if no probes
     * Excludes ground (node 0) since v(0) is not a valid SPICE vector
     * @param {string[] | null} controlSignals - Explicit signals if provided
     * @param {string[]} netNames - All available net names
     * @param {Array<{label: string, node: string, isGround?: boolean}>} probeInfo - Probe information
     * @returns {string[]}
     */
    _resolveControlSignals(controlSignals, netNames, probeInfo = []) {
        // If explicit signals provided, use them
        if (Array.isArray(controlSignals) && controlSignals.length > 0) {
            return controlSignals
                .map(signal => signal?.trim())
                .filter(Boolean);
        }

        // If probes are placed, only output probed nodes (excluding ground)
        if (probeInfo && probeInfo.length > 0) {
            return probeInfo
                .filter(probe => !probe.isGround && probe.node !== '0')
                .map(probe => `v(${probe.node})`);
        }

        // Fall back to all nets if no probes (excluding ground)
        if (netNames.length === 0) return [];
        return netNames
            .filter(name => name !== '0')
            .map(name => `v(${name})`);
    }
}

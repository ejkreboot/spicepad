/**
 * CircuitPersistence - Handles serialization, deserialization, file I/O,
 * localStorage save/load, and auto-save for circuit state.
 */

import { Component } from './Component.js';

export class CircuitPersistence {
    constructor({ componentManager, wireGraph, probeManager, textManager, viewport, getSimDirectives, setSimDirectives, onUpdateSimBadge }) {
        this.componentManager = componentManager;
        this.wireGraph = wireGraph;
        this.probeManager = probeManager;
        this.textManager = textManager;
        this.viewport = viewport;
        this.getSimDirectives = getSimDirectives;
        this.setSimDirectives = setSimDirectives;
        this.onUpdateSimBadge = onUpdateSimBadge;
        this._autoSaveInterval = null;
    }

    setupSaveLoad(getCounters) {
        const saveBtn = document.getElementById('save-btn');
        const loadBtn = document.getElementById('load-btn');
        const fileInput = document.getElementById('file-input');

        saveBtn?.addEventListener('click', () => {
            const { componentCounter, designatorCounters } = getCounters();
            this.saveToFile(componentCounter, designatorCounters);
        });
        loadBtn?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', (e) => this.loadFromFile(e));
    }

    serialize(componentCounter, designatorCounters) {
        return {
            version: 1,
            components: this.componentManager.components.map(comp => ({
                id: comp.id,
                name: comp.name,
                x: comp.x,
                y: comp.y,
                width: comp.width,
                height: comp.height,
                rotation: comp.rotation,
                pins: comp.pins,
                meta: comp.meta
            })),
            wires: this.wireGraph.toJSON(),
            probes: this.probeManager.toJSON(),
            texts: this.textManager.toJSON(),
            simulation: this.getSimDirectives(),
            counters: {
                component: componentCounter,
                designators: Array.from(designatorCounters.entries())
            }
        };
    }

    deserialize(data) {
        this.componentManager.components = [];
        this.componentManager.pinNodeIdsByComponent.clear();
        this.wireGraph.clear();
        this.probeManager.clear();
        this.textManager.clear();
        this.setSimDirectives('');

        if (data.wires) {
            this.wireGraph.fromJSON(data.wires);
        }

        if (data.components) {
            for (const compData of data.components) {
                const component = new Component({
                    id: compData.id,
                    name: compData.name,
                    x: compData.x,
                    y: compData.y,
                    width: compData.width,
                    height: compData.height,
                    pins: compData.pins,
                    meta: compData.meta,
                    rotation: compData.rotation || 0
                });
                this.componentManager.components.push(component);
                this.componentManager._registerComponentPins(component);
            }
        }

        if (data.probes) {
            this.probeManager.fromJSON(data.probes);
        }

        if (data.texts) {
            this.textManager.fromJSON(data.texts);
        }

        let componentCounter = 1;
        let designatorCounters = new Map();
        if (data.counters) {
            componentCounter = data.counters.component || 1;
            designatorCounters = new Map(data.counters.designators || []);
        }

        if (data.simulation !== undefined) {
            if (Array.isArray(data.simulation)) {
                const text = data.simulation.map(d => {
                    const t = (d.text || d).trim().replace(/^\.(?=ac |tran |dc |op[ \b]|op$)/i, '');
                    return t;
                }).join('\n');
                this.setSimDirectives(text);
            } else {
                this.setSimDirectives(data.simulation);
            }
            this.onUpdateSimBadge?.();
        }

        this.viewport.render();

        return { componentCounter, designatorCounters };
    }

    async saveToFile(componentCounter, designatorCounters) {
        const data = this.serialize(componentCounter, designatorCounters);
        const json = JSON.stringify(data, null, 2);
        const suggestedName = 'circuit.spicepad';

        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName,
                    types: [{ description: 'SpicePad Circuit', accept: { 'application/json': ['.spicepad'] } }]
                });
                const writable = await handle.createWritable();
                await writable.write(json);
                await writable.close();
                return;
            } catch (e) {
                if (e.name === 'AbortError') return;
                // Fall through to fallback on unexpected errors
            }
        }

        // Fallback: prompt for filename, then trigger download
        const name = window.prompt('Save as:', suggestedName);
        if (!name) return;
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
    }

    loadFromFile(event, onCountersRestored) {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const counters = this.deserialize(data);
                onCountersRestored?.(counters);
            } catch (error) {
                console.error('Failed to load circuit:', error);
                alert('Failed to load circuit file. Please check the file format.');
            }
        };
        reader.readAsText(file);

        event.target.value = '';
    }

    saveToLocalStorage(componentCounter, designatorCounters) {
        try {
            const data = this.serialize(componentCounter, designatorCounters);
            localStorage.setItem('spicepad_circuit', JSON.stringify(data));
        } catch (error) {
            console.error('Failed to save to localStorage:', error);
        }
    }

    loadFromLocalStorage(onCountersRestored) {
        try {
            const stored = localStorage.getItem('spicepad_circuit');
            if (stored) {
                const data = JSON.parse(stored);
                const counters = this.deserialize(data);
                onCountersRestored?.(counters);
                console.log('Loaded circuit from localStorage');
            }
        } catch (error) {
            console.error('Failed to load from localStorage:', error);
        }
    }

    setupAutoSave(getCounters) {
        this._autoSaveInterval = setInterval(() => {
            const { componentCounter, designatorCounters } = getCounters();
            this.saveToLocalStorage(componentCounter, designatorCounters);
        }, 5000);

        window.addEventListener('beforeunload', () => {
            const { componentCounter, designatorCounters } = getCounters();
            this.saveToLocalStorage(componentCounter, designatorCounters);
        });
    }
}

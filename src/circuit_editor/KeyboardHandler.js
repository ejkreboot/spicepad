/**
 * KeyboardHandler - Routes keyboard events to the appropriate modules.
 *
 * Thin dispatcher that maps key combinations to tool switching, undo/redo,
 * simulation, placement, rotation, and deletion actions.
 */

export class KeyboardHandler {
    constructor(app) {
        this.app = app;
    }

    setupKeyboard() {
        document.addEventListener('keydown', (event) => {
            this._handleKeyDown(event);
        });
    }

    _handleKeyDown(event) {
        const app = this.app;
        const isFormField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName) || event.target?.isContentEditable;

        if (app._isModalOpen()) {
            if (event.key === 'Escape') {
                app.componentEditorModal.closeComponentModal();
                app.subcircuitManager.cancelSubcircuitModal();
            }
            return;
        }

        if (isFormField) return;

        if (app.textEditor.handleKeyDown(event)) {
            return;
        }

        if (event.key === 'Escape') {
            app.wireEditor.handleKeyDown(event);
            app._clearSelection();
            app._setTool('select');
            app._updateToolButtons('select');
            app.viewport.render();
            return;
        }

        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            app.simulationController.runSimulation();
            return;
        }

        if (event.key === 'z' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            if (event.shiftKey) {
                app._redo();
            } else {
                app._undo();
            }
            return;
        }

        if (app.wireEditor.handleKeyDown(event)) {
            app.viewport.render();
            return;
        }

        switch (event.key.toLowerCase()) {
            case 'c':
                if (!event.ctrlKey && !event.metaKey) {
                    const mouse = app.viewport.getMouseWorld();
                    const snapped = app.viewport.snapToGrid(mouse.x, mouse.y);
                    void app._placeSelectedComponent(snapped);
                }
                break;
            case 'w':
                if (!event.ctrlKey && !event.metaKey) {
                    app._setTool('wire');
                    app._updateToolButtons('wire');
                }
                break;
            case 's':
                if (!event.ctrlKey && !event.metaKey) {
                    app._setTool('select');
                    app._updateToolButtons('select');
                }
                break;
            case 'p':
                if (!event.ctrlKey && !event.metaKey) {
                    app._setTool('probe');
                    app._updateToolButtons('probe');
                }
                break;
            case 't':
                if (!event.ctrlKey && !event.metaKey) {
                    app._setTool('text');
                    app._updateToolButtons('text');
                }
                break;
            case 'd':
                if (!event.ctrlKey && !event.metaKey) {
                    app._setTool('delete');
                    app._updateToolButtons('delete');
                }
                break;
            case 'r':
                if (!event.ctrlKey && !event.metaKey) {
                    if (app._ghostComponent && app.libraryManager.selectedComponentId) {
                        app._ghostComponent.rotate();
                        app.viewport.render();
                    } else if (app._currentTool === 'probe') {
                        if (app.probeManager.selectedProbeId) {
                            app.probeManager.rotateProbe(app.probeManager.selectedProbeId);
                        } else {
                            app.probeManager.rotateGhost();
                        }
                    } else {
                        const mouse = app.viewport.getMouseWorld();
                        const hit = app.componentManager.getComponentAt(mouse.x, mouse.y);
                        if (hit) {
                            hit.rotate();
                            app.viewport.render();
                        } else {
                            const probe = app.probeManager.getProbeAt(mouse.x, mouse.y);
                            if (probe) {
                                app.probeManager.rotateProbe(probe.id);
                            } else {
                                app.viewport.resetView();
                            }
                        }
                    }
                }
                break;
            case 'delete':
            case 'backspace':
                if (!event.ctrlKey && !event.metaKey) {
                    app._deleteSelected();
                    event.preventDefault();
                }
                break;
        }
    }
}

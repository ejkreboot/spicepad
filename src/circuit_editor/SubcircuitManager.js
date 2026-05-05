/**
 * SubcircuitManager - Handles subcircuit parsing, validation, uniqueness,
 * and the subcircuit definition modal.
 */

export class SubcircuitManager {
    constructor({ componentManager, getComponentLibrary }) {
        this.componentManager = componentManager;
        this.getComponentLibrary = getComponentLibrary;
        this._subcircuitModalResolver = null;
        this._subcircuitModalEls = null;
        this._modalOpen = false;
    }

    get isModalOpen() {
        return this._modalOpen;
    }

    setupSubcircuitModal() {
        const modal = document.getElementById('subcircuit-modal');
        const textarea = document.getElementById('subcircuit-text');
        const okBtn = document.getElementById('subcircuit-modal-ok');
        const cancelBtn = document.getElementById('subcircuit-modal-cancel');
        const closeBtn = modal?.querySelector('.modal-close');
        const errorEl = document.getElementById('subcircuit-modal-error');
        const loadBtn = document.getElementById('subcircuit-load-btn');
        const fileInput = document.getElementById('subcircuit-file-input');

        if (!modal || !textarea || !okBtn || !cancelBtn || !errorEl) return;

        this._subcircuitModalEls = { modal, textarea, okBtn, cancelBtn, errorEl };

        okBtn.addEventListener('click', () => this._handleSubcircuitSubmit());
        cancelBtn.addEventListener('click', () => this.cancelSubcircuitModal());
        closeBtn?.addEventListener('click', () => this.cancelSubcircuitModal());

        if (loadBtn && fileInput) {
            loadBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', () => {
                const file = fileInput.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (e) => {
                    textarea.value = e.target.result ?? '';
                    this._setSubcircuitError('');
                    textarea.focus();
                };
                reader.readAsText(file);
                fileInput.value = '';
            });
        }
    }

    promptSubcircuitDefinition() {
        if (!this._subcircuitModalEls) {
            const text = window.prompt('Paste a .subckt definition to create this subcircuit:');
            if (!text) return Promise.resolve(null);
            try {
                const parsed = this.parseUserSubcircuitInput(text);
                return Promise.resolve(parsed);
            } catch (error) {
                alert(error?.message || 'Invalid subcircuit definition.');
                return Promise.resolve(null);
            }
        }

        this._subcircuitModalEls.textarea.value = '';
        this._setSubcircuitError('');
        this._subcircuitModalEls.modal.classList.add('is-open');
        this._subcircuitModalEls.modal.setAttribute('aria-hidden', 'false');
        this._modalOpen = true;

        return new Promise((resolve) => {
            this._subcircuitModalResolver = resolve;
            setTimeout(() => this._subcircuitModalEls?.textarea?.focus(), 0);
        });
    }

    _handleSubcircuitSubmit() {
        if (!this._subcircuitModalEls) return;
        const raw = this._subcircuitModalEls.textarea.value;
        try {
            const parsed = this.parseUserSubcircuitInput(raw);
            this._finishSubcircuitModal(parsed);
        } catch (error) {
            this._setSubcircuitError(error?.message || 'Invalid subcircuit definition.');
        }
    }

    _finishSubcircuitModal(result) {
        if (this._subcircuitModalEls?.modal) {
            this._subcircuitModalEls.modal.classList.remove('is-open');
            this._subcircuitModalEls.modal.setAttribute('aria-hidden', 'true');
        }
        this._modalOpen = false;
        const resolver = this._subcircuitModalResolver;
        this._subcircuitModalResolver = null;
        resolver?.(result || null);
    }

    cancelSubcircuitModal() {
        if (this._subcircuitModalResolver) {
            this._finishSubcircuitModal(null);
        } else if (this._subcircuitModalEls?.modal?.classList.contains('is-open')) {
            this._finishSubcircuitModal(null);
        }
    }

    _setSubcircuitError(message = '') {
        if (!this._subcircuitModalEls?.errorEl) return;
        if (message) {
            this._subcircuitModalEls.errorEl.textContent = message;
            this._subcircuitModalEls.errorEl.style.display = 'block';
        } else {
            this._subcircuitModalEls.errorEl.textContent = '';
            this._subcircuitModalEls.errorEl.style.display = 'none';
        }
    }

    parseSubcircuitHeader(definition = '') {
        const params = [];
        if (typeof definition !== 'string' || !definition.trim()) {
            return { name: '', params };
        }

        const headerLine = definition
            .split(/\r?\n/)
            .map(line => line.trim())
            .find(line => line && !line.startsWith('*') && /^\.subckt/i.test(line));

        if (!headerLine) return { name: '', params };

        const tokens = headerLine.split(/\s+/).filter(Boolean);
        if (tokens.length < 2) return { name: '', params };

        let collectingParams = false;
        for (let i = 2; i < tokens.length; i += 1) {
            const token = tokens[i];
            const lowered = token.toLowerCase();

            if (lowered === 'params:' || lowered === 'param:' || lowered === 'par:') {
                collectingParams = true;
                continue;
            }

            const hasEquals = token.includes('=');
            if (hasEquals || collectingParams) {
                const [namePart, ...rest] = token.split('=');
                const name = namePart?.trim();
                if (!name) continue;
                const defaultValue = rest.join('=').trim();
                params.push({ name, defaultValue });
                collectingParams = true;
            }
        }

        return { name: tokens[1], params };
    }

    splitSubcircuitDefinition(definition = '', fallbackName = 'SUB') {
        const lines = (typeof definition === 'string' ? definition : '').split(/\r?\n/);
        const trimmed = lines.map(line => line.replace(/\s+$/u, ''));
        const headerIndex = trimmed.findIndex(line => line && !line.startsWith('*') && /^\.subckt/i.test(line));
        const endsIndex = (() => {
            for (let i = trimmed.length - 1; i >= 0; i -= 1) {
                if (/^\.ends\b/i.test(trimmed[i].trim())) return i;
            }
            return -1;
        })();

        const headerName = this.parseSubcircuitHeader(definition).name || fallbackName;
        const headerLine = headerIndex >= 0 ? trimmed[headerIndex] : `.subckt ${headerName}`;
        const endsLine = endsIndex >= 0 ? trimmed[endsIndex] : `.ends ${headerName}`;

        const bodyStart = headerIndex >= 0 ? headerIndex + 1 : 0;
        const bodyEnd = endsIndex >= 0 ? endsIndex : trimmed.length;
        const bodyLines = trimmed
            .slice(bodyStart, bodyEnd)
            .filter(line => line && !/^\.subckt/i.test(line.trim()) && !/^\.ends\b/i.test(line.trim()));

        const prefix = headerIndex > 0 ? trimmed.slice(0, headerIndex).filter(Boolean) : [];
        const suffix = endsIndex >= 0 && endsIndex < trimmed.length - 1
            ? trimmed.slice(endsIndex + 1).filter(Boolean)
            : [];

        return {
            header: headerLine,
            ends: endsLine,
            bodyLines,
            prefix,
            suffix,
            name: headerName
        };
    }

    parseUserSubcircuitInput(text = '') {
        const trimmed = (text || '').trim();
        if (!trimmed) {
            throw new Error('Paste a .subckt definition to continue.');
        }

        const lines = trimmed.split(/\r?\n/).map((line) => line.replace(/\s+$/u, ''));
        const headerLine = lines
            .map(line => line.trim())
            .find(line => line && !line.startsWith('*') && /^\.subckt/i.test(line));

        if (!headerLine) {
            throw new Error('Missing .subckt line. Start your block with ".subckt NAME pin1 pin2 ...".');
        }

        const tokens = headerLine.split(/\s+/).filter(Boolean);
        if (tokens.length < 3) {
            throw new Error('The .subckt line must include a name and at least one pin.');
        }

        const name = tokens[1];
        const pins = [];
        let collectingParams = false;
        for (let i = 2; i < tokens.length; i += 1) {
            const token = tokens[i];
            const lowered = token.toLowerCase();
            if (lowered === 'params:' || lowered === 'param:' || lowered === 'par:') {
                collectingParams = true;
                continue;
            }
            if (collectingParams || token.includes('=')) {
                collectingParams = true;
                continue;
            }
            pins.push({ id: String(pins.length + 1), name: token });
        }

        if (pins.length === 0) {
            throw new Error('No pins were detected on the .subckt line. Add pins after the name.');
        }

        const hasEnds = lines.some(line => /^\.ends\b/i.test(line.trim()));
        if (!hasEnds) {
            lines.push(`.ends ${name}`);
        }

        return {
            name,
            pins,
            definitionText: lines.join('\n')
        };
    }

    ensureUniqueSubcircuitName(name, definitionText = '') {
        const baseName = name && name.trim() ? name.trim() : 'SUB';
        const normalizedDefinition = (definitionText || '').trim().toLowerCase().replace(/\s+/g, ' ');

        const existingNames = new Set();
        let needsRename = false;
        let sameDefinitionExists = false;

        const checkEntry = (entryName, entryDefinition) => {
            if (!entryName) return;
            const key = entryName.toLowerCase();
            existingNames.add(key);
            if (key === baseName.toLowerCase()) {
                const normalized = (entryDefinition || '').trim().toLowerCase().replace(/\s+/g, ' ');
                if (normalized === normalizedDefinition) {
                    sameDefinitionExists = true;
                } else {
                    needsRename = true;
                }
            }
        };

        for (const component of this.componentManager.components) {
            const sub = component.meta?.definition?.subcircuit;
            if (sub?.name) {
                checkEntry(sub.name, sub.definition);
            }
        }

        const componentLibrary = this.getComponentLibrary();
        Object.values(componentLibrary || {}).forEach(def => {
            if (def?.componentType === 'subcircuit' && def.subcircuit?.name) {
                checkEntry(def.subcircuit.name, def.subcircuit.definition);
            }
        });

        if (!needsRename) {
            if (sameDefinitionExists || !existingNames.has(baseName.toLowerCase())) {
                return { name: baseName, definitionText };
            }
        }

        let suffix = 1;
        let candidate = `${baseName}_${suffix}`;
        while (existingNames.has(candidate.toLowerCase())) {
            suffix += 1;
            candidate = `${baseName}_${suffix}`;
        }

        const rewritten = this.rewriteSubcircuitName(definitionText, candidate);
        return { name: candidate, definitionText: rewritten };
    }

    rewriteSubcircuitName(definitionText = '', newName) {
        if (!definitionText || !newName) return definitionText;
        const lines = definitionText.split(/\r?\n/);
        let hasEnds = false;
        const rewritten = lines.map((line) => {
            const trimmed = line.trim();
            if (/^\.subckt/i.test(trimmed)) {
                const leading = line.match(/^\s*/)?.[0] ?? '';
                const parts = trimmed.split(/\s+/);
                if (parts.length >= 2) {
                    parts[1] = newName;
                }
                return `${leading}${parts.join(' ')}`;
            }
            if (/^\.ends/i.test(trimmed)) {
                hasEnds = true;
                return `.ends ${newName}`;
            }
            return line;
        });
        if (!hasEnds) {
            rewritten.push(`.ends ${newName}`);
        }
        return rewritten.join('\n');
    }

    buildDynamicSubcircuitDefinition({ name, pins, definitionText }, gridSize = 10) {
        const grid = gridSize;
        const pinSpacing = Math.ceil(Math.max(grid * 2, 20) / grid) * grid;
        const leftCount = Math.ceil(pins.length / 2);
        const rightCount = Math.floor(pins.length / 2);
        const maxSide = Math.max(leftCount, rightCount, 1);

        let height = Math.max(grid * 4, pinSpacing * (maxSide - 1) + grid * 2);
        height = Math.ceil(height / grid) * grid;
        const available = height - pinSpacing * (maxSide - 1);
        const topPadding = Math.max(grid, Math.round((available / 2) / grid) * grid);

        let width = Math.max(80, grid * 6);
        width = Math.ceil(width / grid) * grid;
        const labelInset = Math.min(Math.max(10, Math.round(width * 0.2)), Math.max(grid, width / 2 - grid));

        const pinDefs = [];
        let idx = 0;
        for (let i = 0; i < leftCount; i += 1) {
            const pin = pins[idx++];
            const y = topPadding + i * pinSpacing;
            pinDefs.push({
                id: pin.id || String(idx),
                name: pin.name,
                position: { x: 0, y },
                labelPosition: { x: labelInset, y }
            });
        }
        for (let i = 0; i < rightCount; i += 1) {
            const pin = pins[idx++];
            const y = topPadding + i * pinSpacing;
            pinDefs.push({
                id: pin.id || String(idx),
                name: pin.name,
                position: { x: width, y },
                labelPosition: { x: width - labelInset, y }
            });
        }

        const definitionId = `custom_subcircuit:${name}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;

        return {
            definitionId,
            definition: {
                name,
                description: 'User-defined subcircuit',
                componentType: 'subcircuit',
                dynamicSubcircuit: true,
                allowRotation: false,
                designator: { prefix: 'X', autoIncrement: true },
                size: { width, height },
                pins: pinDefs,
                labels: {
                    designator: [
                        { x: width / 2, y: height + 8 },
                        { x: width / 2, y: height + 8 }
                    ],
                    value: []
                },
                svg: null,
                subcircuit: {
                    name,
                    definition: definitionText
                }
            }
        };
    }
}

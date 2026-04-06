/**
 * SimulationController - Manages the simulation directives UI and ngspice runner.
 *
 * Handles the simulation modal (directive builders, tabs), the run/cancel buttons,
 * status/progress display, debug console, and orchestrates job execution.
 */

export class SimulationController {
    constructor({ netlistGenerator, simulationRuntime, probeManager, resultsPlotter, onSave }) {
        this.netlistGenerator = netlistGenerator;
        this.simulationRuntime = simulationRuntime;
        this.probeManager = probeManager;
        this.resultsPlotter = resultsPlotter;
        this.onSave = onSave;

        this.spiceRunBtn = null;
        this.spiceCancelBtn = null;
        this.spiceStatusEl = null;
        this.spiceStatusDetailEl = null;
        this.spiceProgressEl = null;
        this.spiceProgressBarEl = null;
        this.spiceProgressLabelEl = null;
        this.spiceDebugOutputEl = null;
        this.spiceDebugContainerEl = null;
        this.debugConsoleEnabled = false;

        this._isSimulationRunning = false;
        this._simulationCancelled = false;
        this._pendingSimJobs = null;
        this._simResults = [];
        this._mergeableGroups = [];
        this._compareModalOpen = false;
        this._modalOpen = false;
    }

    get isModalOpen() {
        return this._modalOpen || this._compareModalOpen;
    }

    get isRunning() {
        return this._isSimulationRunning;
    }

    // ==================== Simulation Modal ====================

    setupSimulationModal() {
        const simBtn = document.getElementById('simulation-btn');
        const simBadge = document.getElementById('simulation-badge');

        simBtn?.addEventListener('click', () => this.showSimulationModal());
        simBadge?.addEventListener('click', () => this.showSimulationModal());
        document.getElementById('close-sim-btn')?.addEventListener('click', () => this.closeSimulationModal());
        document.getElementById('clear-sim-btn')?.addEventListener('click', () => this._clearAllDirectives());

        document.getElementById('simulation-preview')?.addEventListener('input', () => this.updateSimulationBadge());

        const tabs = document.querySelectorAll('.sim-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetPanel = tab.dataset.tab;
                this._switchSimTab(targetPanel);
            });
        });

        document.getElementById('add-dc-btn')?.addEventListener('click', () => this._addDcDirective());
        document.getElementById('add-ac-btn')?.addEventListener('click', () => this._addAcDirective());
        document.getElementById('add-tran-btn')?.addEventListener('click', () => this._addTranDirective());
        document.getElementById('add-op-btn')?.addEventListener('click', () => this._addOpDirective());
        document.getElementById('add-custom-btn')?.addEventListener('click', () => this._addCustomDirective());
    }

    showSimulationModal() {
        const modal = document.getElementById('simulation-modal');
        if (!modal) return;

        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        this._modalOpen = true;
    }

    closeSimulationModal() {
        const modal = document.getElementById('simulation-modal');
        if (modal) {
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
        }
        this._modalOpen = false;
        this.updateSimulationBadge();
    }

    _switchSimTab(tabName) {
        document.querySelectorAll('.sim-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        document.querySelectorAll('.sim-panel').forEach(panel => {
            panel.classList.toggle('active', panel.dataset.panel === tabName);
        });
    }

    _addDcDirective() {
        const source = document.getElementById('dc-source').value.trim();
        const start = document.getElementById('dc-start').value.trim();
        const stop = document.getElementById('dc-stop').value.trim();
        const step = document.getElementById('dc-step').value.trim();

        if (!source || !start || !stop || !step) {
            alert('Please fill in all DC sweep parameters');
            return;
        }

        this._appendToSimTextarea(`dc ${source} ${start} ${stop} ${step}`);

        document.getElementById('dc-source').value = '';
        document.getElementById('dc-start').value = '';
        document.getElementById('dc-stop').value = '';
        document.getElementById('dc-step').value = '';
    }

    _addAcDirective() {
        const type = document.getElementById('ac-type').value;
        const points = document.getElementById('ac-points').value.trim();
        const fstart = document.getElementById('ac-fstart').value.trim();
        const fstop = document.getElementById('ac-fstop').value.trim();

        if (!points || !fstart || !fstop) {
            alert('Please fill in all AC analysis parameters');
            return;
        }

        this._appendToSimTextarea(`ac ${type} ${points} ${fstart} ${fstop}`);

        document.getElementById('ac-points').value = '';
        document.getElementById('ac-fstart').value = '';
        document.getElementById('ac-fstop').value = '';
    }

    _addTranDirective() {
        const tstep = document.getElementById('tran-tstep').value.trim();
        const tstop = document.getElementById('tran-tstop').value.trim();
        const tstart = document.getElementById('tran-tstart').value.trim();
        const tmax = document.getElementById('tran-tmax').value.trim();

        if (!tstep || !tstop) {
            alert('Please fill in required transient parameters (tstep and tstop)');
            return;
        }

        let line = `tran ${tstep} ${tstop}`;
        if (tstart) line += ` ${tstart}`;
        if (tmax) line += ` ${tmax}`;

        this._appendToSimTextarea(line);

        document.getElementById('tran-tstep').value = '';
        document.getElementById('tran-tstop').value = '';
        document.getElementById('tran-tstart').value = '';
        document.getElementById('tran-tmax').value = '';
    }

    _addOpDirective() {
        this._appendToSimTextarea('op');
    }

    _addCustomDirective() {
        const text = document.getElementById('custom-directive').value.trim();

        if (!text) {
            alert('Please enter custom directive text');
            return;
        }

        this._appendToSimTextarea(text);
        document.getElementById('custom-directive').value = '';
    }

    _appendToSimTextarea(text) {
        const ta = document.getElementById('simulation-preview');
        if (!ta) return;
        const current = ta.value;
        ta.value = current ? `${current.trimEnd()}\n${text}` : text;
        this.updateSimulationBadge();
    }

    _clearAllDirectives() {
        const ta = document.getElementById('simulation-preview');
        if (!ta || !ta.value.trim()) return;

        if (confirm('Clear all simulation commands?')) {
            ta.value = '';
            this.updateSimulationBadge();
        }
    }

    updateSimulationBadge() {
        const badge = document.getElementById('simulation-badge');
        const badgeText = document.getElementById('simulation-badge-text');
        if (!badge || !badgeText) return;

        const text = (document.getElementById('simulation-preview')?.value || '').trim();
        if (!text) {
            badge.classList.remove('active');
            badgeText.textContent = 'No Sim';
        } else {
            const types = new Set();
            text.split('\n').forEach(line => {
                const l = line.trim().toLowerCase();
                if (l.startsWith('ac ') || l === 'ac' || l.startsWith('.ac')) types.add('AC');
                else if (l.startsWith('tran ') || l === 'tran' || l.startsWith('.tran')) types.add('TRAN');
                else if (l.startsWith('dc ') || l === 'dc' || l.startsWith('.dc')) types.add('DC');
                else if (l === 'op' || l.startsWith('op ') || l === '.op' || l.startsWith('.op ')) types.add('OP');
            });
            badge.classList.add('active');
            badgeText.textContent = types.size > 0 ? [...types].join(', ') : 'Custom';
        }
    }

    // ==================== Ngspice Runner ====================

    setupSimulationRunner() {
        this.spiceRunBtn = document.getElementById('sim-run-btn');
        this.spiceCancelBtn = document.getElementById('sim-cancel-btn');
        this.spiceStatusEl = document.getElementById('sim-status');
        this.spiceStatusDetailEl = document.getElementById('sim-status-detail');
        this.spiceProgressEl = document.getElementById('sim-progress');
        this.spiceProgressBarEl = document.getElementById('sim-progress-bar');
        this.spiceProgressLabelEl = document.getElementById('sim-progress-label');
        this.spiceDebugOutputEl = document.getElementById('sim-debug-output');
        this.spiceDebugContainerEl = document.getElementById('results-debug');

        const debugToggleEl = document.getElementById('debug-console-toggle');
        if (debugToggleEl) {
            debugToggleEl.addEventListener('change', () => {
                this.debugConsoleEnabled = debugToggleEl.checked;
                if (this.spiceDebugContainerEl) {
                    this.spiceDebugContainerEl.classList.toggle('is-visible', this.debugConsoleEnabled);
                }
            });
        }

        if (this.spiceRunBtn) {
            this.spiceRunBtn.addEventListener('click', () => this.runSimulation());
        }
        if (this.spiceCancelBtn) {
            this.spiceCancelBtn.addEventListener('click', () => this.cancelSimulation());
            this.spiceCancelBtn.disabled = true;
        }

        this._setRunStatus('ready', 'Ready');
        this._setRunProgress('none');
        this._clearDebugConsole();
    }

    _clearDebugConsole() {
        if (!this.spiceDebugOutputEl) return;
        this.spiceDebugOutputEl.textContent = 'Waiting for simulation output...';
    }

    _appendDebugConsole(text, prefix = '') {
        if (!this.debugConsoleEnabled || !this.spiceDebugOutputEl || !text) return;

        const entry = `${prefix}${text}`.replace(/\n?$/, '\n');
        if (this.spiceDebugOutputEl.textContent === 'Waiting for simulation output...') {
            this.spiceDebugOutputEl.textContent = '';
        }
        this.spiceDebugOutputEl.textContent += entry;
        this.spiceDebugOutputEl.scrollTop = this.spiceDebugOutputEl.scrollHeight;
    }

    async runSimulation() {
        if (!this.spiceRunBtn || !this.spiceStatusEl) return;
        if (this._isSimulationRunning) return;

        const probeCount = this.probeManager?.probes?.length ?? 0;
        if (probeCount === 0) {
            const message = 'Place at least one probe before running the simulation.';
            this._setRunStatus('error', message);
            alert(message);
            return;
        }

        const rawText = (document.getElementById('simulation-preview')?.value || '').trim();
        const simText = rawText || 'op';

        let jobs;
        try {
            const { netlist, probeInfo, analysisType, runtimeSignals } =
                this.netlistGenerator.generateWithMetadata([{ type: 'custom', text: simText }]);
            jobs = [{
                idx: 0,
                label: rawText || 'Operating Point',
                netlist,
                probeInfo,
                analysisType,
                runtimeSignals
            }];
        } catch (error) {
            this._setRunStatus('error', 'Failed to generate netlist');
            return;
        }

        this.resultsPlotter.clearPlot();
        this._clearDebugConsole();
        this._appendDebugConsole(`Queued ${jobs.length} analysis${jobs.length === 1 ? '' : 'es'}`);

        this._simulationCancelled = false;
        this._isSimulationRunning = true;
        this._setRunStatus('running', 'Initializing simulation...', `Queued ${jobs.length} analysis${jobs.length === 1 ? '' : 'es'}`);
        this._setRunProgress('indeterminate', null, 'Preparing ngspice runtime');
        this.spiceRunBtn.disabled = true;
        if (this.spiceCancelBtn) {
            this.spiceCancelBtn.disabled = false;
        }

        this._pendingSimJobs = jobs;
        this._simResults = [];

        try {
            for (let index = 0; index < jobs.length; index += 1) {
                if (this._simulationCancelled) break;

                const job = jobs[index];
                const result = await this.simulationRuntime.runJob(job, {
                    onStatus: (status) => this._handleSimulationStatus(status, job, index, jobs.length),
                    onProgress: (progress) => this._handleSimulationProgress(progress, job, index, jobs.length),
                    onStdout: (text) => this._appendDebugConsole(text, '[stdout] '),
                    onStderr: (text) => this._appendDebugConsole(text, '[stderr] '),
                });

                this._simResults.push({ ...job, ...result });
            }

            if (this._simulationCancelled) {
                this._setRunStatus('ready', 'Simulation cancelled', 'Run aborted before completion');
                this._setRunProgress('none');
            } else {
                this._finishSimulationRun();
            }
        } catch (error) {
            if (error?.cancelled || this._simulationCancelled) {
                this._setRunStatus('ready', 'Simulation cancelled', 'Run aborted before completion');
                this._setRunProgress('none');
            } else {
                this._setRunStatus('error', 'Simulation failed', error.message);
                this.resultsPlotter.showErrorPlaceholder(error.message);
            }
        } finally {
            this._isSimulationRunning = false;
            this.spiceRunBtn.disabled = false;
            if (this.spiceCancelBtn) {
                this.spiceCancelBtn.disabled = true;
            }
        }
    }

    async cancelSimulation() {
        if (!this._isSimulationRunning) return;
        this._simulationCancelled = true;
        this._setRunStatus('running', 'Cancelling simulation...', 'Stopping active ngspice worker');
        this._setRunProgress('indeterminate', null, 'Cancelling active analysis');
        await this.simulationRuntime.cancel();
    }

    _handleSimulationStatus(status, job, index, totalJobs) {
        const lifecycle = status.lifecycle || 'running';
        const summary = lifecycle === 'loading-assets'
            ? 'Loading ngspice assets...'
            : lifecycle === 'parsing-netlist'
                ? 'Submitting circuit...'
                : 'Running simulation...';

        this._setRunStatus('running', summary, `[${index + 1}/${totalJobs}] ${job.label}`);
        this._appendDebugConsole(`${status.message || summary}`, `[status ${index + 1}/${totalJobs}] `);

        if (lifecycle !== 'running') {
            this._setRunProgress('indeterminate', null, status.message);
        }
    }

    _handleSimulationProgress(progress, job, index, totalJobs) {
        if (progress.mode === 'determinate' && Number.isFinite(progress.progress)) {
            const percent = Math.max(0, Math.min(progress.progress, 1));
            const label = `${Math.round(percent * 100)}% • ${this._formatProgressTimes(progress.currentTime, progress.finalTime)}`;
            this._setRunProgress('determinate', percent, label);
            return;
        }

        this._setRunProgress('indeterminate', null, `[${index + 1}/${totalJobs}] ${job.label}`);
    }

    _finishSimulationRun() {
        let failedCount = 0;
        console.log('Simulation results:', this._simResults);
        this._simResults.forEach((result) => {
            const plotId = `${result.analysisType || 'plot'}-${result.idx + 1}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
            this._appendDebugConsole(`\n=== ${result.label} (${result.analysisType}) ===`);
            if (result.stdout) {
                this._appendDebugConsole(result.stdout, '[stdout dump]\n');
            }
            if (result.stderr) {
                this._appendDebugConsole(result.stderr, '[stderr dump]\n');
            }
            if (result.success === false) {
                failedCount += 1;
                const message = result.failureMessage || 'Analysis failed before any plot data was produced.';
                this.resultsPlotter.showAnalysisFailure(result.analysisType, result.label, message, plotId);
            } else if (result.analyses && result.analyses.length > 0) {
                this.resultsPlotter.plotAnalyses(result.analyses, result.probeInfo, result.runtimeSignals, plotId);
            } else {
                failedCount += 1;
                const message = result.failureMessage || 'Analysis completed without producing usable results.';
                this.resultsPlotter.showAnalysisFailure(result.analysisType, result.label, message, plotId);
            }
        });

        if (failedCount === 0) {
            this._setRunStatus('ready', 'Simulation complete', `Completed ${this._simResults.length} analys${this._simResults.length === 1 ? 'is' : 'es'}`);
        } else if (failedCount === this._simResults.length) {
            this._setRunStatus('error', 'All analyses failed', 'See console for ngspice diagnostics');
        } else {
            this._setRunStatus('error', `${failedCount} of ${this._simResults.length} analyses failed`, 'Completed with partial failures');
        }

        this._setRunProgress('none');

        // Detect mergeable analysis groups for overlay comparison
        this._mergeableGroups = this._findMergeableGroups();
        this._updateCompareButton();
    }
    _formatProgressTimes(currentTime, finalTime) {
        if (!Number.isFinite(currentTime) || !Number.isFinite(finalTime) || finalTime <= 0) {
            return 'Running';
        }
        return `${currentTime.toExponential(3)} / ${finalTime.toExponential(3)} s`;
    }

    // ==================== Compare Analyses ====================

    setupCompareModal() {
        const compareBtn = document.getElementById('compare-analyses-btn');
        compareBtn?.addEventListener('click', () => this._showCompareModal());

        const modal = document.getElementById('compare-modal');
        if (!modal) return;

        const closeBtn = modal.querySelector('.modal-close');
        closeBtn?.addEventListener('click', () => this._closeCompareModal());

        modal.addEventListener('click', (e) => {
            if (e.target === modal) this._closeCompareModal();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this._compareModalOpen) {
                this._closeCompareModal();
            }
        });

        const groupSelect = document.getElementById('compare-group-select');
        groupSelect?.addEventListener('change', () => {
            const idx = parseInt(groupSelect.value);
            if (Number.isFinite(idx) && this._mergeableGroups[idx]) {
                this._renderCompareGroup(idx);
            }
        });

        const scaleButtons = document.querySelectorAll('#compare-scale-toggle .scale-btn');
        scaleButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                scaleButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const groupIdx = parseInt(groupSelect?.value || '0');
                this._renderCompareGroup(groupIdx, btn.dataset.scale);
            });
        });
    }

    /**
     * Derive a short label for an analysis from job label / directive text.
     */
    /**
     * Split a job label (full directive text) into per-analysis segments.
     * Each segment includes any setup lines (alter, let, etc.) leading up to the
     * analysis command, plus the analysis command itself.
     */
    _splitJobLabelIntoSegments(jobLabel) {
        if (!jobLabel) return [];
        const raw = jobLabel.replace(/^\s*\./, '').trim();
        if (!raw) return [];
        const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const analysisRe = /^(ac|dc|tran|noise|disto|pz)\b/i;
        const segments = [];
        let pending = [];
        for (const line of lines) {
            if (analysisRe.test(line)) {
                pending.push(line);
                segments.push(pending.join('\n'));
                pending = [];
            } else {
                pending.push(line);
            }
        }
        // If there are trailing non-analysis lines, attach to last segment
        if (pending.length > 0 && segments.length > 0) {
            segments[segments.length - 1] += '\n' + pending.join('\n');
        }
        return segments;
    }

    _deriveAnalysisLabel(jobLabel, analysisIdx) {
        const segments = this._splitJobLabelIntoSegments(jobLabel);
        if (segments.length > 0 && analysisIdx < segments.length) {
            return segments[analysisIdx];
        }
        if (!jobLabel) return `Analysis ${analysisIdx + 1}`;
        let label = jobLabel.replace(/^\s*\./, '').trim();
        return label || `Analysis ${analysisIdx + 1}`;
    }

    /**
     * Find groups of analyses that can be overlaid (same type + identical sweep).
     * Returns array of groups; each group is an array of entry objects.
     */
    _findMergeableGroups() {
        const entries = [];

        this._simResults.forEach((result, ri) => {
            if (result.success === false || !result.analyses) return;

            result.analyses.forEach((analysis, ai) => {
                if (!analysis.sweep || !analysis.sweep.values || analysis.sweep.values.length === 0) return;
                const type = analysis.type;
                if (!type || type === 'op' || type === 'tf' || type === 'sens') return;

                const sv = analysis.sweep.values;
                const sweepStart = sv[0];
                const sweepStop = sv[sv.length - 1];
                const sweepLen = sv.length;

                entries.push({
                    resultIdx: ri,
                    analysisIdx: ai,
                    type,
                    sweepStart,
                    sweepStop,
                    sweepLen,
                    label: this._deriveAnalysisLabel(result.label, ai),
                    analysis,
                    probeInfo: result.probeInfo || [],
                    runtimeSignals: result.runtimeSignals || []
                });
            });
        });

        // Group by composite key (type, sweepLen, sweepStart, sweepStop)
        const groupMap = new Map();
        for (const entry of entries) {
            const key = `${entry.type}|${entry.sweepLen}|${entry.sweepStart}|${entry.sweepStop}`;
            if (!groupMap.has(key)) groupMap.set(key, []);
            groupMap.get(key).push(entry);
        }

        // Deduplicate labels within each group
        const groups = [];
        for (const members of groupMap.values()) {
            if (members.length < 2) continue;
            const seen = new Map();
            for (const m of members) {
                const count = (seen.get(m.label) || 0) + 1;
                seen.set(m.label, count);
                if (count > 1) m.label = `${m.label} (#${count})`;
            }
            groups.push(members);
        }

        return groups;
    }

    _updateCompareButton() {
        const btn = document.getElementById('compare-analyses-btn');
        if (!btn) return;
        btn.disabled = this._mergeableGroups.length === 0;
    }

    _showCompareModal() {
        if (this._mergeableGroups.length === 0) return;

        const modal = document.getElementById('compare-modal');
        if (!modal) return;

        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        this._compareModalOpen = true;

        // Populate group selector
        const groupSelect = document.getElementById('compare-group-select');
        if (groupSelect) {
            groupSelect.innerHTML = '';
            this._mergeableGroups.forEach((group, i) => {
                const opt = document.createElement('option');
                opt.value = i;
                const type = group[0].type.toUpperCase();
                opt.textContent = `${type} — ${group.length} analyses`;
                groupSelect.appendChild(opt);
            });
            groupSelect.style.display = this._mergeableGroups.length > 1 ? '' : 'none';
            groupSelect.value = '0';
        }

        this._renderCompareGroup(0);
    }

    _closeCompareModal() {
        const modal = document.getElementById('compare-modal');
        if (!modal) return;

        const plotArea = document.getElementById('compare-plot-area');
        if (plotArea && window.Plotly) {
            try { window.Plotly.purge(plotArea); } catch (_) {}
        }

        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        this._compareModalOpen = false;
    }

    _renderCompareGroup(groupIndex, scale) {
        const group = this._mergeableGroups[groupIndex];
        if (!group) return;

        const plotArea = document.getElementById('compare-plot-area');
        if (!plotArea) return;

        // Show/hide AC scale toggle
        const scaleToggle = document.getElementById('compare-scale-toggle');
        if (scaleToggle) {
            scaleToggle.style.display = group[0].type === 'ac' ? '' : 'none';
        }

        // Determine scale from active button if not provided
        if (!scale && group[0].type === 'ac') {
            const activeBtn = document.querySelector('#compare-scale-toggle .scale-btn.active');
            scale = activeBtn?.dataset.scale || 'db';
        }

        const meta = this.resultsPlotter.plotOverlay(group, plotArea, scale);
        if (!meta) return;

        // Track checked states for visibility toggling
        const checkedProbes = new Set(meta.probes.map(p => p.label));
        const checkedAnalyses = new Set(meta.analyses.map((_, i) => i));

        const updateVisibility = () => {
            if (!window.Plotly) return;
            const visibility = meta.traceMap.map(t =>
                checkedProbes.has(t.probeLabel) && checkedAnalyses.has(t.analysisIndex)
            );
            window.Plotly.restyle(plotArea, { visible: visibility });
        };

        // Build custom probe legend with checkboxes
        const legendEl = document.getElementById('compare-probe-legend');
        if (legendEl) {
            legendEl.innerHTML = '';
            meta.probes.forEach(probe => {
                const label = document.createElement('label');
                label.className = 'compare-probe-legend-item';

                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = true;
                cb.addEventListener('change', () => {
                    if (cb.checked) checkedProbes.add(probe.label);
                    else checkedProbes.delete(probe.label);
                    updateVisibility();
                });

                label.appendChild(cb);
                label.insertAdjacentHTML('beforeend', this._dashSvg(probe.dash));
                const text = document.createElement('span');
                text.textContent = probe.label;
                label.appendChild(text);
                legendEl.appendChild(label);
            });
        }

        // Build color-coded analysis blocks with checkboxes
        const blocksEl = document.getElementById('compare-analysis-blocks');
        if (blocksEl) {
            blocksEl.innerHTML = '';
            meta.analyses.forEach((a, i) => {
                const block = document.createElement('label');
                block.className = 'compare-analysis-block';
                block.style.color = a.color;

                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = true;
                cb.addEventListener('change', () => {
                    if (cb.checked) checkedAnalyses.add(i);
                    else checkedAnalyses.delete(i);
                    updateVisibility();
                });

                block.appendChild(cb);
                const text = document.createElement('span');
                text.textContent = a.label;
                block.appendChild(text);
                blocksEl.appendChild(block);
            });
        }
    }

    /**
     * Generate an inline SVG showing a dash pattern for the probe legend.
     */
    _dashSvg(dash) {
        const dashArrays = {
            solid: '',
            dash: '8,4',
            dot: '2,4',
            dashdot: '8,4,2,4',
            longdash: '12,4',
            longdashdot: '12,4,2,4'
        };
        const d = dashArrays[dash] || '';
        const dashAttr = d ? ` stroke-dasharray="${d}"` : '';
        return `<svg width="28" height="10" viewBox="0 0 28 10"><line x1="0" y1="5" x2="28" y2="5" stroke="#334155" stroke-width="2"${dashAttr}/></svg>`;
    }

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    _setRunStatus(state, text, detail = '') {
        if (!this.spiceStatusEl) return;
        this.spiceStatusEl.textContent = text;
        if (this.spiceStatusDetailEl) {
            this.spiceStatusDetailEl.textContent = detail || '';
        }
        this.spiceStatusEl.classList.remove('run-ready', 'run-running', 'run-error');
        switch (state) {
            case 'running':
                this.spiceStatusEl.classList.add('run-running');
                break;
            case 'error':
                this.spiceStatusEl.classList.add('run-error');
                break;
            default:
                this.spiceStatusEl.classList.add('run-ready');
        }
    }

    _setRunProgress(mode, value = null, label = '') {
        if (!this.spiceProgressEl || !this.spiceProgressBarEl || !this.spiceProgressLabelEl) return;

        this.spiceProgressEl.classList.remove('is-hidden', 'is-indeterminate');

        if (mode === 'none') {
            this.spiceProgressEl.classList.add('is-hidden');
            this.spiceProgressBarEl.style.width = '0%';
            this.spiceProgressLabelEl.textContent = '';
            return;
        }

        if (mode === 'indeterminate') {
            this.spiceProgressEl.classList.add('is-indeterminate');
            this.spiceProgressBarEl.style.width = '35%';
            this.spiceProgressLabelEl.textContent = label || 'Running analysis';
            return;
        }

        const percent = Math.max(0, Math.min(Number(value) || 0, 1));
        this.spiceProgressBarEl.style.width = `${percent * 100}%`;
        this.spiceProgressLabelEl.textContent = label || `${Math.round(percent * 100)}%`;
    }
}

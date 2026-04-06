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
        this._modalOpen = false;
    }

    get isModalOpen() {
        return this._modalOpen;
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
    }

    _formatProgressTimes(currentTime, finalTime) {
        if (!Number.isFinite(currentTime) || !Number.isFinite(finalTime) || finalTime <= 0) {
            return 'Running';
        }
        return `${currentTime.toExponential(3)} / ${finalTime.toExponential(3)} s`;
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

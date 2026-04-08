/**
 * ResultsPlotter - Handles all simulation result visualization.
 *
 * Renders operating-point tables, AC frequency-response plots,
 * transient / DC sweep plots, and X-Y mode using Plotly.
 */

export class ResultsPlotter {
    constructor(plotsContainer) {
        this.spicePlotsEl = plotsContainer;
        this._plotCounter = 0;
    }

    clearPlot() {
        if (!this.spicePlotsEl) return;
        this.spicePlotsEl.querySelectorAll('.plot-container').forEach(container => {
            const plotArea = container.querySelector('.plot-area');
            if (plotArea && window.Plotly) {
                try { window.Plotly.purge(plotArea); } catch (_) {}
            }
        });
        this.spicePlotsEl.innerHTML = `
            <div class="plot-placeholder running">
                <span class="material-symbols-outlined">autorenew</span>
                <span>Running simulation...</span>
            </div>
        `;
        this._plotCounter = 0;
    }

    showPlotPlaceholder() {
        if (!this.spicePlotsEl) return;
        this.spicePlotsEl.innerHTML = `
            <div class="plot-placeholder">
                <span class="material-symbols-outlined">show_chart</span>
                <span>Add probes to your circuit and run<br/>a simulation to see results here</span>
            </div>
        `;
    }

    showErrorPlaceholder(message) {
        if (!this.spicePlotsEl) return;
        this.spicePlotsEl.innerHTML = `
            <div class="plot-placeholder error">
                <span class="material-symbols-outlined">error_outline</span>
                <span>Simulation failed<br/><small>Review the status and analysis cards for details</small></span>
            </div>
        `;
    }

    getAnalysisTitle(analysisType) {
        return {
            'ac': 'AC Analysis (Frequency Response)',
            'tran': 'Transient Analysis',
            'dc': 'DC Sweep',
            'op': 'Operating Point'
        }[analysisType] || 'Simulation Results';
    }

    showAnalysisFailure(analysisType, label, message, id) {
        if (!this.spicePlotsEl) return;

        const placeholder = this.spicePlotsEl.querySelector('.plot-placeholder');
        if (placeholder) placeholder.remove();

        const container = document.createElement('div');
        container.className = 'plot-container plot-container-error';
        container.id = `plot-${id}`;

        const header = document.createElement('div');
        header.className = 'plot-header';

        const title = document.createElement('div');
        title.className = 'plot-title';
        title.textContent = this.getAnalysisTitle(analysisType);
        header.appendChild(title);

        const body = document.createElement('div');
        body.className = 'plot-message error';

        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined';
        icon.textContent = 'error_outline';

        const copy = document.createElement('div');
        copy.className = 'plot-message-copy';

        const heading = document.createElement('strong');
        heading.textContent = label;

        const detail = document.createElement('span');
        detail.textContent = message;

        copy.appendChild(heading);
        copy.appendChild(detail);
        body.appendChild(icon);
        body.appendChild(copy);

        container.appendChild(header);
        container.appendChild(body);
        this.spicePlotsEl.appendChild(container);
    }

    _createPlotContainer(analysisType, id) {
        if (!this.spicePlotsEl) return null;

        const placeholder = this.spicePlotsEl.querySelector('.plot-placeholder');
        if (placeholder) placeholder.remove();

        const container = document.createElement('div');
        container.className = 'plot-container';
        container.id = `plot-${id}`;

        const titleText = this.getAnalysisTitle(analysisType);

        const scaleToggle = analysisType === 'ac' ? `
            <div class="plot-scale-toggle">
                <button class="scale-btn active" data-scale="db">dB</button>
                <button class="scale-btn" data-scale="v">V</button>
                <button class="scale-btn" data-scale="phase">Phase</button>
            </div>
        ` : '';

        const showXYMode = (analysisType === 'tran' || analysisType === 'dc');
        const xyModeToggle = showXYMode ? `
            <div class="plot-mode-toggle">
                <button class="mode-btn active" data-mode="standard">Standard</button>
                <button class="mode-btn" data-mode="xy">X-Y</button>
            </div>
        ` : '';

        const xySelectors = showXYMode ? `
            <div class="plot-xy-selectors" style="display: none;">
                <span class="xy-selector-label">X-axis:</span>
                <select class="xy-axis-select" data-axis="x" title="X-axis signal">
                    <option value="">Select signal...</option>
                </select>
                <span class="xy-selector-label">Y-axis:</span>
                <select class="xy-axis-select" data-axis="y" title="Y-axis signal">
                    <option value="">Select signal...</option>
                </select>
            </div>
        ` : '';

        container.innerHTML = `
            <div class="plot-header">
                <div class="plot-title">${titleText}</div>
                <div class="plot-actions">
                    ${scaleToggle}
                    ${xyModeToggle}
                    <button class="plot-export-btn" title="Download as PNG">
                        <span class="material-symbols-outlined">download</span>
                    </button>
                </div>
            </div>
            ${xySelectors}
            <div class="plot-area" id="plot-area-${id}"></div>
            <div class="plot-yrange-controls"></div>
        `;

        const exportBtn = container.querySelector('.plot-export-btn');
        exportBtn?.addEventListener('click', () => {
            const plotAreaEl = container.querySelector('.plot-area');
            if (plotAreaEl && window.Plotly) {
                window.Plotly.downloadImage(plotAreaEl, {
                    format: 'png',
                    width: 800,
                    height: 400,
                    filename: `spicepad-${analysisType}-${Date.now()}`
                });
            }
        });

        if (showXYMode) {
            const modeButtons = container.querySelectorAll('.mode-btn');
            const xySelectorEl = container.querySelector('.plot-xy-selectors');

            modeButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    modeButtons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const mode = btn.dataset.mode;

                    if (mode === 'xy') {
                        xySelectorEl.style.display = 'flex';
                        if (container._signalData) {
                            this._updateXYPlot(container);
                        }
                    } else {
                        xySelectorEl.style.display = 'none';
                        if (container._signalData) {
                            this._renderStandardPlot(
                                container.querySelector('.plot-area'),
                                container._signalData,
                                container._analysisType
                            );
                        }
                    }
                });
            });

            const axisSelects = container.querySelectorAll('.xy-axis-select');
            axisSelects.forEach(select => {
                select.addEventListener('change', () => {
                    this._updateXYPlot(container);
                });
            });
        }

        this.spicePlotsEl.appendChild(container);
        return container.querySelector('.plot-area');
    }

    plotAnalyses(analyses, probeInfo = [], runtimeSignals = [], plotId = null) {
        if (!this.spicePlotsEl) return;

        const wantedSet = new Set(runtimeSignals.map(s => s.toLowerCase()));

        analyses.forEach((analysis, i) => {
            const id = plotId ? `${plotId}-${i}` : `analysis-${++this._plotCounter}`;
            const aType = analysis.type || 'unknown';

            if (aType === 'op' || aType === 'tf' || aType === 'sens') {
                this._plotOpAnalysis(analysis, probeInfo, wantedSet, id);
                return;
            }

            if (!analysis.sweep) return;
            if (!window.Plotly) return;

            const plotArea = this._createPlotContainer(aType, id);
            if (!plotArea) return;

            if (aType === 'ac') {
                this._plotAcAnalysis(analysis, probeInfo, wantedSet, plotArea);
            } else {
                this._plotSweepAnalysis(analysis, probeInfo, wantedSet, aType, plotArea);
            }
        });
    }

    _filterVectors(vectors, probeInfo, wantedSet) {
        const defaultColors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

        return vectors
            .filter(v => wantedSet.size === 0 || wantedSet.has(v.name.toLowerCase()))
            .map((v, i) => {
                const probe = probeInfo.find(p => {
                    if (p.type === 'current' && p.sourceName) {
                        return v.name.toLowerCase() === `i(${p.sourceName.toLowerCase()})`;
                    }
                    return v.name.toLowerCase() === `v(${(p.node || '').toLowerCase()})`;
                });
                return {
                    vector: v,
                    label: probe?.label || v.name,
                    color: probe?.color || defaultColors[i % defaultColors.length],
                    type: probe?.type || (v.name.toLowerCase().startsWith('i(') ? 'current' : 'voltage')
                };
            });
    }

    _plotOpAnalysis(analysis, probeInfo, wantedSet, plotId) {
        const plotArea = this._createPlotContainer(analysis.type || 'op', plotId);
        if (!plotArea) return;

        const fmt = (v) => {
            const abs = Math.abs(v);
            if (abs === 0) return '0';
            if (abs >= 1e3) return (v / 1e3).toPrecision(5) + ' k';
            if (abs >= 1) return v.toPrecision(5);
            if (abs >= 1e-3) return (v * 1e3).toPrecision(5) + ' m';
            if (abs >= 1e-6) return (v * 1e6).toPrecision(5) + ' µ';
            return v.toExponential(4);
        };

        const scalars = analysis.scalars || {};
        const entries = Object.entries(scalars)
            .filter(([name]) => wantedSet.size === 0 || wantedSet.has(name.toLowerCase()));

        if (entries.length === 0) {
            plotArea.innerHTML = '<div class="op-table-empty">No operating point data</div>';
            return;
        }

        let rows = '';
        for (const [name, value] of entries) {
            const probe = probeInfo.find(p => {
                if (p.type === 'current' && p.sourceName) {
                    return name.toLowerCase() === `i(${p.sourceName.toLowerCase()})`;
                }
                return name.toLowerCase() === `v(${(p.node || '').toLowerCase()})`;
            });
            const label = probe?.label || name;
            const unit = name.toLowerCase().startsWith('i(') ? 'A' : 'V';
            rows += `<tr><td class="op-probe">${label}</td><td class="op-value">${fmt(value)} ${unit}</td></tr>`;
        }

        plotArea.innerHTML = `
            <table class="op-table">
                <thead><tr><th>Probe</th><th>Value</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    _plotAcAnalysis(analysis, probeInfo, wantedSet, plotArea) {
        const filtered = this._filterVectors(analysis.vectors, probeInfo, wantedSet);
        if (filtered.length === 0) return;

        const freqValues = analysis.sweep.values;

        const signals = filtered.map(f => {
            const v = f.vector;
            const mag = [];
            const phase = [];
            for (let i = 0; i < v.real.length; i++) {
                const re = v.real[i];
                const im = v.imag ? v.imag[i] : 0;
                mag.push(Math.sqrt(re * re + im * im));
                phase.push(Math.atan2(im, re) * (180 / Math.PI));
            }
            return {
                label: f.label,
                color: f.color,
                freq: freqValues,
                magnitude: mag,
                phase
            };
        });

        const plotContainer = plotArea.closest('.plot-container');
        plotContainer._acSignalData = signals;

        const scaleButtons = plotContainer.querySelectorAll('.scale-btn');
        scaleButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                scaleButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._renderAcPlot(plotArea, plotContainer._acSignalData, btn.dataset.scale);
            });
        });

        this._renderAcPlot(plotArea, signals, 'db');
    }

    _renderAcPlot(plotArea, signals, scale) {
        const isDb = scale === 'db';
        const isPhase = scale === 'phase';

        let yData, yLabel, traceSuffix;
        if (isPhase) {
            yData = sig => sig.phase;
            yLabel = 'Phase (°)';
            traceSuffix = '°';
        } else if (isDb) {
            yData = sig => sig.magnitude.map(m => 20 * Math.log10(Math.max(m, 1e-12)));
            yLabel = 'Magnitude (dB)';
            traceSuffix = 'dB';
        } else {
            yData = sig => sig.magnitude;
            yLabel = 'Magnitude (V)';
            traceSuffix = 'V';
        }

        const traces = signals.map(sig => ({
            x: Array.from(sig.freq),
            y: yData(sig),
            type: 'scatter',
            mode: 'lines',
            name: `${sig.label} (${traceSuffix})`,
            line: { color: sig.color, width: 2 }
        }));

        const layout = {
            paper_bgcolor: '#ffffff',
            plot_bgcolor: '#f8fafc',
            font: { color: '#0f172a', size: 10 },
            xaxis: {
                title: { text: 'Frequency (Hz)', font: { size: 11 }, standoff: 0 },
                type: 'log',
                gridcolor: '#e2e8f0',
                zerolinecolor: '#e2e8f0',
                linecolor: '#cbd5e1',
                linewidth: 1,
                mirror: true,
                tickfont: { size: 9 }
            },
            yaxis: {
                title: { text: yLabel, font: { size: 11 } },
                gridcolor: '#e2e8f0',
                zerolinecolor: '#e2e8f0',
                linecolor: '#cbd5e1',
                linewidth: 1,
                mirror: true,
                tickfont: { size: 9 }
            },
            margin: { t: 20, r: 20, b: 70, l: 50 },
            legend: {
                orientation: 'h',
                x: 0.5, xanchor: 'center',
                y: -0.22, yanchor: 'top',
                bgcolor: 'rgba(255, 255, 255, 0.92)',
                bordercolor: '#dbe2ea', borderwidth: 1,
                font: { size: 10 }
            }
        };

        requestAnimationFrame(() => {
            const rect = plotArea.getBoundingClientRect();
            layout.width = rect.width || 340;
            layout.height = rect.height || 260;
            try {
                window.Plotly.newPlot(plotArea, traces, layout, {
                    responsive: true,
                    modeBarButtonsToRemove: ['pan2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d']
                });
            } catch (err) {
                console.error('[AC Plot] Plotly.newPlot error:', err);
            }
        });

        const container = plotArea.closest('.plot-container');
        if (container) {
            this._setupYRangeControls(container, { hasDualAxis: false, y1Label: yLabel });
        }
    }

    _plotSweepAnalysis(analysis, probeInfo, wantedSet, analysisType, plotArea) {
        const filtered = this._filterVectors(analysis.vectors, probeInfo, wantedSet);
        if (filtered.length === 0) return;

        const xValues = Array.from(analysis.sweep.values);
        const signals = {};
        const signalMeta = [];
        const signalColors = {};
        const defaultColors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

        filtered.forEach((f, i) => {
            const label = f.label;
            signalMeta.push({ label, type: f.type, color: f.color });
            signalColors[label] = f.color;
            signals[label] = Array.from(f.vector.real);
        });

        const plotContainer = plotArea.closest('.plot-container');
        plotContainer._signalData = { xValues, signals, signalMeta, signalColors, defaultColors };
        plotContainer._analysisType = analysisType;

        this._populateXYSelectors(plotContainer, signalMeta);
        this._renderStandardPlot(plotArea, plotContainer._signalData, analysisType);
    }

    _renderStandardPlot(plotArea, signalData, analysisType) {
        const { xValues, signals, signalMeta, signalColors, defaultColors } = signalData;

        let hasVoltage = false;
        let hasCurrent = false;
        const traces = [];

        signalMeta.forEach((meta, i) => {
            const values = signals[meta.label];
            if (!values) return;
            const isCurrent = meta.type === 'current';
            hasCurrent = hasCurrent || isCurrent;
            hasVoltage = hasVoltage || !isCurrent;
            traces.push({
                x: xValues,
                y: values,
                type: 'scatter',
                mode: 'lines',
                name: meta.label,
                yaxis: isCurrent ? 'y2' : 'y',
                line: { color: signalColors[meta.label] || defaultColors[i % defaultColors.length], width: 2 }
            });
        });

        let xAxisTitle = 'Time (s)';
        if (analysisType === 'dc') xAxisTitle = 'Voltage (V)';

        let yAxisTitle = 'Voltage (V)';
        if (hasCurrent && !hasVoltage) yAxisTitle = 'Current (A)';

        const layout = {
            paper_bgcolor: '#ffffff',
            plot_bgcolor: '#f8fafc',
            font: { color: '#0f172a', size: 10 },
            xaxis: {
                title: { text: xAxisTitle, font: { size: 11 }, standoff: 0 },
                gridcolor: '#e2e8f0',
                zerolinecolor: '#e2e8f0',
                linecolor: '#cbd5e1',
                linewidth: 1,
                mirror: true,
                tickfont: { size: 9 }
            },
            yaxis: {
                title: { text: yAxisTitle, font: { size: 11 } },
                gridcolor: '#e2e8f0',
                zerolinecolor: '#e2e8f0',
                linecolor: '#cbd5e1',
                linewidth: 1,
                mirror: true,
                tickfont: { size: 9 }
            },
            margin: { t: 20, r: 20, b: 70, l: 50 },
            legend: {
                orientation: 'h',
                x: 0.5, xanchor: 'center',
                y: -0.22, yanchor: 'top',
                bgcolor: 'rgba(255, 255, 255, 0.92)',
                bordercolor: '#dbe2ea', borderwidth: 1,
                font: { size: 10 }
            }
        };

        if (hasCurrent && hasVoltage) {
            layout.yaxis2 = {
                title: { text: 'Current (A)', font: { size: 11 }, standoff: 20 },
                overlaying: 'y',
                side: 'right',
                gridcolor: '#e2e8f0',
                zerolinecolor: '#e2e8f0',
                linecolor: '#cbd5e1',
                linewidth: 1,
                mirror: true,
                tickfont: { size: 9 }
            };
            layout.margin.r = 60;
        }

        requestAnimationFrame(() => {
            const rect = plotArea.getBoundingClientRect();
            layout.width = rect.width || 340;
            layout.height = rect.height || 260;
            window.Plotly.newPlot(plotArea, traces, layout, {
                responsive: true,
                modeBarButtonsToRemove: ['pan2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d']
            });
        });

        const container = plotArea.closest('.plot-container');
        if (container) {
            const y2Label = 'Current (A)';
            this._setupYRangeControls(container, {
                hasDualAxis: hasCurrent && hasVoltage,
                y1Label: yAxisTitle,
                y2Label
            });
        }
    }

    _populateXYSelectors(plotContainer, signalMeta) {
        const xSelect = plotContainer.querySelector('.xy-axis-select[data-axis="x"]');
        const ySelect = plotContainer.querySelector('.xy-axis-select[data-axis="y"]');

        if (!xSelect || !ySelect || signalMeta.length < 2) return;

        xSelect.innerHTML = '<option value="">Select X...</option>';
        ySelect.innerHTML = '<option value="">Select Y...</option>';

        signalMeta.forEach((meta, index) => {
            const xOption = document.createElement('option');
            xOption.value = index;
            xOption.textContent = meta.label;
            xSelect.appendChild(xOption);

            const yOption = document.createElement('option');
            yOption.value = index;
            yOption.textContent = meta.label;
            ySelect.appendChild(yOption);
        });

        if (signalMeta.length >= 2) {
            xSelect.value = '0';
            ySelect.value = '1';
        }
    }

    _updateXYPlot(plotContainer) {
        const xSelect = plotContainer.querySelector('.xy-axis-select[data-axis="x"]');
        const ySelect = plotContainer.querySelector('.xy-axis-select[data-axis="y"]');
        const plotArea = plotContainer.querySelector('.plot-area');

        if (!xSelect || !ySelect || !plotArea || !plotContainer._signalData) return;

        const xIndex = parseInt(xSelect.value);
        const yIndex = parseInt(ySelect.value);

        if (!Number.isFinite(xIndex) || !Number.isFinite(yIndex)) {
            plotArea.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #94a3b8; font-size: 12px;">Select X and Y signals to plot</div>';
            return;
        }

        if (xIndex === yIndex) {
            plotArea.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #f59e0b; font-size: 12px;">Please select different signals for X and Y axes</div>';
            return;
        }

        this._renderXYPlot(plotArea, plotContainer._signalData, xIndex, yIndex);
    }

    _setupYRangeControls(container, { hasDualAxis = false, y1Label = 'Y', y2Label = 'Y2' } = {}) {
        const el = container.querySelector('.plot-yrange-controls');
        if (!el) return;

        const makeRow = (axisKey, labelText) => {
            const row = document.createElement('div');
            row.className = 'yrange-row';

            const label = document.createElement('span');
            label.className = 'yrange-label';
            label.textContent = labelText;
            label.title = labelText;

            const minInput = document.createElement('input');
            minInput.type = 'number';
            minInput.className = 'yrange-input';
            minInput.placeholder = 'min';
            minInput.step = 'any';

            const sep = document.createElement('span');
            sep.className = 'yrange-sep';
            sep.textContent = '–';

            const maxInput = document.createElement('input');
            maxInput.type = 'number';
            maxInput.className = 'yrange-input';
            maxInput.placeholder = 'max';
            maxInput.step = 'any';

            const autoBtn = document.createElement('button');
            autoBtn.className = 'yrange-auto-btn';
            autoBtn.textContent = 'Auto';

            row.appendChild(label);
            row.appendChild(minInput);
            row.appendChild(sep);
            row.appendChild(maxInput);
            row.appendChild(autoBtn);

            const apply = () => {
                const plotArea = container.querySelector('.plot-area');
                if (!plotArea || !window.Plotly) return;
                const minVal = minInput.value !== '' ? parseFloat(minInput.value) : null;
                const maxVal = maxInput.value !== '' ? parseFloat(maxInput.value) : null;
                const update = {};
                if (minVal !== null && maxVal !== null && isFinite(minVal) && isFinite(maxVal)) {
                    update[`${axisKey}.range`] = [minVal, maxVal];
                    update[`${axisKey}.autorange`] = false;
                } else {
                    update[`${axisKey}.autorange`] = true;
                }
                window.Plotly.relayout(plotArea, update);
            };

            minInput.addEventListener('blur', apply);
            maxInput.addEventListener('blur', apply);
            minInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.target.blur(); } });
            maxInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.target.blur(); } });

            autoBtn.addEventListener('click', () => {
                minInput.value = '';
                maxInput.value = '';
                apply();
            });

            return row;
        };

        el.innerHTML = '';
        el.appendChild(makeRow('yaxis', y1Label));
        if (hasDualAxis) {
            el.appendChild(makeRow('yaxis2', y2Label));
        }
    }

    _renderXYPlot(plotArea, signalData, xIndex, yIndex) {
        const { signals, signalMeta, signalColors, defaultColors } = signalData;

        const xMeta = signalMeta[xIndex];
        const yMeta = signalMeta[yIndex];
        if (!xMeta || !yMeta) return;

        const xValues = signals[xMeta.label];
        const yValues = signals[yMeta.label];
        if (!xValues || !yValues) return;

        const minLength = Math.min(xValues.length, yValues.length);
        const xData = xValues.slice(0, minLength);
        const yData = yValues.slice(0, minLength);

        const trace = {
            x: xData,
            y: yData,
            type: 'scatter',
            mode: 'lines',
            name: `${yMeta.label} vs ${xMeta.label}`,
            line: {
                color: signalColors[yMeta.label] || defaultColors[yIndex % defaultColors.length],
                width: 2
            }
        };

        const xUnit = xMeta.type === 'current' ? 'A' : 'V';
        const yUnit = yMeta.type === 'current' ? 'A' : 'V';

        const layout = {
            paper_bgcolor: '#ffffff',
            plot_bgcolor: '#f8fafc',
            font: { color: '#0f172a', size: 10 },
            xaxis: {
                title: { text: `${xMeta.label} (${xUnit})`, font: { size: 11 }, standoff: 0 },
                gridcolor: '#e2e8f0',
                zerolinecolor: '#e2e8f0',
                linecolor: '#cbd5e1',
                linewidth: 1,
                mirror: true,
                tickfont: { size: 9 }
            },
            yaxis: {
                title: { text: `${yMeta.label} (${yUnit})`, font: { size: 11 } },
                gridcolor: '#e2e8f0',
                zerolinecolor: '#e2e8f0',
                linecolor: '#cbd5e1',
                linewidth: 1,
                mirror: true,
                tickfont: { size: 9 }
            },
            margin: { t: 20, r: 20, b: 45, l: 50 },
            showlegend: false
        };

        requestAnimationFrame(() => {
            const rect = plotArea.getBoundingClientRect();
            layout.width = rect.width || 340;
            layout.height = rect.height || 260;
            try {
                window.Plotly.newPlot(plotArea, [trace], layout, {
                    responsive: true,
                    modeBarButtonsToRemove: ['pan2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d']
                });
            } catch (err) {
                console.error('[X-Y Plot] Plotly.newPlot error:', err);
            }
        });

        const container = plotArea.closest('.plot-container');
        if (container) {
            this._setupYRangeControls(container, { hasDualAxis: false, y1Label: `${yMeta.label} (${yUnit})` });
        }
    }

    // ==================== Overlay Plotting ====================

    static DASH_STYLES = ['solid', 'dash', 'dot', 'dashdot', 'longdash', 'longdashdot'];
    static ANALYSIS_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

    /**
     * Render overlaid traces from multiple analyses onto a single Plotly chart.
     * Color = per-analysis, dash style = per-probe. Plotly legend is disabled.
     * Returns metadata for building custom legend + analysis blocks.
     * @returns {{ probes: Array<{label: string, dash: string}>, analyses: Array<{label: string, color: string}> }}
     */
    plotOverlay(group, plotAreaEl, scale = 'db') {
        if (!group || group.length === 0 || !plotAreaEl || !window.Plotly) return null;

        const analysisType = group[0].analysis.type;

        // Collect unique probe labels across all analyses to assign dash styles
        const probeLabelSet = new Set();
        for (const entry of group) {
            const wantedSet = new Set((entry.runtimeSignals || []).map(s => s.toLowerCase()));
            const filtered = this._filterVectors(entry.analysis.vectors, entry.probeInfo || [], wantedSet);
            for (const f of filtered) probeLabelSet.add(f.label);
        }
        const probeLabels = [...probeLabelSet];
        const probeDashMap = new Map();
        probeLabels.forEach((label, i) => {
            probeDashMap.set(label, ResultsPlotter.DASH_STYLES[i % ResultsPlotter.DASH_STYLES.length]);
        });

        // Build analysis color assignments
        const analysisColors = group.map((entry, i) => {
            const lbl = entry.label || {};
            return {
                text: typeof lbl === 'string' ? lbl : (lbl.text || ''),
                iteration: lbl.iteration,
                iterationCount: lbl.iterationCount,
                loopVar: lbl.loopVar,
                loopValue: lbl.loopValue,
                color: ResultsPlotter.ANALYSIS_COLORS[i % ResultsPlotter.ANALYSIS_COLORS.length]
            };
        });

        const traceMap = [];

        if (analysisType === 'ac') {
            this._plotOverlayAc(group, plotAreaEl, scale, probeDashMap, analysisColors, traceMap);
        } else {
            this._plotOverlaySweep(group, plotAreaEl, analysisType, probeDashMap, analysisColors, traceMap);
        }

        return {
            probes: probeLabels.map(label => ({ label, dash: probeDashMap.get(label) })),
            analyses: analysisColors,
            traceMap
        };
    }

    _plotOverlayAc(group, plotAreaEl, scale, probeDashMap, analysisColors, traceMap) {
        const isPhase = scale === 'phase';
        const isDb = scale === 'db';

        let yTransform, yLabel;
        if (isPhase) {
            yTransform = (re, im) => Math.atan2(im, re) * (180 / Math.PI);
            yLabel = 'Phase (°)';
        } else if (isDb) {
            yTransform = (re, im) => 20 * Math.log10(Math.max(Math.sqrt(re * re + im * im), 1e-12));
            yLabel = 'Magnitude (dB)';
        } else {
            yTransform = (re, im) => Math.sqrt(re * re + im * im);
            yLabel = 'Magnitude (V)';
        }

        const traces = [];

        group.forEach((entry, ai) => {
            const color = analysisColors[ai].color;
            const analysis = entry.analysis;
            const freqValues = Array.from(analysis.sweep.values);
            const wantedSet = new Set((entry.runtimeSignals || []).map(s => s.toLowerCase()));
            const filtered = this._filterVectors(analysis.vectors, entry.probeInfo || [], wantedSet);

            filtered.forEach(f => {
                const v = f.vector;
                const yData = [];
                for (let i = 0; i < v.real.length; i++) {
                    yData.push(yTransform(v.real[i], v.imag ? v.imag[i] : 0));
                }
                traces.push({
                    x: freqValues,
                    y: yData,
                    type: 'scatter',
                    mode: 'lines',
                    name: `${f.label} — ${entry.label?.text || entry.label}`,
                    showlegend: false,
                    line: { color, width: 2, dash: probeDashMap.get(f.label) || 'solid' }
                });
                traceMap.push({ probeLabel: f.label, analysisIndex: ai });
            });
        });

        const layout = this._overlayLayout({
            xTitle: 'Frequency (Hz)',
            yTitle: yLabel,
            xType: 'log'
        });

        requestAnimationFrame(() => {
            layout.width = plotAreaEl.clientWidth || 680;
            layout.height = plotAreaEl.clientHeight || 500;
            try {
                window.Plotly.newPlot(plotAreaEl, traces, layout, {
                    responsive: true,
                    modeBarButtonsToRemove: ['pan2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d']
                });
            } catch (err) {
                console.error('[Overlay AC Plot] Plotly.newPlot error:', err);
            }
        });
    }

    _plotOverlaySweep(group, plotAreaEl, analysisType, probeDashMap, analysisColors, traceMap) {
        const traces = [];
        let hasVoltage = false;
        let hasCurrent = false;

        group.forEach((entry, ai) => {
            const color = analysisColors[ai].color;
            const analysis = entry.analysis;
            const xValues = Array.from(analysis.sweep.values);
            const wantedSet = new Set((entry.runtimeSignals || []).map(s => s.toLowerCase()));
            const filtered = this._filterVectors(analysis.vectors, entry.probeInfo || [], wantedSet);

            filtered.forEach(f => {
                const isCurrent = f.type === 'current';
                hasCurrent = hasCurrent || isCurrent;
                hasVoltage = hasVoltage || !isCurrent;
                traces.push({
                    x: xValues,
                    y: Array.from(f.vector.real),
                    type: 'scatter',
                    mode: 'lines',
                    name: `${f.label} — ${entry.label?.text || entry.label}`,
                    showlegend: false,
                    yaxis: isCurrent ? 'y2' : 'y',
                    line: { color, width: 2, dash: probeDashMap.get(f.label) || 'solid' }
                });
                traceMap.push({ probeLabel: f.label, analysisIndex: ai });
            });
        });

        const xTitle = analysisType === 'dc' ? 'Voltage (V)' : 'Time (s)';
        let yTitle = 'Voltage (V)';
        if (hasCurrent && !hasVoltage) yTitle = 'Current (A)';

        const layout = this._overlayLayout({ xTitle, yTitle });

        if (hasCurrent && hasVoltage) {
            layout.yaxis2 = {
                title: { text: 'Current (A)', font: { size: 11 }, standoff: 20 },
                overlaying: 'y',
                side: 'right',
                gridcolor: '#e2e8f0',
                zerolinecolor: '#e2e8f0',
                linecolor: '#cbd5e1',
                linewidth: 1,
                mirror: true,
                tickfont: { size: 9 }
            };
            layout.margin.r = 60;
        }

        requestAnimationFrame(() => {
            layout.width = plotAreaEl.clientWidth || 680;
            layout.height = plotAreaEl.clientHeight || 500;
            try {
                window.Plotly.newPlot(plotAreaEl, traces, layout, {
                    responsive: true,
                    modeBarButtonsToRemove: ['pan2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d']
                });
            } catch (err) {
                console.error('[Overlay Sweep Plot] Plotly.newPlot error:', err);
            }
        });
    }

    _overlayLayout({ xTitle, yTitle, xType = 'linear' }) {
        return {
            paper_bgcolor: '#ffffff',
            plot_bgcolor: '#f8fafc',
            font: { color: '#0f172a', size: 10 },
            xaxis: {
                title: { text: xTitle, font: { size: 11 }, standoff: 0 },
                type: xType,
                gridcolor: '#e2e8f0',
                zerolinecolor: '#e2e8f0',
                linecolor: '#cbd5e1',
                linewidth: 1,
                mirror: true,
                tickfont: { size: 9 }
            },
            yaxis: {
                title: { text: yTitle, font: { size: 11 } },
                gridcolor: '#e2e8f0',
                zerolinecolor: '#e2e8f0',
                linecolor: '#cbd5e1',
                linewidth: 1,
                mirror: true,
                tickfont: { size: 9 }
            },
            margin: { t: 20, r: 20, b: 40, l: 50 },
            showlegend: false
        };
    }
}

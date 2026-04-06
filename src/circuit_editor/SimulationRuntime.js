import { NgspiceLibraryClient } from './ngspice-client.js';

export class SimulationRuntimeManager {
    constructor() {
        this.client = new NgspiceLibraryClient({
            workerUrl: '/ngspice-worker.js',
            assetBaseUrl: '/'
        });
        this._running = false;
    }

    async runJob(job, callbacks = {}) {
        try {
            const result = await this.client.run(job.netlist, {
                onProgress: (data) => {
                    callbacks.onProgress?.({
                        lifecycle: 'running',
                        mode: Number.isFinite(data.progress) ? 'determinate' : 'indeterminate',
                        progress: data.progress,
                        currentTime: data.currentTime,
                        finalTime: data.finalTime
                    });
                },
                onStdout: (line) => callbacks.onStdout?.(line),
                onStderr: (line) => callbacks.onStderr?.(line),
                onStatus: (message) => {
                    callbacks.onStatus?.({
                        lifecycle: 'running',
                        message: message || 'Running simulation...'
                    });
                }
            });

            const success = result.exitCode === 0 && result.analyses.length > 0;
            console.log(result.analyses);
            return {
                analyses: result.analyses,
                stdout: result.stdout,
                stderr: result.stderr,
                success,
                failureMessage: success ? null : 'Simulation produced no usable results.',
                finalTime: result.finalTime,
                progress: result.progress,
                cancelled: false
            };
        } finally {
            this._running = false;
        }
    }

    async cancel() {
        if (!this._running) return;
        this.client.dispose();
        this.client = new NgspiceLibraryClient({
            workerUrl: '/ngspice-worker.js',
            assetBaseUrl: '/'
        });
        this._running = false;
    }

    dispose() {
        this.client.dispose();
        this._running = false;
    }
}
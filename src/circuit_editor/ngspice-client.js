export class NgspiceLibraryClient {
	constructor({ workerUrl = 'ngspice-worker.js', assetBaseUrl = './' } = {}) {
		this.workerUrl = workerUrl;
		this.assetBaseUrl = assetBaseUrl;
		this.worker = null;
		this.initPromise = null;
		this.currentRun = null;
		this.requestId = 0;
	}

	async init() {
		if (this.initPromise) {
			return this.initPromise;
		}

		this.worker = new Worker(this.workerUrl);
		this.worker.addEventListener('message', (event) => this.#handleMessage(event.data));
		this.worker.addEventListener('error', (event) => {
			const message = event.message || 'Worker error';
			if (this.currentRun) {
				this.currentRun.reject(new Error(message));
				this.currentRun = null;
			}
		});

		this.initPromise = new Promise((resolve, reject) => {
			const initRequestId = ++this.requestId;
			const handleReady = (event) => {
				const data = event.data || {};
				if (data.type === 'ready' && data.requestId === initRequestId) {
					this.worker.removeEventListener('message', handleReady);
					resolve();
				}
				if (data.type === 'error' && data.requestId === initRequestId) {
					this.worker.removeEventListener('message', handleReady);
					reject(new Error(data.message || 'Failed to initialize ngspice library worker.'));
				}
			};

			this.worker.addEventListener('message', handleReady);
			this.worker.postMessage({
				type: 'init',
				requestId: initRequestId,
				config: {
					assetBaseUrl: this.assetBaseUrl,
				},
			});
		});

		return this.initPromise;
	}

	async run(netlist, callbacks = {}) {
		if (this.currentRun) {
			throw new Error('Only one ngspice library run can be active at a time.');
		}

		await this.init();

		const requestId = ++this.requestId;
		const log = { stdout: [], stderr: [] };

		this.currentRun = {
			requestId,
			callbacks,
			log,
			resolve: null,
			reject: null,
		};

		const promise = new Promise((resolve, reject) => {
			this.currentRun.resolve = resolve;
			this.currentRun.reject = reject;
		});

		this.worker.postMessage({ type: 'run', requestId, netlist });
		return promise;
	}

	async reset() {
		await this.init();

		const requestId = ++this.requestId;
		return new Promise((resolve, reject) => {
			const handleReset = (event) => {
				const data = event.data || {};
				if (data.requestId !== requestId) {
					return;
				}

				if (data.type === 'reset-done') {
					this.worker.removeEventListener('message', handleReset);
					resolve();
				}

				if (data.type === 'error') {
					this.worker.removeEventListener('message', handleReset);
					reject(new Error(data.message || 'Failed to reset ngspice library state.'));
				}
			};

			this.worker.addEventListener('message', handleReset);
			this.worker.postMessage({ type: 'reset', requestId });
		});
	}

	dispose() {
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
		}

		this.currentRun = null;
		this.initPromise = null;
	}

	#handleMessage(data) {
		if (!data || !this.currentRun || data.requestId !== this.currentRun.requestId) {
			return;
		}

		const { callbacks, log } = this.currentRun;

		if (data.type === 'stdout') {
			log.stdout.push(data.line);
			callbacks.onStdout?.(data.line);
			return;
		}

		if (data.type === 'stderr') {
			log.stderr.push(data.line);
			callbacks.onStderr?.(data.line);
			return;
		}

		if (data.type === 'status') {
			callbacks.onStatus?.(data.message);
			return;
		}

		if (data.type === 'debug') {
			if (data.event !== 'data-callback' && data.event !== 'data-init-callback') {
				console.debug('[ngspice-lib]', data.event, data.details || {});
			}
			callbacks.onDebug?.(data);
			return;
		}

		if (data.type === 'progress') {
			callbacks.onProgress?.(data);
			return;
		}

		if (data.type === 'done') {
			this.currentRun.resolve({
				exitCode: data.exitCode,
				finalTime: data.finalTime,
				progress: data.progress,
				stdout: log.stdout.join('\n'),
				stderr: log.stderr.join('\n'),
				analyses: data.analyses || [],
			});
			this.currentRun = null;
			return;
		}

		if (data.type === 'error') {
			const error = new Error(data.message || 'ngspice library run failed.');
			error.stdout = log.stdout.join('\n');
			error.stderr = log.stderr.join('\n');
			this.currentRun.reject(error);
			this.currentRun = null;
		}
	}
}

/**
 * Convenience function: run a simulation and return structured results.
 * Creates a temporary client, runs the netlist, and disposes the worker.
 *
 * @param {string} netlist
 * @param {object} [callbacks]
 * @param {object} [options]
 * @param {string} [options.workerUrl]
 * @param {string} [options.assetBaseUrl]
 * @returns {Promise<import('../types/index').SimulationResult>}
 */
export async function runSimulation(netlist, callbacks = {}, options = {}) {
	const client = new NgspiceLibraryClient(options);

	try {
		return await client.run(netlist, callbacks);
	} finally {
		client.dispose();
	}
}

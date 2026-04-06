const MODEL_FILES = [
	'analog.cm',
	'digital.cm',
	'spice2poly.cm',
	'table.cm',
	'tlines.cm',
	'xtradev.cm',
	'xtraevt.cm',
];

// vecvaluesall struct offsets (used by onData callback during simulation)
const VECVALUESALL_COUNT_OFFSET = 0;
const VECVALUESALL_VALUES_OFFSET = 8;
const VECVALUES_NAME_OFFSET = 0;
const VECVALUES_REAL_OFFSET = 8;
const VECVALUES_IS_SCALE_OFFSET = 24;

// vector_info struct offsets (used for post-simulation data extraction)
const VECTOR_INFO_NAME_OFFSET = 0;
const VECTOR_INFO_TYPE_OFFSET = 4;
const VECTOR_INFO_FLAGS_OFFSET = 8;
const VECTOR_INFO_REALDATA_OFFSET = 12;
const VECTOR_INFO_IMAGDATA_OFFSET = 16;
const VECTOR_INFO_LENGTH_OFFSET = 20;

// vecinfoall struct offsets (used by onDataInit callback)
const VECINFOALL_COUNT_OFFSET = 16;
const VECINFOALL_VECS_OFFSET = 20;
const VECINFO_NAME_OFFSET = 4;

// ngspice vector type flag for complex data
const VF_COMPLEX = 0x400;

// Analysis types that produce scalar results (no sweep)
const SCALAR_ANALYSIS_TYPES = new Set(['op', 'tf', 'sens']);

let moduleConfig = null;
let moduleReady = null;
let filesystemReady = false;
let api = null;
let callbackPointers = null;
let ngspiceInitialized = false;
let currentRun = null;

function postDebug(event, details = {}) {
	self.postMessage({
		type: 'debug',
		requestId: currentRun?.requestId,
		event,
		details,
	});
}

self.addEventListener('message', async (event) => {
	const data = event.data || {};

	try {
		if (data.type === 'init') {
			await ensureSession(data.config || {});
			self.postMessage({ type: 'ready', requestId: data.requestId });
			return;
		}

		if (data.type === 'run') {
			await runSimulation(data.requestId, data.netlist || '');
			return;
		}

		if (data.type === 'reset') {
			resetNgspice();
			self.postMessage({ type: 'reset-done', requestId: data.requestId });
		}
	} catch (error) {
		self.postMessage({
			type: 'error',
			requestId: data.requestId,
			message: error instanceof Error ? error.message : String(error),
		});
	}
});

async function runSimulation(requestId, netlist) {
	if (!netlist.trim()) {
		throw new Error('Netlist is empty.');
	}

	if (currentRun) {
		throw new Error('A library simulation is already in progress.');
	}

	resetNgspice();
	await ensureSession(moduleConfig || {});

	currentRun = {
		requestId,
		finalTime: extractTranFinalTime(netlist),
		lastProgress: 0,
		lastCurrentTime: 0,
		lastEmitAt: 0,
		timeVectorName: 'time',
	};

	postDebug('run-start', { finalTime: currentRun.finalTime, netlistLines: netlist.split(/\r?\n/).length });

	self.postMessage({ type: 'status', requestId, message: 'Submitting circuit to shared ngspice…' });

	const circuitLines = buildCircuitLines(netlist);
	const allocations = allocateCStringArray(circuitLines);

	try {
		const rc = api.circ(allocations.arrayPointer);
		if (rc !== 0) {
			throw new Error(`ngSpice_Circ failed with status ${rc}.`);
		}

		emitProgress(true);

		const analyses = extractAllAnalyses();
		const transferables = collectTransferables(analyses);

		self.postMessage(
			{
				type: 'done',
				requestId,
				exitCode: rc,
				finalTime: currentRun.finalTime,
				progress: currentRun.lastProgress,
				analyses,
			},
			transferables,
		);
	} finally {
		freeCStringArray(allocations);
		currentRun = null;
	}
}

// ---------------------------------------------------------------------------
// Post-simulation data extraction
// ---------------------------------------------------------------------------

function extractAllAnalyses() {
	const plotNames = readAllPlotNames();
	const analyses = [];

	for (const plotName of plotNames) {
		if (plotName === 'const') {
			continue;
		}

		const analysis = extractPlotAnalysis(plotName);
		if (analysis) {
			analyses.push(analysis);
		}
	}

	postDebug('extract-analyses', { plotCount: plotNames.length, analysisCount: analyses.length });
	return analyses;
}

function readAllPlotNames() {
	const plotsPtr = api.allPlots();
	if (!plotsPtr) {
		return [];
	}

	const names = [];
	let offset = plotsPtr;
	while (true) {
		const strPtr = HEAPU32[offset >> 2];
		if (!strPtr) {
			break;
		}
		names.push(Module.UTF8ToString(strPtr));
		offset += 4;
	}
	return names;
}

function readAllVecNames(plotName) {
	const vecsPtr = api.allVecs(plotName);
	if (!vecsPtr) {
		return [];
	}

	const names = [];
	let offset = vecsPtr;
	while (true) {
		const strPtr = HEAPU32[offset >> 2];
		if (!strPtr) {
			break;
		}
		names.push(Module.UTF8ToString(strPtr));
		offset += 4;
	}
	return names;
}

function extractPlotAnalysis(plotName) {
	const vecNames = readAllVecNames(plotName);
	if (vecNames.length === 0) {
		return null;
	}

	const analysisType = detectAnalysisType(plotName);
	const isComplex = analysisType === 'ac';
	const isScalar = SCALAR_ANALYSIS_TYPES.has(analysisType);

	let sweepVec = null;
	const dataVecs = [];

	for (const vecName of vecNames) {
		const qualifiedName = `${plotName}.${vecName}`;
		const infoPtr = api.getVecInfo(qualifiedName);
		if (!infoPtr) {
			continue;
		}

		const vecData = readVectorData(infoPtr, isComplex);
		if (!vecData) {
			continue;
		}

		const typeFlags = HEAP32[(infoPtr + VECTOR_INFO_TYPE_OFFSET) >> 2];
		// SV_TIME=1, SV_FREQUENCY=2 are scale (independent) vectors
		const svType = typeFlags & 0xFF;
		const isScale = svType === 1 || svType === 2;

		if (isScale) {
			sweepVec = { name: vecName, ...vecData };
		} else {
			dataVecs.push({ name: vecName, ...vecData });
		}
	}

	if (isScalar) {
		return buildScalarResult(analysisType, plotName, sweepVec, dataVecs);
	}

	return buildVectorResult(analysisType, plotName, sweepVec, dataVecs, isComplex);
}

function readVectorData(infoPtr, readImag) {
	const length = HEAP32[(infoPtr + VECTOR_INFO_LENGTH_OFFSET) >> 2];
	if (length <= 0) {
		return null;
	}

	const realDataPtr = HEAPU32[(infoPtr + VECTOR_INFO_REALDATA_OFFSET) >> 2];
	const compDataPtr = HEAPU32[(infoPtr + VECTOR_INFO_IMAGDATA_OFFSET) >> 2];

	// For complex vectors (AC analysis), ngspice stores data as an array of
	// ngcomplex_t structs ({double real; double imag;}) in the compdata field,
	// with realdata set to NULL.
	if (!realDataPtr && compDataPtr && readImag) {
		const real = new Float64Array(length);
		const imag = new Float64Array(length);
		const baseIdx = compDataPtr >> 3; // byte offset to float64 index
		for (let i = 0; i < length; i++) {
			real[i] = HEAPF64[baseIdx + i * 2];
			imag[i] = HEAPF64[baseIdx + i * 2 + 1];
		}
		return { real, imag, length };
	}

	if (!realDataPtr) {
		return null;
	}

	const real = new Float64Array(length);
	real.set(HEAPF64.subarray(realDataPtr >> 3, (realDataPtr >> 3) + length));

	let imag = null;
	if (readImag && compDataPtr) {
		// If both realdata and compdata exist, compdata holds ngcomplex_t structs
		imag = new Float64Array(length);
		const baseIdx = compDataPtr >> 3;
		for (let i = 0; i < length; i++) {
			imag[i] = HEAPF64[baseIdx + i * 2 + 1];
		}
	}

	return { real, imag, length };
}

function buildScalarResult(analysisType, plotName, sweepVec, dataVecs) {
	const scalars = {};

	if (sweepVec) {
		for (let i = 0; i < sweepVec.length; i++) {
			scalars[sweepVec.name] = sweepVec.real[0];
		}
	}

	for (const vec of dataVecs) {
		scalars[vec.name] = vec.real[0];
	}

	return {
		type: analysisType,
		sweep: null,
		vectors: [],
		scalars,
		meta: { plotName },
	};
}

function buildVectorResult(analysisType, plotName, sweepVec, dataVecs, isComplex) {
	const sweep = sweepVec
		? {
				name: sweepVec.name,
				unit: inferUnit(sweepVec.name),
				values: sweepVec.real,
			}
		: null;

	const vectors = dataVecs.map((vec) => ({
		name: vec.name,
		unit: inferUnit(vec.name),
		real: vec.real,
		imag: isComplex ? vec.imag : null,
		complex: isComplex,
	}));

	return {
		type: analysisType,
		sweep,
		vectors,
		scalars: null,
		meta: { plotName },
	};
}

function detectAnalysisType(plotName) {
	const match = plotName.match(/^(tran|ac|dc|op|noise|sens|tf|pz)/i);
	if (match) {
		return match[1].toLowerCase();
	}
	return 'unknown';
}

function inferUnit(vectorName) {
	const lower = vectorName.toLowerCase();
	if (lower === 'time') return 's';
	if (lower === 'frequency') return 'Hz';
	if (/^v\(/.test(lower) || /^v_/.test(lower)) return 'V';
	if (/^i\(/.test(lower) || /^i_/.test(lower)) return 'A';
	if (/^p\(/.test(lower)) return 'W';
	return '';
}

function collectTransferables(analyses) {
	const buffers = new Set();

	for (const analysis of analyses) {
		if (analysis.sweep) {
			buffers.add(analysis.sweep.values.buffer);
		}

		for (const vec of analysis.vectors) {
			buffers.add(vec.real.buffer);
			if (vec.imag) {
				buffers.add(vec.imag.buffer);
			}
		}
	}

	return [...buffers];
}

// ---------------------------------------------------------------------------
// Netlist preprocessing
// ---------------------------------------------------------------------------

function buildCircuitLines(netlist) {
	const lines = netlist.replace(/\r/g, '').split('\n');
	const filtered = [];
	let inControl = false;

	for (const line of lines) {
		const trimmed = line.trim().toLowerCase();

		if (/^\.control\b/.test(trimmed)) {
			inControl = true;
			filtered.push(line);
			continue;
		}

		if (/^\.endc\b/.test(trimmed)) {
			inControl = false;
			filtered.push(line);
			continue;
		}

		if (inControl) {
			if (/^save\b/.test(trimmed) || /^wrdt\b/.test(trimmed)) {
				continue;
			}
			filtered.push(line);
			continue;
		}

		if (/^\s*\.save\b/i.test(line) || /^\s*\.wrdt\b/i.test(line)) {
			continue;
		}

		filtered.push(line);
	}

	const hasEnd = filtered.some((line) => /^\s*\.end\s*$/i.test(line));
	if (!hasEnd) {
		filtered.push('.end');
	}
	return filtered;
}

// ---------------------------------------------------------------------------
// Session & module setup
// ---------------------------------------------------------------------------

async function ensureSession(config) {
	await ensureModule(config);

	if (!filesystemReady) {
		self.postMessage({ type: 'status', requestId: config.requestId, message: 'Staging library assets…' });
		await stageFilesystem();
		filesystemReady = true;
	}

	if (!callbackPointers) {
		registerCallbacks();
	}

	if (!ngspiceInitialized) {
		initializeNgspice();
	}
}

async function ensureModule(config) {
	if (!moduleReady) {
		moduleConfig = normalizeConfig(config);
		moduleReady = new Promise((resolve, reject) => {
			self.Module = {
				noInitialRun: true,
				locateFile: (path) => {
					if (path.endsWith('.wasm')) {
						return resolveAssetUrl(moduleConfig.assetBaseUrl, moduleConfig.wasmFile);
					}
					return path;
				},
				print: (text) => {
					if (currentRun) {
						self.postMessage({ type: 'stdout', requestId: currentRun.requestId, line: text });
					}
				},
				printErr: (text) => {
					if (currentRun && !text.includes('keepRuntimeAlive() is set')) {
						self.postMessage({ type: 'stderr', requestId: currentRun.requestId, line: text });
					}
				},
				onRuntimeInitialized: () => {
					bindApi();
					resolve();
				},
			};

			try {
				importScripts(resolveAssetUrl(moduleConfig.assetBaseUrl, moduleConfig.moduleScript));
			} catch (error) {
				reject(error);
			}
		});
	}

	return moduleReady;
}

function bindApi() {
	api = {
		init: Module.cwrap('ngSpice_Init', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number']),
		command: Module.cwrap('ngSpice_Command', 'number', ['string']),
		circ: Module.cwrap('ngSpice_Circ', 'number', ['number']),
		curPlot: Module.cwrap('ngSpice_CurPlot', 'string', []),
		allPlots: Module.cwrap('ngSpice_AllPlots', 'number', []),
		allVecs: Module.cwrap('ngSpice_AllVecs', 'number', ['string']),
		getVecInfo: Module.cwrap('ngGet_Vec_Info', 'number', ['string']),
		reset: Module.cwrap('ngSpice_Reset', 'number', []),
		nospiceinit: Module.cwrap('ngSpice_nospiceinit', 'number', []),
		setInputPath: Module.cwrap('ngCM_Input_Path', 'number', ['string']),
	};
}

function registerCallbacks() {
	callbackPointers = {
		print: Module.addFunction(onPrint, 'iiii'),
		status: Module.addFunction(onStatus, 'iiii'),
		exit: Module.addFunction(onControlledExit, 'iiiiii'),
		data: Module.addFunction(onData, 'iiiii'),
		dataInit: Module.addFunction(onDataInit, 'iiii'),
		bg: Module.addFunction(onBackground, 'iiii'),
	};
}

function initializeNgspice() {
	api.nospiceinit();
	const rc = api.init(
		callbackPointers.print,
		callbackPointers.status,
		callbackPointers.exit,
		callbackPointers.data,
		callbackPointers.dataInit,
		callbackPointers.bg,
		0,
	);

	if (rc !== 0) {
		throw new Error(`ngSpice_Init failed with status ${rc}.`);
	}

	api.setInputPath('/');
	api.command('set xspice_enabled');
	api.command('source /spinit');
	ngspiceInitialized = true;
}

function resetNgspice() {
	if (!ngspiceInitialized || !api) {
		return;
	}

	api.reset();
	ngspiceInitialized = false;
}

async function stageFilesystem() {
	ensurePath('/usr/local/lib/ngspice');
	ensurePath('/usr/local/share/ngspice/scripts');

	for (const [index, name] of MODEL_FILES.entries()) {
		self.postMessage({
			type: 'status',
			message: `Loading code model ${index + 1}/${MODEL_FILES.length}: ${name}`,
		});
		const data = await fetchBinary(name);
		FS.writeFile(`/usr/local/lib/ngspice/${name}`, new Uint8Array(data));
	}

	const spinitText = await fetchText('spinit');
	FS.writeFile('/usr/local/share/ngspice/scripts/spinit', spinitText);
	FS.writeFile('/spinit', spinitText);
}

// ---------------------------------------------------------------------------
// Ngspice callbacks (invoked during simulation)
// ---------------------------------------------------------------------------

function onPrint(messagePtr) {
	if (!currentRun) {
		return 0;
	}

	const text = Module.UTF8ToString(messagePtr);
	if (text.startsWith('stderr ')) {
		self.postMessage({ type: 'stderr', requestId: currentRun.requestId, line: text.slice(7) });
	} else if (text.startsWith('stdout ')) {
		self.postMessage({ type: 'stdout', requestId: currentRun.requestId, line: text.slice(7) });
	} else {
		self.postMessage({ type: 'stdout', requestId: currentRun.requestId, line: text });
	}
	return 0;
}

function onStatus(messagePtr) {
	if (currentRun) {
		const message = Module.UTF8ToString(messagePtr);
		self.postMessage({ type: 'status', requestId: currentRun.requestId, message });
	}
	return 0;
}

function onControlledExit(status, immediate, fromQuit) {
	if (currentRun && status !== 0 && !fromQuit) {
		self.postMessage({
			type: 'stderr',
			requestId: currentRun.requestId,
			line: `shared ngspice requested exit ${status} (immediate=${Boolean(immediate)})`,
		});
	}
	return 0;
}

function onData(vecvaluesAllPtr, vectorCount) {
	const currentTime = readCurrentTimeFromData(vecvaluesAllPtr, vectorCount);
	postDebug('data-callback', {
		vecvaluesAllPtr,
		vectorCount,
		currentTime,
		timeVectorName: currentRun?.timeVectorName,
	});
	emitProgress(false, currentTime);
	return 0;
}

function onDataInit(vecinfoAllPtr) {
	if (currentRun) {
		const timeVectorName = findTimeVectorName(vecinfoAllPtr);
		if (timeVectorName) {
			currentRun.timeVectorName = timeVectorName;
		}
		postDebug('data-init-callback', {
			vecinfoAllPtr,
			timeVectorName: currentRun.timeVectorName,
		});
	}

	if (currentRun) {
		self.postMessage({ type: 'status', requestId: currentRun.requestId, message: 'Transient vectors initialized.' });
	}
	return 0;
}

function onBackground() {
	return 0;
}

// ---------------------------------------------------------------------------
// Progress tracking helpers
// ---------------------------------------------------------------------------

function emitProgress(force, currentTimeOverride = null) {
	if (!currentRun || !currentRun.finalTime || currentRun.finalTime <= 0) {
		return;
	}

	const currentTime = currentTimeOverride ?? readLatestVectorValue(currentRun.timeVectorName || 'time');
	if (currentTime === null) {
		return;
	}

	const now = Date.now();
	const progress = Math.min(Math.max(currentTime / currentRun.finalTime, currentRun.lastProgress), 1);
	if (!force && progress - currentRun.lastProgress < 0.001 && now - currentRun.lastEmitAt < 80) {
		return;
	}

	currentRun.lastProgress = progress;
	currentRun.lastCurrentTime = currentTime;
	currentRun.lastEmitAt = now;
	self.postMessage({
		type: 'progress',
		requestId: currentRun.requestId,
		currentTime,
		finalTime: currentRun.finalTime,
		progress,
	});
}

function readLatestVectorValue(vectorName) {
	let vectorInfoPtr = api.getVecInfo(vectorName);
	if (!vectorInfoPtr && !vectorName.includes('.')) {
		const currentPlot = api.curPlot?.();
		if (currentPlot) {
			vectorInfoPtr = api.getVecInfo(`${currentPlot}.${vectorName}`);
		}
	}

	if (!vectorInfoPtr) {
		return null;
	}

	const realDataPtr = HEAPU32[(vectorInfoPtr + VECTOR_INFO_REALDATA_OFFSET) >> 2];
	const length = HEAP32[(vectorInfoPtr + VECTOR_INFO_LENGTH_OFFSET) >> 2];
	if (!realDataPtr || length <= 0) {
		return null;
	}

	return HEAPF64[(realDataPtr >> 3) + length - 1];
}

function readCurrentTimeFromData(vecvaluesAllPtr, vectorCount) {
	if (!vecvaluesAllPtr) {
		return null;
	}

	const count = vectorCount || HEAP32[(vecvaluesAllPtr + VECVALUESALL_COUNT_OFFSET) >> 2];
	const valuesPtr = HEAPU32[(vecvaluesAllPtr + VECVALUESALL_VALUES_OFFSET) >> 2];
	if (!valuesPtr || count <= 0) {
		return null;
	}

	for (let index = 0; index < count; index += 1) {
		const vecvaluePtr = HEAPU32[(valuesPtr >> 2) + index];
		if (!vecvaluePtr) {
			continue;
		}

		const namePtr = HEAPU32[(vecvaluePtr + VECVALUES_NAME_OFFSET) >> 2];
		const name = namePtr ? Module.UTF8ToString(namePtr) : '';
		const isScale = HEAPU8[vecvaluePtr + VECVALUES_IS_SCALE_OFFSET] !== 0;
		if (!isScale && name !== 'time' && name !== currentRun?.timeVectorName) {
			continue;
		}

		return HEAPF64[(vecvaluePtr + VECVALUES_REAL_OFFSET) >> 3];
	}

	return null;
}

function findTimeVectorName(vecinfoAllPtr) {
	if (!vecinfoAllPtr) {
		return null;
	}

	const count = HEAP32[(vecinfoAllPtr + VECINFOALL_COUNT_OFFSET) >> 2];
	const vecsPtr = HEAPU32[(vecinfoAllPtr + VECINFOALL_VECS_OFFSET) >> 2];
	if (!vecsPtr || count <= 0) {
		return null;
	}

	for (let index = 0; index < count; index += 1) {
		const vecinfoPtr = HEAPU32[(vecsPtr >> 2) + index];
		if (!vecinfoPtr) {
			continue;
		}

		const namePtr = HEAPU32[(vecinfoPtr + VECINFO_NAME_OFFSET) >> 2];
		if (!namePtr) {
			continue;
		}

		const name = Module.UTF8ToString(namePtr);
		if (name === 'time') {
			return name;
		}
	}

	return null;
}

// ---------------------------------------------------------------------------
// Netlist parsing helpers
// ---------------------------------------------------------------------------

function extractTranFinalTime(netlist) {
	for (const line of netlist.split(/\r?\n/)) {
		if (!/^\s*\.?tran\b/i.test(line)) {
			continue;
		}

		const tokens = line.trim().split(/\s+/);
		if (tokens.length < 3) {
			postDebug('tran-parse-skipped', { line, reason: 'too-few-tokens' });
			return null;
		}

		const finalTime = parseScaledNumber(tokens[2]);
		postDebug('tran-parse-result', { line, tokens, finalTime });
		return finalTime;
	}

	postDebug('tran-parse-missed', { reason: 'no-tran-line-found' });
	return null;
}

function parseScaledNumber(token) {
	const match = token.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)([a-zA-Z]+)?$/);
	if (!match) {
		return null;
	}

	const value = Number(match[1]);
	const suffix = (match[2] || '').toLowerCase();
	const multipliers = {
		t: 1e12,
		g: 1e9,
		meg: 1e6,
		k: 1e3,
		m: 1e-3,
		u: 1e-6,
		n: 1e-9,
		p: 1e-12,
		f: 1e-15,
	};

	if (!suffix) {
		return value;
	}

	return value * (multipliers[suffix] || 1);
}

// ---------------------------------------------------------------------------
// Utility: memory allocation, URLs, filesystem
// ---------------------------------------------------------------------------

function allocateCStringArray(lines) {
	const pointerSize = 4;
	const stringPointers = lines.map((line) => allocateCString(line));
	const arrayPointer = _malloc((stringPointers.length + 1) * pointerSize);

	stringPointers.forEach((pointer, index) => {
		HEAPU32[(arrayPointer >> 2) + index] = pointer;
	});
	HEAPU32[(arrayPointer >> 2) + stringPointers.length] = 0;

	return { arrayPointer, stringPointers };
}

function freeCStringArray({ arrayPointer, stringPointers }) {
	stringPointers.forEach((pointer) => _free(pointer));
	_free(arrayPointer);
}

function allocateCString(value) {
	const length = Module.lengthBytesUTF8(value) + 1;
	const pointer = _malloc(length);
	Module.stringToUTF8(value, pointer, length);
	return pointer;
}

function normalizeConfig(config) {
	return {
		assetBaseUrl: config.assetBaseUrl || './',
		moduleScript: config.moduleScript || 'ngspice-lib.js',
		wasmFile: config.wasmFile || 'ngspice-lib.wasm',
	};
}

function resolveAssetUrl(basePath, fileName) {
	return new URL(`${trimTrailingSlash(basePath)}/${fileName}`, self.location.href).toString();
}

function trimTrailingSlash(value) {
	return value.replace(/\/$/, '');
}

async function fetchBinary(fileName) {
	const response = await fetch(resolveAssetUrl(moduleConfig.assetBaseUrl, fileName));
	if (!response.ok) {
		throw new Error(`Failed to fetch ${fileName}: ${response.status} ${response.statusText}`);
	}
	return response.arrayBuffer();
}

async function fetchText(fileName) {
	const response = await fetch(resolveAssetUrl(moduleConfig.assetBaseUrl, fileName));
	if (!response.ok) {
		throw new Error(`Failed to fetch ${fileName}: ${response.status} ${response.statusText}`);
	}
	return response.text();
}

function ensurePath(path) {
	const parts = path.split('/').filter(Boolean);
	let current = '/';
	for (const part of parts) {
		FS.createPath(current, part, true, true);
		current = current === '/' ? `/${part}` : `${current}/${part}`;
	}
}

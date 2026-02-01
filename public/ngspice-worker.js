// ngspice-worker.js

let outputBuffer = '';
let stderrBuffer = '';
let isInitialized = false;
let pendingNetlist = null;
let pendingSpinit = null;
let codeModelLoadPromise = Promise.resolve();

const CODE_MODEL_DIR = '/usr/local/lib/ngspice';
const CODE_MODEL_FILES = [
  'analog.cm',
  'digital.cm',
  'spice2poly.cm',
  'table.cm',
  'tlines.cm',
  'xtradev.cm',
  'xtraevt.cm'
];

async function loadCodeModels() {
  try {
    FS.createPath('/', 'usr/local/lib/ngspice', true, true);
  } catch (err) {
    self.postMessage({ type: 'stderr', text: 'Could not create code model directory: ' + err.message });
    return;
  }

  await Promise.all(
    CODE_MODEL_FILES.map(async (file) => {
      try {
        const response = await fetch('/' + file);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const buffer = new Uint8Array(await response.arrayBuffer());
        FS.writeFile(`${CODE_MODEL_DIR}/${file}`, buffer);
      } catch (err) {
        self.postMessage({ type: 'stderr', text: `Failed to load code model ${file}: ${err.message}` });
      }
    })
  );
}

// Configure Module BEFORE importScripts
var Module = {
  noInitialRun: true,
  print: (text) => {
    outputBuffer += text + '\n';
    self.postMessage({ type: 'stdout', text });
  },
  printErr: (text) => {
    stderrBuffer += text + '\n';
    self.postMessage({ type: 'stderr', text });
  },
  onRuntimeInitialized: () => {
    isInitialized = true;
    codeModelLoadPromise = loadCodeModels();
    self.postMessage({ type: 'initialized' });
    
    // If we had a pending simulation, run it now
    if (pendingNetlist) {
      runSimulation(pendingNetlist, pendingSpinit);
      pendingNetlist = null;
      pendingSpinit = null;
    }
  }
};

// Load once at worker startup
importScripts('ngspice.js');

async function runSimulation(netlist, spinit) {
  outputBuffer = '';
  stderrBuffer = '';
  
  try {
    await codeModelLoadPromise;

    if (spinit) {
      try {
        FS.createPath('/', 'usr/local/share/ngspice/scripts', true, true);
        FS.writeFile('/usr/local/share/ngspice/scripts/spinit', spinit);
        FS.writeFile('/spinit', spinit);
      } catch (err) {
        self.postMessage({ type: 'stderr', text: 'Could not write spinit: ' + err.message });
      }
    }
    
    FS.writeFile('/circuit.cir', netlist);
    try { FS.unlink('/output.txt'); } catch(e) {}
    
    self.postMessage({ type: 'status', text: 'Running simulation...' });
    
    callMain(['-b', '/circuit.cir']);
    
    let outputData = null;
    try {
      outputData = FS.readFile('/output.txt', { encoding: 'utf8' });
    } catch (e) {}
    
    self.postMessage({ 
      type: 'complete', 
      outputData,
      stdout: outputBuffer,
      stderr: stderrBuffer
    });
    
  } catch (err) {
    self.postMessage({ 
      type: 'error', 
      message: err.message,
      stack: err.stack
    });
  }
}

self.onmessage = function(e) {
  const { type, netlist, spinit } = e.data;
  
  if (type === 'run') {
    if (isInitialized) {
      runSimulation(netlist, spinit).catch(err => {
        self.postMessage({ type: 'error', message: err.message, stack: err.stack });
      });
    } else {
      // Queue it for when initialization completes
      pendingNetlist = netlist;
      pendingSpinit = spinit;
    }
  }
};

self.postMessage({ type: 'ready' });
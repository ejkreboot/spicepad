// ngspice-worker.js

let outputBuffer = '';
let stderrBuffer = '';
let isInitialized = false;
let pendingNetlist = null;
let pendingSpinit = null;

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

function runSimulation(netlist, spinit) {
  outputBuffer = '';
  stderrBuffer = '';
  
  try {
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
      runSimulation(netlist, spinit);
    } else {
      // Queue it for when initialization completes
      pendingNetlist = netlist;
      pendingSpinit = spinit;
    }
  }
};

self.postMessage({ type: 'ready' });
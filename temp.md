# ngspice-xspice-wasm

A Docker-based build system for compiling [ngspice](http://ngspice.sourceforge.net/) with XSPICE extensions to WebAssembly (WASM) using Emscripten.

## Overview

This project provides a reproducible build environment for creating a WASM version of ngspice, a popular open-source SPICE circuit simulator. The build includes XSPICE code model support with dynamic loading capabilities, enabling the simulator to run in web browsers with support for more advanced models that use XSPICE (e.g., poly-controlled sources used in many opamp subcircuits).

## Features

- **Full ngspice compilation to WASM**: Core simulator compiled with Emscripten
- **XSPICE support**: Includes analog, digital, and mixed-signal code models
- **Dynamic code model loading**: Code models built as WASM side modules
- **Dockerized build**: Consistent, reproducible build environment
- **Automated patching**: Handles source modifications for WASM compatibility
- **Structured JavaScript API**: Simulation results returned as normalized JS objects with typed arrays

## Prerequisites

- Docker installed on your system
- Sufficient disk space (~2-3 GB for Docker image and build artifacts)

## Building

1. **Clone or navigate to this repository**:
   ```bash
   git clone ngspice-xspice-wasm
   cd ngspice-xspice-wasm
   ```

2. **Build the Docker image**:
   ```bash
   docker build -t ngspice-wasm-builder .
   ```

3. **Run the build**:
   ```bash
   docker run --rm -v $(pwd)/dist:/dist ngspice-wasm-builder
   ```

The build artifacts are placed in the `dist/` directory:

| File | Description |
|------|-------------|
| `ngspice-lib.js` | Emscripten JavaScript loader |
| `ngspice-lib.wasm` | Main ngspice WASM module |
| `ngspice-client.js` | Browser client API |
| `ngspice-worker.js` | Web Worker that drives the WASM module |
| `spinit` | ngspice initialization script |
| `*.cm` | XSPICE code model side modules |

Default WebAssembly memory settings:
- `INITIAL_MEMORY=256MB`
- `ALLOW_MEMORY_GROWTH=0`

## API

The client exposes a Promise-based API that returns structured JavaScript objects. All simulation vector data is delivered as `Float64Array` instances, transferred from the worker via zero-copy `Transferable` buffers.

### Quick start

```javascript
import { NgspiceLibraryClient, runSimulation } from './dist/ngspice-client.js';

// Option A: standalone convenience function
const result = await runSimulation(`
  V1 in 0 PULSE(0 5 0 10n 10n 1m 2m)
  R1 in out 1k
  C1 out 0 10u
  .tran 10u 10m
  .end
`);

console.log(result.analyses);

// Option B: reusable client (avoids re-initializing the WASM module)
const client = new NgspiceLibraryClient();
const result2 = await client.run(netlist, {
  onProgress: ({ progress }) => console.log(`${(progress * 100).toFixed(1)}%`),
});

// Run additional simulations on the same instance
const result3 = await client.run(anotherNetlist);

// Clean up when done
client.dispose();
```

### `SimulationResult`

The promise returned by `client.run()` (or `runSimulation()`) resolves with:

```typescript
interface SimulationResult {
  exitCode: number;              // ngspice exit code (0 = success)
  finalTime: number | null;      // parsed .tran stop time, if applicable
  progress: number;              // final progress value (0–1)
  stdout: string;                // captured stdout
  stderr: string;                // captured stderr
  analyses: NormalizedResult[];  // one entry per ngspice plot
}
```

### `NormalizedResult`

Each analysis in the `analyses` array has this shape:

```typescript
interface NormalizedResult {
  type: 'tran' | 'ac' | 'dc' | 'op' | 'noise' | 'sens' | 'tf' | 'unknown';
  sweep: SweepInfo | null;                // independent variable (time, frequency, etc.)
  vectors: VectorInfo[];                  // dependent variables
  scalars: Record<string, number> | null; // for scalar analyses (op, tf, sens)
  meta: { plotName: string };             // ngspice internal plot name
}

interface SweepInfo {
  name: string;           // e.g. "time", "frequency"
  unit: string;           // e.g. "s", "Hz"
  values: Float64Array;   // independent variable data
}

interface VectorInfo {
  name: string;           // e.g. "v(out)", "i(v1)"
  unit: string;           // e.g. "V", "A", "" if unknown
  real: Float64Array;     // real part of the data
  imag: Float64Array | null;  // imaginary part (AC analysis only)
  complex: boolean;       // true for AC analysis
}
```

#### Analysis shape by type

| Analysis | `sweep` | `vectors` | `scalars` |
|----------|---------|-----------|-----------|
| `.tran`  | time    | all signals | `null` |
| `.ac`    | frequency | complex signals | `null` |
| `.dc`    | swept source | all signals | `null` |
| `.op`    | `null`  | `[]`      | `{ "v(out)": 1.23, ... }` |
| `.tf`    | `null`  | `[]`      | `{ "Transfer_function": ..., ... }` |
| `.noise` | frequency | noise densities | `null` |

### Callbacks

Optional callbacks can be passed to `client.run()`:

```javascript
const result = await client.run(netlist, {
  onProgress: ({ progress, currentTime, finalTime }) => { },
  onStdout: (line) => { },
  onStderr: (line) => { },
  onStatus: (message) => { },
  onDebug: (data) => { },
});
```

### TypeScript

Type definitions are available at `src/types/index.d.ts`.

## Build Process

The build script performs the following steps:

1. Clones the ngspice source repository
2. Patches source files for WASM compatibility:
   - Fixes compiler warnings for Emscripten
   - Removes `getrusage` function (not available in WASM)
   - Disables Linux `/proc/meminfo` probing, which configure would otherwise enable from the Docker build environment
   - Skips ngspice's output-memory abort when the browser cannot report available system RAM
   - Removes problematic `cppduals` standard lib compound variable reassignment
3. Configures ngspice with XSPICE enabled and X11/readline/debug disabled
4. Patches Makefiles to enable dynamic linking:
   - Main module built with `-sMAIN_MODULE=1`
   - Code models built as side modules with `-sSIDE_MODULE=1`
5. Builds the native `cmpp` preprocessor
6. Compiles ngspice and all code models
7. Collects output files in `./dist`
8. Copies JavaScript client and worker into `./dist`

## Code Models

The following XSPICE code models are included:

- `spice2poly.cm` - SPICE2 polynomial models
- `digital.cm` - Digital logic models
- `analog.cm` - Analog behavioral models
- `xtradev.cm` - Extra device models
- `xtraevt.cm` - Extra event-driven models
- `table.cm` - Table-based models
- `tlines.cm` - Transmission line models

## Technical Details

- **Emscripten version**: 3.1.50
- **Build configuration**: Release build with debug disabled
- **WASM features**: Main module with dynamic linking support
- **Default WASM memory**: 256 MiB initial, growth disabled
- **No dependencies on**: OpenMP, readline, X11

## Demo

A prebuilt playground lives in [demo/index.html](demo/index.html). It uses the client/worker pair from `dist/`, plots the first analysis result on a canvas, and logs the full normalized `SimulationResult` object to the browser console.

### Run locally

From the repo root:

```bash
python -m http.server 3000
```

Open http://localhost:3000/demo/ — edit the netlist and click **Run library simulation**. The plot renders the sweep vectors; open DevTools to inspect the structured result objects.

### Notes

- Serve over HTTP(S) to avoid CORS when fetching WASM and code models.
- Each run reuses the shared ngspice instance; click **Reset ngspice** to clear state.
- The worker automatically strips `.save` and `.wrdt` directives from netlists to ensure all vectors are available for extraction.
- The build disables `/proc/meminfo` probing for WASM targets.

## Credits

- [ngspice](http://ngspice.sourceforge.net/) - Original SPICE simulator
- [Emscripten](https://emscripten.org/) - LLVM-to-WebAssembly compiler
- Source repository: [danchitnis/ngspice-sf-mirror](https://github.com/danchitnis/ngspice-sf-mirror)

## License

MIT License

Copyright (c) 2026 Eric J. Kort

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

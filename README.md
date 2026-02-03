# SpicePad

A modern, browser-based circuit simulator built with vanilla JavaScript and powered by ngspice. SpicePad provides an intuitive visual interface for designing, simulating, and analyzing electronic circuits.

## Features

### Circuit Editor
- **Visual Circuit Design**: Drag-and-drop component placement with automatic wire routing
- **Component Library**: Built-in library of common components (resistors, capacitors, inductors, voltage/current sources, etc.)
- **Custom Components**: Import and manage custom component libraries
- **Probes**: Add voltage and current probes directly on the schematic
- **Undo/Redo**: Undo/redo support
- **Auto-Save**: Automatic local storage backup of your work

### Simulation Capabilities
- **DC Sweep Analysis**: Sweep voltage/current sources and plot results
- **AC Analysis**: Frequency response analysis with Bode plots
- **Transient Analysis**: Time-domain simulation
- **Operating Point**: DC operating point calculation
- **Custom SPICE Commands**: Direct SPICE netlist editing for advanced users

### Results Visualization
- **Interactive Plots**: Powered by Plotly.js for professional-quality charts
- **Resizable Panel**: Drag the resize handle to adjust plot size
- **Multiple Plot Types**: Time-domain, frequency-domain, and X-Y plots
- **Export Options**: Download plots as images

### Symbol Editor
- Create custom component symbols with pins and primitives
- Define electrical properties and SPICE models
- Export and share symbol libraries

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd spicepad
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to the local development URL (typically `http://localhost:5173`)

### Building for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## Usage

### Creating a Circuit

1. **Add Components**: Click components from the left sidebar to place them on the canvas
2. **Wire Components**: Use the Select tool or click between component pins to create wires
3. **Add Probes**: Switch to Probe tool (P) and click on wires to add voltage probes, or on components for current probes
4. **Configure Simulation**: Click the "Simulation" button to set up analysis parameters
5. **Run**: Press the "Run" button (⌘↵) to simulate and view results

### Keyboard Shortcuts

- `S` - Select tool
- `P` - Probe tool
- `D` - Delete tool
- `⌘↵` (Cmd+Enter) - Run simulation
- `⌘Z` - Undo
- `⌘⇧Z` - Redo
- Mouse wheel - Zoom in/out
- Middle mouse drag - Pan canvas

### Resizing the Results Panel

Hover between the circuit canvas and the Results panel to reveal the resize handle (vertical dots). Click and drag left or right to adjust the panel width.

## Architecture

SpicePad is built with a clean, modular architecture:

- **CanvasViewport**: Manages canvas transforms, rendering, and viewport state
- **WireGraph**: Maintains wire topology and connectivity data
- **WireEditor**: Handles user interactions for wire editing
- **ComponentManager**: Manages component lifecycle and rendering
- **SelectionManager**: Handles selection, dragging, and multi-select operations
- **ProbeManager**: Manages voltage and current probes
- **NetlistGenerator**: Converts visual circuit to SPICE netlist
- **UndoManager**: Provides undo/redo functionality

## Technology Stack

- **Frontend**: Vanilla JavaScript (ES6+)
- **Build Tool**: Vite
- **Plotting**: Plotly.js
- **Simulation Engine**: ngspice (WebAssembly)
- **Storage**: IndexedDB (via idb-keyval)
- **Styling**: CSS3 with modern layout techniques

## Project Structure

```
spicepad/
├── src/
│   ├── circuit_editor/     # Main circuit editor
│   │   ├── CanvasViewport.js
│   │   ├── Component.js
│   │   ├── ComponentManager.js
│   │   ├── WireEditor.js
│   │   ├── WireGraph.js
│   │   ├── ProbeManager.js
│   │   ├── NetlistGenerator.js
│   │   ├── SelectionManager.js
│   │   └── UndoManager.js
│   ├── symbol_editor/      # Symbol/component editor
│   ├── common/              # Shared utilities and libraries
│   └── style.css           # Global styles
├── public/                  # Static assets and ngspice files
├── circuit_editor.html      # Circuit editor page
├── symbol_editor.html       # Symbol editor page
├── index.html              # Landing page
└── vite.config.js          # Build configuration
```

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

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


## Acknowledgments

- Built with [ngspice](http://ngspice.sourceforge.net/) for circuit simulation
- Plotting powered by [Plotly.js](https://plotly.com/javascript/)
- Icons from [Google Material Symbols](https://fonts.google.com/icons)
- Code developed with assistance from Claude Sonnet 4.5, Claude Opus 4.5, and GPT 5.1 Codex Max

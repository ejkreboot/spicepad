# X-Y Plotting Feature

## Overview
The X-Y plotting feature allows you to plot one probe signal against another, creating parametric or phase plots. This is useful for:
- Creating Lissajous patterns
- Analyzing phase relationships between signals
- Plotting parametric curves
- Visualizing IV curves (current vs. voltage)
- Creating hysteresis loops

## How to Use

### 1. Place Multiple Probes
- Add 2 or more probes to your circuit using the Probe tool (P)
- Run a transient or DC sweep simulation

### 2. Switch to X-Y Mode
After simulation completes and plots appear:
- Look for the **Standard/X-Y** toggle buttons in the plot header
- Click the **X-Y** button to enable X-Y plotting mode

### 3. Select Signals
Once in X-Y mode:
- Two dropdown menus will appear
- Select the signal for the **X-axis** from the first dropdown
- Select the signal for the **Y-axis** from the second dropdown
- The plot will automatically update

### 4. Switch Back to Standard Mode
- Click the **Standard** button to return to the traditional time-domain or DC sweep plot

## UI Components

### Plot Mode Toggle
- **Standard**: Traditional time-series or sweep plots (signal vs. time/voltage)
- **X-Y**: Parametric plots (one signal vs. another)

### Axis Selectors
- Appear only when X-Y mode is active
- Auto-populate with available probe signals
- Default to first two probes when entering X-Y mode
- Prevent selecting the same signal for both axes

## Design Features

### Intuitive UX
- Clean, minimal interface following the existing design language
- Similar to the AC analysis scale toggle (dB/V/Phase)
- Green highlight for X-Y mode to distinguish from Standard mode
- Inline dropdowns for quick signal selection

### Smart Defaults
- Automatically selects first two probes when entering X-Y mode
- Preserves signal colors from the standard plot
- Shows helpful messages for incomplete selections

### Responsive
- Real-time plot updates when changing signal selections
- Smooth transitions between Standard and X-Y modes
- Maintains plot data for quick mode switching

## Technical Implementation

### Data Storage
- Signal data is stored on each plot container element
- Enables instant mode switching without re-parsing
- Includes: xValues, signals, signalMeta, signalColors

### Plot Rendering
- `_renderStandardPlot()`: Renders traditional time/sweep plots
- `_renderXYPlot()`: Renders parametric X-Y plots
- `_updateXYPlot()`: Handles selector changes and re-rendering

### Signal Metadata
- Preserves probe labels, colors, and types (voltage/current)
- Automatically generates appropriate axis labels with units
- Supports both voltage (V) and current (A) signals

## Supported Analysis Types
- ✅ **Transient Analysis**: Time-domain signals
- ✅ **DC Sweep**: Voltage/current sweeps
- ❌ **AC Analysis**: Not supported (uses frequency domain with complex numbers)
- ❌ **Operating Point**: Not applicable (single-point analysis)

## Examples

### Lissajous Pattern
1. Create a circuit with two sinusoidal voltage sources at different frequencies
2. Place probes on both signals
3. Run transient analysis
4. Switch to X-Y mode and plot V(signal1) vs V(signal2)

### IV Curve
1. Create a circuit with a DC sweep on a voltage source
2. Place voltage probe and current probe
3. Run DC sweep
4. Switch to X-Y mode and plot I(device) vs V(device)

### Phase Portrait
1. Create an oscillator or dynamic circuit
2. Place probes on related signals (e.g., capacitor voltage and derivative)
3. Run transient analysis
4. Switch to X-Y mode to visualize the phase space trajectory

## Color Coding
- X-Y mode toggle: **Green** when active
- Standard mode toggle: **Blue** when active
- Signals retain their original probe colors
- Axis labels include signal names and units

## Browser Compatibility
Requires modern browser with support for:
- Plotly.js for rendering
- CSS flexbox for layout
- ES6 JavaScript features

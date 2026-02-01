# X-Y Plotting Test Scenarios

## Quick Test: Lissajous Pattern

This is the easiest way to test the X-Y plotting feature.

### Circuit Setup
1. Open the Circuit Editor
2. Add two AC voltage sources:
   - **V1**: AC voltage source with amplitude 1V, frequency 1kHz
   - **V2**: AC voltage source with amplitude 1V, frequency 2kHz
3. Add a ground node
4. Place two voltage probes:
   - **Probe 1** on V1's positive terminal (label it "V1")
   - **Probe 2** on V2's positive terminal (label it "V2")

### Simulation
1. Click "Simulation" button
2. Go to "Transient" tab
3. Set parameters:
   - Stop time: `5m` (5 milliseconds)
   - Step time: `10u` (10 microseconds)
4. Click "Add Transient"
5. Click "Run" button (⌘↵)

### Expected Results

#### Standard Mode (Default)
- You should see two sinusoidal waves at different frequencies
- V1 will complete ~5 cycles
- V2 will complete ~10 cycles

#### X-Y Mode
1. Click the **X-Y** button in the plot header
2. Two dropdown menus appear
3. Dropdowns should be auto-populated:
   - X-axis: "V1" (selected)
   - Y-axis: "V2" (selected)
4. The plot should show a **Lissajous figure** (figure-8 pattern)
5. Try swapping the axes:
   - Change X-axis to "V2"
   - Change Y-axis to "V1"
   - The pattern should rotate/flip

#### Switch Back
1. Click **Standard** button
2. Should return to the original time-domain plot
3. Both sine waves should be visible

---

## Advanced Test: IV Curve

### Circuit Setup
1. Create a simple resistor circuit:
   - **V1**: DC voltage source (parameter sweep source)
   - **R1**: 1kΩ resistor
   - Ground
2. Connect V1 → R1 → Ground
3. Place probes:
   - **Voltage probe** across R1 (label "V_R1")
   - **Current probe** through R1 (label "I_R1")

### Simulation
1. Click "Simulation" button
2. Go to "DC Sweep" tab
3. Set parameters:
   - Source Name: `V1`
   - Start: `0`
   - Stop: `5`
   - Step: `0.1`
4. Click "Add DC Sweep"
5. Click "Run"

### Expected Results

#### Standard Mode
- Two traces: one for voltage, one for current
- Both should increase linearly with DC sweep
- Current trace will use secondary Y-axis (right side)

#### X-Y Mode
1. Click **X-Y** button
2. Select:
   - X-axis: "V_R1" (voltage)
   - Y-axis: "I_R1" (current)
3. Should see a **perfect straight line** (Ohm's law: V = IR)
4. Slope = 1/R = 1/1000 = 0.001 A/V

---

## Edge Cases to Test

### 1. Only One Probe
- Place only 1 probe
- Run simulation
- X-Y mode toggle should still appear
- Selecting X-Y mode should show message about selecting signals

### 2. Same Signal on Both Axes
- Select same signal for X and Y
- Should show warning: "Please select different signals for X and Y axes"

### 3. Mode Switching Performance
- Run simulation
- Rapidly toggle between Standard and X-Y modes
- Should be instant (no re-computation)
- Plots should remain smooth

### 4. AC Analysis
- Run an AC analysis
- X-Y mode toggle should **NOT** appear
- Only the dB/V/Phase scale toggle should be visible

### 5. Operating Point
- Run an operating point analysis
- X-Y mode toggle should **NOT** appear
- Only plot export button should be visible

---

## Visual Verification Checklist

### UI Elements
- [ ] X-Y mode toggle appears for Transient and DC Sweep only
- [ ] Standard button is blue when active
- [ ] X-Y button is green when active
- [ ] Dropdowns are hidden in Standard mode
- [ ] Dropdowns are visible in X-Y mode
- [ ] Dropdown styling matches the app theme (dark mode)

### Functionality
- [ ] Dropdowns auto-populate with probe labels
- [ ] First two probes are selected by default
- [ ] Plot updates immediately when changing selections
- [ ] Error messages appear for invalid selections
- [ ] Mode switching preserves data (no flicker/reload)
- [ ] Plot export works in both modes

### Plot Quality
- [ ] X-Y plots use correct axis labels (with units)
- [ ] Signal colors are preserved from probes
- [ ] Grid and styling match standard plots
- [ ] Plot is responsive and fills the area
- [ ] Legend is not shown in X-Y mode (redundant)

---

## Performance Test

### Large Dataset
1. Create circuit with 2 probes
2. Run transient with:
   - Stop time: `100m` (100ms)
   - Step time: `1u` (1 microsecond)
   - This generates ~100,000 data points
3. Switch between modes
4. Should handle smoothly (may take 1-2 seconds for initial render)

---

## Known Limitations

1. **AC Analysis**: Not supported due to complex number format
2. **Operating Point**: Not applicable (single-point data)
3. **3D Plots**: Not supported (only 2D X-Y)
4. **Multiple Traces**: Can only plot one pair at a time in X-Y mode
5. **Time Reference**: Lost in X-Y mode (parametric plot has no time axis)

---

## Troubleshooting

### Dropdowns are Empty
- Check that simulation completed successfully
- Verify probes are connected to nodes
- Look for errors in console

### Plot Not Updating
- Check browser console for Plotly errors
- Ensure Plotly.js is loaded
- Try refreshing the page

### Wrong Axis Labels
- Verify probe types (voltage vs. current)
- Check that probe labels are set correctly
- Ensure netlist generation included all probes

### Performance Issues
- Reduce number of data points
- Increase step time in simulation settings
- Close other browser tabs
- Check if Plotly responsive mode is enabled


---
templateKey: blog-post
title: "Building an Advanced Real-Time EEG Analysis App with Flask and BrainFlow"
date: 2024-09-27T19:09:37.340Z
description: "A comprehensive guide to creating a real-time EEG analysis and visualization app using Flask, BrainFlow, and PiEEG, with a focus on hardware integration and data streaming."
featuredpost: true
featuredimage: /img/eeg_advanced_app.png
tags:
  - bci
  - eeg
  - signal-processing
  - flask
  - brainflow
  - brain-computer-interface
  - python
  - gpio
---

# Building an Advanced Real-Time EEG Analysis App with Flask and BrainFlow

## Introduction: The Brain-Computer Frontier

Ever wondered what it would be like to see your thoughts come to life as real-time data? It might sound futuristic, but with today’s technology, brain-computer interfaces (BCIs) are becoming a reality for researchers and enthusiasts alike. In this guide, we’re diving deep into the process of creating a fully functional, real-time EEG (Electroencephalography) analysis and visualization app using **Flask**, **BrainFlow**, and **PiEEG**.

This isn’t just a project that stops at theory. By the end of this tutorial, you’ll have a tangible system capable of acquiring, processing, and displaying your brain’s electrical activity in an interactive web interface.

We’re building on the foundation laid in our previous post, where we explored the basics of EEG signal acquisition. This time, we’re taking it up a notch by creating a complete real-time analysis system that ties together hardware, data processing, and dynamic visualization—all running on a Raspberry Pi.

---

## Part 1: Setting Up the Raspberry Pi and Installing Dependencies

### 1.1. Preparing the Raspberry Pi

To build this EEG app, we’ll use a **Raspberry Pi** as the central processing hub. The PiEEG board, which captures the raw EEG signals, will be connected directly to the GPIO pins on the Pi. Setting up the environment correctly is crucial for a smooth development experience.

1. **Update and Upgrade Your Raspberry Pi**: Start by ensuring your Pi is up to date with the latest system packages:

    ```bash
    sudo apt-get update
    sudo apt-get upgrade -y
    ```

2. **Install Essential Libraries**: Install the necessary libraries and tools, including Python, CMake, and the build utilities required for compiling BrainFlow.

    ```bash
    sudo apt-get install -y git python3 python3-pip python3-venv build-essential cmake libusb-1.0-0-dev
    ```

3. **Set Up a Virtual Environment**: Create a Python virtual environment to keep project dependencies organized.

    ```bash
    python3 -m venv eeg_env
    source eeg_env/bin/activate
    ```

### 1.2. Installing BrainFlow for EEG Data Acquisition

BrainFlow is a powerful library designed to work with various biosensors, including the PiEEG board. We’ll clone the repository and install the Python package.

```bash
# Clone BrainFlow repository
git clone https://github.com/brainflow-dev/brainflow.git

# Install the BrainFlow package
cd brainflow/python-package
python setup.py install
```

### 1.3. Installing Flask and Supporting Libraries

Flask will serve as the backbone of our application. It handles HTTP requests, serves our front-end, and manages WebSocket connections.

```bash
pip install flask flask-socketio eventlet numpy
```

### 1.4. Configuring SPI and GPIO on the Raspberry Pi

To communicate with the PiEEG board, we need to configure the Raspberry Pi’s **SPI** interface and set up GPIO.

1. **Enable the SPI Interface**:

    ```bash
    sudo raspi-config
    ```
    Navigate to **Interface Options** > **SPI** > **Yes**.

2. **Verify the SPI Configuration**: After rebooting, confirm that the SPI module is active:

    ```bash
    lsmod | grep spi
    ```

3. **Set Up GPIO in the Code**:

    **Include your GPIO and SPI setup code here:**

    ```
    # PLACEHOLDER: Insert your GPIO and SPI configuration code from `app.py`.
    ```


---

## Part 2: Implementing the Flask Server and Real-Time Data Acquisition

### 2.1. Setting Up the Flask Server

With the Raspberry Pi environment configured, it’s time to implement the Flask server. The server will handle HTTP requests, manage WebSocket connections, and stream real-time EEG data to the front-end. We’ll start by setting up the core Flask application.

**Insert the main Flask server setup here:**

```
#v0.1a
import logging
import json
from flask import Flask, render_template, request, jsonify, Response
import spidev
import gpiod
import threading
import time
from scipy.signal import butter, filtfilt, iirnotch
import numpy as np
from flask_socketio import SocketIO, emit
from brainflow.board_shim import BoardShim, BrainFlowInputParams, BoardIds, BrainFlowError
from brainflow.data_filter import DataFilter, FilterTypes, DetrendOperations
import os
import asyncio
import inspect
import sqlite3
import base64

# Configure logging
logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
socketio = SocketIO(app)

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    running = False
    collected_data = [[] for _ in range(enabled_channels)]
    socketio.run(app, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)
```

### 2.2. Establishing a Connection with the PiEEG Board Using BrainFlow

BrainFlow makes it easy to capture and process biosensor data. In this step, we’ll implement the connection logic to initialize the PiEEG board and prepare it for data acquisition.

**Insert the BrainFlow setup code here:**

```
# BrainFlow specific settings
params = BrainFlowInputParams()
params.serial_port = '/dev/spidev0.0'

def cleanup_spi_gpio():
    global spi, chip, line
    try:
        logging.info("Cleaning up SPI and GPIO...")
        if spi:
            spi.close()
            spi = None
            logging.info("SPI closed.")
        if line:
            line.release()
            line = None
            logging.info("GPIO line released.")
        if chip:
            chip.close()
            chip = None
            logging.info("GPIO chip closed.")
    except Exception as e:
        logging.error(f"SPI and GPIO cleanup error: {e}")

def check_gpio_conflicts():
    try:
        # Attempt to open the GPIO line to see if it's already in use
        test_chip = gpiod.Chip('/dev/gpiochip0')
        test_line = test_chip.get_line(26)
        test_line.request(consumer="test", type=gpiod.LINE_REQ_EV_FALLING_EDGE)
        test_line.release()
        test_chip.close()
        return False  # No conflicts
    except Exception:
        return True  # Conflicts detected

# Initialize the variables
enabled_channels = 8  # Default to 8 channels enabled
ref_enabled = True  # Default to REF enableds
biasout_enabled = True  # Default to BIASOUT enabled
fs = 250  # Sampling frequency
bandpass_enabled = False
baseline_correction_enabled = False

# Set up 8 ch for read data
collected_data = []

calibration_values = [0] * 8

```

### 2.3. Implementing Real-Time Data Streaming

Real-time EEG data streaming is the core functionality of this application. We’ll use WebSockets to send data continuously from the Flask backend to the front-end. This ensures that the EEG data is visualized without lag or delay.

**Insert the `read_eeg_data_brainflow()` function here:**

```
def read_eeg_data_brainflow():
    global collected_data
    try:
        board = BoardShim(BoardIds.PIEEG_BOARD.value, params)
        board.prepare_session()
        board.start_stream(45000, '')

        while running:
            data = board.get_current_board_data(fs)
            eeg_channels = BoardShim.get_eeg_channels(BoardIds.PIEEG_BOARD.value)
            data_transposed = data[eeg_channels, :]

            logging.info(f"Raw BrainFlow data: {data_transposed}")

            if data_transposed.size == 0:
                logging.error("No data retrieved from BrainFlow")
                continue

            # Apply BrainFlow filters if enabled
            if bandpass_enabled:  # Assume this variable is set based on the checkbox
                for channel in eeg_channels:
                    try:
                        DataFilter.detrend(data_transposed[channel], DetrendOperations.CONSTANT.value)
                        DataFilter.perform_bandpass(data_transposed[channel], BoardShim.get_sampling_rate(BoardIds.PIEEG_BOARD.value), 3.0, 45.0, 2, FilterTypes.BUTTERWORTH_ZERO_PHASE, 0)
                        DataFilter.perform_bandstop(data_transposed[channel], BoardShim.get_sampling_rate(BoardIds.PIEEG_BOARD.value), 48.0, 52.0, 2, FilterTypes.BUTTERWORTH_ZERO_PHASE, 0)
                        DataFilter.perform_bandstop(data_transposed[channel], BoardShim.get_sampling_rate(BoardIds.PIEEG_BOARD.value), 58.0, 62.0, 2, FilterTypes.BUTTERWORTH_ZERO_PHASE, 0)
                    except Exception as e:
                        logging.error(f"Error applying filters to channel {channel}: {e}")

            # Apply baseline correction if enabled
            if baseline_correction_enabled:  # Assume this variable is set based on the checkbox
                for idx in range(len(eeg_channels)):
                    data_transposed[idx] -= calibration_values[idx]

            # Normalize REF channel if necessary
            ref_channel_index = 0  # Assuming REF channel is the first in eeg_channels
            ref_values = data_transposed[ref_channel_index]
            ref_mean = ref_values.mean()
            ref_std = ref_values.std()

            logging.info(f"REF Channel - Mean: {ref_mean}, Std Dev: {ref_std}")

            # Normalize if the mean is significantly higher than expected
            if ref_mean > 1000:  # This threshold can be adjusted based on expected range
                data_transposed[ref_channel_index] = (ref_values - ref_mean) / ref_std
                logging.info(f"Normalized REF Channel - Mean: {data_transposed[ref_channel_index].mean()}, Std Dev: {data_transposed[ref_channel_index].std()}")

            data_transposed = data_transposed.tolist()  # Convert to list for easier processing
            
            # Reset collected_data for each new read
            collected_data = [[] for _ in range(len(eeg_channels))]
            
            for idx, channel_data in enumerate(data_transposed):
                collected_data[idx].extend(channel_data)
                
            logging.info(f"Processed BrainFlow data: {data_transposed}")
            
            socketio.emit('update_data', {
                'raw': [channel[0] for channel in data_transposed]  # Send only the latest data points
            })
            time.sleep(1)

        board.stop_stream()
        board.release_session()
    except BrainFlowError as e:
        logging.error(f"BrainFlow error: {str(e)}")
    except Exception as e:
        logging.error(f"Unexpected error: {e}")
```

### 2.4. Adding Start & Stop Analysis 
To provide users with complete control over the streaming process, lets add routes to start and stop EEG analysis. 

**Insert the `start-analysis` and `/stop-analysis` function here:**

```
@app.route('/start-analysis', methods=['POST'])
def start_analysis():
    global running
    running = True
    cleanup_spi_gpio()  # Ensure no conflicts before starting BrainFlow

    if check_gpio_conflicts():
        return jsonify({"status": "GPIO conflict detected. Please resolve before starting BrainFlow."}), 409
    
    threading.Thread(target=read_eeg_data_brainflow, daemon=True).start()

@app.route('/stop-analysis', methods=['POST'])
def stop_analysis():
    global running
    running = False
    time.sleep(1)  # Ensure threads have time to exit
    cleanup_spi_gpio()
    socketio.emit('analysis_stopped')  # Notify frontend to update the settings
    return jsonify({"status": "Analysis stopped"})
```

### 2.5. Adding Advanced Data Processing Options

To provide users with more control over the data, lets add a route to update settings for advanced filtering options like **baseline correction** and **bandpass filtering**. These options should be configurable through the front-end and applied dynamically during data streaming.

**Insert the `update_settings()` function here:**

```
@app.route('/update-settings', methods=['POST'])
def update_settings():
    global lowcut, highcut, order, baseline_correction_enabled, enabled_channels, ref_enabled, biasout_enabled, bandpass_enabled, smoothing_enabled, acquisition_method
    data = request.json
    lowcut = float(data.get('lowcut', lowcut))
    highcut = float(data.get('highcut', highcut))
    order = int(data.get('order', order))
    baseline_correction_enabled = data.get('baseline_correction_enabled', baseline_correction_enabled)
    enabled_channels = int(data.get('enabled_channels', enabled_channels))
    ref_enabled = data.get('ref_enabled', ref_enabled)
    biasout_enabled = data.get('biasout_enabled', biasout_enabled)
    bandpass_enabled = data.get('bandpass_filter_enabled', bandpass_enabled)
    smoothing_enabled = data.get('smoothing_enabled', smoothing_enabled)
    logging.info(f"Updated settings: lowcut={lowcut}, highcut={highcut}, order={order}, baseline_correction_enabled={baseline_correction_enabled}, enabled_channels={enabled_channels}, ref_enabled={ref_enabled}, biasout_enabled={biasout_enabled}, bandpass_enabled={bandpass_enabled}, smoothing_enabled={smoothing_enabled}")
    return jsonify({"status": "Settings updated"})
```

### 2.5. Managing Calibration and Signal Integrity

Calibration routines help establish a reliable baseline, reducing noise and ensuring accurate readings. Implement a dedicated route and function for calibrating the PiEEG board, allowing users to optimize signal quality before starting the data acquisition.

**Insert the calibration function here:**

```
def calibrate():
    global calibration_values
    try:
        logging.info("Starting calibration process")
        board = BoardShim(BoardIds.PIEEG_BOARD.value, params)
        board.prepare_session()
        board.start_stream(45000, '')

        calibration_duration = 5  # seconds
        calibration_data = [[] for _ in range(enabled_channels)]

        start_time = time.time()
        while time.time() - start_time < calibration_duration:
            data = board.get_current_board_data(250)
            eeg_channels = BoardShim.get_eeg_channels(BoardIds.PIEEG_BOARD.value)
            data_transposed = data[eeg_channels, :]

            if data_transposed.size == 0:
                logging.error("No data retrieved from BrainFlow")
                continue

            for idx, channel_data in enumerate(data_transposed):
                calibration_data[idx].extend(channel_data)

        calibration_values = [np.mean(ch_data) for ch_data in calibration_data]
        logging.info(f"BrainFlow calibration values: {calibration_values}")

        board.stop_stream()
        board.release_session()

    except BrainFlowError as e:
        logging.error(f"BrainFlow calibration error: {str(e)}")
    except Exception as e:
        logging.error(f"Unexpected calibration error: {e}")
```

### 2.6. Implementing Data Export

Data export allows users to save their EEG recordings for offline analysis. This is crucial for researchers or enthusiasts who want to study their sessions in-depth.

**Insert the `export_data` route here:**

```
# Function to create CSV data
def create_csv(data):
    import csv
    import io
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Channel' + str(i+1) for i in range(len(data))])
    for row in zip(*data):
        writer.writerow(row)
    output.seek(0)
    return output.getvalue()

@app.route('/export-data')
def export_data():
    try:
        num_rows = int(request.args.get('num_rows', 5000))
        if num_rows > len(collected_data[0]):
            num_rows = len(collected_data[0])
        csv_data = create_csv([ch[:num_rows] for ch in collected_data])
        return Response(
            csv_data,
            mimetype='text/csv',
            headers={'Content-Disposition': 'attachment;filename=eeg_data.csv'}
        )
    except Exception as e:
        logging.error(f"Error exporting data: {e}")
        return Response(
            "Internal Server Error",
            status=500
        )

@socketio.on('set_file_path')
def set_file_path(file_content):
    global experiment_file_path, experiment_event
    print("Received file content, length:", len(file_content))
    # Save the file content to a temporary file
    temp_file_path = 'temp_data.csv'
    with open(temp_file_path, 'w') as f:
        f.write(file_content)
    
    print(f"Saved file content to {temp_file_path}")
    
    experiment_file_path = temp_file_path
    experiment_event.set()  # Signal that the file is ready

```
---

## Part 3: Building the Front-End Interface and Integrating with the Flask Server

### 3.1. Designing the HTML Structure

The front-end is where users will interact with the EEG analysis app, configure settings, and visualize brainwave data in real time. We’ll start by building a clean and intuitive interface using HTML.

**Insert your complete `index.html` file here:**

```
<!-- v0.1a-->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>EEG Data</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://cdn.socket.io/4.0.0/socket.io.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="static/js/app.js"></script>
    <link rel="stylesheet" href="static/styles.css">
</head>
<body>
    <div class="container">
        <h1>EEG Data</h1>
        <canvas id="eegChart"></canvas>
        <div class="controls">
            <button id="startBtn" onclick="startAnalysis()">Start Analysis</button>
            <button id="stopBtn" onclick="stopAnalysis()" disabled>Stop Analysis</button>
            <button id="calibrateBtn" onclick="startCalibration()">Start Calibration</button>
            <button id="exportBtn" onclick="exportData()">Export Data</button>
        </div>
        <div class="section">
            <h2>Channel Settings</h2>
            <label for="enabled_channels">Enabled Channels:</label>
            <input type="number" id="enabled_channels" name="enabled_channels" min="1" max="8" value="8" oninput="updateSettings()">
            <span id="enabledChannelsValue">8</span>
            <br>
            <label for="ref_enabled">REF Enabled:</label>
            <input type="checkbox" id="ref_enabled" name="ref_enabled" checked onchange="updateSettings()">
            <br>
            <label for="biasout_enabled">BIASOUT Enabled:</label>
            <input type="checkbox" id="biasout_enabled" name="biasout_enabled" checked onchange="updateSettings()">
        </div>
        <div class="section">
            <h2>Advanced Settings</h2>
            <label for="baseline_correction_enabled">Baseline Correction:</label>
            <input type="checkbox" id="baseline_correction_enabled" name="baseline_correction_enabled" checked onchange="updateSettings()">
            <br>
            <label for="bandpass_filter_enabled">Bandpass Filter:</label>
            <input type="checkbox" id="bandpass_filter_enabled" name="bandpass_filter_enabled" onchange="updateSettings()">
        </div>
        <div class="section">
            <h2>Channels</h2>
            <div class="color-box" data-label="REF" style="background-color: red;"></div>
            <div class="color-box" data-label="BIASOUT" style="background-color: black;"></div>
            <div class="color-box" data-label="Ch1" style="background-color: yellow;"></div>
            <div class="color-box" data-label="Ch2" style="background-color: orange;"></div>
            <div class="color-box" data-label="Ch3" style="background-color: brown;"></div>
            <div class="color-box" data-label="Ch4" style="background-color: green;"></div>
            <div class="color-box" data-label="Ch5" style="background-color: purple;"></div>
            <div class="color-box" data-label="Ch6" style="background-color: blue;"></div>
            <div class="color-box" data-label="Ch7" style="background-color: grey;"></div>
            <div class="color-box" data-label="Ch8" style="background-color: white;"></div>
        </div>
    </div>
</body>
</html>

```

### 3.2. Adding Styles for a Professional Look

Use CSS to style the interface, making it visually appealing and easy to navigate. Proper styling enhances usability and provides a better overall user experience.

**Insert your complete `styles.css` file here:**

```
body {
    background-color: #121212;
    color: #e0e0e0;
    font-family: Arial, sans-serif;
}
.container {
    width: 90%;
    max-width: 1200px;
    margin: auto;
    padding: 20px;
}
canvas {
    width: 100%;
    height: 400px;
}
.controls {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}
.controls > * {
    flex: 1;
}
.section {
    border: 1px solid #444;
    padding: 10px;
    margin-bottom: 10px;
}
button {
    padding: 10px;
    background-color: #1e88e5;
    color: white;
    border: none;
    cursor: pointer;
}
button:disabled {
    background-color: #444;
}
label, input, select {
    display: block;
    margin: 5px 0;
}
input[type="range"] {
    width: 100%;
}
.color-box {
    width: 20px;
    height: 20px;
    display: inline-block;
    cursor: pointer;
}
@media (max-width: 600px) {
    .controls {
        flex-direction: column;
    }
}
.popup {
    display: none;
    position: fixed;
    z-index: 1000;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.8);
    overflow: auto;
}

.popup-content {
    background-color: #333;
    margin: 2% auto;
    padding: 20px;
    border: 1px solid #555;
    width: 90%;
    max-width: 1600px;
    max-height: 95vh;
    overflow: auto;
    display: flex;
    flex-direction: column;
    color: #fefefe;
}

.plot-container {
    flex-grow: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;
}

#plotImage {
    max-width: 100%;
    max-height: 70vh;
    object-fit: contain;
    border: 1px solid #555;
}

.close {
    color: #ccc;
    float: right;
    font-size: 28px;
    font-weight: bold;
    cursor: pointer;
}

.close:hover,
.close:focus {
    color: #fff;
    text-decoration: none;
    cursor: pointer;
}

body.popup-active {
    overflow: hidden;
}

#plotStats {
    margin-top: 20px;
    overflow-x: auto;
}

#plotStats table {
    width: 100%;
    border-collapse: collapse;
}

#plotStats th, #plotStats td {
    border: 1px solid #555;
    padding: 8px;
    text-align: left;
}

#plotStats th {
    background-color: #444;
    color: #fefefe;
}

#plotStats td {
    background-color: #555;
    color: #fefefe;
}

/* New styles for the terminal window */
.terminal-window {
    background-color: #000;
    color: #0f0;
    font-family: monospace;
    padding: 10px;
    border-radius: 5px;
    margin-top: 20px;
    border: 1px solid #0f0;
}

.terminal-header {
    background-color: #0f0;
    padding: 5px;
    border-top-left-radius: 5px;
    border-top-right-radius: 5px;
}

.terminal-title {
    color: #000;
    font-weight: bold;
}

.terminal-content {
    height: 200px;
    overflow-y: auto;
    padding: 10px;
}

.terminal-content::-webkit-scrollbar {
    width: 8px;
}

.terminal-content::-webkit-scrollbar-track {
    background: #000;
}

.terminal-content::-webkit-scrollbar-thumb {
    background-color: #0f0;
    border-radius: 4px;
}

/* New styles for enroll brainwaves */
.enrollBrainwavesPopup {
    display: none;
    position: fixed;
    z-index: 1000;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.8);
    overflow: auto;
    justify-content: center;
    align-items: center;
}

.enrollBrainwavesPopup-content {
    background-color: #333;
    margin: 2% auto;
    padding: 20px;
    border: 1px solid #555;
    width: 60%; /* Reduce width to make it more square */
    max-width: 1000px;
    height: 70%; /* Increase height */
    max-height: 80vh;
    overflow: auto;
    display: flex;
    flex-direction: column;
    color: #fefefe;
    border-radius: 10px;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
}

.enrollBrainwavesHeader {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #555;
    padding-bottom: 10px;
    margin-bottom: 20px;
}

.enrollBrainwavesHeader h2 {
    margin: 0;
}

.close {
    font-size: 28px;
    font-weight: bold;
    color: #fefefe;
    cursor: pointer;
}

.close:hover,
.close:focus {
    color: #bbb;
    text-decoration: none;
    cursor: pointer;
}

.instruction, .visual, .progress-bar {
    margin-bottom: 20px;
}

#enrollBrainwavesInstruction {
    font-size: 24px;
    margin-bottom: 20px;
}

.visual {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    flex-grow: 1; /* Allow the visual element to grow */
}

.visual-element {
    max-width: 100%;
    max-height: 100%; /* Allow the visual element to take full available space */
    margin-bottom: 20px;
}

#embeddedPlotsContainer {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
}

.plotDiv {
    margin: 10px;
    text-align: center;
}

#textDisplay {
    font-size: 48px;
    font-weight: bold;
}


```

### 3.3. Implementing the JavaScript for Real-Time Interactivity

JavaScript is the backbone of the front-end interactivity. It manages WebSocket connections, updates the chart in real time, and handles user input. The script needs to ensure seamless communication with the Flask server, dynamically updating the chart based on incoming data.

**Insert your complete `app.js` file here:**

```
document.addEventListener("DOMContentLoaded", function () {
    ctx = document.getElementById('eegChart').getContext('2d');
    updateSettings(); // Required to clean up settings on first run.


    const colorBoxes = document.querySelectorAll('.color-box');
    colorBoxes.forEach(box => {
        box.addEventListener('click', function () {
            const label = this.getAttribute('data-label');
            const dataset = eegChart.data.datasets.find(ds => ds.label === label);
            if (dataset) {
                dataset.hidden = !dataset.hidden;
                eegChart.update();
            }
        });
    });
});

const socket = io();

let ctx;
let eegChart;

const colors = {
    ref: 'red',
    biasout: 'black',
    ch1: 'yellow',
    ch2: 'orange',
    ch3: 'brown',
    ch4: 'green',
    ch5: 'purple',
    ch6: 'blue',
    ch7: 'grey',
    ch8: 'white'
};

function createChart() {
    if (eegChart) {
        eegChart.destroy();
    }
    const datasets = [];
    const enabledChannels = parseInt(document.getElementById('enabled_channels').value, 10);
    if (document.getElementById('ref_enabled').checked) {
        datasets.push({
            label: 'REF',
            data: [],
            borderColor: colors.ref,
            fill: false
        });
    }
    if (document.getElementById('biasout_enabled').checked) {
        datasets.push({
            label: 'BIASOUT',
            data: [],
            borderColor: colors.biasout,
            fill: false
        });
    }
    for (let i = 0; i < enabledChannels; i++) {
        datasets.push({
            label: `Ch${i + 1}`,
            data: [],
            borderColor: colors[`ch${i + 1}`],
            fill: false
        });
    }
    eegChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: datasets
        },
        options: {
            animation: false,
            scales: {
                x: { type: 'linear', position: 'bottom' },
                y: { type: 'linear' }
            }
        }
    });
}

socket.on('update_data', function (data) {
    if (eegChart.data.labels.length > 100) {
        eegChart.data.labels.shift();
        eegChart.data.datasets.forEach(dataset => dataset.data.shift());
    }
    eegChart.data.labels.push(Date.now());
    eegChart.data.datasets.forEach((dataset, index) => {
        if (data.raw && data.raw.length > index) {
            dataset.data.push({ x: Date.now(), y: data.raw[index] });
        }
    });
    eegChart.update();
});

socket.on('analysis_stopped', function () {
    const acquisition_method = document.getElementById('acquisition_method').value;
    if (acquisition_method === "brainflow") {
        disableSpiSettings(); //Disable settings that are not used by BrainFlow.
    }
});

function startAnalysis() {
    disableControls(true);
    fetch('/start-analysis', { method: 'POST' }).then(response => {
        if (response.status === 409) {
            response.json().then(data => alert(data.status));
            disableControls(false);
        }
    });
}

function stopAnalysis() {
    disableControls(false);
    fetch('/stop-analysis', { method: 'POST' });
}

function startCalibration() {
    disableControls(true);
    const btn = document.getElementById('calibrateBtn');
    btn.innerText = 'Calibrating...';
    fetch('/calibrate', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            alert('Calibration completed: ' + data.values);
            btn.innerText = 'Start Calibration';
            disableControls(false);
        })
        .catch(error => {
            alert('Calibration failed: ' + error);
            btn.innerText = 'Start Calibration';
            disableControls(false);
        });
}

function updateSettings() {
    const baseline_correction_enabled = document.getElementById('baseline_correction_enabled').checked;
    const enabled_channels = document.getElementById('enabled_channels').value;
    const ref_enabled = document.getElementById('ref_enabled').checked;
    const biasout_enabled = document.getElementById('biasout_enabled').checked;
    const bandpass_filter_enabled = document.getElementById('bandpass_filter_enabled').checked;

    document.getElementById('enabledChannelsValue').innerText = enabled_channels;

    createChart();

    fetch('/update-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({

            baseline_correction_enabled,
            enabled_channels,
            ref_enabled,
            biasout_enabled,
            bandpass_filter_enabled,
        })
    });

    if (acquisition_method === "brainflow") {
        disableSpiSettings();
    } else {
        enableSpiSettings();
    }
}

function disableControls(disable) {
    document.getElementById('startBtn').disabled = disable;
    document.getElementById('stopBtn').disabled = !disable;
    document.getElementById('calibrateBtn').disabled = disable;
    document.getElementById('exportBtn').disabled = disable;
    document.getElementById('baseline_correction_enabled').disabled = disable;
    document.getElementById('enabled_channels').disabled = disable;
    document.getElementById('ref_enabled').disabled = disable;
    document.getElementById('biasout_enabled').disabled = disable;
    document.getElementById('bandpass_filter_enabled').disabled = disable;
}


function exportData() {
    const numRows = prompt("Enter the number of rows to export:", 5000);
    fetch(`/export-data?num_rows=${numRows}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'eeg_data.csv';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        })
        .catch(err => console.error('Error exporting data:', err));
}

document.addEventListener("DOMContentLoaded", function () {
    const colorBoxes = document.querySelectorAll('.color-box');
    colorBoxes.forEach(box => {
        box.addEventListener('click', function () {
            const label = this.getAttribute('data-label');
            const dataset = eegChart.data.datasets.find(ds => ds.label === label);
            if (dataset) {
                dataset.hidden = !dataset.hidden;
                eegChart.update();
            }
        });
    });
});

function openFileDialog(fileTypes) {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = fileTypes.map(type => `.${type[1].split('.')[1]}`).join(',');
        input.onchange = e => {
            if (e.target.files.length > 0) {
                resolve(e.target.files[0]);
            } else {
                reject(new Error('No file selected'));
            }
        };
        input.click();
    });
}

socket.on('file_ready', function(data) {
    console.log('File is ready:', data);
    // You can add any client-side logic here that needs to run when the file is ready
});

let originalBodyOverflow;


function fetchAndGeneratePlots(sessionId) {
    console.log('Fetching features for session:', sessionId);

    fetch(`/get_features/${sessionId}`)
        .then(response => {
            console.log('Response status:', response.status);
            console.log('Response headers:', response.headers);
            if (!response.ok) {
                throw new Error('Network response was not ok ' + response.statusText);
            }
            return response.json();
        })
        .then(data => {
            console.log('Received data:', data);

            if (data.length === 0) {
                console.error('No features found for session:', sessionId);
                return;
            }

            const container = document.getElementById('embeddedPlotsContainer');
            container.innerHTML = '';  // Clear any existing content

            data.forEach(item => {
                const [taskName, encodedFeatures] = item;

                console.log('Processing task:', taskName);
                console.log('Encoded features:', encodedFeatures);

                // Decode the base64-encoded features
                const decodedFeatures = new Float64Array(
                    atob(encodedFeatures).split('').map(char => char.charCodeAt(0))
                );

                console.log('Decoded features:', decodedFeatures);

                // Generate the plot using the decoded features
                const plotData = generatePlotData(decodedFeatures);

                console.log('Generated plot data:', plotData);

                // Create a new div for the plot and title
                const plotDiv = document.createElement('div');
                plotDiv.className = 'plotDiv';

                const plotTitleElement = document.createElement('h3');
                plotTitleElement.textContent = taskName;
                plotDiv.appendChild(plotTitleElement);

                // Create and append the plot image
                const plotCanvas = document.createElement('canvas');
                plotDiv.appendChild(plotCanvas);

                // Append the plot div to the container
                container.appendChild(plotDiv);

                // Render the chart
                new Chart(plotCanvas, plotData);
            });
        })
        .catch(error => console.error('Error fetching features:', error));
}

function generatePlotData(features) {
    console.log('Generating plot data for features:', features);

    // Use Chart.js to generate the plot
    const data = {
        labels: [...Array(features.length).keys()],
        datasets: [{
            label: 'EEG Data',
            data: features,
            borderColor: 'rgba(75, 192, 192, 1)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            fill: false,
            tension: 0.1
        }]
    };

    const config = {
        type: 'line',
        data: data,
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: 'EEG Data Plot'
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Sample'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Amplitude'
                    }
                }
            }
        }
    };

    return config;
}


socket.on('connect', function() {
    console.log('Connected to server');
});

socket.on('disconnect', function() {
    console.log('Disconnected from server');
});

```

### 3.4. Explanation of Key JavaScript Functions

1. **WebSocket Listeners**: The JavaScript listens for incoming data and updates the chart accordingly.
2. **Dynamic Chart Updates**: Each time new data arrives, the chart is updated in real time.
3. **User Input Handling**: Users can start/stop the analysis, change channels, and configure filters from the interface.

---

## Part 4: Testing, Debugging, and Optimizing the Application

### 4.1. Running the Application

With both the backend and front-end components set up, it’s time to run the complete EEG analysis application. Start the Flask server and open the web interface to see the real-time EEG data visualization.

1. **Start the Flask Server**:

    ```bash
    python main.py
    ```

2. **Access the Web Interface**:
   Open your web browser and go to `http://<your-raspberry-pi-ip>:5000`.

3. **Interacting with the Interface**:
   Use the controls to start/stop the analysis, configure settings, and observe the real-time EEG data on the chart.

### 4.2. Final Testing Checklist

- **Real-Time Data Accuracy**: Verify that the EEG data displayed matches expected patterns (e.g., alpha and beta waves).
- **Interface Responsiveness**: Ensure that all buttons and controls respond quickly to user inputs.
- **Data Export**: Test the CSV export functionality with different session lengths.

---

## Conclusion

Congratulations! You’ve successfully built a real-time EEG analysis app using Flask, BrainFlow, and PiEEG. This project showcases the power of open-source tools and hardware in creating complex biosignal applications.

With a fully functioning system, you can now explore advanced use cases like neurofeedback, brain-computer interaction, or integrating machine learning models for cognitive state classification.

**Next Steps**: Expand the project by adding more channels, exploring machine learning models, or developing custom neurofeedback protocols.

---


---
templateKey: blog-post
title: "Building an Advanced Real-Time EEG Analysis App with Flask and BrainFlow"
date: 2024-09-27T19:09:37.340Z
description: "A comprehensive guide to creating a real-time EEG analysis and visualization app using Flask, BrainFlow, and PiEEG."
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
---

![Advanced EEG Analysis App](/img/eeg_advanced_app.png)

## Introduction

Welcome to the ultimate guide for building an advanced real-time EEG analysis application. In this step-by-step tutorial, we’ll use the **Flask** web framework, **BrainFlow**, and a **PiEEG** board to build a robust EEG analysis and visualization system.

### Prerequisites

- **Raspberry Pi 4 or 5** with Raspbian OS installed.
- **PiEEG Board** connected to the Raspberry Pi GPIO pins.
- **Conscious Labs ThinkPulse Electrodes** for EEG data acquisition.
- **BrainFlow** library for data processing.

If you haven’t set up your hardware yet, refer to the [Mind Over Malware Hardware Setup Guide](#) for complete assembly instructions.

---

## Part 1: Setting Up the Raspberry Pi Environment

Let’s begin by configuring the Raspberry Pi environment for our EEG project. We’ll install necessary dependencies, set up BrainFlow, and configure the PiEEG board.

### 1.1. Update and Upgrade the System

Start by updating your package list and upgrading existing packages:

```bash
sudo apt-get update
sudo apt-get upgrade -y
```

### 1.2. Install Required Packages

Install the following essential packages:

```bash
sudo apt-get install -y git python3 python3-pip python3-venv build-essential cmake libusb-1.0-0-dev
```

### 1.3. Set Up a Python Virtual Environment

Create and activate a virtual environment to keep your dependencies isolated:

```bash
python3 -m venv eeg_env
source eeg_env/bin/activate
```

### 1.4. Clone and Install BrainFlow

Clone the BrainFlow repository and install it:

```bash
git clone https://github.com/brainflow-dev/brainflow.git
cd brainflow/python-package
python setup.py install
```

### 1.5. Install Flask and Other Python Libraries

```bash
pip install flask flask-socketio eventlet numpy
```

### 1.6. Enable SPI Interface on the Raspberry Pi

Enable SPI by running:

```bash
sudo raspi-config
```

Navigate to **Interface Options** > **SPI** > **Yes**. Reboot the Pi to apply changes:

```bash
sudo reboot
```

After rebooting, verify SPI is enabled:

```bash
lsmod | grep spi
```

You should see `spi_bcm2835` in the output.

---


## Part 2: Building the Backend with Flask

Now, we’ll set up the Flask backend to interface with the PiEEG board and stream real-time data.

### 2.1. Create `main.py`

The `main.py` script is the entry point for our Flask application. It initializes the PiEEG board using BrainFlow and sets up the Flask server to handle streaming data.

```python
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
from brainflow.board_shim import BoardShim, BrainFlowInputParams, BoardIds
import threading
import time

# Initialize Flask app and SocketIO
app = Flask(__name__)
socketio = SocketIO(app)

# Global variables
board = None
is_streaming = False

# BrainFlow parameters
params = BrainFlowInputParams()
params.serial_port = '/dev/ttyUSB0'
board_id = BoardIds.PIEEG_BOARD.value

def init_board():
    global board
    BoardShim.enable_dev_board_logger()
    board = BoardShim(board_id, params)
    board.prepare_session()

def start_stream():
    global is_streaming
    if not is_streaming:
        is_streaming = True
        board.start_stream()
        threading.Thread(target=stream_data).start()

def stop_stream():
    global is_streaming
    if is_streaming:
        is_streaming = False
        board.stop_stream()
        board.release_session()

def stream_data():
    while is_streaming:
        data = board.get_current_board_data(1)
        eeg_data = data[BoardShim.get_eeg_channels(board_id)]
        socketio.emit('update_data', {'raw': eeg_data.tolist()})
        time.sleep(0.01)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/start-analysis', methods=['POST'])
def start_analysis():
    init_board()
    start_stream()
    return jsonify(status="Analysis started")

@app.route('/stop-analysis', methods=['POST'])
def stop_analysis():
    stop_stream()
    return jsonify(status="Analysis stopped")

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000)
```

### Explanation

- **Initialization**: The `init_board()` function sets up the BrainFlow board with the specified parameters.
- **Data Streaming**: The `stream_data()` function captures EEG data and emits it to the front-end.
- **Routes**: Flask routes handle starting and stopping the data stream.

---

## Part 3: Building the Front-End Interface

Next, we’ll build a user interface using `index.html` for real-time visualization.


---

## Part 3: Building the Front-End Interface

In this section, we’ll create a user interface for visualizing EEG data in real-time, using the exact `index.html` code you provided. This will allow users to interactively control the data acquisition process and view real-time brain activity.

### 3.1. Create `index.html`

The `index.html` file serves as the front-end for our EEG app. It includes all the necessary buttons, settings, and chart components to visualize and control the EEG channels.

```html
<!-- v0.1a -->
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

This HTML file is designed to provide users with full control over the EEG channels and settings.

---

## Part 4: Integrating JavaScript for Real-Time Charts

We’ll now integrate `app.js` to dynamically update the EEG chart and handle incoming data streams.


---

## Part 4: Integrating JavaScript for Real-Time Charts

We’ll use your `app.js` code to handle incoming data and dynamically update the EEG chart in real-time.

### 4.1. Implement `app.js`

The following script, `app.js`, manages WebSocket connections and updates the charts based on the EEG data.

```javascript
document.addEventListener("DOMContentLoaded", function () {
    ctx = document.getElementById('eegChart').getContext('2d');
    createChart(); // Initialize the chart on page load.
    updateSettings(); // Set initial chart configurations.
});

const socket = io();

function createChart() {
    if (eegChart) {
        eegChart.destroy();
    }
    const datasets = [];
    const enabledChannels = parseInt(document.getElementById('enabled_channels').value, 10);

    if (document.getElementById('ref_enabled').checked) {
        datasets.push({ label: 'REF', data: [], borderColor: 'red', fill: false });
    }
    if (document.getElementById('biasout_enabled').checked) {
        datasets.push({ label: 'BIASOUT', data: [], borderColor: 'black', fill: false });
    }

    for (let i = 0; i < enabledChannels; i++) {
        datasets.push({ label: `Ch${i + 1}`, data: [], borderColor: colors[`ch${i + 1}`], fill: false });
    }

    eegChart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: datasets },
        options: { animation: false, scales: { x: { type: 'linear' }, y: { type: 'linear' } } }
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

function startAnalysis() {
    fetch('/start-analysis', { method: 'POST' }).then(() => {
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;
    });
}

function stopAnalysis() {
    fetch('/stop-analysis', { method: 'POST' }).then(() => {
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
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
}
```

This script listens for incoming data and updates the chart in real-time. It also manages the front-end settings and handles start/stop commands for data acquisition.

---

## Conclusion

With these four parts, we’ve built a complete EEG data acquisition and visualization system using Flask, BrainFlow, and PiEEG. You now have a fully functioning application capable of reading real-time EEG data and displaying it in an interactive web-based interface.

**Next Steps**: Explore advanced signal processing techniques like **Fast Fourier Transforms (FFT)** or consider adding neurofeedback features to create a richer, more engaging user experience.

---

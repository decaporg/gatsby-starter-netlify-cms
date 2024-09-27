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

@app.route('/')
def index():
    return render_template('index.html')

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

if __name__ == '__main__':
    running = False
    collected_data = [[] for _ in range(enabled_channels)]
    socketio.run(app, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)
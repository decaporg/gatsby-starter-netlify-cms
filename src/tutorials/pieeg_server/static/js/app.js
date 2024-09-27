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
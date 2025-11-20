// WebSocket connection for real-time updates
let ws;
let currentSettings = {};
let presets = {};

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    initializeWebSocket();
    loadStatus();
    setupEventListeners();
    displayProxyInfo();
});

// Display proxy configuration info
function displayProxyInfo() {
    const proxyHostEl = document.getElementById('proxyHost');
    proxyHostEl.textContent = window.location.hostname;
}

// Initialize WebSocket connection
function initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
        console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'status') {
            updateUI(message.data);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        setTimeout(initializeWebSocket, 3000);
    };
}

// Load initial status
async function loadStatus() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        presets = data.presets;
        renderPresets();
        updateUI(data);
    } catch (error) {
        console.error('Failed to load status:', error);
    }
}

// Render preset cards
function renderPresets() {
    const presetsGrid = document.getElementById('presetsGrid');
    presetsGrid.innerHTML = '';

    const presetOrder = ['none', '5g', '4g', '3g', 'edge', '2g', 'dialup', 'custom'];

    presetOrder.forEach(key => {
        const preset = presets[key];
        const card = document.createElement('div');
        card.className = 'preset-card';
        card.dataset.preset = key;

        const bandwidth = preset.bandwidth === 0
            ? 'Unlimited'
            : formatBandwidth(preset.bandwidth);

        card.innerHTML = `
            <div class="preset-name">${preset.name}</div>
            <div class="preset-details">
                <div>📶 ${bandwidth}</div>
                <div>⏱️ ${preset.latency}ms</div>
                <div>📉 ${preset.packetLoss}% loss</div>
            </div>
        `;

        card.addEventListener('click', () => selectPreset(key));
        presetsGrid.appendChild(card);
    });
}

// Select a preset
async function selectPreset(preset) {
    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ preset }),
        });

        if (response.ok) {
            const data = await response.json();
            updateUI({ settings: data.settings });

            // Show custom section if custom preset is selected
            const customSection = document.getElementById('customSection');
            if (preset === 'custom') {
                customSection.classList.add('visible');
                updateCustomInputs(data.settings);
            } else {
                customSection.classList.remove('visible');
            }
        }
    } catch (error) {
        console.error('Failed to select preset:', error);
    }
}

// Update custom input fields
function updateCustomInputs(settings) {
    const bandwidthInput = document.getElementById('bandwidthInput');
    const bandwidthUnit = document.getElementById('bandwidthUnit');
    const latencyInput = document.getElementById('latencyInput');
    const packetLossInput = document.getElementById('packetLossInput');

    // Convert bandwidth to KB/s for display
    bandwidthInput.value = Math.round(settings.bandwidth / 1024);
    bandwidthUnit.value = '1024';
    latencyInput.value = settings.latency;
    packetLossInput.value = settings.packetLoss;
}

// Update UI with current status
function updateUI(data) {
    if (data.settings) {
        currentSettings = data.settings;
        updateStatusIndicator(data.settings.enabled);
        updatePresetSelection(data.settings.preset);

        // Show/hide custom section
        const customSection = document.getElementById('customSection');
        if (data.settings.preset === 'custom') {
            customSection.classList.add('visible');
            updateCustomInputs(data.settings);
        }
    }

    if (data.stats) {
        updateStats(data.stats);
    }
}

// Update status indicator
function updateStatusIndicator(enabled) {
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = statusIndicator.querySelector('.status-text');
    const enableToggle = document.getElementById('enableToggle');

    if (enabled) {
        statusIndicator.classList.add('active');
        statusText.textContent = 'Active';
        enableToggle.checked = true;
    } else {
        statusIndicator.classList.remove('active');
        statusText.textContent = 'Disabled';
        enableToggle.checked = false;
    }
}

// Update preset selection
function updatePresetSelection(preset) {
    document.querySelectorAll('.preset-card').forEach(card => {
        if (card.dataset.preset === preset) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    });
}

// Update statistics
function updateStats(stats) {
    document.getElementById('totalRequests').textContent = stats.totalRequests.toLocaleString();
    document.getElementById('activeConnections').textContent = stats.activeConnections.toLocaleString();
    document.getElementById('bytesTransferred').textContent = formatBytes(stats.bytesTransferred);
    document.getElementById('uptime').textContent = formatUptime(stats.uptime);
}

// Setup event listeners
function setupEventListeners() {
    // Enable/disable toggle
    document.getElementById('enableToggle').addEventListener('change', async (e) => {
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: e.target.checked }),
            });
        } catch (error) {
            console.error('Failed to toggle enabled state:', error);
        }
    });

    // Apply custom settings
    document.getElementById('applyCustomBtn').addEventListener('click', async () => {
        const bandwidth = parseInt(document.getElementById('bandwidthInput').value) || 0;
        const bandwidthUnit = parseInt(document.getElementById('bandwidthUnit').value);
        const latency = parseInt(document.getElementById('latencyInput').value) || 0;
        const packetLoss = parseFloat(document.getElementById('packetLossInput').value) || 0;

        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    preset: 'custom',
                    bandwidth: bandwidth * bandwidthUnit,
                    latency,
                    packetLoss: Math.min(100, Math.max(0, packetLoss)),
                }),
            });
        } catch (error) {
            console.error('Failed to apply custom settings:', error);
        }
    });

    // Reset statistics
    document.getElementById('resetStatsBtn').addEventListener('click', async () => {
        try {
            await fetch('/api/reset-stats', { method: 'POST' });
        } catch (error) {
            console.error('Failed to reset statistics:', error);
        }
    });
}

// Format bytes to human-readable format
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format bandwidth to human-readable format
function formatBandwidth(bytesPerSecond) {
    if (bytesPerSecond === 0) return 'Unlimited';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Format uptime to human-readable format
function formatUptime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

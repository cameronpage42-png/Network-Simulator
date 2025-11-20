// WebSocket connection for real-time updates
let ws;
let currentSettings = {};
let presets = {};
let devices = [];
let serverInfo = {};

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    initializeWebSocket();
    loadStatus();
    loadQRCodes();
    setupEventListeners();
});

// Display proxy configuration info and load QR codes
async function loadQRCodes() {
    try {
        // Load iOS QR code (link to profile download)
        const profileUrl = `${window.location.origin}/api/config/ios.mobileconfig`;
        const iosQRResponse = await fetch('/api/qr/proxy');
        const iosQRData = await iosQRResponse.json();

        const iosQREl = document.getElementById('iosQR');
        if (iosQRData.qrCode) {
            iosQREl.innerHTML = `<img src="${iosQRData.qrCode}" alt="iOS Setup QR Code">`;
        }

        // Load Android QR code
        const androidQRResponse = await fetch('/api/qr/proxy');
        const androidQRData = await androidQRResponse.json();

        const androidQREl = document.getElementById('androidQR');
        if (androidQRData.qrCode) {
            androidQREl.innerHTML = `<img src="${androidQRData.qrCode}" alt="Android Setup QR Code">`;
        }

    } catch (error) {
        console.error('Failed to load QR codes:', error);
    }
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
        serverInfo = {
            serverIp: data.serverIp,
            proxyPort: data.proxyPort,
        };

        // Update proxy info display
        document.getElementById('proxyHost').textContent = data.serverIp || window.location.hostname;
        document.getElementById('proxyPort').textContent = data.proxyPort || '8888';

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
async function selectPreset(preset, deviceId = null) {
    try {
        const body = { preset };
        if (deviceId) {
            body.deviceId = deviceId;
        }

        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (response.ok) {
            const data = await response.json();

            // Show custom section if custom preset is selected and no specific device
            if (!deviceId) {
                const customSection = document.getElementById('customSection');
                if (preset === 'custom') {
                    customSection.classList.add('visible');
                    updateCustomInputs(data.settings);
                } else {
                    customSection.classList.remove('visible');
                }
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
        updateStatusIndicator(data.settings.enabled || data.globalSettings?.enabled);
        updatePresetSelection(data.settings.preset || data.globalSettings?.preset);

        // Show/hide custom section
        const customSection = document.getElementById('customSection');
        const preset = data.settings.preset || data.globalSettings?.preset;
        if (preset === 'custom') {
            customSection.classList.add('visible');
            updateCustomInputs(data.settings || data.globalSettings);
        }
    }

    if (data.globalSettings) {
        updateStatusIndicator(data.globalSettings.enabled);
        updatePresetSelection(data.globalSettings.preset);
    }

    if (data.stats) {
        updateStats(data.stats);
    }

    if (data.devices) {
        devices = data.devices;
        renderDevices(data.devices);
    }
}

// Render connected devices
function renderDevices(devices) {
    const devicesGrid = document.getElementById('devicesGrid');
    const deviceCount = document.getElementById('deviceCount');

    deviceCount.textContent = devices.length;

    if (devices.length === 0) {
        devicesGrid.innerHTML = '<div class="no-devices">No devices connected yet. Connect a device using the proxy settings above.</div>';
        return;
    }

    devicesGrid.innerHTML = '';

    devices.forEach(device => {
        const card = document.createElement('div');
        card.className = 'device-card';

        const deviceName = getDeviceName(device.userAgent);
        const timeSinceLastSeen = Date.now() - device.lastSeen;
        const isActive = timeSinceLastSeen < 60000; // Active if seen in last minute

        card.innerHTML = `
            <div class="device-header">
                <div class="device-info">
                    <h4>${deviceName}</h4>
                    <p>${device.id}</p>
                </div>
                <div class="device-actions">
                    <button class="btn-icon" onclick="removeDevice('${device.id}')" title="Remove device">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="device-stats">
                <div class="device-stat">
                    <span class="device-stat-label">Requests</span>
                    <span class="device-stat-value">${device.requestCount || 0}</span>
                </div>
                <div class="device-stat">
                    <span class="device-stat-label">Status</span>
                    <span class="device-stat-value" style="color: ${isActive ? 'var(--success)' : 'var(--text-secondary)'}">
                        ${isActive ? 'Active' : 'Idle'}
                    </span>
                </div>
                <div class="device-stat">
                    <span class="device-stat-label">Current Preset</span>
                    <span class="device-stat-value">${device.settings?.preset || 'none'}</span>
                </div>
                <div class="device-stat">
                    <span class="device-stat-label">Enabled</span>
                    <span class="device-stat-value">${device.settings?.enabled ? 'Yes' : 'No'}</span>
                </div>
            </div>
            <div class="device-preset-selector">
                ${['none', '4g', '3g', '2g'].map(presetKey => `
                    <button
                        class="device-preset-btn ${device.settings?.preset === presetKey ? 'active' : ''}"
                        onclick="selectDevicePreset('${device.id}', '${presetKey}')"
                    >
                        ${presets[presetKey]?.name || presetKey}
                    </button>
                `).join('')}
            </div>
        `;

        devicesGrid.appendChild(card);
    });
}

// Get device name from user agent
function getDeviceName(userAgent) {
    if (!userAgent || userAgent === 'Unknown') return 'Unknown Device';

    if (userAgent.includes('iPhone')) return 'iPhone';
    if (userAgent.includes('iPad')) return 'iPad';
    if (userAgent.includes('Android')) {
        if (userAgent.includes('Mobile')) return 'Android Phone';
        return 'Android Tablet';
    }
    if (userAgent.includes('Mac')) return 'Mac';
    if (userAgent.includes('Windows')) return 'Windows PC';
    if (userAgent.includes('Linux')) return 'Linux PC';

    return 'Unknown Device';
}

// Select preset for a specific device
window.selectDevicePreset = async function(deviceId, preset) {
    await selectPreset(preset, deviceId);
};

// Remove device
window.removeDevice = async function(deviceId) {
    try {
        await fetch('/api/device/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId }),
        });
    } catch (error) {
        console.error('Failed to remove device:', error);
    }
};

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

    // Android instructions button
    document.getElementById('androidInstructionsBtn').addEventListener('click', () => {
        alert(`Android Proxy Setup:\n\n1. Open Settings > Wi-Fi\n2. Long press your connected network\n3. Select "Modify network"\n4. Show advanced options\n5. Set Proxy to "Manual"\n6. Enter Host: ${serverInfo.serverIp}\n7. Enter Port: ${serverInfo.proxyPort}\n8. Save`);
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

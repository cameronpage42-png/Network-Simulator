const express = require('express');
const http = require('http');
const url = require('url');
const net = require('net');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');

const app = express();
const port = 8080;
const proxyPort = 8888;

// Global default network settings
let globalNetworkSettings = {
  enabled: false,
  preset: 'none',
  bandwidth: 0,
  latency: 0,
  packetLoss: 0,
};

// Per-device settings
const deviceSettings = new Map();
const connectedDevices = new Map();

// Statistics
let stats = {
  totalRequests: 0,
  activeConnections: 0,
  bytesTransferred: 0,
  startTime: Date.now(),
};

// Network presets
const presets = {
  none: { bandwidth: 0, latency: 0, packetLoss: 0, name: 'No Throttling' },
  '5g': { bandwidth: 20 * 1024 * 1024, latency: 10, packetLoss: 0, name: '5G' },
  '4g': { bandwidth: 4 * 1024 * 1024, latency: 50, packetLoss: 0, name: '4G' },
  '3g': { bandwidth: 750 * 1024, latency: 100, packetLoss: 0, name: '3G' },
  edge: { bandwidth: 240 * 1024, latency: 300, packetLoss: 0, name: 'EDGE' },
  '2g': { bandwidth: 50 * 1024, latency: 500, packetLoss: 1, name: '2G' },
  dialup: { bandwidth: 7 * 1024, latency: 700, packetLoss: 2, name: 'Dial-up' },
  custom: { bandwidth: 1024 * 1024, latency: 100, packetLoss: 0, name: 'Custom' },
};

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Get device ID from request
function getDeviceId(req) {
  // Use IP address as device ID (you could also use headers or cookies)
  return req.ip || req.connection.remoteAddress || 'unknown';
}

// Get settings for a specific device
function getDeviceSettings(deviceId) {
  if (deviceSettings.has(deviceId)) {
    return deviceSettings.get(deviceId);
  }
  return globalNetworkSettings;
}

// API Routes
app.get('/api/status', (req, res) => {
  const deviceId = getDeviceId(req);
  const settings = getDeviceSettings(deviceId);

  res.json({
    settings,
    globalSettings: globalNetworkSettings,
    stats: {
      ...stats,
      uptime: Date.now() - stats.startTime,
    },
    presets,
    deviceId,
    devices: Array.from(connectedDevices.entries()).map(([id, device]) => ({
      id,
      ...device,
      settings: getDeviceSettings(id),
    })),
    serverIp: getLocalIP(),
    proxyPort,
  });
});

app.post('/api/settings', (req, res) => {
  const { enabled, preset, bandwidth, latency, packetLoss, deviceId, applyToAll } = req.body;
  const currentDeviceId = deviceId || getDeviceId(req);

  let targetSettings;

  if (applyToAll) {
    targetSettings = globalNetworkSettings;
  } else {
    if (!deviceSettings.has(currentDeviceId)) {
      deviceSettings.set(currentDeviceId, { ...globalNetworkSettings });
    }
    targetSettings = deviceSettings.get(currentDeviceId);
  }

  if (enabled !== undefined) targetSettings.enabled = enabled;

  if (preset && presets[preset]) {
    targetSettings.preset = preset;
    targetSettings.bandwidth = presets[preset].bandwidth;
    targetSettings.latency = presets[preset].latency;
    targetSettings.packetLoss = presets[preset].packetLoss;
  }

  if (preset === 'custom') {
    if (bandwidth !== undefined) targetSettings.bandwidth = bandwidth;
    if (latency !== undefined) targetSettings.latency = latency;
    if (packetLoss !== undefined) targetSettings.packetLoss = packetLoss;
  }

  res.json({ success: true, settings: targetSettings });
  broadcastStatus();
});

app.post('/api/reset-stats', (req, res) => {
  stats.totalRequests = 0;
  stats.bytesTransferred = 0;
  stats.startTime = Date.now();
  res.json({ success: true });
  broadcastStatus();
});

app.post('/api/device/remove', (req, res) => {
  const { deviceId } = req.body;
  if (deviceId) {
    deviceSettings.delete(deviceId);
    connectedDevices.delete(deviceId);
    broadcastStatus();
  }
  res.json({ success: true });
});

// QR Code generation for proxy setup
app.get('/api/qr/android', async (req, res) => {
  try {
    const serverIp = getLocalIP();
    // Android can use a manual proxy configuration URL or PAC file
    // For simplicity, we'll create a WiFi QR code with proxy settings
    const wifiConfig = `WIFI:T:nopass;S:NetworkSimulator;H:true;P:${serverIp}:${proxyPort};;`;

    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(wifiConfig, {
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });

    res.json({ qrCode: qrDataUrl, config: wifiConfig });
  } catch (error) {
    console.error('QR generation error:', error);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

app.get('/api/qr/proxy', async (req, res) => {
  try {
    const serverIp = getLocalIP();
    // Create a URL that opens proxy settings with pre-filled values
    // Format: proxy://host:port
    const proxyConfig = `http://${serverIp}:${port}`;

    const qrDataUrl = await QRCode.toDataURL(proxyConfig, {
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });

    res.json({
      qrCode: qrDataUrl,
      config: {
        host: serverIp,
        port: proxyPort,
        url: proxyConfig,
      }
    });
  } catch (error) {
    console.error('QR generation error:', error);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// iOS Configuration Profile
app.get('/api/config/ios.mobileconfig', (req, res) => {
  const serverIp = getLocalIP();
  const mobileConfig = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>PayloadType</key>
            <string>com.apple.proxy.http.global</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>PayloadIdentifier</key>
            <string>com.networksimulator.proxy</string>
            <key>PayloadUUID</key>
            <string>A1B2C3D4-E5F6-7890-ABCD-EF1234567890</string>
            <key>PayloadDisplayName</key>
            <string>Network Simulator Proxy</string>
            <key>ProxyType</key>
            <string>Manual</string>
            <key>HTTPEnable</key>
            <integer>1</integer>
            <key>HTTPProxy</key>
            <string>${serverIp}</string>
            <key>HTTPPort</key>
            <integer>${proxyPort}</integer>
            <key>HTTPSEnable</key>
            <integer>1</integer>
            <key>HTTPSProxy</key>
            <string>${serverIp}</string>
            <key>HTTPSPort</key>
            <integer>${proxyPort}</integer>
        </dict>
    </array>
    <key>PayloadDisplayName</key>
    <string>Network Simulator Proxy</string>
    <key>PayloadIdentifier</key>
    <string>com.networksimulator</string>
    <key>PayloadRemovalDisallowed</key>
    <false/>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadUUID</key>
    <string>B2C3D4E5-F6A7-8901-BCDE-F12345678901</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
</dict>
</plist>`;

  res.setHeader('Content-Type', 'application/x-apple-aspen-config');
  res.setHeader('Content-Disposition', 'attachment; filename="NetworkSimulator.mobileconfig"');
  res.send(mobileConfig);
});

// Create HTTP server for web interface
const server = http.createServer(app);

// WebSocket for real-time updates
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const deviceId = req.socket.remoteAddress;
  console.log(`WebSocket client connected: ${deviceId}`);

  // Send current status immediately
  ws.send(JSON.stringify({
    type: 'status',
    data: {
      settings: getDeviceSettings(deviceId),
      globalSettings: globalNetworkSettings,
      stats: {
        ...stats,
        uptime: Date.now() - stats.startTime,
      },
      devices: Array.from(connectedDevices.entries()).map(([id, device]) => ({
        id,
        ...device,
        settings: getDeviceSettings(id),
      })),
    },
  }));
});

function broadcastStatus() {
  const message = JSON.stringify({
    type: 'status',
    data: {
      settings: globalNetworkSettings,
      globalSettings: globalNetworkSettings,
      stats: {
        ...stats,
        uptime: Date.now() - stats.startTime,
      },
      devices: Array.from(connectedDevices.entries()).map(([id, device]) => ({
        id,
        ...device,
        settings: getDeviceSettings(id),
      })),
    },
  });

  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  });
}

// Throttle stream - limits bandwidth
class ThrottleStream {
  constructor(bandwidth) {
    this.bandwidth = bandwidth;
    this.lastTime = Date.now();
    this.buffer = [];
    this.processing = false;
  }

  async write(chunk, callback) {
    if (!this.bandwidth || this.bandwidth === 0) {
      callback(chunk);
      return;
    }

    this.buffer.push({ chunk, callback });
    if (!this.processing) {
      this.processBuffer();
    }
  }

  async processBuffer() {
    if (this.buffer.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const { chunk, callback } = this.buffer.shift();

    const now = Date.now();
    const elapsed = (now - this.lastTime) / 1000;
    const allowedBytes = this.bandwidth * elapsed;

    if (chunk.length > allowedBytes && elapsed < 1) {
      const waitTime = ((chunk.length / this.bandwidth) - elapsed) * 1000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastTime = Date.now();
    callback(chunk);

    if (this.buffer.length > 0) {
      setImmediate(() => this.processBuffer());
    } else {
      this.processing = false;
    }
  }
}

// Get settings for a client IP
function getClientSettings(clientIp) {
  if (deviceSettings.has(clientIp)) {
    return deviceSettings.get(clientIp);
  }
  return globalNetworkSettings;
}

// Simulate packet loss
function shouldDropPacket(settings) {
  if (!settings.enabled || settings.packetLoss === 0) {
    return false;
  }
  return Math.random() * 100 < settings.packetLoss;
}

// Add latency
async function addLatency(settings) {
  if (!settings.enabled || settings.latency === 0) {
    return;
  }
  await new Promise(resolve => setTimeout(resolve, settings.latency));
}

// Track device connection
function trackDevice(ip, userAgent) {
  if (!connectedDevices.has(ip)) {
    connectedDevices.set(ip, {
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      userAgent,
      requestCount: 1,
    });
  } else {
    const device = connectedDevices.get(ip);
    device.lastSeen = Date.now();
    device.requestCount++;
  }
  broadcastStatus();
}

// Create proxy server with better error handling
const proxyServer = http.createServer((req, res) => {
  stats.totalRequests++;
  stats.activeConnections++;

  const clientIp = req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'Unknown';

  trackDevice(clientIp, userAgent);

  res.on('close', () => {
    stats.activeConnections--;
  });

  res.on('error', (err) => {
    if (err.code !== 'ECONNRESET') {
      console.error('Response error:', err.message);
    }
  });

  handleHttpRequest(req, res, clientIp);
});

async function handleHttpRequest(req, res, clientIp) {
  const settings = getClientSettings(clientIp);

  try {
    await addLatency(settings);

    if (shouldDropPacket(settings)) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Network packet dropped (simulated packet loss)');
      stats.activeConnections--;
      return;
    }

    const targetUrl = url.parse(req.url);
    if (!targetUrl.host) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      stats.activeConnections--;
      return;
    }

    const targetPort = targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80);
    const targetHost = targetUrl.hostname;

    const proxyReq = http.request({
      hostname: targetHost,
      port: targetPort,
      path: targetUrl.path,
      method: req.method,
      headers: req.headers,
    });

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Bad Gateway');
      }
      stats.activeConnections--;
    });

    proxyReq.on('response', (proxyRes) => {
      const throttle = new ThrottleStream(settings.enabled ? settings.bandwidth : 0);

      res.writeHead(proxyRes.statusCode, proxyRes.headers);

      proxyRes.on('data', (chunk) => {
        stats.bytesTransferred += chunk.length;
        throttle.write(chunk, (throttledChunk) => {
          if (!res.writableEnded) {
            res.write(throttledChunk);
          }
        });
      });

      proxyRes.on('end', () => {
        res.end();
        stats.activeConnections--;
      });
    });

    req.on('data', (chunk) => {
      proxyReq.write(chunk);
    });

    req.on('end', () => {
      proxyReq.end();
    });

  } catch (error) {
    console.error('Proxy error:', error.message);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
    stats.activeConnections--;
  }
}

// Handle CONNECT method for HTTPS proxying with better error handling
proxyServer.on('connect', async (req, clientSocket, head) => {
  stats.totalRequests++;
  stats.activeConnections++;

  const clientIp = clientSocket.remoteAddress;
  trackDevice(clientIp, req.headers['user-agent'] || 'Unknown');

  const settings = getClientSettings(clientIp);

  let serverSocket = null;
  let isConnected = false;

  // Cleanup function
  const cleanup = () => {
    if (!isConnected) {
      isConnected = true;
      stats.activeConnections--;

      if (clientSocket && !clientSocket.destroyed) {
        clientSocket.destroy();
      }
      if (serverSocket && !serverSocket.destroyed) {
        serverSocket.destroy();
      }
    }
  };

  // Set timeouts
  clientSocket.setTimeout(30000);

  clientSocket.on('error', (err) => {
    if (err.code !== 'ECONNRESET') {
      console.error('Client socket error:', err.message);
    }
    cleanup();
  });

  clientSocket.on('timeout', () => {
    cleanup();
  });

  try {
    await addLatency(settings);

    if (shouldDropPacket(settings)) {
      clientSocket.end();
      stats.activeConnections--;
      return;
    }

    const [hostname, port] = req.url.split(':');

    serverSocket = net.connect(port || 443, hostname);

    serverSocket.setTimeout(30000);

    serverSocket.on('error', (err) => {
      if (err.code !== 'ECONNRESET') {
        console.error('Server socket error:', err.message);
      }
      cleanup();
    });

    serverSocket.on('timeout', () => {
      cleanup();
    });

    serverSocket.on('connect', () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

      const upstreamThrottle = new ThrottleStream(settings.enabled ? settings.bandwidth : 0);
      const downstreamThrottle = new ThrottleStream(settings.enabled ? settings.bandwidth : 0);

      clientSocket.on('data', (chunk) => {
        if (!serverSocket.destroyed) {
          stats.bytesTransferred += chunk.length;
          upstreamThrottle.write(chunk, (throttledChunk) => {
            if (!serverSocket.destroyed) {
              serverSocket.write(throttledChunk);
            }
          });
        }
      });

      serverSocket.on('data', (chunk) => {
        if (!clientSocket.destroyed) {
          stats.bytesTransferred += chunk.length;
          downstreamThrottle.write(chunk, (throttledChunk) => {
            if (!clientSocket.destroyed) {
              clientSocket.write(throttledChunk);
            }
          });
        }
      });

      clientSocket.on('end', cleanup);
      serverSocket.on('end', cleanup);
    });

  } catch (error) {
    console.error('CONNECT error:', error.message);
    cleanup();
  }
});

// Start servers
server.listen(port, () => {
  console.log(`\n========================================`);
  console.log(`Network Simulator Control Panel`);
  console.log(`========================================`);
  console.log(`Web Interface: http://localhost:${port}`);
  console.log(`Proxy Server: localhost:${proxyPort}`);
  console.log(`========================================\n`);
  console.log(`Configure your device to use this proxy:`);
  console.log(`  Host: ${getLocalIP()}`);
  console.log(`  Port: ${proxyPort}`);
  console.log(`========================================\n`);
});

proxyServer.listen(proxyPort, () => {
  console.log(`Proxy server listening on port ${proxyPort}`);
});

// Get local IP address
function getLocalIP() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }

  return 'localhost';
}

// Broadcast stats periodically
setInterval(broadcastStatus, 2000);

// Clean up old devices (not seen in 5 minutes)
setInterval(() => {
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  for (const [id, device] of connectedDevices.entries()) {
    if (now - device.lastSeen > fiveMinutes) {
      connectedDevices.delete(id);
      deviceSettings.delete(id);
    }
  }
}, 60000);

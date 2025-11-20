const express = require('express');
const http = require('http');
const httpProxy = require('http-proxy');
const url = require('url');
const net = require('net');
const { WebSocketServer } = require('ws');

const app = express();
const port = 8080;
const proxyPort = 8888;

// Network simulation settings
let networkSettings = {
  enabled: false,
  preset: 'none',
  bandwidth: 0, // bytes per second (0 = unlimited)
  latency: 0, // milliseconds
  packetLoss: 0, // percentage (0-100)
};

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

// API Routes
app.get('/api/status', (req, res) => {
  res.json({
    settings: networkSettings,
    stats: {
      ...stats,
      uptime: Date.now() - stats.startTime,
    },
    presets,
  });
});

app.post('/api/settings', (req, res) => {
  const { enabled, preset, bandwidth, latency, packetLoss } = req.body;

  if (enabled !== undefined) networkSettings.enabled = enabled;

  if (preset && presets[preset]) {
    networkSettings.preset = preset;
    networkSettings.bandwidth = presets[preset].bandwidth;
    networkSettings.latency = presets[preset].latency;
    networkSettings.packetLoss = presets[preset].packetLoss;
  }

  if (preset === 'custom') {
    if (bandwidth !== undefined) networkSettings.bandwidth = bandwidth;
    if (latency !== undefined) networkSettings.latency = latency;
    if (packetLoss !== undefined) networkSettings.packetLoss = packetLoss;
  }

  res.json({ success: true, settings: networkSettings });
  broadcastStatus();
});

app.post('/api/reset-stats', (req, res) => {
  stats.totalRequests = 0;
  stats.bytesTransferred = 0;
  stats.startTime = Date.now();
  res.json({ success: true });
  broadcastStatus();
});

// Create HTTP server for web interface
const server = http.createServer(app);

// WebSocket for real-time updates
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  // Send current status immediately
  ws.send(JSON.stringify({
    type: 'status',
    data: {
      settings: networkSettings,
      stats: {
        ...stats,
        uptime: Date.now() - stats.startTime,
      },
    },
  }));
});

function broadcastStatus() {
  const message = JSON.stringify({
    type: 'status',
    data: {
      settings: networkSettings,
      stats: {
        ...stats,
        uptime: Date.now() - stats.startTime,
      },
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
    this.bandwidth = bandwidth; // bytes per second
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
    const elapsed = (now - this.lastTime) / 1000; // seconds
    const allowedBytes = this.bandwidth * elapsed;

    if (chunk.length > allowedBytes && elapsed < 1) {
      // Need to wait
      const waitTime = ((chunk.length / this.bandwidth) - elapsed) * 1000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastTime = Date.now();
    callback(chunk);

    // Process next item
    if (this.buffer.length > 0) {
      setImmediate(() => this.processBuffer());
    } else {
      this.processing = false;
    }
  }
}

// Simulate packet loss
function shouldDropPacket() {
  if (!networkSettings.enabled || networkSettings.packetLoss === 0) {
    return false;
  }
  return Math.random() * 100 < networkSettings.packetLoss;
}

// Add latency
async function addLatency() {
  if (!networkSettings.enabled || networkSettings.latency === 0) {
    return;
  }
  await new Promise(resolve => setTimeout(resolve, networkSettings.latency));
}

// Create proxy server
const proxy = httpProxy.createProxyServer({});

const proxyServer = http.createServer(async (req, res) => {
  stats.totalRequests++;
  stats.activeConnections++;

  // Add latency
  await addLatency();

  // Check for packet loss (simulate by dropping request)
  if (shouldDropPacket()) {
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end('Network packet dropped (simulated packet loss)');
    stats.activeConnections--;
    broadcastStatus();
    return;
  }

  const targetUrl = req.url;
  const parsedUrl = url.parse(targetUrl);

  // Extract target from absolute URL
  const target = `${parsedUrl.protocol}//${parsedUrl.host}`;

  // Bandwidth throttling
  const throttle = new ThrottleStream(networkSettings.enabled ? networkSettings.bandwidth : 0);

  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);

  res.write = function(chunk, ...args) {
    if (chunk) {
      stats.bytesTransferred += chunk.length;
      throttle.write(chunk, (throttledChunk) => {
        originalWrite(throttledChunk, ...args);
      });
    }
  };

  res.end = function(chunk, ...args) {
    if (chunk) {
      stats.bytesTransferred += chunk.length;
      throttle.write(chunk, (throttledChunk) => {
        originalEnd(throttledChunk, ...args);
        stats.activeConnections--;
        broadcastStatus();
      });
    } else {
      originalEnd(...args);
      stats.activeConnections--;
      broadcastStatus();
    }
  };

  try {
    proxy.web(req, res, { target, changeOrigin: true });
  } catch (error) {
    console.error('Proxy error:', error);
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Proxy error');
    stats.activeConnections--;
  }
});

// Handle CONNECT method for HTTPS proxying
proxyServer.on('connect', async (req, clientSocket, head) => {
  stats.totalRequests++;
  stats.activeConnections++;

  // Add latency
  await addLatency();

  // Check for packet loss
  if (shouldDropPacket()) {
    clientSocket.end();
    stats.activeConnections--;
    broadcastStatus();
    return;
  }

  const [hostname, port] = req.url.split(':');

  const serverSocket = net.connect(port || 443, hostname, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

    // Bandwidth throttling for HTTPS
    const upstreamThrottle = new ThrottleStream(networkSettings.enabled ? networkSettings.bandwidth : 0);
    const downstreamThrottle = new ThrottleStream(networkSettings.enabled ? networkSettings.bandwidth : 0);

    // Client to server
    clientSocket.on('data', (chunk) => {
      stats.bytesTransferred += chunk.length;
      upstreamThrottle.write(chunk, (throttledChunk) => {
        serverSocket.write(throttledChunk);
      });
    });

    // Server to client
    serverSocket.on('data', (chunk) => {
      stats.bytesTransferred += chunk.length;
      downstreamThrottle.write(chunk, (throttledChunk) => {
        clientSocket.write(throttledChunk);
      });
    });

    serverSocket.pipe(clientSocket);

    broadcastStatus();
  });

  serverSocket.on('error', (err) => {
    console.error('Server socket error:', err);
    clientSocket.end();
    stats.activeConnections--;
  });

  clientSocket.on('error', (err) => {
    console.error('Client socket error:', err);
    serverSocket.end();
    stats.activeConnections--;
  });

  serverSocket.on('end', () => {
    stats.activeConnections--;
    broadcastStatus();
  });
});

proxy.on('error', (err, req, res) => {
  console.error('Proxy error:', err);
  if (res.writeHead) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad Gateway');
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
      // Skip over non-IPv4 and internal addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }

  return 'localhost';
}

// Broadcast stats periodically
setInterval(broadcastStatus, 2000);

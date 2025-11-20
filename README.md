# Network Simulator

A powerful Mac Mini (and cross-platform) network simulation tool that acts as a proxy server, allowing you to test your applications under various network conditions. Features a beautiful, modern web interface for real-time control and monitoring.

![Network Simulator](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-blue)
![Node.js](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

✨ **Network Presets**
- 5G, 4G, 3G, EDGE, 2G, Dial-up
- Custom settings for advanced users
- One-click preset switching

🎛️ **Network Conditions**
- **Bandwidth Throttling**: Simulate different connection speeds
- **Latency Injection**: Add artificial delay to requests
- **Packet Loss**: Simulate unreliable networks

📊 **Real-time Monitoring**
- Total requests count
- Active connections
- Data transferred statistics
- Uptime tracking
- WebSocket-based live updates

🎨 **Modern Web Interface**
- Beautiful dark theme design
- Responsive layout for all devices
- Real-time status updates
- Easy-to-use controls

## Screenshots

The interface includes:
- Network preset cards (5G, 4G, 3G, etc.)
- Custom bandwidth, latency, and packet loss controls
- Real-time statistics dashboard
- Enable/disable toggle

## Installation

### Prerequisites

- Node.js 14.0.0 or higher
- npm (comes with Node.js)

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Network-Simulator
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

4. **Access the web interface**
   Open your browser and navigate to:
   ```
   http://localhost:8080
   ```

## Usage

### Configuring Devices to Use the Proxy

To route traffic through the network simulator, configure your device's proxy settings:

#### macOS
1. Open **System Preferences** → **Network**
2. Select your active network connection
3. Click **Advanced** → **Proxies**
4. Enable **Web Proxy (HTTP)** and **Secure Web Proxy (HTTPS)**
5. Set the proxy server to the IP address shown in the web interface (default: port 8888)
6. Click **OK** and **Apply**

#### iOS
1. Open **Settings** → **Wi-Fi**
2. Tap the (i) icon next to your connected network
3. Scroll down to **HTTP Proxy** → **Configure Proxy**
4. Select **Manual**
5. Enter the server IP and port (8888)
6. Tap **Save**

#### Android
1. Open **Settings** → **Wi-Fi**
2. Long press your connected network → **Modify network**
3. Show **Advanced options**
4. Set **Proxy** to **Manual**
5. Enter the proxy hostname and port (8888)
6. Tap **Save**

#### Windows
1. Open **Settings** → **Network & Internet** → **Proxy**
2. Under **Manual proxy setup**, enable **Use a proxy server**
3. Enter the address and port (8888)
4. Click **Save**

### Using the Web Interface

1. **Enable/Disable Simulation**
   - Use the toggle switch in the top right corner
   - When disabled, traffic passes through without modification

2. **Select Network Presets**
   - Click any preset card (5G, 4G, 3G, etc.)
   - The active preset will be highlighted in blue

3. **Custom Settings**
   - Click the "Custom" preset to reveal advanced controls
   - Adjust bandwidth (KB/s or MB/s)
   - Set latency in milliseconds
   - Configure packet loss percentage (0-100%)
   - Click "Apply Custom Settings"

4. **Monitor Statistics**
   - View real-time statistics at the bottom
   - Click "Reset Statistics" to clear counters

## Network Presets

| Preset  | Bandwidth   | Latency | Packet Loss |
|---------|-------------|---------|-------------|
| None    | Unlimited   | 0ms     | 0%          |
| 5G      | 20 MB/s     | 10ms    | 0%          |
| 4G      | 4 MB/s      | 50ms    | 0%          |
| 3G      | 750 KB/s    | 100ms   | 0%          |
| EDGE    | 240 KB/s    | 300ms   | 0%          |
| 2G      | 50 KB/s     | 500ms   | 1%          |
| Dial-up | 7 KB/s      | 700ms   | 2%          |
| Custom  | Configurable| Configurable| Configurable|

## API Endpoints

The application exposes a REST API for programmatic control:

### Get Status
```http
GET /api/status
```

Returns current settings, statistics, and available presets.

### Update Settings
```http
POST /api/settings
Content-Type: application/json

{
  "enabled": true,
  "preset": "4g"
}
```

Or for custom settings:
```http
POST /api/settings
Content-Type: application/json

{
  "preset": "custom",
  "bandwidth": 1048576,
  "latency": 100,
  "packetLoss": 1
}
```

### Reset Statistics
```http
POST /api/reset-stats
```

## Architecture

The application consists of three main components:

1. **Proxy Server** (Port 8888)
   - HTTP/HTTPS proxy with CONNECT method support
   - Traffic interception and manipulation
   - Bandwidth throttling using custom stream processing
   - Latency injection using async delays
   - Packet loss simulation

2. **Web Server** (Port 8080)
   - Express.js REST API
   - Static file serving for the web interface
   - WebSocket server for real-time updates

3. **Web Interface**
   - Modern HTML/CSS/JavaScript frontend
   - Real-time status updates via WebSocket
   - Responsive design for mobile and desktop

## Technical Details

### Bandwidth Throttling
Traffic is throttled at the byte level using a custom `ThrottleStream` class that ensures data is transmitted at the configured rate.

### Latency Injection
Artificial delay is added to each request using async/await patterns before establishing connections or proxying data.

### Packet Loss Simulation
Random packet dropping is implemented at the request level, simulating unreliable network conditions.

## Troubleshooting

### Proxy Connection Issues
- Ensure the server is running (`npm start`)
- Verify the correct IP address and port (8888)
- Check firewall settings on the Mac Mini
- Ensure devices are on the same network

### HTTPS Issues
- Some apps may require certificate trust configuration
- iOS may show certificate warnings for HTTPS traffic

### Performance
- For high-bandwidth simulations, ensure the Mac Mini has sufficient network capacity
- Close unnecessary applications to free up system resources

## Development

### Project Structure
```
Network-Simulator/
├── server.js           # Main server and proxy logic
├── package.json        # Dependencies and scripts
├── public/             # Web interface files
│   ├── index.html      # Main HTML page
│   ├── styles.css      # Styles and design
│   └── app.js          # Frontend JavaScript
└── README.md           # This file
```

### Future Enhancements
- [ ] SSL/TLS certificate generation for HTTPS inspection
- [ ] Traffic recording and replay
- [ ] Per-domain rules and filtering
- [ ] Multiple device management
- [ ] Historical statistics and graphs
- [ ] Export/import configuration profiles
- [ ] Command-line interface (CLI) mode

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT License - feel free to use this project for any purpose.

## Support

For issues, questions, or suggestions, please open an issue on GitHub.

---

**Made with ❤️ for developers who need to test network conditions**

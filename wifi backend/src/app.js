const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const blockRoutes = require('./routes/blockRoutes');
const wifiRoutes = require('./routes/wifiRoutes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

// Trust reverse proxy (e.g. Render) so req.protocol is https
app.set('trust proxy', 1);

// Enable Cross-Origin Resource Sharing
app.use(cors());

// HTTP request logger
app.use(morgan('dev'));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded floor map images statically
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Root health check & API overview
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'online',
    service: 'Indoor Wi-Fi Heatmap Backend API',
    endpoints: {
      "GET /SSID/block": "Fetch Wi-Fi heatmap matrix, stats, and floor map image (or cached status)",
      "POST /SSID/block": "Submit Wi-Fi measurement at (x,y) coordinates with signal strength (dBm)",
      "POST /createBlock": "Create a new indoor block with floor map image (multipart/form-data)",
      "POST /addblock": "Assign an indoor block to a Wi-Fi (takes wifi ssid and indoor block id)",
      "POST /delete": "Delete an indoor block from a Wi-Fi or globally",
      "POST /calibrateBlock": "Calibrate floor map scale (metersPerPixel) using two reference points or ratio",
      "POST /calculateDistance": "Calculate real-world distance in meters between any two points on a floor map",
      "GET /blocks": "List all blocks or search nearby within 10m radius",
      "GET /block/:blockId": "Get complete block details by ID",
      "GET /block/:blockId/image": "Stream floor map image with HTTP 304 caching",
      "GET /wifis": "List all registered Wi-Fi networks and their assigned indoor blocks"
    }
  });
});

// Mount Routes (Mounted directly at root as specified in requirements, and also aliased under /api)
app.use('/', blockRoutes);
app.use('/', wifiRoutes);

app.use('/api', blockRoutes);
app.use('/api', wifiRoutes);

// Fallback 404 Handler
app.use(notFoundHandler);

// Centralized Error Handler
app.use(errorHandler);

module.exports = app;


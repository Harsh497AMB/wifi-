const fs = require('fs');
const path = require('path');
const Block = require('../models/Block');
const { get10mGridKey } = require('../utils/locationHelper');
const { build2DMatrix } = require('../utils/matrixHelper');

/**
 * Helper to locate a block by blockId or by (lat, lon, blockName)
 */
async function findTargetBlock({ blockId, blockName, lat, lon }) {
  if (blockId) {
    return await Block.findOne({ blockId });
  }

  if (lat != null && lon != null) {
    const gridKey = get10mGridKey(lat, lon);
    const filter = {
      $or: [
        { 'location.gridKey': gridKey },
        {
          'location.lat': { $gte: Number(lat) - 0.00015, $lte: Number(lat) + 0.00015 },
          'location.lon': { $gte: Number(lon) - 0.00015, $lte: Number(lon) + 0.00015 }
        }
      ]
    };
    if (blockName) {
      filter.blockName = blockName.trim();
    }
    return await Block.findOne(filter);
  }

  if (blockName) {
    return await Block.findOne({ blockName: blockName.trim() });
  }

  return null;
}

/**
 * GET /SSID/block or /:ssid/block
 * Returns the matrix of the Wi-Fi in that particular block, related terms,
 * and sends the floor map image if not available in user cache/local storage.
 */
exports.getWifiBlock = async (req, res, next) => {
  try {
    const ssid = req.params.ssid || req.query.ssid;
    const blockId = req.query.blockId || req.headers['x-block-id'];
    const blockName = req.query.blockName;
    const lat = req.query.lat;
    const lon = req.query.lon;

    if (!ssid) {
      return res.status(400).json({
        success: false,
        message: 'SSID must be provided in route param or query (e.g., /SSID/block?ssid=MyWifi&blockId=...)'
      });
    }

    const block = await findTargetBlock({ blockId, blockName, lat, lon });

    if (!block) {
      return res.status(404).json({
        success: false,
        message: 'Block not found for the specified blockId or location'
      });
    }

    // Find Wi-Fi in block
    const wifi = block.wifis.find(
      (w) => w.ssid.toLowerCase() === ssid.trim().toLowerCase()
    );

    if (!wifi) {
      return res.status(404).json({
        success: false,
        message: `Wi-Fi with SSID '${ssid}' not found in block '${block.blockName}'`,
        availableSsids: block.wifis.map((w) => w.ssid)
      });
    }

    // Determine client cache status for floor map image:
    // 1. Client can pass ?hasImage=true/false
    // 2. Client can send header 'If-None-Match' matching the image filename/etag
    // 3. Client can send query ?includeImage=true
    const clientHasImage =
      req.query.hasImage === 'true' ||
      req.headers['x-has-image'] === 'true' ||
      req.headers['if-none-match'] === `"${block.blockImage.filename}"` ||
      req.headers['if-none-match'] === block.blockImage.filename;

    const includeImageExplicit = req.query.includeImage === 'true';
    const shouldSendImageData = !clientHasImage || includeImageExplicit;

    let floorImageData = null;
    if (shouldSendImageData && block.blockImage && block.blockImage.path) {
      try {
        if (fs.existsSync(block.blockImage.path)) {
          const fileBuffer = fs.readFileSync(block.blockImage.path);
          floorImageData = {
            mimetype: block.blockImage.mimetype,
            base64: `data:${block.blockImage.mimetype};base64,${fileBuffer.toString('base64')}`
          };
        }
      } catch (err) {
        console.error('Error reading floor image file for base64 response:', err.message);
      }
    }

    // Generate 2D Matrix from coordinate measurements
    const matrix = build2DMatrix(wifi.measurements);

    // Compute basic heatmap statistics
    let minStrength = null;
    let maxStrength = null;
    let avgStrength = null;

    if (wifi.measurements.length > 0) {
      const strengths = wifi.measurements.map((m) => m.strength);
      minStrength = Math.min(...strengths);
      maxStrength = Math.max(...strengths);
      avgStrength = Number((strengths.reduce((a, b) => a + b, 0) / strengths.length).toFixed(2));
    }

    // Set ETag header for caching
    res.setHeader('ETag', `"${block.blockImage.filename}"`);

    return res.status(200).json({
      success: true,
      block: {
        blockId: block.blockId,
        blockName: block.blockName,
        location: {
          lat: block.location.lat,
          lon: block.location.lon,
          gridKey: block.location.gridKey
        },
        scale: block.scale,
        image: {
          filename: block.blockImage.filename,
          url: block.blockImage.url,
          isCachedOnClient: clientHasImage,
          floorImage: floorImageData // sent if not cached on client
        }
      },
      wifi: {
        ssid: wifi.ssid,
        band: wifi.band,
        width: wifi.width,
        security: wifi.security,
        estDistance: wifi.estDistance,
        lastUpdated: wifi.lastUpdated,
        stats: {
          totalPoints: wifi.measurements.length,
          minStrengthDbm: minStrength,
          maxStrengthDbm: maxStrength,
          avgStrengthDbm: avgStrength
        },
        // The 2D matrix of signal strengths (dBm)
        matrix: matrix,
        // The raw coordinates readings [{x, y, strength, timestamp}]
        measurements: wifi.measurements
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /SSID/block or /:ssid/block
 * Sends location (GPS), strength(dBm), band, security, est distance, coordinates
 * Appends/updates the measurement point for the Wi-Fi in the block.
 */
exports.postWifiBlockMeasurement = async (req, res, next) => {
  try {
    const paramSsid = req.params.ssid;
    const {
      ssid: bodySsid,
      blockId,
      blockName,
      location,
      lat,
      lon,
      strength,
      band,
      security,
      estDistance,
      est_distance,
      coordinates,
      x,
      y
    } = req.body;

    const resolvedSsid = (paramSsid || bodySsid || '').trim();
    if (!resolvedSsid) {
      return res.status(400).json({
        success: false,
        message: 'SSID is required in URL or body'
      });
    }

    // Extract coordinates (x, y)
    let coordX = x;
    let coordY = y;

    if (coordinates) {
      if (Array.isArray(coordinates)) {
        coordX = coordinates[0];
        coordY = coordinates[1];
      } else if (typeof coordinates === 'object') {
        coordX = coordinates.x;
        coordY = coordinates.y;
      }
    }

    if (coordX == null || coordY == null || isNaN(coordX) || isNaN(coordY)) {
      return res.status(400).json({
        success: false,
        message: 'Valid coordinates (x, y) are required'
      });
    }

    if (strength == null || isNaN(strength)) {
      return res.status(400).json({
        success: false,
        message: 'Valid signal strength (dBm) is required'
      });
    }

    // Resolve lat/lon from location or direct properties
    let resolvedLat = lat;
    let resolvedLon = lon;
    if (location) {
      if (typeof location === 'string') {
        try {
          const parsed = JSON.parse(location);
          resolvedLat = parsed.lat ?? parsed.latitude;
          resolvedLon = parsed.lon ?? parsed.longitude;
        } catch (e) {}
      } else if (typeof location === 'object') {
        resolvedLat = location.lat ?? location.latitude;
        resolvedLon = location.lon ?? location.longitude;
      }
    }

    const resolvedEstDistance = estDistance ?? est_distance ?? null;

    // Locate block
    const block = await findTargetBlock({
      blockId,
      blockName,
      lat: resolvedLat,
      lon: resolvedLon
    });

    if (!block) {
      return res.status(404).json({
        success: false,
        message: 'Block not found for the given blockId or location'
      });
    }

    // Find or automatically create Wi-Fi entry in this block
    let wifi = block.wifis.find(
      (w) => w.ssid.toLowerCase() === resolvedSsid.toLowerCase()
    );

    if (!wifi) {
      // Auto-register Wi-Fi in block
      block.wifis.push({
        ssid: resolvedSsid,
        band: band || '2.4GHz',
        security: security || 'WPA2',
        estDistance: resolvedEstDistance,
        measurements: [],
        rawMatrix: [],
        lastUpdated: new Date()
      });
      wifi = block.wifis[block.wifis.length - 1];
    } else {
      // Update Wi-Fi metadata if provided
      if (band) wifi.band = band;
      if (security) wifi.security = security;
      if (resolvedEstDistance != null) wifi.estDistance = resolvedEstDistance;
      wifi.lastUpdated = new Date();
    }

    // Create and push new measurement
    const newMeasurement = {
      x: Number(coordX),
      y: Number(coordY),
      strength: Number(strength),
      band: band || wifi.band,
      security: security || wifi.security,
      estDistance: resolvedEstDistance,
      timestamp: new Date()
    };

    wifi.measurements.push(newMeasurement);

    await block.save();

    // Generate updated 2D Matrix
    const updatedMatrix = build2DMatrix(wifi.measurements);

    return res.status(201).json({
      success: true,
      message: 'Measurement recorded successfully',
      blockId: block.blockId,
      blockName: block.blockName,
      wifi: {
        ssid: wifi.ssid,
        band: wifi.band,
        security: wifi.security,
        estDistance: wifi.estDistance,
        lastMeasurement: newMeasurement,
        totalMeasurements: wifi.measurements.length,
        matrix: updatedMatrix
      }
    });
  } catch (error) {
    next(error);
  }
};


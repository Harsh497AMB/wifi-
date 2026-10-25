const fs = require('fs');
const path = require('path');
const Wifi = require('../models/Wifi');
const Block = require('../models/Block');
const { get10mGridKey, getHaversineDistance } = require('../utils/locationHelper');
const { build2DMatrix } = require('../utils/matrixHelper');
const { ssidRegex } = require('../utils/stringHelper');

/**
 * Helper to locate an indoor block inside a Wi-Fi document,
 * or lookup and auto-attach from Block master collection if needed
 */
async function resolveWifiBlock(wifi, { blockId, blockName, lat, lon }, autoAttach = false) {
  let targetBlock = null;

  // 1. Try to find inside wifi.blocks
  if (blockId) {
    targetBlock = wifi.blocks.find((b) => b.blockId === blockId);
  }

  if (!targetBlock && lat != null && lon != null) {
    const gridKey = get10mGridKey(lat, lon);
    targetBlock = wifi.blocks.find((b) => {
      if (b.location?.gridKey && b.location.gridKey === gridKey) return true;
      if (b.location?.lat != null && b.location?.lon != null) {
        const dist = getHaversineDistance(b.location.lat, b.location.lon, lat, lon);
        if (dist <= 10) return true;
      }
      return false;
    });
  }

  if (!targetBlock && blockName) {
    targetBlock = wifi.blocks.find(
      (b) => b.blockName.toLowerCase() === blockName.trim().toLowerCase()
    );
  }

  // Fallback: If only 1 block is assigned and no specific filter provided
  if (!targetBlock && !blockId && !blockName && lat == null && wifi.blocks.length === 1) {
    targetBlock = wifi.blocks[0];
  }

  // 2. If not found in wifi.blocks, check Block collection
  if (!targetBlock && autoAttach) {
    let masterBlock = null;
    if (blockId) {
      masterBlock = await Block.findOne({ blockId });
    }

    if (!masterBlock && lat != null && lon != null) {
      const gridKey = get10mGridKey(lat, lon);
      masterBlock = await Block.findOne({
        $or: [
          { 'location.gridKey': gridKey },
          {
            'location.lat': { $gte: Number(lat) - 0.00015, $lte: Number(lat) + 0.00015 },
            'location.lon': { $gte: Number(lon) - 0.00015, $lte: Number(lon) + 0.00015 }
          }
        ]
      });
    }

    if (!masterBlock && blockName) {
      masterBlock = await Block.findOne({ blockName: blockName.trim() });
    }

    if (masterBlock) {
      // Auto-attach block to Wi-Fi
      wifi.blocks.push({
        blockId: masterBlock.blockId,
        blockName: masterBlock.blockName,
        location: {
          lat: masterBlock.location.lat,
          lon: masterBlock.location.lon,
          gridKey: masterBlock.location.gridKey,
          geo: masterBlock.location.geo
        },
        blockImage: masterBlock.blockImage.toObject ? masterBlock.blockImage.toObject() : { ...masterBlock.blockImage },
        scale: masterBlock.scale,
        measurements: [],
        rawMatrix: [],
        addedAt: new Date(),
        lastUpdated: new Date()
      });
      targetBlock = wifi.blocks[wifi.blocks.length - 1];
    }
  }

  return targetBlock;
}

/**
 * GET /SSID/block or /:ssid/block
 * Returns the matrix of the Wi-Fi in that particular block, related terms,
 * and sends the floor map image if not available to user (in cache or local storage).
 */
exports.getWifiBlock = async (req, res, next) => {
  try {
    const ssid = req.params.ssid || req.query.ssid;
    const blockId = req.params.blockId || req.query.blockId || req.headers['x-block-id'];
    const blockName = req.query.blockName;
    const lat = req.query.lat;
    const lon = req.query.lon;
    const lite = req.query.lite === 'true';

    if (!ssid) {
      return res.status(400).json({
        success: false,
        message: 'SSID must be provided in route param or query (e.g., /SSID/block?ssid=MyWifi&blockId=...)'
      });
    }

    // Find the Wi-Fi document
    const wifi = await Wifi.findOne({
      ssid: ssidRegex(ssid)
    });

    if (!wifi) {
      return res.status(404).json({
        success: false,
        message: `Wi-Fi with SSID '${ssid}' not found`
      });
    }

    // Locate the block inside this Wi-Fi's blocks
    const targetBlock = await resolveWifiBlock(wifi, { blockId, blockName, lat, lon }, false);

    if (!targetBlock) {
      return res.status(404).json({
        success: false,
        message: `Block not found for Wi-Fi '${wifi.ssid}'.`,
        availableBlocks: wifi.blocks.map((b) => ({
          blockId: b.blockId,
          blockName: b.blockName,
          measurementsCount: b.measurements.length
        }))
      });
    }

    // Validate image dimensions are present
    const imageWidth = targetBlock.blockImage?.imageWidth;
    const imageHeight = targetBlock.blockImage?.imageHeight;
    if (!imageWidth || !imageHeight) {
      return res.status(400).json({
        success: false,
        message: 'Block has no image size. Delete and recreate it.'
      });
    }

    // Determine client cache status for floor map image
    const clientHasImage =
      req.query.hasImage === 'true' ||
      req.headers['x-has-image'] === 'true' ||
      req.headers['if-none-match'] === `"${targetBlock.blockImage?.filename}"` ||
      req.headers['if-none-match'] === targetBlock.blockImage?.filename;

    const includeImageExplicit = req.query.includeImage === 'true';
    const shouldSendImageData = !clientHasImage || includeImageExplicit;

    let floorImageData = null;
    if (
      shouldSendImageData &&
      targetBlock.blockImage?.path &&
      !(targetBlock.blockImage.url || '').startsWith('https://')
    ) {
      if (targetBlock.blockImage.path) {
        try {
          if (fs.existsSync(targetBlock.blockImage.path)) {
            const fileBuffer = fs.readFileSync(targetBlock.blockImage.path);
            floorImageData = {
              mimetype: targetBlock.blockImage.mimetype,
              base64: `data:${targetBlock.blockImage.mimetype};base64,${fileBuffer.toString('base64')}`
            };
          }
        } catch (err) {
          console.error('Error reading floor image file for base64 response:', err.message);
        }
      }
    }

    // Build 2D Matrix from measurements using image-pixel coordinates
    const { matrix, rows, cols } = build2DMatrix(targetBlock.measurements, imageWidth, imageHeight);

    // Compute basic heatmap statistics
    let minStrength = null;
    let maxStrength = null;
    let avgStrength = null;

    if (targetBlock.measurements.length > 0) {
      const strengths = targetBlock.measurements.map((m) => m.strength);
      minStrength = Math.min(...strengths);
      maxStrength = Math.max(...strengths);
      avgStrength = Number((strengths.reduce((a, b) => a + b, 0) / strengths.length).toFixed(2));
    }

    // Set ETag header for caching
    if (targetBlock.blockImage?.filename) {
      res.setHeader('ETag', `"${targetBlock.blockImage.filename}"`);
    }

    return res.status(200).json({
      success: true,
      wifi: {
        ssid: wifi.ssid,
        band: wifi.band,
        width: wifi.width,
        security: wifi.security,
        estDistance: targetBlock.measurements[targetBlock.measurements.length - 1]?.estDistance ?? null,
        lastUpdated: targetBlock.lastUpdated,
        rows,
        cols,
        stats: {
          totalPoints: targetBlock.measurements.length,
          minStrengthDbm: minStrength,
          maxStrengthDbm: maxStrength,
          avgStrengthDbm: avgStrength
        },
        matrix,
        ...(lite ? {} : { measurements: targetBlock.measurements })
      },
      block: {
        blockId: targetBlock.blockId,
        blockName: targetBlock.blockName,
        location: {
          lat: targetBlock.location.lat,
          lon: targetBlock.location.lon,
          gridKey: targetBlock.location.gridKey
        },
        scale: targetBlock.scale,
        image: {
          filename: targetBlock.blockImage?.filename,
          url: targetBlock.blockImage?.url,
          width: imageWidth,
          height: imageHeight,
          isCachedOnClient: clientHasImage,
          floorImage: floorImageData
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /SSID/block or /:ssid/block
 * Sends location (GPS), strength(dBm), band, security, est distance, coordinates
 * Appends the measurement point to the indoor block inside that Wi-Fi.
 */
exports.postWifiBlockMeasurement = async (req, res, next) => {
  try {
    const paramSsid = req.params.ssid;
    const {
      ssid: bodySsid,
      blockId,
      indoorBlockId,
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
    const resolvedBlockId = (blockId || indoorBlockId || '').trim();

    // Find or create Wi-Fi document
    let wifi = await Wifi.findOne({
      ssid: ssidRegex(resolvedSsid)
    });

    if (!wifi) {
      wifi = new Wifi({
        ssid: resolvedSsid,
        band: band || '2.4GHz',
        security: security || 'WPA2',
        blocks: []
      });
    } else {
      if (band) wifi.band = band;
      if (security) wifi.security = security;
    }

    // Locate the indoor block inside this Wi-Fi, or auto-attach from Block master collection
    const targetBlock = await resolveWifiBlock(
      wifi,
      {
        blockId: resolvedBlockId,
        blockName,
        lat: resolvedLat,
        lon: resolvedLon
      },
      true // autoAttach if found in Block collection
    );

    if (!targetBlock) {
      return res.status(404).json({
        success: false,
        message: 'Block not found for the given blockId or location. Please create block first using POST /createBlock or provide valid blockId.'
      });
    }

    // Create the measurement
    const newMeasurement = {
      x: Number(coordX),
      y: Number(coordY),
      strength: Number(strength),
      band: band || wifi.band,
      security: security || wifi.security,
      estDistance: resolvedEstDistance,
      timestamp: new Date()
    };

    // 1) Save the Wi-Fi doc only if it is new or a block was just auto-attached
    if (wifi.isNew || wifi.isModified()) {
      await wifi.save();
    }

    // 2) Atomic push: no version check, safe for concurrent taps
    const filters = { arrayFilters: [{ 'b.blockId': targetBlock.blockId }] };
    await Wifi.updateOne(
      { _id: wifi._id },
      {
        $push: { 'blocks.$[b].measurements': newMeasurement },
        $set: { 'blocks.$[b].lastUpdated': new Date() }
      },
      filters
    );

    return res.status(201).json({
      success: true,
      message: 'Measurement recorded successfully',
      ssid: wifi.ssid,
      blockId: targetBlock.blockId,
      blockName: targetBlock.blockName,
      wifi: {
        ssid: wifi.ssid,
        band: wifi.band,
        security: wifi.security,
        estDistance: resolvedEstDistance,
        lastMeasurement: newMeasurement,
        totalMeasurements: targetBlock.measurements.length + 1
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /wifis
 * Lists all Wi-Fi networks and summary of their indoor blocks
 */
exports.getAllWifis = async (req, res, next) => {
  try {
    const wifis = await Wifi.find().sort({ updatedAt: -1 });

    return res.status(200).json({
      success: true,
      count: wifis.length,
      wifis: wifis.map((w) => ({
        ssid: w.ssid,
        band: w.band,
        width: w.width,
        security: w.security,
        totalBlocks: w.blocks.length,
        blocks: w.blocks.map((b) => ({
          blockId: b.blockId,
          blockName: b.blockName,
          location: b.location,
          totalMeasurements: b.measurements.length
        }))
      }))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /wifi/:ssid
 * Retrieves detailed info for a single Wi-Fi and its assigned blocks
 */
exports.getWifiBySsid = async (req, res, next) => {
  try {
    const { ssid } = req.params;
    const wifi = await Wifi.findOne({
      ssid: ssidRegex(ssid)
    });

    if (!wifi) {
      return res.status(404).json({
        success: false,
        message: `Wi-Fi '${ssid}' not found`
      });
    }

    return res.status(200).json({
      success: true,
      wifi
    });
  } catch (error) {
    next(error);
  }
};

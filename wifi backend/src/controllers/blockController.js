const fs = require('fs');
const path = require('path');
const Block = require('../models/Block');
const { get10mGridKey, getHaversineDistance } = require('../utils/locationHelper');
const { build2DMatrix } = require('../utils/matrixHelper');
const {
  calculatePixelDistance,
  calibrateScaleFromPoints,
  calculateRealDistance
} = require('../utils/distanceHelper');

/**
 * POST /createBlock
 * Creates a new indoor block with floor map image and assigns unique id
 */
exports.createBlock = async (req, res, next) => {
  try {
    const {
      blockName,
      name,
      lat,
      lon,
      location,
      metersPerPixel,
      calibration,
      realWidthMeters,
      realHeightMeters
    } = req.body;

    const resolvedBlockName = (blockName || name || '').trim();
    if (!resolvedBlockName) {
      return res.status(400).json({
        success: false,
        message: 'Block name is required'
      });
    }

    // Resolve lat and lon from body (handles lat/lon directly or nested { location: { lat, lon } })
    let resolvedLat = lat;
    let resolvedLon = lon;
    if (location) {
      if (typeof location === 'string') {
        try {
          const parsed = JSON.parse(location);
          resolvedLat = parsed.lat ?? parsed.latitude;
          resolvedLon = parsed.lon ?? parsed.longitude;
        } catch (e) {
          // not JSON string
        }
      } else if (typeof location === 'object') {
        resolvedLat = location.lat ?? location.latitude;
        resolvedLon = location.lon ?? location.longitude;
      }
    }

    if (resolvedLat == null || resolvedLon == null || isNaN(resolvedLat) || isNaN(resolvedLon)) {
      return res.status(400).json({
        success: false,
        message: 'Valid latitude (lat) and longitude (lon) are required'
      });
    }

    // Check if image file was uploaded via Multer
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Block floor map image (blockImage) is required'
      });
    }

    // Parse initial scale / calibration if provided
    let blockScale = {
      metersPerPixel: null,
      referencePixelDistance: null,
      referenceRealDistanceMeters: null,
      realWidthMeters: realWidthMeters ? Number(realWidthMeters) : null,
      realHeightMeters: realHeightMeters ? Number(realHeightMeters) : null,
      isCalibrated: false
    };

    if (metersPerPixel && !isNaN(metersPerPixel)) {
      blockScale.metersPerPixel = Number(metersPerPixel);
      blockScale.isCalibrated = true;
    } else if (calibration) {
      let calibObj = calibration;
      if (typeof calibration === 'string') {
        try {
          calibObj = JSON.parse(calibration);
        } catch (e) {}
      }
      if (calibObj.pointA && calibObj.pointB && calibObj.realDistanceMeters) {
        const calibResult = calibrateScaleFromPoints(
          calibObj.pointA,
          calibObj.pointB,
          calibObj.realDistanceMeters
        );
        blockScale.metersPerPixel = calibResult.metersPerPixel;
        blockScale.referencePixelDistance = calibResult.pixelDistance;
        blockScale.referenceRealDistanceMeters = calibResult.realDistanceMeters;
        blockScale.isCalibrated = true;
      }
    }

    const host = req.get('host');
    const protocol = req.protocol;
    const imageUrl = `${protocol}://${host}/uploads/blocks/${req.file.filename}`;

    const newBlock = new Block({
      blockName: resolvedBlockName,
      location: {
        lat: Number(resolvedLat),
        lon: Number(resolvedLon),
        gridKey: get10mGridKey(resolvedLat, resolvedLon),
        geo: {
          type: 'Point',
          coordinates: [Number(resolvedLon), Number(resolvedLat)]
        }
      },
      blockImage: {
        filename: req.file.filename,
        path: req.file.path,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        url: imageUrl
      },
      scale: blockScale,
      wifis: []
    });

    const savedBlock = await newBlock.save();

    return res.status(201).json({
      success: true,
      message: 'Block created successfully',
      block: {
        blockId: savedBlock.blockId,
        blockName: savedBlock.blockName,
        location: {
          lat: savedBlock.location.lat,
          lon: savedBlock.location.lon,
          gridKey: savedBlock.location.gridKey
        },
        blockImage: {
          filename: savedBlock.blockImage.filename,
          url: savedBlock.blockImage.url
        },
        scale: savedBlock.scale,
        wifis: savedBlock.wifis,
        createdAt: savedBlock.createdAt
      }
    });
  } catch (error) {
    // If error occurred and file was uploaded, clean up file
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.error('Failed to cleanup file on error:', err);
      }
    }
    next(error);
  }
};

/**
 * POST /addWifi
 * Adds a new Wi-Fi or updates existing Wi-Fi configuration in an existing block
 */
exports.addWifi = async (req, res, next) => {
  try {
    const { blockId, blockName, location, lat, lon, ssid, band, width, security } = req.body;

    if (!ssid || !ssid.trim()) {
      return res.status(400).json({
        success: false,
        message: 'SSID is required'
      });
    }

    // Locate block by blockId or by (lat, lon, blockName)
    let block = null;
    if (blockId) {
      block = await Block.findOne({ blockId });
    } else {
      let resolvedLat = lat ?? location?.lat;
      let resolvedLon = lon ?? location?.lon;

      if (blockName && resolvedLat != null && resolvedLon != null) {
        const gridKey = get10mGridKey(resolvedLat, resolvedLon);
        block = await Block.findOne({
          blockName: blockName.trim(),
          $or: [
            { 'location.gridKey': gridKey },
            {
              'location.lat': { $gte: Number(resolvedLat) - 0.00015, $lte: Number(resolvedLat) + 0.00015 },
              'location.lon': { $gte: Number(resolvedLon) - 0.00015, $lte: Number(resolvedLon) + 0.00015 }
            }
          ]
        });
      } else if (blockName) {
        block = await Block.findOne({ blockName: blockName.trim() });
      }
    }

    if (!block) {
      return res.status(404).json({
        success: false,
        message: 'Block not found. Please provide a valid blockId or location and blockName.'
      });
    }

    const trimmedSsid = ssid.trim();
    // Check if Wi-Fi already exists in this block
    const existingWifiIndex = block.wifis.findIndex(
      (w) => w.ssid.toLowerCase() === trimmedSsid.toLowerCase()
    );

    if (existingWifiIndex !== -1) {
      // Update existing Wi-Fi properties
      if (band) block.wifis[existingWifiIndex].band = band;
      if (width) block.wifis[existingWifiIndex].width = width;
      if (security) block.wifis[existingWifiIndex].security = security;
      block.wifis[existingWifiIndex].lastUpdated = new Date();
    } else {
      // Add new Wi-Fi
      block.wifis.push({
        ssid: trimmedSsid,
        band: band || '2.4GHz',
        width: width || '20MHz',
        security: security || 'WPA2',
        estDistance: null,
        measurements: [],
        rawMatrix: [],
        lastUpdated: new Date()
      });
    }

    await block.save();

    const targetWifi = block.wifis.find(
      (w) => w.ssid.toLowerCase() === trimmedSsid.toLowerCase()
    );

    return res.status(200).json({
      success: true,
      message: existingWifiIndex !== -1 ? 'Wi-Fi configuration updated' : 'Wi-Fi added to block successfully',
      blockId: block.blockId,
      blockName: block.blockName,
      wifi: {
        ssid: targetWifi.ssid,
        band: targetWifi.band,
        width: targetWifi.width,
        security: targetWifi.security,
        measurementsCount: targetWifi.measurements.length
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /delete
 * Deletes the existing block and all associated Wi-Fis for that block
 * Body accepts blockId OR (location(lat, lon), block name, [block image])
 */
exports.deleteBlock = async (req, res, next) => {
  try {
    const { blockId, blockName, name, lat, lon, location, blockImage } = req.body;

    let filter = {};

    if (blockId) {
      filter.blockId = blockId;
    } else {
      const resolvedName = (blockName || name || '').trim();
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

      if (resolvedName) {
        filter.blockName = resolvedName;
      }

      if (resolvedLat != null && resolvedLon != null) {
        const gridKey = get10mGridKey(resolvedLat, resolvedLon);
        filter.$or = [
          { 'location.gridKey': gridKey },
          {
            'location.lat': { $gte: Number(resolvedLat) - 0.00015, $lte: Number(resolvedLat) + 0.00015 },
            'location.lon': { $gte: Number(resolvedLon) - 0.00015, $lte: Number(resolvedLon) + 0.00015 }
          }
        ];
      }

      if (blockImage) {
        filter['blockImage.filename'] = path.basename(blockImage);
      }
    }

    if (Object.keys(filter).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Must provide blockId or location (lat, lon) and blockName to delete'
      });
    }

    const block = await Block.findOne(filter);

    if (!block) {
      return res.status(404).json({
        success: false,
        message: 'Block not found matching specified criteria'
      });
    }

    // Delete the local image file if present
    if (block.blockImage && block.blockImage.path) {
      try {
        if (fs.existsSync(block.blockImage.path)) {
          fs.unlinkSync(block.blockImage.path);
        }
      } catch (err) {
        console.error('Error deleting block image file:', err.message);
      }
    }

    await Block.deleteOne({ _id: block._id });

    return res.status(200).json({
      success: true,
      message: `Block '${block.blockName}' (ID: ${block.blockId}) and its Wi-Fi records deleted successfully`
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /blocks
 * Lists all indoor blocks or blocks nearby given lat/lon (10m accuracy)
 */
exports.getAllBlocks = async (req, res, next) => {
  try {
    const { lat, lon, radius = 50 } = req.query;

    let blocks;
    if (lat != null && lon != null) {
      const numLat = Number(lat);
      const numLon = Number(lon);

      // Geospatial query within specified radius (default 50m, or 10m for immediate cell)
      blocks = await Block.find({
        'location.geo': {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [numLon, numLat]
            },
            $maxDistance: Number(radius)
          }
        }
      });
    } else {
      blocks = await Block.find().sort({ createdAt: -1 });
    }

    return res.status(200).json({
      success: true,
      count: blocks.length,
      blocks: blocks.map((b) => ({
        blockId: b.blockId,
        blockName: b.blockName,
        location: b.location,
        blockImage: b.blockImage,
        scale: b.scale,
        wifisCount: b.wifis.length,
        wifis: b.wifis.map((w) => ({
          ssid: w.ssid,
          band: w.band,
          width: w.width,
          security: w.security,
          measurementsCount: w.measurements.length
        }))
      }))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /block/:blockId
 * Retrieves full details for a single block
 */
exports.getBlockById = async (req, res, next) => {
  try {
    const { blockId } = req.params;
    const block = await Block.findOne({ blockId });

    if (!block) {
      return res.status(404).json({
        success: false,
        message: 'Block not found'
      });
    }

    return res.status(200).json({
      success: true,
      block
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /block/:blockId/image
 * Streams the floor map image with ETag / 304 Not Modified caching support
 */
exports.getBlockImage = async (req, res, next) => {
  try {
    const { blockId } = req.params;
    const block = await Block.findOne({ blockId });

    if (!block || !block.blockImage || !block.blockImage.path) {
      return res.status(404).json({
        success: false,
        message: 'Block or image not found'
      });
    }

    const imagePath = block.blockImage.path;
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({
        success: false,
        message: 'Image file does not exist on disk'
      });
    }

    // Set Cache-Control and send file
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
    return res.sendFile(path.resolve(imagePath));
  } catch (error) {
    next(error);
  }
};

/**
 * POST /calibrateBlock
 * Calibrates the real-world scale (meters per pixel) of an indoor floor map
 * Body accepts:
 * - blockId (or blockName)
 * - Either { pointA: {x, y}, pointB: {x, y}, realDistanceMeters }
 * - OR { metersPerPixel }
 * - OR { realWidthMeters, imageWidth }
 */
exports.calibrateBlock = async (req, res, next) => {
  try {
    const {
      blockId,
      blockName,
      pointA,
      pointB,
      realDistanceMeters,
      metersPerPixel,
      realWidthMeters,
      imageWidth
    } = req.body;

    if (!blockId && !blockName) {
      return res.status(400).json({
        success: false,
        message: 'blockId or blockName is required'
      });
    }

    const hasPoints = pointA && pointB && realDistanceMeters;
    const hasMetersPerPx = metersPerPixel != null && !isNaN(metersPerPixel);
    const hasDimensions = realWidthMeters && imageWidth;

    if (!hasPoints && !hasMetersPerPx && !hasDimensions) {
      return res.status(400).json({
        success: false,
        message: 'Must provide either (pointA, pointB, realDistanceMeters) OR metersPerPixel'
      });
    }

    let block;
    if (blockId) {
      block = await Block.findOne({ blockId });
    } else if (blockName) {
      block = await Block.findOne({ blockName: blockName.trim() });
    }

    if (!block) {
      return res.status(404).json({
        success: false,
        message: 'Block not found. Please provide a valid blockId or blockName'
      });
    }

    if (metersPerPixel && !isNaN(metersPerPixel)) {
      block.scale.metersPerPixel = Number(metersPerPixel);
      block.scale.isCalibrated = true;
    } else if (pointA && pointB && realDistanceMeters) {
      const result = calibrateScaleFromPoints(pointA, pointB, realDistanceMeters);
      block.scale.metersPerPixel = result.metersPerPixel;
      block.scale.referencePixelDistance = result.pixelDistance;
      block.scale.referenceRealDistanceMeters = result.realDistanceMeters;
      block.scale.isCalibrated = true;
    } else if (realWidthMeters && imageWidth) {
      const mPerPx = Number(realWidthMeters) / Number(imageWidth);
      block.scale.metersPerPixel = Number(mPerPx.toFixed(6));
      block.scale.realWidthMeters = Number(realWidthMeters);
      block.scale.isCalibrated = true;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Must provide either (pointA, pointB, realDistanceMeters) OR metersPerPixel'
      });
    }

    await block.save();

    return res.status(200).json({
      success: true,
      message: 'Block floor map scale calibrated successfully',
      blockId: block.blockId,
      blockName: block.blockName,
      scale: block.scale
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /calculateDistance
 * Computes the real-world distance in meters between any two points on a floor map
 * Body: { blockId, pointA: {x, y}, pointB: {x, y} }
 */
exports.calculateDistance = async (req, res, next) => {
  try {
    const { blockId, pointA, pointB } = req.body;

    if (!blockId || !pointA || !pointB) {
      return res.status(400).json({
        success: false,
        message: 'blockId, pointA {x, y}, and pointB {x, y} are required'
      });
    }

    const block = await Block.findOne({ blockId });
    if (!block) {
      return res.status(404).json({
        success: false,
        message: 'Block not found'
      });
    }

    const pixelDist = calculatePixelDistance(pointA, pointB);

    if (!block.scale || !block.scale.isCalibrated || !block.scale.metersPerPixel) {
      return res.status(200).json({
        success: true,
        blockId: block.blockId,
        isCalibrated: false,
        pixelDistance: Number(pixelDist.toFixed(2)),
        realDistanceMeters: null,
        message: 'Floor map is not calibrated yet. Call POST /calibrateBlock with two reference points to enable real-world meter calculations.'
      });
    }

    const { realDistanceMeters } = calculateRealDistance(pointA, pointB, block.scale.metersPerPixel);

    return res.status(200).json({
      success: true,
      blockId: block.blockId,
      isCalibrated: true,
      pixelDistance: Number(pixelDist.toFixed(2)),
      metersPerPixel: block.scale.metersPerPixel,
      realDistanceMeters: realDistanceMeters
    });
  } catch (error) {
    next(error);
  }
};
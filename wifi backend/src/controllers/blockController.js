const fs = require('fs');
const path = require('path');
const Block = require('../models/Block');
const Wifi = require('../models/Wifi');
const { get10mGridKey, getHaversineDistance } = require('../utils/locationHelper');
const { uploadBuffer, deleteImage } = require('../config/cloudinary');
const { ssidRegex } = require('../utils/stringHelper');
const {
  calculatePixelDistance,
  calibrateScaleFromPoints,
  calculateRealDistance
} = require('../utils/distanceHelper');

/**
 * POST /createBlock
 * Creates a new indoor block with floor map image and assigns unique id
 * Accepts: blockName, lat, lon (or location), blockImage (file via multer)
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

    const uploaded = await uploadBuffer(req.file.buffer);
    const imageUrl = uploaded.secure_url;

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
        filename: uploaded.public_id,
        path: uploaded.public_id,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        url: imageUrl
      },
      scale: blockScale
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
        createdAt: savedBlock.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /addblock (alias /addWifi)
 * Assigns an indoor block to a Wi-Fi network
 * req body: wifi ssid and the indoor block id
 */
exports.addBlock = async (req, res, next) => {
  try {
    const {
      ssid,
      wifiSsid,
      wifi: wifiParam,
      blockId,
      indoorBlockId,
      block_id,
      blockName,
      lat,
      lon,
      location,
      band,
      width,
      security
    } = req.body;

    const resolvedSsid = (ssid || wifiSsid || wifiParam || '').trim();
    const resolvedBlockId = (blockId || indoorBlockId || block_id || '').trim();

    if (!resolvedSsid) {
      return res.status(400).json({
        success: false,
        message: 'SSID is required'
      });
    }

    if (!resolvedBlockId && !blockName && lat == null && location == null) {
      return res.status(400).json({
        success: false,
        message: 'Indoor block ID (blockId) is required'
      });
    }

    // Locate the master block
    let block = null;
    if (resolvedBlockId) {
      block = await Block.findOne({ blockId: resolvedBlockId });
    }

    if (!block) {
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

      if (blockName && resolvedLat != null && resolvedLon != null) {
        const gridKey = get10mGridKey(resolvedLat, resolvedLon);
        block = await Block.findOne({
          blockName: blockName.trim(),
          $or: [
            { 'location.gridKey': gridKey },
            {
              'location.lat': { $gte: Number(resolvedLat) - 0.00015,$lte: Number(resolvedLat) + 0.00015 },
              'location.lon': { $gte: Number(resolvedLon) - 0.00015,$lte: Number(resolvedLon) + 0.00015 }
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
        message: `Block not found. Please provide a valid blockId (or create one using POST /createBlock).`
      });
    }

    // Find or create the Wi-Fi document
    let wifi = await Wifi.findOne({
      ssid: ssidRegex(resolvedSsid)
    });

    if (!wifi) {
      wifi = new Wifi({
        ssid: resolvedSsid,
        band: band || '2.4GHz',
        width: width || '20MHz',
        security: security || 'WPA2',
        blocks: []
      });
    } else {
      if (band) wifi.band = band;
      if (width) wifi.width = width;
      if (security) wifi.security = security;
    }

    // Check if the block is already assigned to this Wi-Fi
    const existingIndex = wifi.blocks.findIndex((b) => b.blockId === block.blockId);

    if (existingIndex !== -1) {
      await wifi.save();
      return res.status(200).json({
        success: true,
        message: 'Block is already assigned to this Wi-Fi',
        ssid: wifi.ssid,
        block: {
          blockId: wifi.blocks[existingIndex].blockId,
          blockName: wifi.blocks[existingIndex].blockName,
          measurementsCount: wifi.blocks[existingIndex].measurements.length
        },
        totalBlocksInWifi: wifi.blocks.length
      });
    }

    // Assign the indoor block to the Wi-Fi
    wifi.blocks.push({
      blockId: block.blockId,
      blockName: block.blockName,
      location: {
        lat: block.location.lat,
        lon: block.location.lon,
        gridKey: block.location.gridKey,
        geo: block.location.geo
      },
      blockImage: block.blockImage,
      scale: block.scale,
      measurements: [],
      rawMatrix: [],
      addedAt: new Date(),
      lastUpdated: new Date()
    });

    await wifi.save();

    return res.status(200).json({
      success: true,
      message: 'Block assigned to Wi-Fi successfully',
      ssid: wifi.ssid,
      block: {
        blockId: block.blockId,
        blockName: block.blockName,
        location: {
          lat: block.location.lat,
          lon: block.location.lon,
          gridKey: block.location.gridKey
        },
        blockImage: {
          filename: block.blockImage.filename,
          url: block.blockImage.url
        }
      },
      totalBlocksInWifi: wifi.blocks.length
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /delete
 * Deletes the existing block in that Wi-Fi (if ssid specified),
 * or deletes the block globally and from all associated Wi-Fis
 * Accepts: location (lat, lon), block id, [ssid]
 */
exports.deleteBlock = async (req, res, next) => {
  try {
    const { blockId, indoorBlockId, blockName, name, lat, lon, location, ssid } = req.body;

    const resolvedBlockId = (blockId || indoorBlockId || '').trim();
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

    if (!resolvedBlockId && !resolvedName && (resolvedLat == null || resolvedLon == null)) {
      return res.status(400).json({
        success: false,
        message: 'Must provide blockId or location (lat, lon) and blockName to delete'
      });
    }

    // 1. If SSID is specified: remove the block from that specific Wi-Fi
    if (ssid && ssid.trim()) {
      const wifi = await Wifi.findOne({
        ssid: ssidRegex(ssid)
      });

      if (!wifi) {
        return res.status(404).json({
          success: false,
          message: `Wi-Fi with SSID '${ssid}' not found`
        });
      }

      const blockIndex = wifi.blocks.findIndex((b) => {
        if (resolvedBlockId && b.blockId === resolvedBlockId) return true;
        if (resolvedLat != null && resolvedLon != null) {
          const dist = getHaversineDistance(b.location.lat, b.location.lon, resolvedLat, resolvedLon);
          if (dist <= 10) return true;
        }
        if (resolvedName && b.blockName.toLowerCase() === resolvedName.toLowerCase()) return true;
        return false;
      });

      if (blockIndex === -1) {
        return res.status(404).json({
          success: false,
          message: `Block not found in Wi-Fi '${wifi.ssid}'`
        });
      }

      const removedBlock = wifi.blocks[blockIndex];
      wifi.blocks.splice(blockIndex, 1);
      await wifi.save();

      return res.status(200).json({
        success: true,
        message: `Block '${removedBlock.blockName}' (ID: ${removedBlock.blockId}) removed from Wi-Fi '${wifi.ssid}' successfully`,
        ssid: wifi.ssid,
        remainingBlocks: wifi.blocks.length
      });
    }

    // 2. If SSID is not specified: delete block globally and from all Wi-Fis
    let filter = {};
    if (resolvedBlockId) {
      filter.blockId = resolvedBlockId;
    } else {
      if (resolvedName) filter.blockName = resolvedName;
      if (resolvedLat != null && resolvedLon != null) {
        const gridKey = get10mGridKey(resolvedLat, resolvedLon);
        filter.$or = [
          { 'location.gridKey': gridKey },
          {
            'location.lat': { $gte: Number(resolvedLat) - 0.00015,$lte: Number(resolvedLat) + 0.00015 },
            'location.lon': { $gte: Number(resolvedLon) - 0.00015,$lte: Number(resolvedLon) + 0.00015 }
          }
        ];
      }
    }

    const block = await Block.findOne(filter);

    if (!block) {
      // Check if block exists only in a Wi-Fi document
      const wifiWithBlock = await Wifi.findOne({
        'blocks.blockId': resolvedBlockId
      });
      if (wifiWithBlock) {
        await Wifi.updateMany(
          {},
          { $pull: { blocks: { blockId: resolvedBlockId } } }
        );
        return res.status(200).json({
          success: true,
          message: `Block ID '${resolvedBlockId}' removed from all Wi-Fi records successfully`
        });
      }

      return res.status(404).json({
        success: false,
        message: 'Block not found matching specified criteria'
      });
    }

    const targetBlockId = block.blockId;

    await deleteImage(block.blockImage?.filename);

    // Remove this block from ALL Wi-Fi documents
    await Wifi.updateMany(
      {},
      { $pull: { blocks: { blockId: targetBlockId } } }
    );

    // Delete the block master record
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
 * Also includes list of Wi-Fis covering each block
 */
exports.getAllBlocks = async (req, res, next) => {
  try {
    const { lat, lon, radius = 50 } = req.query;

    let blocks;
    if (lat != null && lon != null) {
      const numLat = Number(lat);
      const numLon = Number(lon);

      blocks = await Block.find({
        'location.geo': {
          $near: {
            $geometry: { type: 'Point', coordinates: [numLon, numLat] },$maxDistance: Number(radius)
          }
        }
      });
    } else {
      blocks = await Block.find().sort({ createdAt: -1 });
    }

    // Attach Wi-Fis associated with each block
    const blockList = await Promise.all(
      blocks.map(async (b) => {
        const associatedWifis = await Wifi.find(
          { 'blocks.blockId': b.blockId },
          'ssid band width security blocks.$'
        );

        return {
          blockId: b.blockId,
          blockName: b.blockName,
          location: b.location,
          blockImage: b.blockImage,
          scale: b.scale,
          wifisCount: associatedWifis.length,
          wifis: associatedWifis.map((w) => {
            const blockInWifi = w.blocks[0];
            return {
              ssid: w.ssid,
              band: w.band,
              width: w.width,
              security: w.security,
              measurementsCount: blockInWifi ? blockInWifi.measurements.length : 0
            };
          })
        };
      })
    );

    return res.status(200).json({
      success: true,
      count: blockList.length,
      blocks: blockList
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /block/:blockId
 * Retrieves full details for a single block, including active Wi-Fis in this block
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

    // Find all Wi-Fis containing this block
    const associatedWifis = await Wifi.find(
      { 'blocks.blockId': blockId },
      'ssid band width security blocks.$'
    );

    return res.status(200).json({
      success: true,
      block: {
        ...block.toObject(),
        wifis: associatedWifis.map((w) => {
          const blockInWifi = w.blocks[0];
          return {
            ssid: w.ssid,
            band: w.band,
            width: w.width,
            security: w.security,
            measurementsCount: blockInWifi ? blockInWifi.measurements.length : 0
          };
        })
      }
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
    let block = await Block.findOne({ blockId });

    if (block?.blockImage?.url && block.blockImage.url.startsWith('https://')) {
      return res.redirect(block.blockImage.url);
    }

    let imageUrl = block?.blockImage?.url;
    let imagePath = block?.blockImage?.path;

    if (!block) {
      // Check in Wifi blocks
      const wifi = await Wifi.findOne({ 'blocks.blockId': blockId });
      const b = wifi?.blocks?.find((item) => item.blockId === blockId);
      if (b && b.blockImage) {
        imageUrl = b.blockImage.url;
        imagePath = b.blockImage.path;
      }
    }

    if (imageUrl && imageUrl.startsWith('https://')) {
      return res.redirect(imageUrl);
    }

    if (!imagePath || !fs.existsSync(imagePath)) {
      return res.status(404).json({
        success: false,
        message: 'Floor map image file not found on disk'
      });
    }

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
    }

    await block.save();

    // Synchronize calibrated scale to all Wi-Fis containing this block
    await Wifi.updateMany(
      { 'blocks.blockId': block.blockId },
      { $set: { 'blocks.$[elem].scale': block.scale } },
      { arrayFilters: [{ 'elem.blockId': block.blockId }] }
    );

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

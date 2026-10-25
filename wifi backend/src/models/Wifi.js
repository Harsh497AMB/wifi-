const mongoose = require('mongoose');
const { get10mGridKey } = require('../utils/locationHelper');

// Measurement Schema: User manual coordinate input with Wi-Fi signal strength
const MeasurementSchema = new mongoose.Schema({
  x: {
    type: Number,
    required: true
  },
  y: {
    type: Number,
    required: true
  },
  strength: {
    type: Number, // In dBm, e.g. -65
    required: true
  },
  band: {
    type: String,
    default: null
  },
  security: {
    type: String,
    default: null
  },
  estDistance: {
    type: Number, // Estimated distance in meters
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

// Indoor Block Schema stored within a Wi-Fi document
const IndoorBlockSchema = new mongoose.Schema({
  blockId: {
    type: String,
    required: true,
    index: true
  },
  blockName: {
    type: String,
    required: [true, 'Block name is required'],
    trim: true
  },
  location: {
    lat: {
      type: Number,
      required: [true, 'Latitude is required']
    },
    lon: {
      type: Number,
      required: [true, 'Longitude is required']
    },
    gridKey: {
      type: String,
      index: true
    },
    geo: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude] for GeoJSON
        default: [0, 0]
      }
    }
  },
  blockImage: {
    filename: { type: String, required: true },
    path: { type: String, required: true },
    originalName: { type: String },
    mimetype: { type: String },
    size: { type: Number },
    url: { type: String },
    imageWidth:  { type: Number, default: null },
    imageHeight: { type: Number, default: null }
  },
  scale: {
    metersPerPixel: {
      type: Number,
      default: null // e.g. 0.05 (1 px = 0.05m)
    },
    referencePixelDistance: {
      type: Number,
      default: null
    },
    referenceRealDistanceMeters: {
      type: Number,
      default: null
    },
    realWidthMeters: {
      type: Number,
      default: null
    },
    realHeightMeters: {
      type: Number,
      default: null
    },
    isCalibrated: {
      type: Boolean,
      default: false
    }
  },
  measurements: [MeasurementSchema],
  rawMatrix: {
    type: Array,
    default: []
  },
  addedAt: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

// Main Wifi Schema: Stores the indoor blocks for each Wi-Fi
const WifiSchema = new mongoose.Schema({
  ssid: {
    type: String,
    required: [true, 'SSID is required'],
    trim: true,
    unique: true,
    index: true
  },
  band: {
    type: String, // e.g. '2.4GHz', '5GHz', '6GHz'
    default: '2.4GHz'
  },
  width: {
    type: String, // e.g. '20MHz', '40MHz', '80MHz', '160MHz'
    default: '20MHz'
  },
  security: {
    type: String, // e.g. 'WPA2-PSK', 'WPA3', 'Open'
    default: 'WPA2'
  },
  // Indoor blocks assigned to this Wi-Fi
  blocks: [IndoorBlockSchema]
}, {
  timestamps: true
});

// Indexes for fast lookup
WifiSchema.index({ 'blocks.location.lat': 1, 'blocks.location.lon': 1 });

module.exports = mongoose.model('Wifi', WifiSchema);

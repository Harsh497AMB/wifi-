const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
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

// Wifi Schema: Individual Wi-Fi network registered within a block
const WifiSchema = new mongoose.Schema({
  ssid: {
    type: String,
    required: true,
    trim: true
  },
  band: {
    type: String, // e.g., '2.4GHz', '5GHz', '6GHz'
    default: '2.4GHz'
  },
  width: {
    type: String, // e.g., '20MHz', '40MHz', '80MHz', '160MHz'
    default: '20MHz'
  },
  security: {
    type: String, // e.g., 'WPA2-PSK', 'WPA3', 'Open'
    default: 'WPA2'
  },
  estDistance: {
    type: Number,
    default: null
  },
  measurements: [MeasurementSchema],
  // Optional precomputed or custom 2D matrix
  rawMatrix: {
    type: Array,
    default: []
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// Block Schema: Indoor floor plan and area representation
const BlockSchema = new mongoose.Schema({
  blockId: {
    type: String,
    unique: true,
    index: true,
    default: () => `block_${uuidv4().replace(/-/g, '').slice(0, 12)}`
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
    url: { type: String }
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
  wifis: [WifiSchema]
}, {
  timestamps: true
});

// GeoJSON 2dsphere index for accurate 10m spatial querying
BlockSchema.index({ 'location.geo': '2dsphere' });
BlockSchema.index({ 'location.lat': 1, 'location.lon': 1 });
BlockSchema.index({ blockName: 1 });

// Pre-save hook to populate geo coordinates & 10m grid key
BlockSchema.pre('save', function (next) {
  if (this.isModified('location.lat') || this.isModified('location.lon') || !this.location.gridKey) {
    const lat = this.location.lat;
    const lon = this.location.lon;
    this.location.gridKey = get10mGridKey(lat, lon);
    this.location.geo = {
      type: 'Point',
      coordinates: [lon, lat] // Mongo GeoJSON uses [longitude, latitude]
    };
  }
  next();
});

module.exports = mongoose.model('Block', BlockSchema);
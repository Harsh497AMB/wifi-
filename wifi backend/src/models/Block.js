const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { get10mGridKey } = require('../utils/locationHelper');

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
  }
}, {
  timestamps: true
});

// GeoJSON 2dsphere index for accurate 10m spatial querying
BlockSchema.index({ 'location.geo': '2dsphere' });
BlockSchema.index({ 'location.lat': 1, 'location.lon': 1 });
BlockSchema.index({ blockName: 1 });

// Pre-save hook to populate geo coordinates & 10m grid key
BlockSchema.pre('save', function () {
  if (this.isModified('location.lat') || this.isModified('location.lon') || !this.location.gridKey) {
    const lat = this.location.lat;
    const lon = this.location.lon;
    this.location.gridKey = get10mGridKey(lat, lon);
    this.location.geo = {
      type: 'Point',
      coordinates: [lon, lat] // Mongo GeoJSON uses [longitude, latitude]
    };
  }
});

module.exports = mongoose.model('Block', BlockSchema);

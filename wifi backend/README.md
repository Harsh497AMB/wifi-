# Indoor Wi-Fi Heatmap Backend (Node.js & Express)

A specialized Node.js + Express backend for indoor Wi-Fi heatmap mobile applications. This backend manages indoor floor maps, stores indoor blocks within Wi-Fi networks, receives user coordinate signal readings (dBm), and serves dynamic heatmap matrices with client-side image caching support.

---

## 🏗️ Architecture & Database Design (MongoDB Atlas)

### Updated Database Schema: Indoor Blocks Stored Inside Wi-Fi
In this updated architecture, **indoor blocks are stored directly within each Wi-Fi network**:

```
Wi-Fi Network (SSID e.g. "Office_5G", band, security, width)
  └── Indoor Blocks assigned to this Wi-Fi
        ├── Block ID (Unique identifier, e.g. "block_4a3b1c8f90de")
        ├── Block Name (e.g. "Floor 1 - Main Wing")
        ├── Location (lat, lon, ~10m GPS accuracy gridKey, GeoJSON Point)
        ├── Block Image (stored locally via Multer in ./uploads/blocks/, static URL)
        ├── Scale / Calibration (metersPerPixel, reference points)
        ├── Measurements (Array of user manual coordinate inputs)
        │     ├── x (floor plan coordinate)
        │     ├── y (floor plan coordinate)
        │     ├── strength (signal in dBm, e.g. -55 dBm)
        │     ├── band, security, estDistance
        │     └── timestamp
        └── Matrix (dynamically generated 2D grid matrix of signal strengths)
```

Additionally, master indoor floor maps are registered in the `Block` collection upon creation via `POST /createBlock`, allowing multiple Wi-Fi networks to reference and attach the same physical indoor block.

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v18+ (tested on Node v24)
- **MongoDB Atlas** account (or local MongoDB)

### 2. Installation
```bash
# Clone or navigate to the project directory
cd "wifi backend"

# Install dependencies
npm install
```

### 3. Environment Configuration
Create or edit your `.env` file in the root directory:
```env
PORT=5000
NODE_ENV=development

# MongoDB Atlas Connection String
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/wifi_heatmap?retryWrites=true&w=majority
```

### 4. Running the Server
```bash
# Production mode
npm start

# Development mode (with live reload via nodemon)
npm run dev

# Run automated tests
npm test
```

Server will run on: `http://localhost:5000`

---

## 📡 API Routes & Documentation

### 1. `POST /createBlock`
Creates a new indoor block, assigns a unique `blockId`, and saves the uploaded floor plan image locally using `multer` in `./uploads/blocks/`.

- **Method**: `POST`
- **Content-Type**: `multipart/form-data`
- **Fields**:
  - `blockName`: Name of the indoor block/floor (string, e.g. `"Floor 1 - Main Wing"`)
  - `lat`: GPS latitude (number, e.g. `37.774929`)
  - `lon`: GPS longitude (number, e.g. `-122.419416`)
  - `blockImage`: Floor plan image file (`.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`)

**Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Block created successfully",
  "block": {
    "blockId": "block_4a3b1c8f90de",
    "blockName": "Floor 1 - Main Wing",
    "location": {
      "lat": 37.774929,
      "lon": -122.419416,
      "gridKey": "419389_-934502"
    },
    "blockImage": {
      "filename": "block-1771407000-123456789.png",
      "url": "http://localhost:5000/uploads/blocks/block-1771407000-123456789.png"
    },
    "scale": {
      "metersPerPixel": null,
      "isCalibrated": false
    },
    "createdAt": "2026-10-21T09:30:00.000Z"
  }
}
```

---

### 2. `POST /addblock`
Assigns an existing indoor block to a Wi-Fi network.

- **Method**: `POST`
- **Content-Type**: `application/json`
- **Body**:
```json
{
  "ssid": "Office_5G",
  "blockId": "block_4a3b1c8f90de",
  "band": "5GHz",
  "width": "80MHz",
  "security": "WPA2-PSK"
}
```
*(Also supports identifying block via `"blockName"` and `"location"`)*

**Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Block assigned to Wi-Fi successfully",
  "ssid": "Office_5G",
  "block": {
    "blockId": "block_4a3b1c8f90de",
    "blockName": "Floor 1 - Main Wing",
    "location": {
      "lat": 37.774929,
      "lon": -122.419416,
      "gridKey": "419389_-934502"
    },
    "blockImage": {
      "filename": "block-1771407000-123456789.png",
      "url": "http://localhost:5000/uploads/blocks/block-1771407000-123456789.png"
    }
  },
  "totalBlocksInWifi": 1
}
```

---

### 3. `POST /SSID/block` (or `POST /:ssid/block`)
Records a user manual coordinate measurement with signal strength (dBm) for a Wi-Fi network in an indoor block.

- **Method**: `POST`
- **Content-Type**: `application/json`
- **Body**:
```json
{
  "ssid": "Office_5G",
  "blockId": "block_4a3b1c8f90de",
  "location": {
    "lat": 37.774929,
    "lon": -122.419416
  },
  "coordinates": {
    "x": 4,
    "y": 6
  },
  "strength": -62,
  "band": "5GHz",
  "security": "WPA2-PSK",
  "estDistance": 3.8
}
```

**Response (`201 Created`):**
```json
{
  "success": true,
  "message": "Measurement recorded successfully",
  "ssid": "Office_5G",
  "blockId": "block_4a3b1c8f90de",
  "blockName": "Floor 1 - Main Wing",
  "wifi": {
    "ssid": "Office_5G",
    "band": "5GHz",
    "security": "WPA2-PSK",
    "estDistance": 3.8,
    "lastMeasurement": {
      "x": 4,
      "y": 6,
      "strength": -62,
      "band": "5GHz",
      "security": "WPA2-PSK",
      "estDistance": 3.8,
      "timestamp": "2026-10-21T09:35:10.000Z"
    },
    "totalMeasurements": 1,
    "matrix": [
      [null, null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      [null, null, null, null, -62, null, null, null, null, null]
    ]
  }
}
```

---

### 4. `GET /SSID/block` (or `GET /:ssid/block`)
Returns the 2D signal strength matrix of the Wi-Fi in that particular block, related terms, and sends the floor map image if not available in client cache/storage.

- **Method**: `GET`
- **URL Parameters / Query**:
  - `GET /SSID/block?ssid=Office_5G&blockId=block_4a3b1c8f90de`
  - `GET /Office_5G/block?blockId=block_4a3b1c8f90de`
  - `GET /SSID/block?ssid=Office_5G&lat=37.774929&lon=-122.419416`

#### Image Caching Mechanism:
1. **If user does NOT have the image** (default or `?hasImage=false`):
   - Returns base64 floor image in `block.image.floorImage.base64` so mobile apps display the image immediately.
2. **If user HAS the image cached** (`?hasImage=true` or header `If-None-Match`):
   - `floorImage` is `null`, saving mobile data and bandwidth.
   - Apps can also download image via `image.url` or `/block/:blockId/image` (HTTP 304 caching supported).

**Response (`200 OK`):**
```json
{
  "success": true,
  "wifi": {
    "ssid": "Office_5G",
    "band": "5GHz",
    "width": "80MHz",
    "security": "WPA2-PSK",
    "estDistance": 3.8,
    "lastUpdated": "2026-10-21T09:35:10.000Z",
    "stats": {
      "totalPoints": 1,
      "minStrengthDbm": -62,
      "maxStrengthDbm": -62,
      "avgStrengthDbm": -62
    },
    "matrix": [
      [null, null, null, null, null],
      [null, null, null, null, null],
      [null, null, null, null, -62]
    ],
    "measurements": [
      {
        "x": 4,
        "y": 2,
        "strength": -62,
        "band": "5GHz",
        "security": "WPA2-PSK",
        "estDistance": 3.8,
        "timestamp": "2026-10-21T09:35:10.000Z"
      }
    ]
  },
  "block": {
    "blockId": "block_4a3b1c8f90de",
    "blockName": "Floor 1 - Main Wing",
    "location": {
      "lat": 37.774929,
      "lon": -122.419416,
      "gridKey": "419389_-934502"
    },
    "scale": {
      "metersPerPixel": 0.05,
      "isCalibrated": true
    },
    "image": {
      "filename": "block-1771407000-123456789.png",
      "url": "http://localhost:5000/uploads/blocks/block-1771407000-123456789.png",
      "isCachedOnClient": false,
      "floorImage": {
        "mimetype": "image/png",
        "base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
      }
    }
  }
}
```

---

### 5. `POST /delete`
Deletes an existing block in a Wi-Fi (if `ssid` provided), or deletes the block globally and removes it from all Wi-Fi records and disk.

- **Method**: `POST`
- **Content-Type**: `application/json`
- **Option A (Remove block from a specific Wi-Fi)**:
```json
{
  "ssid": "Office_5G",
  "blockId": "block_4a3b1c8f90de"
}
```
- **Option B (Delete block by location & blockId / blockName)**:
```json
{
  "blockId": "block_4a3b1c8f90de",
  "lat": 37.774929,
  "lon": -122.419416
}
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Block 'Floor 1 - Main Wing' (ID: block_4a3b1c8f90de) removed from Wi-Fi 'Office_5G' successfully",
  "ssid": "Office_5G",
  "remainingBlocks": 0
}
```

---

### 6. Additional Floor Map Features
- **`POST /calibrateBlock`**: Calibrate pixel-to-meter scale using 2 reference points or ratio.
- **`POST /calculateDistance`**: Compute real-world distance in meters between any 2 coordinates on a floor plan.
- **`GET /blocks`**: List all floor map blocks or search nearby within 10m-50m radius.
- **`GET /block/:blockId`**: Full block details including all Wi-Fis covering that block.
- **`GET /block/:blockId/image`**: Direct streaming of floor map image with `ETag` and `304 Not Modified` caching.
- **`GET /wifis`**: List all Wi-Fi networks and their assigned indoor blocks.
- **`GET /wifi/:ssid`**: Full details of a specific Wi-Fi and its blocks.

---

## 🧪 Testing
```bash
# Run automated Node.js test suite
npm test
```
All tests verify route contracts, validation handling, distance calculations, 10m grid quantization, and matrix generation.

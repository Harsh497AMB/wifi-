# Indoor Wi-Fi Heatmap Backend (Node.js & Express)

A specialized Node.js + Express backend for indoor Wi-Fi heatmap mobile applications. This backend manages indoor floor maps, registers Wi-Fi access points per indoor block, receives user coordinate signal readings (dBm), and serves dynamic heatmap matrices with client-side image caching support.

---

## 🏗️ Architecture & Database Design (MongoDB Atlas)

The system organizes indoor spaces in a hierarchical model:

```
Location (lat, lon) [~10m GPS accuracy grid]
  └── Indoor Blocks (Floor map image saved locally via Multer)
        ├── Block ID (Unique identifier)
        ├── Block Name
        ├── Location & GeoJSON 2dsphere index
        ├── Local image metadata & static URL
        └── Wi-Fis in this Block
              ├── SSID (e.g. "Office_5G")
              ├── Band (e.g. "5GHz", "2.4GHz")
              ├── Width (e.g. "80MHz", "40MHz")
              ├── Security (e.g. "WPA2-PSK", "WPA3")
              ├── Est. Distance (meters)
              └── Measurements (User manual coordinate inputs)
                    ├── x (floor plan coordinate)
                    ├── y (floor plan coordinate)
                    ├── strength (signal in dBm, e.g. -55 dBm)
                    └── Matrix (generated 2D grid matrix of signal strengths)
```

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
  - `blockName`: Name of the indoor block/floor (string, e.g. `"Building A - 2nd Floor"`)
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
    "blockName": "Building A - 2nd Floor",
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
    "wifis": [],
    "createdAt": "2026-10-19T09:30:00.000Z"
  }
}
```

---

### 2. `POST /calibrateBlock` (Floor Plan Scale Calibration)
Calibrates the scale between the uploaded floor map image and physical real-world meters.
Users can tap two points on their mobile screen, input the real-world distance (e.g. 10m), and the server calculates `metersPerPixel`.

- **Method**: `POST`
- **Content-Type**: `application/json`
- **Body**:
```json
{
  "blockId": "block_4a3b1c8f90de",
  "pointA": { "x": 100, "y": 150 },
  "pointB": { "x": 300, "y": 150 },
  "realDistanceMeters": 10
}
```
*(Or send `"metersPerPixel": 0.05` directly)*

**Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Block floor map scale calibrated successfully",
  "blockId": "block_4a3b1c8f90de",
  "blockName": "Building A - 2nd Floor",
  "scale": {
    "metersPerPixel": 0.05,
    "referencePixelDistance": 200,
    "referenceRealDistanceMeters": 10,
    "isCalibrated": true
  }
}
```

---

### 3. `POST /calculateDistance`
Calculates the real-world distance in physical meters between any two points on the floor map.

- **Method**: `POST`
- **Content-Type**: `application/json`
- **Body**:
```json
{
  "blockId": "block_4a3b1c8f90de",
  "pointA": { "x": 100, "y": 150 },
  "pointB": { "x": 500, "y": 150 }
}
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "blockId": "block_4a3b1c8f90de",
  "isCalibrated": true,
  "pixelDistance": 400,
  "metersPerPixel": 0.05,
  "realDistanceMeters": 20.0
}
```

---

### 4. `POST /addWifi`
Adds a Wi-Fi network configuration to an existing block.

- **Method**: `POST`
- **Content-Type**: `application/json`
- **Body**:
```json
{
  "blockId": "block_4a3b1c8f90de",
  "ssid": "Office_5G",
  "band": "5GHz",
  "width": "80MHz",
  "security": "WPA2-PSK"
}
```
*(You can also identify the block using `"blockName"` and `"location"` `{ lat, lon }` instead of `blockId`)*

**Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Wi-Fi added to block successfully",
  "blockId": "block_4a3b1c8f90de",
  "blockName": "Building A - 2nd Floor",
  "wifi": {
    "ssid": "Office_5G",
    "band": "5GHz",
    "width": "80MHz",
    "security": "WPA2-PSK",
    "measurementsCount": 0
  }
}
```

---

### 5. `POST /SSID/block`
Records a Wi-Fi signal measurement at manual `(x, y)` coordinates on the indoor floor map.

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
  "blockId": "block_4a3b1c8f90de",
  "blockName": "Building A - 2nd Floor",
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
      "timestamp": "2026-10-19T09:35:10.000Z"
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

### 6. `GET /SSID/block` (or `GET /:ssid/block`)
Retrieves the 2D signal strength matrix, Wi-Fi parameters, and the floor map image if not already cached on the user's mobile device.

- **Method**: `GET`
- **URL Options**:
  - `GET /SSID/block?ssid=Office_5G&blockId=block_4a3b1c8f90de`
  - `GET /Office_5G/block?blockId=block_4a3b1c8f90de`
  - `GET /SSID/block?ssid=Office_5G&lat=37.774929&lon=-122.419416&blockName=Building%20A`

#### How Image Caching Works:
1. **If user does NOT have the image** (default or `?hasImage=false`):
   - The response includes `image.floorImage.base64` directly so the mobile app gets the image instantly in one request.
2. **If user HAS the image cached** (`?hasImage=true` or sends header `If-None-Match: "block-filename.png"`):
   - `floorImage` base64 is set to `null` to conserve bandwidth and battery. The app uses its local cached image.
   - The app can also download or cache the image directly via the permanent URL `image.url` or `/block/:blockId/image` which supports standard HTTP `304 Not Modified` headers.

**Sample Response (`200 OK`):**
```json
{
  "success": true,
  "block": {
    "blockId": "block_4a3b1c8f90de",
    "blockName": "Building A - 2nd Floor",
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
  },
  "wifi": {
    "ssid": "Office_5G",
    "band": "5GHz",
    "width": "80MHz",
    "security": "WPA2-PSK",
    "estDistance": 3.8,
    "lastUpdated": "2026-10-19T09:35:10.000Z",
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
        "timestamp": "2026-10-19T09:35:10.000Z"
      }
    ]
  }
}
```

---

### 7. `POST /delete`
Deletes an existing block, its uploaded floor map image from disk, and all associated Wi-Fi networks.

- **Method**: `POST`
- **Content-Type**: `application/json`
- **Body Option A (by `blockId`):**
```json
{
  "blockId": "block_4a3b1c8f90de"
}
```
- **Body Option B (by location & name):**
```json
{
  "blockName": "Building A - 2nd Floor",
  "lat": 37.774929,
  "lon": -122.419416
}
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Block 'Building A - 2nd Floor' (ID: block_4a3b1c8f90de) and its Wi-Fi records deleted successfully"
}
```

---

### Additional Helper Endpoints
- `GET /` — API health check and routes index.
- `GET /blocks?lat=...&lon=...&radius=50` — List all blocks or find nearby blocks within 10-50m.
- `GET /block/:blockId` — Full block details.
- `GET /block/:blockId/image` — Direct floor map image streaming with `Cache-Control` and `ETag`.

---

## 🧪 Testing
- Run test suite: `npm test`
- Interactive HTTP requests: Open `test-requests.http` in VS Code / REST Client / Thunder Client.


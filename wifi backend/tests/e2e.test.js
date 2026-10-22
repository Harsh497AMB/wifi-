require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Writable } = require('stream');
const mongoose = require('mongoose');

jest.mock('../src/config/cloudinary', () => ({
  uploadBuffer: jest.fn().mockResolvedValue({ secure_url: 'https://res.cloudinary.com/test/x.png', public_id: 'wifi-blocks/x' }),
  deleteImage: jest.fn().mockResolvedValue()
}));

const app = require('../src/app');

test('E2E Lifecycle: createBlock -> addblock -> post measurement -> get matrix/image -> calibrate -> delete', async () => {
  // Connect to DB if not connected
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let createdBlockId = null;
  const testSsid = `E2E_Test_Wifi_${Date.now()}`;
  const testBlockName = `E2E Floor ${Date.now()}`;

  try {
    // 1. POST /createBlock with image upload
    const sampleImagePath = path.join(__dirname, 'sample_floor_plan.png');
    const imageBytes = fs.readFileSync(sampleImagePath);

    const formData = new FormData();
    formData.append('blockName', testBlockName);
    formData.append('lat', '37.774929');
    formData.append('lon', '-122.419416');
    formData.append(
      'blockImage',
      new Blob([imageBytes], { type: 'image/png' }),
      'sample_floor_plan.png'
    );

    const createRes = await fetch(`${baseUrl}/createBlock`, {
      method: 'POST',
      body: formData
    });

    assert.strictEqual(createRes.status, 201, 'createBlock should return 201');
    const createData = await createRes.json();
    assert.strictEqual(createData.success, true);
    assert.ok(createData.block.blockId);
    createdBlockId = createData.block.blockId;
    assert.strictEqual(createData.block.blockName, testBlockName);
    assert.ok(createData.block.blockImage.url.startsWith('https://'), 'blockImage.url should start with https://');

    // 2. POST /addblock (assign indoor block to Wi-Fi)
    const addRes = await fetch(`${baseUrl}/addblock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ssid: testSsid,
        blockId: createdBlockId,
        band: '5GHz',
        width: '80MHz',
        security: 'WPA2-PSK'
      })
    });

    assert.strictEqual(addRes.status, 200, 'addblock should return 200');
    const addData = await addRes.json();
    assert.strictEqual(addData.success, true);
    assert.strictEqual(addData.ssid, testSsid);
    assert.strictEqual(addData.block.blockId, createdBlockId);

    // 3. GET /wifi/:ssid (verify wifi.blocks contains that blockId)
    const wifiGetRes = await fetch(`${baseUrl}/wifi/${encodeURIComponent(testSsid)}`);
    assert.strictEqual(wifiGetRes.status, 200);
    const wifiGetData = await wifiGetRes.json();
    assert.strictEqual(wifiGetData.success, true);
    assert.ok(wifiGetData.wifi.blocks.some((b) => b.blockId === createdBlockId));

    // 4. POST /SSID/block (submit measurement)
    const measureRes = await fetch(`${baseUrl}/SSID/block`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ssid: testSsid,
        blockId: createdBlockId,
        coordinates: [3, 4],
        strength: -58,
        band: '5GHz',
        security: 'WPA2-PSK',
        estDistance: 4.5
      })
    });

    assert.strictEqual(measureRes.status, 201, 'post measurement should return 201');
    const measureData = await measureRes.json();
    assert.strictEqual(measureData.success, true);
    assert.strictEqual(measureData.wifi.lastMeasurement.strength, -58);
    assert.strictEqual(measureData.wifi.matrix[4][3], -58);

    // 5. GET /SSID/block (without cached image -> floorImage returned as Cloudinary URL)
    const getNoCacheRes = await fetch(
      `${baseUrl}/SSID/block?ssid=${encodeURIComponent(testSsid)}&blockId=${createdBlockId}&hasImage=false`
    );

    assert.strictEqual(getNoCacheRes.status, 200);
    const getNoCacheData = await getNoCacheRes.json();
    assert.strictEqual(getNoCacheData.success, true);
    assert.strictEqual(getNoCacheData.wifi.matrix[4][3], -58);
    assert.ok(getNoCacheData.block.image.floorImage.startsWith('https://'), 'floorImage should be URL');
    assert.strictEqual(getNoCacheData.block.image.isCachedOnClient, false);

    // 6. GET /SSID/block (with cached image -> floorImage omitted)
    const getCachedRes = await fetch(
      `${baseUrl}/SSID/block?ssid=${encodeURIComponent(testSsid)}&blockId=${createdBlockId}&hasImage=true`
    );

    assert.strictEqual(getCachedRes.status, 200);
    const getCachedData = await getCachedRes.json();
    assert.strictEqual(getCachedData.success, true);
    assert.strictEqual(getCachedData.block.image.floorImage, null);
    assert.strictEqual(getCachedData.block.image.isCachedOnClient, true);

    // 7. GET /block/:blockId/image (verify redirect to Cloudinary)
    const redirectRes = await fetch(`${baseUrl}/block/${createdBlockId}/image`, {
      redirect: 'manual'
    });
    assert.strictEqual(redirectRes.status, 302);
    const locationHeader = redirectRes.headers.get('location');
    assert.ok(locationHeader && locationHeader.startsWith('https://'), 'Redirect location should be https://');

    // 8. 404 tests for GET /:ssid/block and GET /wifi/:ssid
    const nonExistentWifiRes = await fetch(`${baseUrl}/NonExistent_Wifi_9999/block`);
    assert.strictEqual(nonExistentWifiRes.status, 404);
    const nonExistentWifiData = await nonExistentWifiRes.json();
    assert.strictEqual(nonExistentWifiData.success, false);
    assert.ok(nonExistentWifiData.message);

    const nonExistentWifiBySsidRes = await fetch(`${baseUrl}/wifi/NonExistent_Wifi_9999`);
    assert.strictEqual(nonExistentWifiBySsidRes.status, 404);
    const nonExistentWifiBySsidData = await nonExistentWifiBySsidRes.json();
    assert.strictEqual(nonExistentWifiBySsidData.success, false);
    assert.ok(nonExistentWifiBySsidData.message);

    // 9. POST /calibrateBlock (set scale)
    const calibRes = await fetch(`${baseUrl}/calibrateBlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blockId: createdBlockId,
        pointA: { x: 100, y: 100 },
        pointB: { x: 300, y: 100 },
        realDistanceMeters: 10
      })
    });

    assert.strictEqual(calibRes.status, 200);
    const calibData = await calibRes.json();
    assert.strictEqual(calibData.success, true);
    assert.strictEqual(calibData.scale.metersPerPixel, 0.05);

    // 10. POST /calculateDistance (calculate distance with calibrated scale)
    const distRes = await fetch(`${baseUrl}/calculateDistance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blockId: createdBlockId,
        pointA: { x: 100, y: 100 },
        pointB: { x: 500, y: 100 }
      })
    });

    assert.strictEqual(distRes.status, 200);
    const distData = await distRes.json();
    assert.strictEqual(distData.success, true);
    assert.strictEqual(distData.realDistanceMeters, 20);

    // 11. GET /wifis (list all Wi-Fis and assigned blocks)
    const wifisRes = await fetch(`${baseUrl}/wifis`);
    assert.strictEqual(wifisRes.status, 200);
    const wifisData = await wifisRes.json();
    assert.strictEqual(wifisData.success, true);
    const foundWifi = wifisData.wifis.find((w) => w.ssid === testSsid);
    assert.ok(foundWifi, 'Created Wi-Fi should appear in list');

    // 12. POST /delete (delete block in that Wi-Fi)
    const deleteWifiBlockRes = await fetch(`${baseUrl}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ssid: testSsid,
        blockId: createdBlockId
      })
    });

    assert.strictEqual(deleteWifiBlockRes.status, 200);
    const deleteWifiBlockData = await deleteWifiBlockRes.json();
    assert.strictEqual(deleteWifiBlockData.success, true);
    assert.strictEqual(deleteWifiBlockData.remainingBlocks, 0);

    // 13. POST /delete (global delete master block and Cloudinary image cleanup)
    const deleteGlobalRes = await fetch(`${baseUrl}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blockId: createdBlockId
      })
    });

    assert.strictEqual(deleteGlobalRes.status, 200);
    const deleteGlobalData = await deleteGlobalRes.json();
    assert.strictEqual(deleteGlobalData.success, true);
  } finally {
    // Cleanup if anything failed before delete
    if (createdBlockId) {
      const WifiModel = require('../src/models/Wifi');
      const BlockModel = require('../src/models/Block');
      await WifiModel.deleteOne({ ssid: testSsid });
      await BlockModel.deleteOne({ blockId: createdBlockId });
    }
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.close();
  }
});

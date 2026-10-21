const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const app = require('../src/app');

test('Express app routes: test endpoints with native HTTP and fetch', async (t) => {
  // Start server on an ephemeral port (port 0)
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  await t.test('GET / should return 200 with service status and endpoints', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'online');
    assert.ok(data.endpoints['POST /createBlock']);
    assert.ok(data.endpoints['POST /calibrateBlock']);
    assert.ok(data.endpoints['POST /calculateDistance']);
    assert.ok(data.endpoints['GET /SSID/block']);
    assert.ok(data.endpoints['POST /SSID/block']);
    assert.ok(data.endpoints['POST /addWifi']);
    assert.ok(data.endpoints['POST /delete']);
  });

  await t.test('POST /calibrateBlock should return 400 when parameters are missing', async () => {
    const res = await fetch(`${baseUrl}/calibrateBlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.message, 'blockId or blockName is required');
  });

  await t.test('POST /calculateDistance should return 400 when missing points', async () => {
    const res = await fetch(`${baseUrl}/calculateDistance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockId: 'block_123' })
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
  });

  await t.test('POST /createBlock should return 400 when required fields are missing', async () => {
    const res = await fetch(`${baseUrl}/createBlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.message, 'Block name is required');
  });

  await t.test('POST /addWifi should return 400 when SSID is missing', async () => {
    const res = await fetch(`${baseUrl}/addWifi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockName: 'Block A' })
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.message, 'SSID is required');
  });

  await t.test('POST /delete should return 400 when missing identifiers', async () => {
    const res = await fetch(`${baseUrl}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
  });

  await t.test('GET /unknown-route should return 404 JSON', async () => {
    const res = await fetch(`${baseUrl}/non-existent-route`);
    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.strictEqual(data.error, 'Route Not Found');
  });

  // Close server
  await new Promise((resolve) => server.close(resolve));
});


const test = require('node:test');
const assert = require('node:assert');
const { get10mGridKey, getHaversineDistance } = require('../src/utils/locationHelper');
const { build2DMatrix } = require('../src/utils/matrixHelper');

test('locationHelper: 10m grid key and distance calculation', () => {
  const lat1 = 37.774929;
  const lon1 = -122.419416;

  // Point roughly 4.4 meters away
  const lat2 = 37.774929 + 0.00004;
  const lon2 = -122.419416;

  // Point 2 kilometers away
  const latFar = 37.794929;
  const lonFar = -122.419416;

  const distClose = getHaversineDistance(lat1, lon1, lat2, lon2);
  const distFar = getHaversineDistance(lat1, lon1, latFar, lonFar);

  assert.ok(distClose < 10, `distClose should be < 10m, got ${distClose}`);
  assert.ok(distFar > 1000, `distFar should be > 1000m, got ${distFar}`);

  const key1 = get10mGridKey(lat1, lon1);
  const keyFar = get10mGridKey(latFar, lonFar);
  assert.notStrictEqual(key1, keyFar, 'Far locations should have different grid keys');
});

test('matrixHelper: builds 2D matrix from sparse coordinates', () => {
  const measurements = [
    { x: 0, y: 0, strength: -45 },
    { x: 2, y: 1, strength: -70 },
    { x: 4, y: 3, strength: -85 }
  ];

  const matrix = build2DMatrix(measurements, 5, 5);

  assert.strictEqual(Array.isArray(matrix), true);
  assert.strictEqual(matrix.length >= 4, true);
  // Matrix is rows (y) x cols (x)
  assert.strictEqual(matrix[0][0], -45);
  assert.strictEqual(matrix[1][2], -70);
  assert.strictEqual(matrix[3][4], -85);
  assert.strictEqual(matrix[2][2], null);
});

const {
  calculatePixelDistance,
  calibrateScaleFromPoints,
  calculateRealDistance
} = require('../src/utils/distanceHelper');

test('distanceHelper: calculates pixel distance and real-world meter conversion', () => {
  const p1 = { x: 100, y: 100 };
  const p2 = { x: 300, y: 100 }; // 200 pixels apart horizontally

  const pixelDist = calculatePixelDistance(p1, p2);
  assert.strictEqual(pixelDist, 200);

  // User scenario: 200px represents 10 meters in real life
  const calibration = calibrateScaleFromPoints(p1, p2, 10);
  assert.strictEqual(calibration.metersPerPixel, 0.05); // 10m / 200px = 0.05m per pixel
  assert.strictEqual(calibration.pixelDistance, 200);
  assert.strictEqual(calibration.realDistanceMeters, 10);

  // Test another pair of points with the calibrated scale: 400px apart
  const p3 = { x: 500, y: 100 };
  const realDist = calculateRealDistance(p1, p3, calibration.metersPerPixel);
  assert.strictEqual(realDist.pixelDistance, 400);
  assert.strictEqual(realDist.realDistanceMeters, 20); // 400 * 0.05 = 20 meters
});


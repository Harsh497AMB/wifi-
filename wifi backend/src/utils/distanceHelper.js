/**
 * Distance & Floor Plan Calibration Helper
 * Converts image pixel distances to real-world meters
 */

/**
 * Calculates euclidean pixel distance between two points on the floor map
 * @param {{x: number, y: number}} p1
 * @param {{x: number, y: number}} p2
 * @returns {number} Distance in pixels
 */
function calculatePixelDistance(p1, p2) {
  if (!p1 || !p2 || p1.x == null || p1.y == null || p2.x == null || p2.y == null) {
    throw new Error('Both points must contain valid x and y coordinates');
  }
  return Math.hypot(Number(p2.x) - Number(p1.x), Number(p2.y) - Number(p1.y));
}

/**
 * Calculates calibration scale (meters per pixel) from two reference points
 * @param {{x: number, y: number}} p1 - First point on image
 * @param {{x: number, y: number}} p2 - Second point on image
 * @param {number} realDistanceMeters - Known distance in real life between p1 and p2 (meters)
 * @returns {{ metersPerPixel: number, pixelDistance: number, realDistanceMeters: number }}
 */
function calibrateScaleFromPoints(p1, p2, realDistanceMeters) {
  const pixelDistance = calculatePixelDistance(p1, p2);

  if (pixelDistance <= 0) {
    throw new Error('Points must be distinct; pixel distance is 0');
  }

  const meters = Number(realDistanceMeters);
  if (isNaN(meters) || meters <= 0) {
    throw new Error('Real distance in meters must be a positive number');
  }

  const metersPerPixel = meters / pixelDistance;

  return {
    metersPerPixel: Number(metersPerPixel.toFixed(6)),
    pixelDistance: Number(pixelDistance.toFixed(2)),
    realDistanceMeters: meters
  };
}

/**
 * Calculates the real-world distance in meters between two image points
 * @param {{x: number, y: number}} p1
 * @param {{x: number, y: number}} p2
 * @param {number} metersPerPixel
 * @returns {{ pixelDistance: number, realDistanceMeters: number }}
 */
function calculateRealDistance(p1, p2, metersPerPixel) {
  const pixelDistance = calculatePixelDistance(p1, p2);
  const realDistance = pixelDistance * Number(metersPerPixel);

  return {
    pixelDistance: Number(pixelDistance.toFixed(2)),
    realDistanceMeters: Number(realDistance.toFixed(3))
  };
}

module.exports = {
  calculatePixelDistance,
  calibrateScaleFromPoints,
  calculateRealDistance
};


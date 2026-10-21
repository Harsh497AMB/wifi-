/**
 * Location Helper for 10m grid quantization and distance calculation
 */

// Latitude 1 degree is roughly 111,139 meters
const LAT_DEG_PER_METER = 1 / 111139;

/**
 * Returns a 10m grid key based on lat & lon coordinates
 * Groups coordinates into ~10x10m cells
 */
function get10mGridKey(lat, lon) {
  if (lat == null || lon == null) return null;
  const numLat = Number(lat);
  const numLon = Number(lon);

  // 10 meters in latitude degrees
  const latStep = 10 * LAT_DEG_PER_METER;
  // 10 meters in longitude degrees adjusted by latitude cosine
  const rad = (numLat * Math.PI) / 180;
  const lonStep = (10 / (111139 * Math.max(Math.cos(rad), 0.00001)));

  const latBucket = Math.round(numLat / latStep);
  const lonBucket = Math.round(numLon / lonStep);

  return `${latBucket}_${lonBucket}`;
}

/**
 * Haversine formula to calculate the distance between two coordinates in meters
 */
function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (Number(lat1) * Math.PI) / 180;
  const φ2 = (Number(lat2) * Math.PI) / 180;
  const Δφ = ((Number(lat2) - Number(lat1)) * Math.PI) / 180;
  const Δλ = ((Number(lon2) - Number(lon1)) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
}

module.exports = {
  get10mGridKey,
  getHaversineDistance
};


/**
 * Matrix helper to convert coordinate measurements into a 2D matrix representation
 */

/**
 * Builds a 2D matrix from an array of measurements [{x, y, strength}, ...]
 * @param {Array} measurements - Array of { x, y, strength }
 * @param {number} defaultRows - Optional fixed rows (default: auto or 10)
 * @param {number} defaultCols - Optional fixed cols (default: auto or 10)
 * @returns {Array<Array<number|null>>} 2D matrix
 */
function build2DMatrix(measurements = [], defaultRows = 10, defaultCols = 10) {
  if (!Array.isArray(measurements) || measurements.length === 0) {
    // Return empty defaultRows x defaultCols matrix initialized to null
    return Array.from({ length: defaultRows }, () => Array(defaultCols).fill(null));
  }

  // Find max coordinate values
  let maxX = defaultCols - 1;
  let maxY = defaultRows - 1;

  for (const m of measurements) {
    if (m.x != null && !isNaN(m.x)) {
      maxX = Math.max(maxX, Math.floor(m.x));
    }
    if (m.y != null && !isNaN(m.y)) {
      maxY = Math.max(maxY, Math.floor(m.y));
    }
  }

  // Keep matrix dimensions within reasonable bounds (e.g., max 100x100 to avoid memory spike)
  const cols = Math.min(Math.max(maxX + 1, defaultCols), 100);
  const rows = Math.min(Math.max(maxY + 1, defaultRows), 100);

  // Initialize matrix with null
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(null));

  // Populate matrix with latest signal strength at each coordinate
  for (const m of measurements) {
    const x = Math.floor(m.x);
    const y = Math.floor(m.y);
    if (x >= 0 && x < cols && y >= 0 && y < rows) {
      matrix[y][x] = m.strength;
    }
  }

  return matrix;
}

module.exports = {
  build2DMatrix
};
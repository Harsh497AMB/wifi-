function build2DMatrix(measurements = [], imageWidth, imageHeight, cols = 50) {
  const rows = Math.max(1, Math.round((cols * imageHeight) / imageWidth));
  const sum = Array.from({ length: rows }, () => Array(cols).fill(0));
  const cnt = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (const m of measurements) {
    if (m.x == null || m.y == null || m.strength == null) continue;
    const c = Math.min(cols - 1, Math.max(0, Math.floor((m.x / imageWidth) * cols)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor((m.y / imageHeight) * rows)));
    sum[r][c] += m.strength;
    cnt[r][c] += 1;
  }

  const matrix = sum.map((row, r) =>
    row.map((s, c) => (cnt[r][c] ? Number((s / cnt[r][c]).toFixed(2)) : null))
  );

  return { matrix, rows, cols };
}

module.exports = { build2DMatrix };
const fs = require('fs');
const path = require('path');

const sampleDir = path.join(__dirname);
if (!fs.existsSync(sampleDir)) {
  fs.mkdirSync(sampleDir, { recursive: true });
}

// 1x1 base64 PNG image
const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
fs.writeFileSync(path.join(sampleDir, 'sample_floor_plan.png'), Buffer.from(base64Png, 'base64'));
console.log('Sample floor plan image created at tests/sample_floor_plan.png');


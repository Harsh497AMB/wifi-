const express = require('express');
const router = express.Router();
const { upload } = require('../config/multer');
const {
  createBlock,
  addWifi,
  deleteBlock,
  getAllBlocks,
  getBlockById,
  getBlockImage,
  calibrateBlock,
  calculateDistance
} = require('../controllers/blockController');

// POST /createBlock - Creates a new block with uploaded floor map image
router.post('/createBlock', upload.single('blockImage'), createBlock);

// POST /calibrateBlock - Calibrates scale between image pixels and real-world meters
router.post('/calibrateBlock', calibrateBlock);

// POST /calculateDistance - Calculates real-world distance between two floor map coordinates
router.post('/calculateDistance', calculateDistance);

// POST /addWifi - Adds Wi-Fi to an existing block
router.post('/addWifi', addWifi);

// POST /delete - Deletes existing block & associated Wi-Fis
router.post('/delete', deleteBlock);

// Helper endpoints for listing & querying blocks
router.get('/blocks', getAllBlocks);
router.get('/block/:blockId', getBlockById);
router.get('/block/:blockId/image', getBlockImage);

module.exports = router;
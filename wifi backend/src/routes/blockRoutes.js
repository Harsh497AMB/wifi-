const express = require('express');
const router = express.Router();
const { upload } = require('../config/multer');
const {
  createBlock,
  addBlock,
  deleteBlock,
  getAllBlocks,
  getBlockById,
  getBlockImage,
  calibrateBlock,
  calculateDistance
} = require('../controllers/blockController');

// POST /createBlock (and /createblock) - Creates a new block with uploaded floor map image
router.post('/createBlock', upload.single('blockImage'), createBlock);
router.post('/createblock', upload.single('blockImage'), createBlock);

// POST /addblock (and /addBlock, /addWifi) - Assigns an indoor block to a Wi-Fi
router.post('/addblock', addBlock);
router.post('/addBlock', addBlock);
router.post('/addWifi', addBlock);

// POST /delete - Deletes existing block in that Wi-Fi or globally
router.post('/delete', deleteBlock);

// POST /calibrateBlock - Calibrates scale between image pixels and real-world meters
router.post('/calibrateBlock', calibrateBlock);

// POST /calculateDistance - Calculates real-world distance between two floor map coordinates
router.post('/calculateDistance', calculateDistance);

// Helper endpoints for listing & querying blocks
router.get('/blocks', getAllBlocks);
router.get('/block/:blockId', getBlockById);
router.get('/block/:blockId/image', getBlockImage);

module.exports = router;

const express = require('express');
const router = express.Router();
const {
  getWifiBlock,
  postWifiBlockMeasurement,
  getAllWifis,
  getWifiBySsid
} = require('../controllers/wifiController');

// Handles both dynamic route param: /:ssid/block (e.g. /Office_5G/block)
// AND literal route: /SSID/block (with ssid in query or body)
// AND path-param block id: /:ssid/block/:blockId
router.get('/SSID/block', getWifiBlock);
router.get('/:ssid/block/:blockId', getWifiBlock);
router.get('/:ssid/block', getWifiBlock);

router.post('/SSID/block', postWifiBlockMeasurement);
router.post('/:ssid/block', postWifiBlockMeasurement);

// Helper endpoints for querying Wi-Fis
router.get('/wifis', getAllWifis);
router.get('/wifi/:ssid', getWifiBySsid);

module.exports = router;

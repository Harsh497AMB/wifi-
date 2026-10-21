const express = require('express');
const router = express.Router();
const {
  getWifiBlock,
  postWifiBlockMeasurement
} = require('../controllers/wifiController');

// Handles both dynamic route param: /:ssid/block (e.g. /Office-Wifi/block)
// AND literal route: /SSID/block (with ssid in query or body)
router.get('/SSID/block', getWifiBlock);
router.get('/:ssid/block', getWifiBlock);

router.post('/SSID/block', postWifiBlockMeasurement);
router.post('/:ssid/block', postWifiBlockMeasurement);

module.exports = router;


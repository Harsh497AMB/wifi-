const escapeRegex = (str = '') => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ssidRegex = (ssid) => new RegExp(`^${escapeRegex(String(ssid).trim())}$`, 'i');

module.exports = { escapeRegex, ssidRegex };
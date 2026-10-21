const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/wifi_heatmap';
    
    const conn = await mongoose.connect(mongoUri, {
      autoIndex: true,
    });

    console.log(`[MongoDB] Connected successfully to: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.error(`[MongoDB] Connection error: ${error.message}`);
    // Don't kill process immediately in dev so app can still boot and log helpful hints
  }
};

module.exports = connectDB;


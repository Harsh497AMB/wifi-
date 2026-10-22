require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const connectDB = require('./src/config/db');

// 1. Set PORT to a number (use environment variable or default to 5000)
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  // Connect to Database
  await connectDB();

  // Create HTTP Server
  const server = http.createServer(app);

  // 2. Pass PORT as the first argument, and '0.0.0.0' as the second argument
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`===============================================`);
    console.log(`🚀 Wi-Fi Heatmap Backend running on port ${PORT}`);
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`📁 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`===============================================`);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
  });
};

app.get('/', (req, res) => {
  res.send('Wi-Fi Backend is connected and working!');
});

startServer();
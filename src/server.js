// src/server.js
require('dotenv').config()

const http = require('http')
const app = require('./app')
const { init } = require('./utils/socket');
const { startNotificationCronJobs } = require('./jobs/notification.cron');

const PORT = process.env.PORT || 4000
// create HTTP Server with app
const server = http.createServer(app)

// ให้ socket.io ทำงานด้วย server ที่มี app
init(server)
startNotificationCronJobs()

// run Server and socket server
server.listen(PORT, () => {
  console.log(`🚀 Server & Real-time running on http://localhost:${PORT}`)
})

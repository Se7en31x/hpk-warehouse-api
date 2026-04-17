const express = require('express')
const cors = require('cors')
const routes = require('./routes') // เรียกใช้ Routes  
const { getIO} = require('./utils/socket')

const app = express()

// Middleware
app.use(cors())
app.use(express.json())

app.use((req, res, next) => {
    try {
        req.io = getIO();
    } catch {
        // Socket not yet initialized (e.g. running app.js standalone instead of server.js).
        // Degrade gracefully: controllers that call req.io.emit() will get a no-op instead
        // of a 500 error, so the actual DB operation still succeeds.
        console.warn('[Socket] req.io not available — socket.io may not be initialized');
        req.io = { emit: () => {}, to: () => ({ emit: () => {} }) };
    }
    next();
})

// intitail route
app.use('/api', routes)

// 404 — route not found (must be after all routes)
app.use((req, res) => {
    res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` })
})

// Global error handler
app.use((err, req, res, next) => {
    console.error('[Unhandled Error]', err)
    res.status(err.status || 500).json({ success: false, message: err.message || 'Internal Server Error' })
})

module.exports = app
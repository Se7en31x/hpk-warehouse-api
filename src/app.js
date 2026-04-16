const express = require('express')
const cors = require('cors')
const routes = require('./routes') // เรียกใช้ Routes  
const { getIO} = require('./utils/socket')

const app = express()

// Middleware
app.use(cors())
app.use(express.json())

app.use((req, res, next) => {
    req.io = getIO()
    next()
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
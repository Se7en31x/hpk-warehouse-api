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

module.exports = app
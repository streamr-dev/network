const path = require('path')

const express = require('express')

const app = express()
const keyserver = require('../keyserver')

// viewed at http://localhost:8880
app.use('/static', express.static(path.join(__dirname, '/../../dist')))

let server

app.get('/stop', (req, res) => {
    res.end()

    if (server) {
        console.info('Browser Test Server: Closed')
        server.close()
    }
})

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'browser.html'))
})

server = app.listen(8880, () => {
    console.info('Browser Test Server: Listening on ', server.address())
})
server.once('close', () => {
    keyserver?.close()
})

/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path')

const express = require('express')
const { KeyServer } = require('@streamr/test-utils')

const app = express()
const keyserver = new KeyServer()

// viewed at http://localhost:8880
app.use('/static', express.static(path.join(__dirname, '/../../dist')))

let server

app.get('/stop', (_req, res) => {
    res.end()

    if (server) {
        console.info('Browser Test Server: Closed')
        server.close()
    }
})

app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'browser.html'))
})

server = app.listen(8880, () => {
    console.info('Browser Test Server: Listening on ', server.address())
})

server.once('close', () => {
    keyserver?.destroy()
})

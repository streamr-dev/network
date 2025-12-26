/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('path')
const express = require('express')
const { Logger } = require('@streamr/utils')

const logger = new Logger('browser-smoke-test/server')
const app = express()

app.use('/static', express.static(path.join(__dirname, '/../../dist')))
app.get('/stop', (_req, res) => {
    res.end()

    if (server) {
        logger.info('Stopping...')
        server.close()
    }
})
app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'smoke-test.html'))
})

const server = app.listen(8880, () => {
    logger.info('Serving on', server.address())
})

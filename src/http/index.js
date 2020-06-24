const fs = require('fs')
const https = require('https')

const cors = require('cors')
const express = require('express')

const adapterRegistry = require('../adapterRegistry')

const dataQueryEndpoints = require('./DataQueryEndpoints')
const dataProduceEndpoints = require('./DataProduceEndpoints')
const volumeEndpoint = require('./VolumeEndpoint')

adapterRegistry.register('http', ({ port, privateKeyFileName, certFileName },
    { networkNode, publisher, streamFetcher, volumeLogger }) => {
    const app = express()

    // Add CORS headers
    app.use(cors())

    // Rest endpoints
    app.use('/api/v1', dataQueryEndpoints(networkNode, streamFetcher, volumeLogger))
    app.use('/api/v1', dataProduceEndpoints(streamFetcher, publisher))
    app.use('/api/v1', volumeEndpoint(volumeLogger))

    let httpServer
    if (privateKeyFileName && certFileName) {
        httpServer = https.createServer({
            cert: fs.readFileSync(certFileName),
            key: fs.readFileSync(privateKeyFileName)
        }, app).listen(port, () => console.info(`HTTPS adapter listening on ${httpServer.address().port}`))
    } else {
        httpServer = app.listen(port, () => console.info(`HTTP adapter listening on ${httpServer.address().port}`))
    }
    return () => new Promise((resolve, reject) => {
        httpServer.close((err) => {
            if (err) {
                reject(err)
            } else {
                resolve()
            }
        })
    })
})

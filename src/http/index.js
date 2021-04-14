const fs = require('fs')
const https = require('https')

const cors = require('cors')
const express = require('express')

const logger = require('../helpers/logger')('streamr:httpAdapter')
const adapterRegistry = require('../adapterRegistry')

const dataQueryEndpoints = require('./DataQueryEndpoints')
const dataProduceEndpoints = require('./DataProduceEndpoints')
const volumeEndpoint = require('./VolumeEndpoint')
const dataMetadataEndpoint = require('./DataMetadataEndpoints')
const storageConfigEndpoints = require('./StorageConfigEndpoints')

adapterRegistry.register('http', ({ port, privateKeyFileName, certFileName }, {
    networkNode, publisher, streamFetcher, metricsContext, cassandraStorage, storageConfig
}) => {
    const app = express()

    // Add CORS headers
    app.use(cors())

    // Rest endpoints
    app.use('/api/v1', dataQueryEndpoints(networkNode, streamFetcher, metricsContext))
    app.use('/api/v1', dataProduceEndpoints(streamFetcher, publisher))
    app.use('/api/v1', volumeEndpoint(metricsContext))

    app.use('/api/v1', dataMetadataEndpoint(cassandraStorage))
    app.use('/api/v1', storageConfigEndpoints(storageConfig))

    let httpServer
    if (privateKeyFileName && certFileName) {
        httpServer = https.createServer({
            cert: fs.readFileSync(certFileName),
            key: fs.readFileSync(privateKeyFileName)
        }, app).listen(port, () => logger.info(`HTTPS adapter listening on ${httpServer.address().port}`))
    } else {
        httpServer = app.listen(port, () => logger.info(`HTTP adapter listening on ${httpServer.address().port}`))
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

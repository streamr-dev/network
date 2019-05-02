const cors = require('cors')
const express = require('express')

const dataQueryEndpoints = require('./DataQueryEndpoints')
const dataProduceEndpoints = require('./DataProduceEndpoints')
const volumeEndpoint = require('./VolumeEndpoint')

module.exports = ({
    publisher,
    storage,
    streamFetcher,
    volumeLogger,
    config,
}) => {
    const app = express()

    // Add CORS headers
    app.use(cors())

    // Rest endpoints
    app.use('/api/v1', dataQueryEndpoints(storage, streamFetcher, volumeLogger))
    app.use('/api/v1', dataProduceEndpoints(streamFetcher, publisher, volumeLogger))
    app.use('/api/v1', volumeEndpoint(volumeLogger))

    const httpServer = app.listen(config.httpPort, () => console.info(`HTTP adapter listening on ${config.httpPort}`))
    return () => httpServer.stop()
}

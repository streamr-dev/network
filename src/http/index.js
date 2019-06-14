const cors = require('cors')
const express = require('express')

const adapterRegistry = require('../adapterRegistry')
const dataQueryEndpoints = require('./DataQueryEndpoints')
const dataProduceEndpoints = require('./DataProduceEndpoints')
const volumeEndpoint = require('./VolumeEndpoint')

adapterRegistry.register('http', ({ port }, { networkNode, publisher, streamFetcher, volumeLogger }) => {
    const app = express()

    // Add CORS headers
    app.use(cors())

    // Rest endpoints
    app.use('/api/v1', dataQueryEndpoints(networkNode, streamFetcher, volumeLogger))
    app.use('/api/v1', dataProduceEndpoints(streamFetcher, publisher))
    app.use('/api/v1', volumeEndpoint(volumeLogger))

    const httpServer = app.listen(port, () => console.info(`HTTP adapter listening on ${httpServer.address().port}`))
    return () => httpServer.close(() => {})
})

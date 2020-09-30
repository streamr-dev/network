const extraLogger = require('./logger')('streamr:tracker:http-endpoints')

const writeCorsHeaders = (res, req) => {
    const origin = req.getHeader('origin')
    res.writeHeader('Access-Control-Allow-Origin', origin)
    res.writeHeader('Access-Control-Allow-Credentials', 'true')
}

const trackerHttpEndpoints = (wss, tracker) => {
    wss.get('/topology/', (res, req) => {
        writeCorsHeaders(res, req)
        extraLogger.debug('request to /topology/')

        res.end(JSON.stringify(tracker.getTopology()))
    }).get('/topology/:streamId/', (res, req) => {
        writeCorsHeaders(res, req)

        const streamId = req.getParameter(0)
        if (streamId === '') {
            extraLogger.error('422 streamId must be a not empty string')
            res.writeStatus('422 streamId must be a not empty string').end()
            return
        }

        extraLogger.debug(`request to /topology/${streamId}/`)
        res.end(JSON.stringify(tracker.getTopology(streamId, null)))
    }).get('/topology/:streamId/:partition/', (res, req) => {
        writeCorsHeaders(res, req)

        const streamId = req.getParameter(0)
        if (streamId === '') {
            extraLogger.error('422 streamId must be a not empty string')
            res.writeStatus('422 streamId must be a not empty string').end()
            return
        }

        const askedPartition = Number.parseInt(req.getParameter(1), 10)
        if (!Number.isSafeInteger(askedPartition) || askedPartition < 0) {
            extraLogger.error(`422 partition must be a positive integer, askedPartition: ${askedPartition}`)
            res.writeStatus('422 partition must be a positive integer').end()
            return
        }

        extraLogger.debug(`request to /topology/${streamId}/${askedPartition}/`)
        res.end(JSON.stringify(tracker.getTopology(streamId, askedPartition)))
    }).get('/location/', (res, req) => {
        writeCorsHeaders(res, req)
        extraLogger.debug('request to /location/')

        res.end(JSON.stringify(tracker.getAllNodeLocations()))
    }).get('/location/:nodeId/', (res, req) => {
        writeCorsHeaders(res, req)

        const nodeId = req.getParameter(0)
        const location = tracker.getNodeLocation(nodeId)

        extraLogger.debug(`request to /location/${nodeId}/`)
        res.end(JSON.stringify(location || {}))
    }).get('/metrics/', async (res, req) => {
        writeCorsHeaders(res, req)

        /* Can't return or yield from here without responding or attaching an abort handler */
        res.onAborted(() => {
            res.aborted = true
        })

        const metrics = await tracker.getMetrics()

        if (!res.aborted) {
            extraLogger.debug('request to /metrics/')
            res.end(JSON.stringify(metrics))
        }
    })
}

module.exports = {
    writeCorsHeaders,
    trackerHttpEndpoints
}

import { HttpRequest, HttpResponse, TemplatedApp } from 'uWebSockets.js'
import { MetricsContext } from './MetricsContext'
import { addRttsToNodeConnections, getNodeConnections, getTopology } from '../logic/trackerSummaryUtils'
import getLogger from './logger'
import { Tracker } from '../logic/Tracker'

const extraLogger = getLogger('streamr:tracker:http-endpoints')

const writeCorsHeaders = (res: HttpResponse, req: HttpRequest): void => {
    const origin = req.getHeader('origin')
    res.writeHeader('Access-Control-Allow-Origin', origin)
    res.writeHeader('Access-Control-Allow-Credentials', 'true')
}

const respondWithError = (res: HttpResponse, req: HttpRequest, errorMessage: string): void => {
    res.writeStatus('422 Unprocessable Entity')
    writeCorsHeaders(res, req)
    res.end(JSON.stringify({
        errorMessage
    }))
}

const cachedJsonGet = (wss: TemplatedApp, endpoint: string, maxAge: number, jsonFactory: () => any): TemplatedApp => {
    let cache: undefined | {
        timestamp: number
        json: any
    }
    return wss.get(endpoint, (res, req) => {
        extraLogger.debug('request to ' + endpoint)
        writeCorsHeaders(res, req)
        if ((cache === undefined) || (Date.now() > (cache.timestamp + maxAge))) {
            cache = {
                json: jsonFactory(),
                timestamp: Date.now()
            }
        }
        res.end(JSON.stringify(cache.json))
    })
}

export function trackerHttpEndpoints(wss: TemplatedApp, tracker: Tracker, metricsContext: MetricsContext): void {
    wss.get('/topology/', (res, req) => {
        extraLogger.debug('request to /topology/')
        writeCorsHeaders(res, req)
        res.end(JSON.stringify(getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts())))
    })
    wss.get('/topology/:streamId/', (res, req) => {
        const streamId = decodeURIComponent(req.getParameter(0)).trim()
        if (streamId.length === 0) {
            extraLogger.error('422 streamId must be a not empty string')
            respondWithError(res, req, 'streamId cannot be empty')
            return
        }

        extraLogger.debug(`request to /topology/${streamId}/`)
        writeCorsHeaders(res, req)
        res.end(JSON.stringify(getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts(), streamId, null)))
    })
    wss.get('/topology/:streamId/:partition/', (res, req) => {
        const streamId = decodeURIComponent(req.getParameter(0)).trim()
        if (streamId.length === 0) {
            extraLogger.error('422 streamId must be a not empty string')
            respondWithError(res, req, 'streamId cannot be empty')
            return
        }

        const askedPartition = Number.parseInt(req.getParameter(1), 10)
        if (!Number.isSafeInteger(askedPartition) || askedPartition < 0) {
            extraLogger.error(`422 partition must be a positive integer, askedPartition: ${askedPartition}`)
            respondWithError(res, req, `partition must be a positive integer (was ${askedPartition})`)
            return
        }

        extraLogger.debug(`request to /topology/${streamId}/${askedPartition}/`)
        writeCorsHeaders(res, req)
        res.end(JSON.stringify(getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts(), streamId, askedPartition)))
    })
    cachedJsonGet(wss,'/node-connections/', 15 * 1000, () => {
        const topologyUnion = getNodeConnections(tracker.getNodes(), tracker.getOverlayPerStream())
        return Object.assign({}, ...Object.entries(topologyUnion).map(([nodeId, neighbors]) => {
            return addRttsToNodeConnections(nodeId, Array.from(neighbors), tracker.getOverlayConnectionRtts())
        }))
    })
    wss.get('/location/', (res, req) => {
        extraLogger.debug('request to /location/')
        writeCorsHeaders(res, req)
        res.end(JSON.stringify(tracker.getAllNodeLocations()))
    })
    wss.get('/location/:nodeId/', (res, req) => {
        const nodeId = req.getParameter(0)
        const location = tracker.getNodeLocation(nodeId)

        extraLogger.debug(`request to /location/${nodeId}/`)
        writeCorsHeaders(res, req)
        res.end(JSON.stringify(location || {}))
    })
    wss.get('/metrics/', async (res, req) => {
        /* Can't return or yield from here without responding or attaching an abort handler */
        res.onAborted(() => {
            res.aborted = true
        })

        const metrics = await metricsContext.report()

        if (!res.aborted) {
            writeCorsHeaders(res, req)
            extraLogger.debug('request to /metrics/')
            res.end(JSON.stringify(metrics))
        }
    })
}

import express from 'express'
import cors from 'cors'
import { MetricsContext } from './MetricsContext'
import { addRttsToNodeConnections, getNodeConnections, getTopology, getStreamSizes } from '../logic/trackerSummaryUtils'
import { Logger } from './Logger'
import { Tracker } from '../logic/Tracker'
import http from 'http'
import https from 'https'

const staticLogger = new Logger(module)

const respondWithError = (res: express.Response, errorMessage: string): void => {
    res.status(422).json({
        errorMessage
    })
}

const validateStreamId = (req: express.Request, res: express.Response): string | null => {
    const streamId = decodeURIComponent(req.params.streamId).trim()
    if (streamId.length === 0) {
        staticLogger.warn('422 streamId must be a not empty string')
        respondWithError(res, 'streamId cannot be empty')
        return null
    }
    return streamId
}

const validatePartition = (req: express.Request, res: express.Response): number | null  => {
    const partition = Number.parseInt(req.params.partition, 10)
    if (!Number.isSafeInteger(partition) || partition < 0) {
        staticLogger.warn(`422 partition must be a positive integer, askedPartition: ${partition}`)
        respondWithError(res, `partition must be a positive integer (was ${partition})`)
        return null
    }
    return partition
}

const cachedJsonGet = (
    app: express.Application,
    endpoint: string,
    maxAge: number,
    jsonFactory: () => any
): express.Application => {
    let cache: undefined | {
        timestamp: number
        json: any
    }
    return app.get(endpoint, (req: express.Request, res: express.Response) => {
        staticLogger.debug('request to ' + endpoint)
        if ((cache === undefined) || (Date.now() > (cache.timestamp + maxAge))) {
            cache = {
                json: jsonFactory(),
                timestamp: Date.now()
            }
        }
        res.json(cache.json)
    })
}

export function trackerHttpEndpoints(
    httpServer: http.Server | https.Server,
    tracker: Tracker,
    metricsContext: MetricsContext
): void {
    const app = express()
    app.use(cors())
    httpServer.on('request', app)

    app.get('/topology/', (req: express.Request, res: express.Response) => {
        staticLogger.debug('request to /topology/')
        res.json(getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts()))
    })
    app.get('/topology/:streamId/', (req: express.Request, res: express.Response) => {
        const streamId = validateStreamId(req, res)
        if (streamId === null) {
            return
        }

        staticLogger.debug(`request to /topology/${streamId}/`)
        res.json(getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts(), streamId, null))
    })
    app.get('/topology/:streamId/:partition/', (req: express.Request, res: express.Response) => {
        const streamId = validateStreamId(req, res)
        if (streamId === null) {
            return
        }

        const askedPartition = validatePartition(req, res)
        if (askedPartition === null) {
            return
        }

        staticLogger.debug(`request to /topology/${streamId}/${askedPartition}/`)
        res.json(getTopology(tracker.getOverlayPerStream(), tracker.getOverlayConnectionRtts(), streamId, askedPartition))
    })
    cachedJsonGet(app,'/node-connections/', 15 * 1000, () => {
        const topologyUnion = getNodeConnections(tracker.getNodes(), tracker.getOverlayPerStream())
        return Object.assign({}, ...Object.entries(topologyUnion).map(([nodeId, neighbors]) => {
            return addRttsToNodeConnections(nodeId, Array.from(neighbors), tracker.getOverlayConnectionRtts())
        }))
    })
    app.get('/location/', (req: express.Request, res: express.Response) => {
        staticLogger.debug('request to /location/')
        res.json(tracker.getAllNodeLocations())
    })
    app.get('/location/:nodeId/', (req: express.Request, res: express.Response) => {
        const nodeId = req.params.nodeId
        const location = tracker.getNodeLocation(nodeId)

        staticLogger.debug(`request to /location/${nodeId}/`)
        res.json(location || {})
    })
    app.get('/metrics/', async (req: express.Request, res: express.Response) => {
        const metrics = await metricsContext.report()
        staticLogger.debug('request to /metrics/')
        res.json(metrics)
    })
    app.get('/topology-size/', async (req: express.Request, res: express.Response) => {
        staticLogger.debug('request to /topology-size/')
        res.json(getStreamSizes(tracker.getOverlayPerStream()))
    })
    app.get('/topology-size/:streamId/', async (req: express.Request, res: express.Response) => {
        const streamId = validateStreamId(req, res)
        if (streamId === null) {
            return
        }
        
        staticLogger.debug(`request to /topology-size/${streamId}/`)
        res.json(getStreamSizes(tracker.getOverlayPerStream(), streamId, null))
    })
    app.get('/topology-size/:streamId/:partition/', async (req: express.Request, res: express.Response) => {
        const streamId = validateStreamId(req, res)
        if (streamId === null) {
            return
        }

        const askedPartition = validatePartition(req, res)
        if (askedPartition === null) {
            return
        }

        staticLogger.debug(`request to /topology-size/${streamId}/${askedPartition}/`)
        res.json(getStreamSizes(tracker.getOverlayPerStream(), streamId, askedPartition))
    })
}

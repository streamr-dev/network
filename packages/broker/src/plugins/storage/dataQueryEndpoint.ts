/**
 * Endpoints for RESTful data requests
 */
import { Request, RequestHandler, Response } from 'express'
import { StreamMessage } from '@streamr/protocol'
import { Logger, MetricsContext, MetricsDefinition, RateMetric } from '@streamr/utils'
import { Readable, Transform, pipeline } from 'stream'
import { Storage } from './Storage'
import { Format, getFormat } from './DataQueryFormat'
import { HttpServerEndpoint } from '../../Plugin'

const logger = new Logger(module)

// TODO: move this to protocol-js
export const MIN_SEQUENCE_NUMBER_VALUE = 0
export const MAX_SEQUENCE_NUMBER_VALUE = 2147483647

class ResponseTransform extends Transform {

    format: Format
    version: number | undefined
    firstMessage = true

    constructor(format: Format, version: number | undefined) {
        super({
            writableObjectMode: true
        })
        this.format = format
        this.version = version
    }

    override _transform(input: StreamMessage, _encoding: string, done: () => void) {
        if (this.firstMessage) {
            this.firstMessage = false
            this.push(this.format.header)
        } else {
            this.push(this.format.delimiter)
        }
        this.push(this.format.getMessageAsString(input, this.version))
        done()
    }

    override _flush(done: () => void) {
        if (this.firstMessage) {
            this.push(this.format.header)
        }
        this.push(this.format.footer)
        done()
    }
}

function parseIntIfExists(x: string | undefined): number | undefined {
    return x === undefined ? undefined : parseInt(x)
}

const sendSuccess = (data: Readable, format: Format, version: number | undefined, streamId: string, res: Response) => {
    data.once('data', () => {
        res.writeHead(200, {
            'Content-Type': format.contentType
        })
    })
    data.once('error', () => {
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Failed to fetch data!'
            })
        }
    })
    pipeline(
        data,
        new ResponseTransform(format, version),
        res,
        (err) => {
            if ((err !== undefined) && (err !== null)) {
                logger.error('Encountered error in pipeline', {
                    streamId,
                    err
                })
            }
        }
    )
}

const sendError = (message: string, res: Response) => {
    res.status(400).json({
        error: message
    })
}

type BaseRequest<Q> = Request<Record<string, any>, any, any, Q, Record<string, any>>

type LastRequest = BaseRequest<{
    count?: string
}>

type FromRequest = BaseRequest<{
    fromTimestamp?: string
    fromSequenceNumber?: string
    publisherId?: string
}>

type RangeRequest = BaseRequest<{
    fromTimestamp?: string
    toTimestamp?: string
    fromSequenceNumber?: string
    toSequenceNumber?: string
    publisherId?: string
    msgChainId?: string
    fromOffset?: string // no longer supported
    toOffset?: string   // no longer supported
}>

const handleLast = (
    req: LastRequest,
    streamId: string,
    partition: number,
    format: Format,
    version: number | undefined,
    res: Response,
    storage: Storage,
    metrics: MetricsDefinition
) => {
    metrics.resendLastQueriesPerSecond.record(1)
    const count = req.query.count === undefined ? 1 : parseIntIfExists(req.query.count)
    if (Number.isNaN(count)) {
        sendError(`Query parameter "count" not a number: ${req.query.count}`, res)
        return
    }
    const data = storage.requestLast(
        streamId,
        partition,
        count!,
    )
    sendSuccess(data, format, version, streamId, res)
}

const handleFrom = (
    req: FromRequest,
    streamId: string,
    partition: number,
    format: Format,
    version: number | undefined,
    res: Response,
    storage: Storage,
    metrics: MetricsDefinition
) => {
    metrics.resendFromQueriesPerSecond.record(1)
    const fromTimestamp = parseIntIfExists(req.query.fromTimestamp)
    const fromSequenceNumber = parseIntIfExists(req.query.fromSequenceNumber) ?? MIN_SEQUENCE_NUMBER_VALUE
    const { publisherId } = req.query
    if (fromTimestamp === undefined) {
        sendError('Query parameter "fromTimestamp" required.', res)
        return
    }
    if (Number.isNaN(fromTimestamp)) {
        sendError(`Query parameter "fromTimestamp" not a number: ${req.query.fromTimestamp}`, res)
        return
    } 
    const data = storage.requestFrom(
        streamId,
        partition,
        fromTimestamp,
        fromSequenceNumber,
        publisherId
    )
    sendSuccess(data, format, version, streamId, res)
}

const handleRange = (
    req: RangeRequest,
    streamId: string,
    partition: number,
    format: Format,
    version: number | undefined,
    res: Response,
    storage: Storage,
    metrics: MetricsDefinition
) => {
    metrics.resendRangeQueriesPerSecond.record(1)
    const fromTimestamp = parseIntIfExists(req.query.fromTimestamp)
    const toTimestamp = parseIntIfExists(req.query.toTimestamp)
    const fromSequenceNumber = parseIntIfExists(req.query.fromSequenceNumber) ?? MIN_SEQUENCE_NUMBER_VALUE
    const toSequenceNumber = parseIntIfExists(req.query.toSequenceNumber) ?? MAX_SEQUENCE_NUMBER_VALUE
    const { publisherId, msgChainId } = req.query
    if (req.query.fromOffset !== undefined || req.query.toOffset !== undefined) {
        sendError('Query parameters "fromOffset" and "toOffset" are no longer supported. Please use "fromTimestamp" and "toTimestamp".', res)
        return
    }
    if (fromTimestamp === undefined) {
        sendError('Query parameter "fromTimestamp" required.', res)
        return
    }
    if (Number.isNaN(fromTimestamp)) {
        sendError(`Query parameter "fromTimestamp" not a number: ${req.query.fromTimestamp}`, res)
        return
    }
    if (toTimestamp === undefined) {
        // eslint-disable-next-line max-len
        sendError('Query parameter "toTimestamp" required as well. To request all messages since a timestamp, use the endpoint /streams/:id/data/partitions/:partition/from', res)
        return
    }
    if (Number.isNaN(toTimestamp)) {
        sendError(`Query parameter "toTimestamp" not a number: ${req.query.toTimestamp}`, res)
        return
    }
    if ((publisherId && !msgChainId) || (!publisherId && msgChainId)) {
        sendError('Invalid combination of "publisherId" and "msgChainId"', res)
        return
    }
    const data = storage.requestRange(
        streamId,
        partition,
        fromTimestamp,
        fromSequenceNumber,
        toTimestamp,
        toSequenceNumber,
        publisherId,
        msgChainId
    )
    sendSuccess(data, format, version, streamId, res)
}

const createHandler = (storage: Storage, metrics: MetricsDefinition): RequestHandler => {
    return (req: Request, res: Response) => {
        if (Number.isNaN(parseInt(req.params.partition))) {
            sendError(`Path parameter "partition" not a number: ${req.params.partition}`, res)
            return
        }
        const format = getFormat(req.query.format as string)
        if (format === undefined) {
            sendError(`Query parameter "format" is invalid: ${req.query.format}`, res)
            return
        }
        const streamId = req.params.id
        const partition = parseInt(req.params.partition)
        const version = parseIntIfExists(req.query.version as string)
        switch (req.params.resendType) {
            case 'last':
                handleLast(req, streamId, partition, format, version, res, storage, metrics)
                break
            case 'from':
                handleFrom(req, streamId, partition, format, version, res, storage, metrics)
                break
            case 'range':
                handleRange(req, streamId, partition, format, version, res, storage, metrics)
                break
            default: 
                sendError('Unknown resend type', res)
                break
        }
    }
}

export const createDataQueryEndpoint = (storage: Storage, metricsContext: MetricsContext): HttpServerEndpoint => {
    const metrics = {
        resendLastQueriesPerSecond: new RateMetric(),
        resendFromQueriesPerSecond: new RateMetric(),
        resendRangeQueriesPerSecond: new RateMetric()
    }
    metricsContext.addMetrics('broker.plugin.storage', metrics)
    return {
        path: `/streams/:id/data/partitions/:partition/:resendType`,
        method: 'get',
        requestHandlers: [createHandler(storage, metrics)]
    }
}

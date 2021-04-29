/**
 * Endpoints for RESTful data requests
 */
import express, { Request, Response } from 'express'
import { MetricsContext, Protocol } from 'streamr-network'
import { Metrics } from 'streamr-network/dist/helpers/MetricsContext'
import { getLogger } from '../helpers/logger'
import { Todo } from '../types'
import { Storage } from '../storage/Storage'
import { authenticator } from './RequestAuthenticatorMiddleware'
import { Format, getFormat } from './DataQueryFormat'

const logger = getLogger('streamr:http:DataQueryEndpoints')

// TODO: move this to protocol-js
export const MIN_SEQUENCE_NUMBER_VALUE = 0
export const MAX_SEQUENCE_NUMBER_VALUE = 2147483647

const onStarted = (res: Response, format: Format) => {
    res.writeHead(200, {
        'Content-Type': format.contentType
    })
    res.write(format.header)
}

const onRow = (res: Response, streamMessage: Protocol.StreamMessage, delimiter: Todo, format: Format, version: number|undefined, metrics: Metrics) => {
    res.write(delimiter) // because can't have trailing comma in JSON array
    const messageAsString = format.getMessageAsString(streamMessage, version)
    res.write(messageAsString)
    metrics.record('outBytes', streamMessage.getSerializedContent().length) // TODO this should the actual byte count (messageAsString.length)?
    metrics.record('outMessages', 1)
}

const streamData = (res: Response, stream: NodeJS.ReadableStream, format: Format, version: Todo, metrics: Metrics) => {
    let delimiter = ''
    stream.on('data', (row) => {
        // first row
        if (delimiter === '') {
            onStarted(res, format)
        }
        onRow(res, row, delimiter, format, version, metrics)
        delimiter = format.delimiter
    })
    stream.on('end', () => {
        if (delimiter === '') {
            onStarted(res, format)
        }
        res.write(format.footer)
        res.end()
    })
    stream.on('error', (err: Todo) => {
        logger.error(err)
        res.status(500).send({
            error: 'Failed to fetch data!'
        })
    })
}

function parseIntIfExists(x: Todo) {
    return x === undefined ? undefined : parseInt(x)
}

const createEndpoint = (path: string, router: express.Router, callback: (req: Request, res: Response, streamId: string, partition: number, format: Format, version: number|undefined) => void) => {
    router.get(path, (req: Request, res: Response) => {
        const format = getFormat(req.query.format as string)
        if (format === undefined) {
            const errMsg = `Query parameter "format" is invalid: ${req.query.format}`
            logger.error(errMsg)
            res.status(400).send({
                error: errMsg
            })
        } else {
            const streamId = req.params.id
            const partition = parseInt(req.params.partition)
            const version = parseIntIfExists(req.query.version)
            callback(req, res, streamId, partition, format, version)
        }
    })
}

export const router = (storage: Storage, streamFetcher: Todo, metricsContext: MetricsContext) => {
    const router = express.Router()
    const metrics = metricsContext.create('broker/http')
        .addRecordedMetric('outBytes')
        .addRecordedMetric('outMessages')
        .addRecordedMetric('lastRequests')
        .addRecordedMetric('fromRequests')
        .addRecordedMetric('rangeRequests')

    router.use(
        '/streams/:id/data/partitions/:partition',
        // partition parsing middleware
        (req, res, next) => {
            if (Number.isNaN(parseInt(req.params.partition))) {
                const errMsg = `Path parameter "partition" not a number: ${req.params.partition}`
                logger.error(errMsg)
                res.status(400).send({
                    error: errMsg
                })
            } else {
                next()
            }
        },
        // authentication
        authenticator(streamFetcher, 'stream_subscribe'),
    )

    createEndpoint('/streams/:id/data/partitions/:partition/last', router, (req: Request, res: Response, streamId: string, partition: number, format: Format, version: number|undefined) => {
        const count = req.query.count === undefined ? 1 : parseInt(req.query.count as string)
        metrics.record('lastRequests', 1)

        if (Number.isNaN(count)) {
            const errMsg = `Query parameter "count" not a number: ${req.query.count}`
            logger.error(errMsg)

            res.status(400).send({
                error: errMsg,
            })
        } else {
            const streamingData = storage.requestLast(
                streamId,
                partition,
                count,
            )

            streamData(res, streamingData, format, version, metrics)
        }
    })

    createEndpoint('/streams/:id/data/partitions/:partition/from', router, (req: Request, res: Response, streamId: string, partition: number, format: Format, version: number|undefined) => {
        const fromTimestamp = parseIntIfExists(req.query.fromTimestamp)
        const fromSequenceNumber = parseIntIfExists(req.query.fromSequenceNumber) || MIN_SEQUENCE_NUMBER_VALUE
        const { publisherId } = req.query
        metrics.record('fromRequests', 1)

        if (fromTimestamp === undefined) {
            const errMsg = 'Query parameter "fromTimestamp" required.'
            logger.error(errMsg)

            res.status(400).send({
                error: errMsg
            })
        } else if (Number.isNaN(fromTimestamp)) {
            const errMsg = `Query parameter "fromTimestamp" not a number: ${req.query.fromTimestamp}`
            logger.error(errMsg)

            res.status(400).send({
                error: errMsg
            })
        } else {
            const streamingData = storage.requestFrom(
                streamId,
                partition,
                fromTimestamp,
                fromSequenceNumber,
                (publisherId as string) || null,
                null,
            )

            streamData(res, streamingData, format, version, metrics)
        }
    })

    createEndpoint('/streams/:id/data/partitions/:partition/range', router, (req: Request, res: Response, streamId: string, partition: number, format: Format, version: number|undefined) => {
        const fromTimestamp = parseIntIfExists(req.query.fromTimestamp)
        const toTimestamp = parseIntIfExists(req.query.toTimestamp)
        const fromSequenceNumber = parseIntIfExists(req.query.fromSequenceNumber) || MIN_SEQUENCE_NUMBER_VALUE
        const toSequenceNumber = parseIntIfExists(req.query.toSequenceNumber) || MAX_SEQUENCE_NUMBER_VALUE
        const { publisherId, msgChainId } = req.query
        metrics.record('rangeRequests', 1)

        if (req.query.fromOffset !== undefined || req.query.toOffset !== undefined) {
            const errMsg = 'Query parameters "fromOffset" and "toOffset" are no longer supported. '
                + 'Please use "fromTimestamp" and "toTimestamp".'
            logger.error(errMsg)

            res.status(400).send({
                error: errMsg
            })
        } else if (fromTimestamp === undefined) {
            const errMsg = 'Query parameter "fromTimestamp" required.'
            logger.error(errMsg)

            res.status(400).send({
                error: errMsg
            })
        } else if (Number.isNaN(fromTimestamp)) {
            const errMsg = `Query parameter "fromTimestamp" not a number: ${req.query.fromTimestamp}`
            logger.error(errMsg)

            res.status(400).send({
                error: errMsg
            })
        } else if (toTimestamp === undefined) {
            const errMsg = 'Query parameter "toTimestamp" required as well. To request all messages since a timestamp,'
                + 'use the endpoint /streams/:id/data/partitions/:partition/from'
            logger.error(errMsg)

            res.status(400).send({
                error: errMsg
            })
        } else if (Number.isNaN(toTimestamp)) {
            const errMsg = `Query parameter "toTimestamp" not a number: ${req.query.toTimestamp}`
            logger.error(errMsg)

            res.status(400).send({
                error: errMsg
            })
        } else {
            if ((publisherId && !msgChainId) || (!publisherId && msgChainId)) {
                res.status(400).send({
                    error: 'Invalid combination of "publisherId" and "msgChainId"'
                })
                return
            }
            const streamingData = storage.requestRange(
                streamId,
                partition,
                fromTimestamp,
                fromSequenceNumber,
                toTimestamp,
                toSequenceNumber,
                (publisherId as string) || null,
                (msgChainId as string) || null
            )

            streamData(res, streamingData, format, version, metrics)
        }
    })

    return router
}

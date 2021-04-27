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

const logger = getLogger('streamr:http:DataQueryEndpoints')

// TODO: move this to protocol-js
export const MIN_SEQUENCE_NUMBER_VALUE = 0
export const MAX_SEQUENCE_NUMBER_VALUE = 2147483647

const onStarted = (res: Response) => {
    res.writeHead(200, {
        'Content-Type': 'application/json'
    })
    res.write('[')
}

const onRow = (res: Response, streamMessage: Protocol.StreamMessage, delimiter: Todo, format = 'object', version: Todo, metrics: Metrics) => {
    res.write(delimiter) // because can't have trailing comma in JSON array
    res.write(format === 'protocol' ? JSON.stringify(streamMessage.serialize(version)) : JSON.stringify(streamMessage.toObject()))
    metrics.record('outBytes', streamMessage.getSerializedContent().length)
    metrics.record('outMessages', 1)
}

const streamData = (res: Response, stream: NodeJS.ReadableStream, format: string, version: Todo, metrics: Metrics) => {
    let delimiter = ''
    stream.on('data', (row) => {
        // first row
        if (delimiter === '') {
            onStarted(res)
        }
        onRow(res, row, delimiter, format, version, metrics)
        delimiter = ','
    })
    stream.on('end', () => {
        if (delimiter === '') {
            onStarted(res)
        }
        res.write(']')
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

    router.get('/streams/:id/data/partitions/:partition/last', (req: Request, res: Response) => {
        const partition = parseInt(req.params.partition)
        const count = req.query.count === undefined ? 1 : parseInt(req.query.count as string)
        const version = parseIntIfExists(req.query.version)
        metrics.record('lastRequests', 1)

        if (Number.isNaN(count)) {
            const errMsg = `Query parameter "count" not a number: ${req.query.count}`
            logger.error(errMsg)

            res.status(400).send({
                error: errMsg,
            })
        } else {
            const streamingData = storage.requestLast(
                req.params.id,
                partition,
                count,
            )

            streamData(res, streamingData, (req.query.format as string), version, metrics)
        }
    })

    router.get('/streams/:id/data/partitions/:partition/from', (req: Request, res: Response) => {
        const partition = parseInt(req.params.partition)
        const fromTimestamp = parseIntIfExists(req.query.fromTimestamp)
        const fromSequenceNumber = parseIntIfExists(req.query.fromSequenceNumber) || MIN_SEQUENCE_NUMBER_VALUE
        const { publisherId } = req.query
        const version = parseIntIfExists(req.query.version)
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
                req.params.id,
                partition,
                fromTimestamp,
                fromSequenceNumber,
                (publisherId as string) || null,
                null,
            )

            streamData(res, streamingData, (req.query.format as string), version, metrics)
        }
    })

    router.get('/streams/:id/data/partitions/:partition/range', (req: Request, res: Response) => {
        const partition = parseInt(req.params.partition)
        const version = parseIntIfExists(req.query.version)
        const fromTimestamp = parseIntIfExists(req.query.fromTimestamp)
        const toTimestamp = parseIntIfExists(req.query.toTimestamp)
        const fromSequenceNumber = parseIntIfExists(req.query.fromSequenceNumber) || MIN_SEQUENCE_NUMBER_VALUE
        const toSequenceNumber = parseIntIfExists(req.query.toSequenceNumber) || MAX_SEQUENCE_NUMBER_VALUE
        const { publisherId } = req.query
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
            const streamingData = storage.requestRange(
                req.params.id,
                partition,
                fromTimestamp,
                fromSequenceNumber,
                toTimestamp,
                toSequenceNumber,
                (publisherId as string) || null,
                null,
            )

            streamData(res, streamingData, (req.query.format as string), version, metrics)
        }
    })

    return router
}

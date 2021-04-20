/**
 * Endpoints for RESTful data requests
 */
import express, { Request, Response } from 'express'
import { MetricsContext, NetworkNode } from 'streamr-network'
import { Metrics } from 'streamr-network/dist/helpers/MetricsContext'
import getLogger from '../helpers/logger'
import { Todo } from '../types'
import authenticationMiddleware from './RequestAuthenticatorMiddleware'

const logger = getLogger('streamr:http:DataQueryEndpoints')

const onStarted = (res: Response) => {
    res.writeHead(200, {
        'Content-Type': 'application/json'
    })
    res.write('[')
}

const onRow = (res: Response, unicastMessage: Todo, delimiter: Todo, format = 'object', version: Todo, metrics: Metrics) => {
    const { streamMessage } = unicastMessage
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

function generateSubId() {
    let result = ''
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (let i = 0; i < characters.length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length))
    }
    return result
}

export const router = (networkNode: NetworkNode, streamFetcher: Todo, metricsContext: MetricsContext) => {
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
        authenticationMiddleware(streamFetcher, 'stream_subscribe'),
    )

    router.get('/streams/:id/data/partitions/:partition/last', (req: Request, res: Response) => {
        const partition = parseInt(req.params.partition)
        // @ts-expect-error
        const count = req.query.count === undefined ? 1 : parseInt(req.query.count)
        const version = parseIntIfExists(req.query.version)
        metrics.record('lastRequests', 1)

        if (Number.isNaN(count)) {
            const errMsg = `Query parameter "count" not a number: ${req.query.count}`
            logger.error(errMsg)

            res.status(400).send({
                error: errMsg,
            })
        } else {
            const streamingData = networkNode.requestResendLast(
                req.params.id,
                partition,
                generateSubId(),
                count,
            )

            // @ts-expect-error
            streamData(res, streamingData, req.query.format, version, metrics)
        }
    })

    router.get('/streams/:id/data/partitions/:partition/from', (req: Request, res: Response) => {
        const partition = parseInt(req.params.partition)
        const fromTimestamp = parseIntIfExists(req.query.fromTimestamp)
        const fromSequenceNumber = parseIntIfExists(req.query.fromSequenceNumber)
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
            const streamingData = networkNode.requestResendFrom(
                req.params.id,
                partition,
                generateSubId(),
                fromTimestamp,
                // @ts-expect-error
                fromSequenceNumber,
                publisherId || null,
                null,
            )

            // @ts-expect-error
            streamData(res, streamingData, req.query.format, version, metrics)
        }
    })

    router.get('/streams/:id/data/partitions/:partition/range', (req: Request, res: Response) => {
        const partition = parseInt(req.params.partition)
        const version = parseIntIfExists(req.query.version)
        const fromTimestamp = parseIntIfExists(req.query.fromTimestamp)
        const toTimestamp = parseIntIfExists(req.query.toTimestamp)
        const fromSequenceNumber = parseIntIfExists(req.query.fromSequenceNumber)
        const toSequenceNumber = parseIntIfExists(req.query.toSequenceNumber)
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
            const streamingData = networkNode.requestResendRange(
                req.params.id,
                partition,
                generateSubId(),
                fromTimestamp,
                // @ts-expect-error
                fromSequenceNumber,
                toTimestamp,
                toSequenceNumber,
                publisherId || null,
                null,
            )

            // @ts-expect-error
            streamData(res, streamingData, req.query.format, version, metrics)
        }
    })

    return router
}

/**
 * Endpoints for RESTful data requests
 */
const express = require('express')

const VolumeLogger = require('../VolumeLogger')
const logger = require('../helpers/logger')('streamr:http:DataQueryEndpoints')

const authenticationMiddleware = require('./RequestAuthenticatorMiddleware')

const onStarted = (res) => {
    res.writeHead(200, {
        'Content-Type': 'application/json'
    })
    res.write('[')
}

const onRow = (res, unicastMessage, delimiter, format = 'object', version, volumeLogger) => {
    const { streamMessage } = unicastMessage
    volumeLogger.logOutput(streamMessage.getSerializedContent().length)
    res.write(delimiter) // because can't have trailing comma in JSON array
    res.write(format === 'protocol' ? JSON.stringify(streamMessage.serialize(version)) : JSON.stringify(streamMessage.toObject()))
}

const streamData = (res, stream, format, version, volumeLogger) => {
    let delimiter = ''
    stream.on('data', (row) => {
        // first row
        if (delimiter === '') {
            onStarted(res)
        }
        onRow(res, row, delimiter, format, version, volumeLogger)
        delimiter = ','
    })
    stream.on('end', () => {
        if (delimiter === '') {
            onStarted(res)
        }
        res.write(']')
        res.end()
    })
    stream.on('error', (err) => {
        logger.error(err)
        res.status(500).send({
            error: 'Failed to fetch data!'
        })
    })
}

function parseIntIfExists(x) {
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

module.exports = (networkNode, streamFetcher, volumeLogger = new VolumeLogger(0)) => {
    const router = express.Router()

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

    router.get('/streams/:id/data/partitions/:partition/last', (req, res) => {
        const partition = parseInt(req.params.partition)
        const count = req.query.count === undefined ? 1 : parseInt(req.query.count)
        const version = parseIntIfExists(req.query.version)

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

            streamData(res, streamingData, req.query.format, version, volumeLogger)
        }
    })

    router.get('/streams/:id/data/partitions/:partition/from', (req, res) => {
        const partition = parseInt(req.params.partition)
        const fromTimestamp = parseIntIfExists(req.query.fromTimestamp)
        const fromSequenceNumber = parseIntIfExists(req.query.fromSequenceNumber)
        const { publisherId } = req.query
        const version = parseIntIfExists(req.query.version)

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
                fromSequenceNumber,
                publisherId || null,
                null,
            )

            streamData(res, streamingData, req.query.format, version, volumeLogger)
        }
    })

    router.get('/streams/:id/data/partitions/:partition/range', (req, res) => {
        const partition = parseInt(req.params.partition)
        const version = parseIntIfExists(req.query.version)
        const fromTimestamp = parseIntIfExists(req.query.fromTimestamp)
        const toTimestamp = parseIntIfExists(req.query.toTimestamp)
        const fromSequenceNumber = parseIntIfExists(req.query.fromSequenceNumber)
        const toSequenceNumber = parseIntIfExists(req.query.toSequenceNumber)
        const { publisherId } = req.query

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
                fromSequenceNumber,
                toTimestamp,
                toSequenceNumber,
                publisherId || null,
                null,
            )

            streamData(res, streamingData, req.query.format, version, volumeLogger)
        }
    })

    return router
}

/**
 * Endpoints for RESTful data requests
 */
const express = require('express')
const VolumeLogger = require('../utils/VolumeLogger')
const authenticationMiddleware = require('./RequestAuthenticatorMiddleware')

function onDataFetchDone(res, dataPoints, wrapper, content, volumeLogger) {
    return function (largestOffset, err) {
        if (err) {
            console.log(err)
            res.status(500).send({
                error: 'Failed to fetch data!',
            })
        } else {
            switch (wrapper.toLowerCase()) {
                case 'array':
                    volumeLogger.outCount += 1
                    res.send(dataPoints.map((message) => message.toArray(content !== 'json')))
                    break
                case 'object':
                    volumeLogger.outCount += 1
                    res.send(dataPoints.map((message) => message.toObject(content !== 'json')))
                    break
                default:
                    console.log(err)
                    res.status(400).send({
                        error: `Invalid value for query parameter "wrapper": ${wrapper}`,
                    })
            }
        }
    }
}

function parseIntIfExists(x) {
    return x === undefined ? undefined : parseInt(x)
}

module.exports = (historicalAdapter, streamFetcher, volumeLogger = new VolumeLogger(0)) => {
    const router = express.Router()

    router.use(
        '/streams/:id/data/partitions/:partition',
        // partition parsing middleware
        (req, res, next) => {
            if (Number.isNaN(parseInt(req.params.partition))) {
                res.status(400).send({
                    error: `Path parameter "partition" not a number: ${req.params.partition}`,
                })
            } else {
                next()
            }
        },
        // authentication
        authenticationMiddleware(streamFetcher, 'read'),
    )

    router.get('/streams/:id/data/partitions/:partition/last', (req, res) => {
        const partition = parseInt(req.params.partition)
        const count = req.query.count === undefined ? 1 : parseInt(req.query.count)
        const wrapper = req.query.wrapper || 'array'
        const content = req.query.content || 'string'

        if (Number.isNaN(count)) {
            res.status(400).send({
                error: `Query parameter "count" not a number: ${req.query.count}`,
            })
        } else {
            const dataPoints = []
            historicalAdapter.getLast(
                req.params.id,
                partition,
                count,
                dataPoints.push.bind(dataPoints),
                onDataFetchDone(res, dataPoints, wrapper, content, volumeLogger),
            )
        }
    })

    router.get('/streams/:id/data/partitions/:partition/range', (req, res) => {
        const partition = parseInt(req.params.partition)
        const wrapper = req.query.wrapper || 'array'
        const content = req.query.content || 'string'
        const fromOffset = parseIntIfExists(req.query.fromOffset)
        const toOffset = parseIntIfExists(req.query.toOffset)
        const fromTimestamp = parseIntIfExists(req.query.fromTimestamp)
        const toTimestamp = parseIntIfExists(req.query.toTimestamp)

        if (fromOffset !== undefined && Number.isNaN(fromOffset)) {
            res.status(400).send({
                error: `Query parameter "fromOffset" not a number: ${req.query.fromOffset}`,
            })
        } else if (fromTimestamp !== undefined && Number.isNaN(fromTimestamp)) {
            res.status(400).send({
                error: `Query parameter "fromTimestamp" not a number: ${req.query.fromTimestamp}`,
            })
        } else if (toOffset !== undefined && Number.isNaN(toOffset)) {
            res.status(400).send({
                error: `Query parameter "toOffset" not a number: ${req.query.toOffset}`,
            })
        } else if (toTimestamp !== undefined && Number.isNaN(toTimestamp)) {
            res.status(400).send({
                error: `Query parameter "toTimestamp" not a number: ${req.query.toTimestamp}`,
            })
        } else if (fromOffset === undefined && fromTimestamp === undefined) {
            res.status(400).send({
                error: 'Query parameter "fromOffset" or "fromTimestamp" required.',
            })
        } else if (fromOffset !== undefined && fromTimestamp !== undefined) {
            res.status(400).send({
                error: 'Query parameters "fromOffset" and "fromTimestamp" cannot be used simultaneously.',
            })
        } else if (toOffset !== undefined && toTimestamp !== undefined) {
            res.status(400).send({
                error: 'Query parameters "toOffset" and "toTimestamp" cannot be used simultaneously.',
            })
        } else if (fromOffset !== undefined && toTimestamp !== undefined) {
            res.status(400).send({
                error: 'Using query parameters "fromOffset" and "toTimestamp" together is not yet supported.',
            })
        } else if (fromTimestamp !== undefined && toOffset !== undefined) {
            res.status(400).send({
                error: 'Using query parameters "fromTimestamp" and "toOffset" together is not yet supported.',
            })
        } else {
            const dataPoints = []

            if (fromOffset !== undefined && toOffset === undefined) {
                historicalAdapter.getFromOffset(
                    req.params.id,
                    partition,
                    fromOffset,
                    dataPoints.push.bind(dataPoints),
                    onDataFetchDone(res, dataPoints, wrapper, content, volumeLogger),
                )
            } else if (fromOffset !== undefined && toOffset !== undefined) {
                historicalAdapter.getOffsetRange(
                    req.params.id,
                    partition,
                    fromOffset,
                    toOffset,
                    dataPoints.push.bind(dataPoints),
                    onDataFetchDone(res, dataPoints, wrapper, content, volumeLogger),
                )
            } else if (toTimestamp === undefined) {
                historicalAdapter.getFromTimestamp(
                    req.params.id,
                    partition,
                    new Date(fromTimestamp),
                    dataPoints.push.bind(dataPoints),
                    onDataFetchDone(res, dataPoints, wrapper, content, volumeLogger),
                )
            } else {
                historicalAdapter.getTimestampRange(
                    req.params.id,
                    partition,
                    new Date(fromTimestamp),
                    new Date(toTimestamp),
                    dataPoints.push.bind(dataPoints),
                    onDataFetchDone(res, dataPoints, wrapper, content, volumeLogger),
                )
            }
        }
    })

    return router
}

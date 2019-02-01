/**
 * Endpoints for RESTful data requests
 */
const express = require('express')
const VolumeLogger = require('../utils/VolumeLogger')
const authenticationMiddleware = require('./RequestAuthenticatorMiddleware')

function onDataFetchDone(res, dataPoints, wrapper, content, volumeLogger) {
    return (err) => {
        if (err) {
            console.log(err)
            res.status(500).send({
                error: 'Failed to fetch data!',
            })
        } else {
            let volumeBytes = 0
            res.send(dataPoints.map((streamMessage) => {
                volumeBytes += streamMessage.getSerializedContent().length
                if (streamMessage.version === 30) {
                    return streamMessage.toArray(content === 'json')
                }
                return streamMessage.toObject(
                    content === 'json', // parseContent
                    wrapper !== 'object', // compact
                )
            }))
            volumeLogger.logOutput(volumeBytes)
        }
    }
}

function parseIntIfExists(x) {
    return x === undefined ? undefined : parseInt(x)
}

module.exports = (storage, streamFetcher, volumeLogger = new VolumeLogger(0)) => {
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
        const wrapperOption = req.query.wrapper || 'array'
        const contentOption = req.query.content || 'string'

        if (Number.isNaN(count)) {
            res.status(400).send({
                error: `Query parameter "count" not a number: ${req.query.count}`,
            })
        } else {
            const dataPoints = []
            const streamingData = storage.fetchLatest(
                req.params.id,
                partition,
                count,
            )
            streamingData.on('error', onDataFetchDone(res))
            streamingData.on('data', dataPoints.push.bind(dataPoints))
            streamingData.on('end', onDataFetchDone(res, dataPoints, wrapperOption.toLowerCase(), contentOption.toLowerCase(), volumeLogger))
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

        // TODO: do we just drop offsets (like done below) and keep the rest the same?
        // or do we modify the REST API to support from/range with message refs and publisherId like in WebSocket?

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
                throw new Error('no longer supported') // TODO: support?
            } else if (fromOffset !== undefined && toOffset !== undefined) {
                throw new Error('no longer supported') // TODO: support?
            } else if (toTimestamp === undefined) {
                const streamingData = storage.fetchFromTimestamp(
                    req.params.id,
                    partition,
                    new Date(fromTimestamp),
                )
                streamingData.on('error', onDataFetchDone(res))
                streamingData.on('data', dataPoints.push.bind(dataPoints))
                streamingData.on('end', onDataFetchDone(res, dataPoints, wrapper, content, volumeLogger))
            } else {
                const streamingData = storage.fetchBetweenTimestamps(
                    req.params.id,
                    partition,
                    new Date(fromTimestamp),
                    new Date(toTimestamp),
                )
                streamingData.on('error', onDataFetchDone(res))
                streamingData.on('data', dataPoints.push.bind(dataPoints))
                streamingData.on('end', onDataFetchDone(res, dataPoints, wrapper, content, volumeLogger))
            }
        }
    })

    return router
}

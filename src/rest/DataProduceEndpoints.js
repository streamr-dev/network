const express = require('express')
const bodyParser = require('body-parser')
const StreamrBinaryMessage = require('../protocol/StreamrBinaryMessage')
const InvalidMessageContentError = require('../errors/InvalidMessageContentError')
const FailedToPublishError = require('../errors/FailedToPublishError')
const NotReadyError = require('../errors/NotReadyError')
const authenticationMiddleware = require('./RequestAuthenticatorMiddleware')

/**
 * Endpoint for POSTing data to streams
 */
module.exports = (streamFetcher, publisher) => {
    if (!streamFetcher) {
        throw new Error('No StreamFetcher given! Must use: new StreamrDataApi(streamrUrl)')
    }
    if (!publisher) {
        throw new Error('Publisher not given!')
    }

    const router = express.Router()

    router.post(
        '/streams/:id/data',
        // Disable automatic body parsing and increase body size limit (body becomes available as Buffer)
        bodyParser.raw({
            limit: '1024kb',
            type() { return true },
        }),
        // Check write permission using middleware, writes req.stream
        authenticationMiddleware(streamFetcher, 'write'),
        // Produce request handler
        (req, res) => {
            // Validate body
            if (!req.body || !req.body.length) {
                res.status(400).send({
                    error: 'No request body or invalid request body.',
                })
                return
            }

            // Validate ttl if given
            let ttl
            if (req.query.ttl) {
                ttl = Number(req.query.ttl)
                if (!ttl) {
                    res.status(400).send({
                        error: `Invalid ttl: ${req.query.ttl}`,
                    })
                    return
                }
            }

            // Read timestamp if given
            let timestamp
            if (req.query.ts) {
                // Try millis
                timestamp = Number(req.query.ts) || Date.parse(req.query.ts)
                if (Number.isNaN(timestamp)) {
                    res.status(400).send({
                        error: `Invalid timestamp: ${req.query.ts}`,
                    })
                    return
                }
            }

            // req.stream is written by authentication middleware
            publisher.publish(req.stream, timestamp, ttl, StreamrBinaryMessage.CONTENT_TYPE_JSON, req.body, req.query.pkey).then(() => {
                res.status(200).send(/* empty success response */)
            }).catch((err) => {
                if (err instanceof InvalidMessageContentError) {
                    res.status(400).send({
                        error: err.message,
                    })
                } else if (err instanceof FailedToPublishError) {
                    res.status(500).send({
                        error: 'Internal error, sorry',
                    })
                } else if (err instanceof NotReadyError) {
                    res.status(503).send({
                        error: err.message,
                    })
                }
            })
        },
    )

    return router
}

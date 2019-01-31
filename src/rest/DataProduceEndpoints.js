const express = require('express')
const bodyParser = require('body-parser')
const Protocol = require('streamr-client-protocol')

const { MessageLayer } = Protocol

const InvalidMessageContentError = require('../errors/InvalidMessageContentError')
const FailedToPublishError = require('../errors/FailedToPublishError')
const NotReadyError = require('../errors/NotReadyError')
const TimestampUtil = require('../utils/TimestampUtil')
const VolumeLogger = require('../utils/VolumeLogger')
const authenticationMiddleware = require('./RequestAuthenticatorMiddleware')

/**
 * Endpoint for POSTing data to streams
 */
module.exports = (streamFetcher, publisher, volumeLogger = new VolumeLogger(0)) => {
    if (!streamFetcher) {
        throw new Error('No StreamFetcher given! Must use: new StreamrDataApi(streamrUrl)')
    }
    if (!publisher) {
        throw new Error('Publisher not given!')
    }
    if (!volumeLogger) {
        throw new Error('VolumeLogger not given!')
    }

    const router = express.Router()
    this.volumeLogger = volumeLogger

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

            // Read timestamp if given
            let timestamp
            if (req.query.ts) {
                try {
                    timestamp = TimestampUtil.parse(req.query.ts)
                } catch (err) {
                    res.status(400).send({
                        error: err.message,
                    })
                    return
                }
            }

            // req.stream is written by authentication middleware
            publisher.publish(
                req.stream,
                publisher.getStreamPartition(req.stream, req.query.pkey),
                timestamp,
                0, // sequenceNumber
                req.query.address, // publisherId
                null, // prevTimestamp
                0, // prevSequenceNumber
                undefined, // ttl, read from stream when available
                MessageLayer.StreamMessage.CONTENT_TYPES.JSON,
                req.body,
                req.query.signatureType,
                req.query.signature,
            ).then(() => {
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

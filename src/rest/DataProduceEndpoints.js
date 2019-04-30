const express = require('express')
const bodyParser = require('body-parser')
const { StreamMessage } = require('streamr-client-protocol').MessageLayer
const InvalidMessageContentError = require('../errors/InvalidMessageContentError')
const FailedToPublishError = require('../errors/FailedToPublishError')
const NotReadyError = require('../errors/NotReadyError')
const VolumeLogger = require('../utils/VolumeLogger')
const authenticationMiddleware = require('./RequestAuthenticatorMiddleware')

function parseTimestamp(millisOrString) {
    if (typeof millisOrString === 'number') {
        return millisOrString
    }
    if (typeof millisOrString === 'string') {
        // Try if this string represents a number
        const timestamp = Number(millisOrString) || Date.parse(millisOrString)
        if (Number.isNaN(timestamp)) {
            throw new Error(`Invalid timestamp: ${millisOrString}`)
        } else {
            return timestamp
        }
    } else {
        throw new Error(`Invalid timestamp: ${millisOrString}`)
    }
}

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
            let sequenceNumber
            let previousMessageRef = null
            let signatureType

            function parseInteger(n) {
                const parsed = parseInt(n)
                if (!Number.isInteger(parsed) || parsed < 0) {
                    throw new Error(`${n} is not a valid positive integer`)
                }
                return parsed
            }

            try {
                timestamp = req.query.ts ? parseTimestamp(req.query.ts) : Date.now()
                sequenceNumber = req.query.seq ? parseInteger(req.query.seq) : 0
                if (req.query.prev_ts) {
                    const previousSequenceNumber = req.query.prev_seq ? parseInteger(req.query.prev_seq) : 0
                    previousMessageRef = [parseInteger(req.query.prev_ts), previousSequenceNumber]
                }
                signatureType = req.query.signatureType ? parseInteger(req.query.signatureType) : 0
            } catch (err) {
                res.status(400).send({
                    error: err.message,
                })
                return
            }

            // req.stream is written by authentication middleware
            publisher.publish(
                req.stream,
                StreamMessage.create(
                    [req.stream.streamId,
                        publisher.getStreamPartition(req.stream, req.query.pkey),
                        timestamp,
                        sequenceNumber, // sequenceNumber
                        req.query.address || '', // publisherId
                        req.query.msgChainId || '',
                    ],
                    previousMessageRef,
                    StreamMessage.CONTENT_TYPES.JSON,
                    req.body.toString(),
                    signatureType,
                    req.query.signature || null,
                ),
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

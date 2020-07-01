const express = require('express')
const bodyParser = require('body-parser')
const { Protocol } = require('streamr-network')

const { StreamMessage, MessageID, MessageRef } = Protocol.MessageLayer
const { InvalidJsonError, ValidationError } = Protocol.Errors

const FailedToPublishError = require('../errors/FailedToPublishError')
const partition = require('../helpers/partition')

const authenticationMiddleware = require('./RequestAuthenticatorMiddleware')

function parsePositiveInteger(n) {
    const parsed = parseInt(n)
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`${n} is not a valid positive integer`)
    }
    return parsed
}

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
module.exports = (streamFetcher, publisher, partitionFn = partition) => {
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
        authenticationMiddleware(streamFetcher, 'stream_publish'),
        // Produce request handler
        async (req, res) => {
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

            try {
                timestamp = req.query.ts ? parseTimestamp(req.query.ts) : Date.now()
                sequenceNumber = req.query.seq ? parsePositiveInteger(req.query.seq) : 0
                if (req.query.prev_ts) {
                    const previousSequenceNumber = req.query.prev_seq ? parsePositiveInteger(req.query.prev_seq) : 0
                    previousMessageRef = new MessageRef(parsePositiveInteger(req.query.prev_ts), previousSequenceNumber)
                }
                signatureType = req.query.signatureType ? parsePositiveInteger(req.query.signatureType) : 0
            } catch (err) {
                res.status(400).send({
                    error: err.message
                })
                return
            }

            // req.stream is written by authentication middleware
            try {
                const streamMessage = new StreamMessage({
                    messageId: new MessageID(
                        req.stream.id,
                        partitionFn(req.stream.partitions, req.query.pkey),
                        timestamp,
                        sequenceNumber, // sequenceNumber
                        req.query.address || '', // publisherId
                        req.query.msgChainId || '',
                    ),
                    prevMsgRef: previousMessageRef,
                    content: req.body.toString(),
                    signatureType,
                    signature: req.query.signature || null,
                })

                await publisher.validateAndPublish(streamMessage)
                res.status(200).send(/* empty success response */)
            } catch (err) {
                if (err instanceof InvalidJsonError
                    || err instanceof ValidationError
                    || err instanceof FailedToPublishError) {
                    res.status(400).send({
                        error: err.message,
                    })
                } else {
                    console.error(err)
                }
            }
        },
    )

    return router
}

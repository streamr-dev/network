import express from 'express'
import bodyParser from 'body-parser'
import { Protocol } from 'streamr-network'
import { Logger } from 'streamr-network'
import { FailedToPublishError } from '../errors/FailedToPublishError'
import { partition } from '../helpers/partition'
import { authenticator } from './RequestAuthenticatorMiddleware'
import { StreamFetcher } from '../StreamFetcher'
import { Publisher } from '../Publisher'
import { Todo } from '../types'

const logger = new Logger(module)

const { StreamMessage, MessageID, MessageRef } = Protocol.MessageLayer
const { InvalidJsonError, ValidationError } = Protocol.Errors

function parsePositiveInteger(n: string) {
    const parsed = parseInt(n)
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`${n} is not a valid positive integer`)
    }
    return parsed
}

function parseTimestamp(millisOrString: number|string) {
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
export const router = (streamFetcher: StreamFetcher, publisher: Publisher, partitionFn = partition) => {
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
        authenticator(streamFetcher, 'stream_publish'),
        // Produce request handler
        async (req: Todo, res: Todo) => {
            // Validate body
            if (!req.body || !req.body.length) {
                const errMsg = 'No request body or invalid request body.'
                logger.error(errMsg)

                res.status(400).send({
                    error: errMsg
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
                logger.error(err)
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
                    logger.error(err)
                }
            }
        },
    )

    return router
}

import express, { Router, Response } from 'express'
import bodyParser from 'body-parser'
import { Protocol } from 'streamr-network'
import { Logger } from 'streamr-network'
import { FailedToPublishError } from '../../errors/FailedToPublishError'
import { partition } from '../../helpers/partition'
import { AuthenticatedRequest, authenticator } from '../../RequestAuthenticatorMiddleware'
import { StreamFetcher } from '../../StreamFetcher'
import { Publisher } from '../../Publisher'
import { LEGACY_API_ROUTE_PREFIX } from '../../httpServer'
import { parsePositiveInteger, parseTimestamp } from '../../helpers/parser'

const logger = new Logger(module)

const { StreamMessage, MessageID, MessageRef } = Protocol.MessageLayer
const { InvalidJsonError, ValidationError } = Protocol.Errors

interface QueryParams {
    ts?: string
    seq?: string
    prev_ts?: string
    prev_seq?: string
    signatureType?: string
    signature?: string
    pkey?: string
    address?: string
    msgChainId?: string
}

/**
 * Endpoint for POSTing data to streams
 */
export const router = (streamFetcher: StreamFetcher, publisher: Publisher, partitionFn = partition): Router => {
    if (!streamFetcher) {
        throw new Error('No StreamFetcher given! Must use: new StreamrDataApi(streamrUrl)')
    }
    if (!publisher) {
        throw new Error('Publisher not given!')
    }

    const router = express.Router()

    router.post(
        `${LEGACY_API_ROUTE_PREFIX}/streams/:id/data`,
        // Disable automatic body parsing and increase body size limit (body becomes available as Buffer)
        bodyParser.raw({
            limit: '1024kb',
            type() { return true },
        }),
        // Check write permission using middleware, writes req.stream
        // authenticator(streamFetcher, StreamOperation.STREAM_PUBLISH, ????),
        // Produce request handler
        async (req: AuthenticatedRequest<QueryParams>, res: Response) => {
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
                        req.stream!.id as string,
                        partitionFn(req.stream!.partitions as number, req.query.pkey),
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

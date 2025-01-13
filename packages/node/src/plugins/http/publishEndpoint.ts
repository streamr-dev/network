import express, { Request, RequestHandler, Response } from 'express'
import { StreamrClient } from '@streamr/sdk'
import { Logger } from '@streamr/utils'
import { v4 as uuid } from 'uuid'
import { parseQueryParameter, parsePositiveInteger, parseTimestamp } from '../../helpers/parser'
import { PlainPayloadFormat } from '../../helpers/PayloadFormat'
import { HttpServerEndpoint } from '../../Plugin'

const logger = new Logger(module)
const PAYLOAD_FORMAT = new PlainPayloadFormat()

const createHandler = (msgChainId: string, streamrClient: StreamrClient): RequestHandler => {
    return async (req: Request, res: Response) => {
        let content: Record<string, unknown>
        let timestamp: number | undefined
        let partition: number | undefined
        let partitionKey: string | undefined
        try {
            content = PAYLOAD_FORMAT.createMessage(req.body.toString()).content
            timestamp = parseQueryParameter<number>('timestamp', req.query, parseTimestamp)
            partition = parseQueryParameter<number>('partition', req.query, parsePositiveInteger)
            partitionKey = req.query.partitionKey as string
        } catch (e) {
            res.status(400).send({
                error: e.message
            })
            return
        }
        if (partition !== undefined && partitionKey !== undefined) {
            res.status(422).send({
                error: 'Invalid combination of "partition" and "partitionKey"'
            })
            return
        }
        const streamId = req.params.streamId
        const streamPartDefinition = {
            streamId,
            streamPartition: partition
        }
        try {
            await streamrClient.publish(streamPartDefinition, content, {
                timestamp,
                partitionKey,
                msgChainId
            })
            res.sendStatus(200)
        } catch (err) {
            logger.error('Unable to publish to message', { streamId, err })
            res.sendStatus(500)
        }
    }
}

export const createEndpoint = (streamrClient: StreamrClient): HttpServerEndpoint => {
    const msgChainId = uuid()
    return {
        path: '/streams/:streamId/',
        method: 'post',
        requestHandlers: [
            express.raw({
                limit: '1024kb',
                type() {
                    return true
                }
            }),
            createHandler(msgChainId, streamrClient)
        ]
    }
}

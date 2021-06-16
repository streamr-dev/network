import express, { Request, Response } from 'express'
import { StreamrClient } from 'streamr-client'
import { Logger } from 'streamr-network'
import { parseQueryParameter, parsePositiveInteger, parseTimestamp } from '../../helpers/parser'

const logger = new Logger(module)

const parseContent = (req: Request) => {
    if (req.body.length === 0) {
        throw new Error('No request body')
    }
    const contentAsString = req.body.toString()
    try {
        return JSON.parse(contentAsString)
    } catch (e) {
        throw new Error('Request body is not a JSON string')
    }
}

export const createEndpoint = (streamrClient: StreamrClient): express.Router => {
    const router = express.Router()
    router.use(express.raw({
        limit: '1024kb',
        type() { return true },
    }))
    router.post('/streams/:streamId/', async (req: Request, res: Response) => {
        let content: any
        let timestamp: number|undefined
        let partition: number|undefined
        let partitionKey: string|undefined
        try {
            content = parseContent(req)
            timestamp = parseQueryParameter<number>('timestamp', req.query, parseTimestamp)
            partition = parseQueryParameter<number>('partition', req.query, parsePositiveInteger)
            partitionKey = req.query['partitionKey'] as string
        } catch (e) {
            res.status(400).send({
                error: e.message
            })
            return
        }
        if ((partition !== undefined) && (partitionKey !== undefined)) {
            res.status(422).send({
                error: 'Invalid combination of "partition" and "partitionKey"'
            })
            return
        }
        const streamId = req.params.streamId as string
        const streamPartDefinition = {
            streamId,
            streamPartition: partition
        }
        try {
            await streamrClient.publish(streamPartDefinition, content, timestamp, partitionKey)
            return res.sendStatus(200)
        } catch (e) {
            logger.error(`Unable to publish to ${streamId}: ${e.message}`)
            return res.sendStatus(500)
        }
    })
    return router
}

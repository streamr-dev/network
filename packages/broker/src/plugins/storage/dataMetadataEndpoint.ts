import { Request, RequestHandler, Response } from 'express'
import { HttpServerEndpoint } from '../../Plugin'
import { Storage } from './Storage'

const parseIntIfExists = (x: string | undefined): number | undefined => {
    return x === undefined ? undefined : parseInt(x)
}

const createHandler = (cassandraStorage: Storage): RequestHandler => {
    return async (req: Request, res: Response) => {
        const streamId = req.params.id
        const partition = parseIntIfExists(req.params.partition)
        if (Number.isNaN(partition) || partition === undefined) {
            const errMsg = `Path parameter "partition" not a number: ${req.params.partition}`
            res.status(400).send({
                error: errMsg
            })
            return
        }
        const out = {
            totalBytes: await cassandraStorage.getTotalBytesInStream(streamId, partition),
            totalMessages: await cassandraStorage.getNumberOfMessagesInStream(streamId, partition),
            firstMessage: await cassandraStorage.getFirstMessageTimestampInStream(streamId, partition),
            lastMessage: await cassandraStorage.getLastMessageTimestampInStream(streamId, partition)
        }
        res.status(200).send(out)
    }
}

export const createDataMetadataEndpoint = (cassandraStorage: Storage): HttpServerEndpoint => {
    return {
        path: '/streams/:id/metadata/partitions/:partition',
        method: 'get',
        requestHandlers: [createHandler(cassandraStorage)]
    }
}

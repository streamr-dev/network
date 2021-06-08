import express, { Request, Response } from 'express'
import { Storage } from './Storage'
import { LEGACY_API_ROUTE_PREFIX } from '../../httpServer'

const parseIntIfExists = (x: string | undefined): number | undefined => {
    return x === undefined ? undefined : parseInt(x)
}

export const router = (cassandraStorage: Storage) => {
    const router = express.Router()
    const handler = async (req: Request, res: Response) => {
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

    router.get(
        `${LEGACY_API_ROUTE_PREFIX}/streams/:id/metadata/partitions/:partition`,
        handler
    )

    return router
}

import { toStreamID, toStreamPartID } from '@streamr/utils'
import { Request, RequestHandler, Response } from 'express'
import { HttpServerEndpoint } from '../../Plugin'
import { StorageConfig } from './StorageConfig'

const createHandler = (storageConfig: StorageConfig): RequestHandler => {
    return (req: Request, res: Response) => {
        const { id, partition } = req.params
        const isValidPartition = !Number.isNaN(parseInt(partition))
        if (isValidPartition) {
            const found = storageConfig.hasStreamPart(toStreamPartID(toStreamID(id), Number(partition)))
            if (found) {
                res.status(200).send({})
            } else {
                res.status(404).end()
            }
        } else {
            res.status(400).send('Partition is not a number: ' + partition)
        }
    }
}

export const createStorageConfigEndpoint = (storageConfig: StorageConfig): HttpServerEndpoint => {
    return {
        path: '/streams/:id/storage/partitions/:partition',
        method: 'get',
        requestHandlers: [createHandler(storageConfig)]
    }
}

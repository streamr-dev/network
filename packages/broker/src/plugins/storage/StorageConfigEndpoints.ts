import express, { Request, Response, Router } from 'express'
import { Protocol } from 'streamr-network'
import { StorageConfig } from './StorageConfig'
import { LEGACY_API_ROUTE_PREFIX } from '../../httpServer'

const createHandler = (storageConfig: StorageConfig) => {
    return (req: Request, res: Response) => {
        const { id, partition } = req.params
        const isValidPartition = !Number.isNaN(parseInt(partition))
        if (isValidPartition) {
            const found = storageConfig.hasSPID(new Protocol.SPID(id, Number(partition)))
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

export const router = (storageConfig: StorageConfig): Router => {
    const router = express.Router()
    const handler = createHandler(storageConfig)
    router.get(`${LEGACY_API_ROUTE_PREFIX}/streams/:id/storage/partitions/:partition`, handler)
    return router
}

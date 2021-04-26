import express, { Request, Response } from 'express'
import { StorageConfig } from '../storage/StorageConfig'
import { Todo } from '../types'

const createHandler = (storageConfig: StorageConfig) => {
    return (req: Request, res: Response) => {
        const { id, partition } = req.params
        const isValidPartition = !Number.isNaN(parseInt(partition))
        if (isValidPartition) {
            const found = storageConfig.hasStream({
                id,
                partition: Number(partition)
            })
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

export const router = (storageConfig: StorageConfig) => {
    const router = express.Router()
    const handler = (storageConfig !== null) ? createHandler(storageConfig) : (_: Todo, res: Todo) => res.status(501).send('Not a storage node')
    router.get('/streams/:id/storage/partitions/:partition', handler)
    return router
}

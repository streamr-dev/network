import express from 'express'
import request from 'supertest'
import { router } from '../../../src/http/StorageConfigEndpoints'
import { createMockStorageConfig } from '../../integration/storage/MockStorageConfig'
import { Todo } from '../../types'

const createRequest = (streamId: string, partition: number, app: Todo) => {
    return request(app).get(`/api/v1/streams/${streamId}/storage/partitions/${partition}`)
}

describe('StorageConfigEndpoints', () => {
    const storageConfig = createMockStorageConfig([{
        id: 'existing',
        partition: 123,
    }])

    it('stream in storage config', async () => {
        const app = express()
        // @ts-expect-error
        app.use('/api/v1', router(storageConfig))
        await createRequest('existing', 123, app).expect(200)
    })

    it('stream not in storage config', async () => {
        const app = express()
        // @ts-expect-error
        app.use('/api/v1', router(storageConfig))
        await createRequest('non-existing', 456, app).expect(404)
    })

    it('invalid partition', async () => {
        const app = express()
        // @ts-expect-error
        app.use('/api/v1', router(storageConfig))
        await createRequest('foo', 'bar' as any, app).expect(400, 'Partition is not a number: bar')
    })
})

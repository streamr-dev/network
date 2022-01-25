import express from 'express'
import { StreamPartIDUtils } from 'streamr-client-protocol'
import request from 'supertest'
import { router } from '../../../../src/plugins/storage/StorageConfigEndpoints'
import { createMockStorageConfig } from '../../../integration/plugins/storage/MockStorageConfig'

const createRequest = (streamId: string, partition: number, app: express.Application) => {
    return request(app).get(`/api/v1/streams/${encodeURIComponent(streamId)}/storage/partitions/${partition}`)
}

describe('StorageConfigEndpoints', () => {
    const storageConfig = createMockStorageConfig([StreamPartIDUtils.parse('existing#12')])

    it('stream in storage config', async () => {
        const app = express()
        app.use(router(storageConfig))
        await createRequest('existing', 12, app).expect(200)
    })

    it('stream not in storage config', async () => {
        const app = express()
        app.use(router(storageConfig))
        await createRequest('non-existing', 34, app).expect(404)
    })

    it('invalid partition', async () => {
        const app = express()
        app.use(router(storageConfig))
        await createRequest('foo', 'bar' as any, app).expect(400, 'Partition is not a number: bar')
    })
})

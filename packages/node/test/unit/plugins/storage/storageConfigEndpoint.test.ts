import { StreamPartIDUtils } from '@streamr/utils'
import express from 'express'
import request from 'supertest'
import { createStorageConfigEndpoint } from '../../../../src/plugins/storage/storageConfigEndpoint'
import { createMockStorageConfig } from '../../../integration/plugins/storage/MockStorageConfig'

const createRequest = (streamId: string, partition: number, app: express.Application) => {
    return request(app).get(`/streams/${encodeURIComponent(streamId)}/storage/partitions/${partition}`)
}

const createApp = (): express.Application => {
    const storageConfig = createMockStorageConfig([StreamPartIDUtils.parse('existing#12')])
    const app = express()
    const endpoint = createStorageConfigEndpoint(storageConfig)
    app.route(endpoint.path)[endpoint.method](endpoint.requestHandlers)
    return app
}

describe('StorageConfigEndpoints', () => {
    it('stream in storage config', async () => {
        const app = createApp()
        await createRequest('existing', 12, app).expect(200)
    })

    it('stream not in storage config', async () => {
        const app = createApp()
        await createRequest('non-existing', 34, app).expect(404)
    })

    it('invalid partition', async () => {
        const app = createApp()
        await createRequest('foo', 'bar' as any, app).expect(400, 'Partition is not a number: bar')
    })
})

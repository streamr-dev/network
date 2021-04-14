const express = require('express')
const request = require('supertest')

const storageConfigEndpoints = require('../../../src/http/StorageConfigEndpoints')
const { createMockStorageConfig } = require('../../integration/storage/MockStorageConfig')

const createRequest = (streamId, partition, app) => {
    return request(app).get(`/api/v1/streams/${streamId}/storage/partitions/${partition}`)
}

describe('StorageConfigEndpoints', () => {
    const storageConfig = createMockStorageConfig([{
        id: 'existing',
        partition: 123,
    }])

    it('stream in storage config', async () => {
        const app = express()
        app.use('/api/v1', storageConfigEndpoints(storageConfig))
        await createRequest('existing', 123, app).expect(200)
    })

    it('stream not in storage config', async () => {
        const app = express()
        app.use('/api/v1', storageConfigEndpoints(storageConfig))
        await createRequest('non-existing', 456, app).expect(404)
    })

    it('invalid partition', async () => {
        const app = express()
        app.use('/api/v1', storageConfigEndpoints(storageConfig))
        await createRequest('foo', 'bar', app).expect(400, 'Partition is not a number: bar')
    })

    it('not storage node', async () => {
        const app = express()
        app.use('/api/v1', storageConfigEndpoints(null))
        await createRequest('foobar', 0, app).expect(501, 'Not a storage node')
    })
})

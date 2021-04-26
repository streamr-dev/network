import express from 'express'
import request from 'supertest'
import { router } from '../../../src/http/DataMetadataEndpoints'
import { Todo } from '../../types'

describe('DataMetadataEndpoints', () => {
    let app: Todo

    function testGetRequest(url: string, sessionToken = 'mock-session-token') {
        return request(app)
            .get(url)
            .set('Accept', 'application/json')
            .set('Authorization', `Bearer ${sessionToken}`)
    }

    it('should fail testGetRequest on uninitialized Cassandra broker', async () => {
        app = express()
        // @ts-expect-error
        app.use('/api/v1', router())

        await testGetRequest('/api/v1/streams/0/metadata/partitions/0')
            .expect(501)
    })
})
